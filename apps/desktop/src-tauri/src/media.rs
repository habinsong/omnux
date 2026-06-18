use serde::Serialize;

#[derive(Serialize)]
pub struct MediaData {
    title: String,
    artist: String,
    album: String,
    source: Option<String>,
    playing: bool,
    position: f64,
    duration: f64,
    art_url: Option<String>,
}

fn clean_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("unknown") {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn seek_target(position: f64, duration: f64, offset: f64) -> f64 {
    let lower_bound = (position + offset).max(0.0);
    if duration > 0.0 {
        lower_bound.min(duration)
    } else {
        lower_bound
    }
}

#[cfg(target_os = "macos")]
fn album_cover_data_url(info: &media_remote::NowPlayingInfo) -> Option<String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::io::Cursor;

    let cover = info.album_cover.as_ref()?;
    let mut buffer = Cursor::new(Vec::new());
    cover.write_to(&mut buffer, image::ImageFormat::Png).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(buffer.into_inner())
    ))
}

// media-remote 0.3.8 은 번들된 mediaremote-adapter 가 보내는 ISO-8601 timestamp
// ("2026-06-09T16:02:40Z")를 payload["timestamp"].as_f64() 로 파싱한다. 문자열이므로 결과는
// 항상 None → info_update_time = None → 크레이트도, 우리 보정도 elapsed_time 을 라이브로
// 전진시키지 못해 재생 위치가 마지막 샘플에 고정된다. raw elapsed 가 바뀐(=새 payload 도착)
// 시각을 우리가 직접 기록해, 그 이후 경과분을 더해 라이브 위치를 복원한다.
#[cfg(target_os = "macos")]
struct LivePositionAnchor {
    title: String,
    raw_elapsed: f64,
    observed_at: std::time::Instant,
}

#[cfg(target_os = "macos")]
static LIVE_POSITION_ANCHOR: std::sync::Mutex<Option<LivePositionAnchor>> =
    std::sync::Mutex::new(None);

// adapter 스트림 payload 가 "도착한 순간"을 anchor 로 기록한다 (listener 콜백에서 호출).
// 폴링 시점에 처음 관측해 anchor 를 잡으면 payload 발행→첫 폴 사이(0~2초, 평균 ~1초)만큼
// 영구적으로 뒤처지므로, 도착 즉시 기록해 그 지연을 제거한다.
#[cfg(target_os = "macos")]
fn note_observed_now_playing(info: &media_remote::NowPlayingInfo) {
    let mut guard = LIVE_POSITION_ANCHOR.lock().unwrap();
    if info.is_playing != Some(true) {
        // 일시정지/세션 없음 → anchor 해제. 재개 payload 가 도착하면 그 시각으로 새로 잡힌다
        // (같은 raw 로 재개해도 anchor 가 None 이라 재기록되어 pause 시간이 더해지지 않는다).
        *guard = None;
        return;
    }
    let Some(title) = info.title.as_deref().and_then(clean_text) else {
        *guard = None;
        return;
    };
    let raw_elapsed = info.elapsed_time.unwrap_or(0.0);
    let need_reanchor = match guard.as_ref() {
        None => true,
        // 같은 트랙 + 같은 raw(메타데이터만 갱신된 반복 payload)면 anchor 유지 — 위치 역행 방지.
        Some(anchor) => anchor.title != title || (raw_elapsed - anchor.raw_elapsed).abs() > 0.05,
    };
    if need_reanchor {
        *guard = Some(LivePositionAnchor {
            title,
            raw_elapsed,
            observed_at: std::time::Instant::now(),
        });
    }
}

#[cfg(target_os = "macos")]
fn live_position_from_observed(title: &str, raw_elapsed: f64) -> f64 {
    let now = std::time::Instant::now();
    let mut guard = LIVE_POSITION_ANCHOR.lock().unwrap();
    if let Some(anchor) = guard.as_ref() {
        // 같은 트랙이고 adapter 가 새 elapsed 샘플을 아직 안 보냈으면(raw 동일) 관측 시각 기준 전진.
        if anchor.title == title && (raw_elapsed - anchor.raw_elapsed).abs() < 0.05 {
            return anchor.raw_elapsed + now.duration_since(anchor.observed_at).as_secs_f64();
        }
    }
    // 트랙 변경 또는 새 elapsed 샘플 도착 → 이 시각을 새 기준으로 고정하고 raw 를 그대로 반환.
    *guard = Some(LivePositionAnchor {
        title: title.to_string(),
        raw_elapsed,
        observed_at: now,
    });
    raw_elapsed
}

#[cfg(target_os = "macos")]
fn reset_live_position_anchor() {
    *LIVE_POSITION_ANCHOR.lock().unwrap() = None;
}

#[cfg(target_os = "macos")]
fn media_data_from_info(info: &media_remote::NowPlayingInfo) -> Option<MediaData> {
    let title = info.title.as_deref().and_then(clean_text)?;
    let artist = info
        .artist
        .as_deref()
        .and_then(clean_text)
        .unwrap_or_default();
    let album = info
        .album
        .as_deref()
        .and_then(clean_text)
        .unwrap_or_default();
    let source = info
        .bundle_name
        .as_deref()
        .and_then(clean_text)
        .or_else(|| info.bundle_id.as_deref().and_then(clean_text));

    let playing = info.is_playing.unwrap_or(false);
    let raw_elapsed = info.elapsed_time.unwrap_or(0.0);

    let position = if playing {
        match info.info_update_time {
            // 타임스탬프가 정상 파싱된 adapter 라면 그대로 보정해 사용.
            Some(update_time) => {
                let delta = std::time::SystemTime::now()
                    .duration_since(update_time)
                    .map(|d| d.as_secs_f64())
                    .unwrap_or(0.0);
                raw_elapsed + delta
            }
            // info_update_time 이 None(ISO timestamp 파싱 실패 → 현실적으로 항상)이면
            // 관측 시각 기준으로 라이브 위치를 복원한다.
            None => live_position_from_observed(&title, raw_elapsed),
        }
    } else {
        // anchor 해제는 payload listener(note_observed_now_playing)가 담당한다.
        // 여기서 같이 지우면 "일시정지 폴 응답 처리 중 재개 payload 도착" 레이스에서
        // 방금 잡힌 새 anchor 를 지울 수 있다.
        raw_elapsed
    };

    Some(MediaData {
        title,
        artist,
        album,
        source,
        playing,
        position,
        duration: info.duration.unwrap_or(0.0),
        art_url: album_cover_data_url(info),
    })
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn get_media_info() -> Result<Option<MediaData>, String> {
    use media_remote::{ListenerToken, NowPlayingPerl, Subscription};
    use std::sync::OnceLock;

    static NOW_PLAYING_PERL: OnceLock<NowPlayingPerl> = OnceLock::new();
    static PERL_PAYLOAD_LISTENER: OnceLock<ListenerToken> = OnceLock::new();

    // 주의: media_remote 의 JXA 폴백(NowPlayingJXA)은 osascript 의 stderr 를 그대로 상속한다
    // (crate 의 execute_jxa.rs 가 .stderr 를 지정하지 않음). 재생 중인 미디어 세션이 없으면
    // 번들된 nowPlaying.jxa 가 client 가 undefined 인 상태로 `client.bundleIdentifier` 를
    // 평가하다 실패해, 매 폴링마다
    // "undefined is not an object (evaluating 'client.bundleIdentifier')" (-2700) 를
    // omnux 포그라운드 터미널에 도배한다. 네이티브 MediaRemote 경로(Perl)만 사용해 소음을 없앤다.
    let perl = NOW_PLAYING_PERL.get_or_init(NowPlayingPerl::new);
    // payload 도착 즉시 anchor 를 기록하는 listener — 폴링 관측 지연(평균 ~1초) 제거.
    PERL_PAYLOAD_LISTENER.get_or_init(|| {
        perl.subscribe(|guard| {
            match guard.as_ref() {
                Some(info) => note_observed_now_playing(info),
                None => reset_live_position_anchor(),
            }
        })
    });
    let perl_info = perl.get_info();
    Ok(perl_info.as_ref().and_then(media_data_from_info))
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn control_media(action: String) -> Result<(), String> {
    use media_remote::{send_command, set_elapsed_time, Command};

    match action.as_str() {
        "toggle" => {
            if send_command(Command::TogglePlayPause) {
                Ok(())
            } else {
                Err("미디어 재생/일시정지 명령을 보내지 못했다.".to_string())
            }
        }
        "seek_backward" | "seek_forward" => {
            let offset = if action == "seek_backward" {
                -15.0
            } else {
                15.0
            };
            if let Some(data) = get_media_info().await? {
                set_elapsed_time(seek_target(data.position, data.duration, offset));
                Ok(())
            } else {
                let command = if action == "seek_backward" {
                    Command::GoBackFifteenSeconds
                } else {
                    Command::SkipFifteenSeconds
                };
                if send_command(command) {
                    Ok(())
                } else {
                    Err("미디어 15초 이동 명령을 보낼 세션이 없다.".to_string())
                }
            }
        }
        "next_track" => {
            if send_command(Command::NextTrack) {
                Ok(())
            } else {
                Err("다음 트랙 명령을 보내지 못했다.".to_string())
            }
        }
        "previous_track" => {
            if send_command(Command::PreviousTrack) {
                Ok(())
            } else {
                Err("이전 트랙 명령을 보내지 못했다.".to_string())
            }
        }
        other => Err(format!("알 수 없는 미디어 제어 액션: {other}")),
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn seek_media(position: f64) -> Result<(), String> {
    use media_remote::set_elapsed_time;

    let data = get_media_info()
        .await?
        .ok_or_else(|| "이동할 미디어 세션이 없다.".to_string())?;
    set_elapsed_time(seek_target(0.0, data.duration, position));
    Ok(())
}

#[cfg(not(target_os = "macos"))]
async fn best_player_info() -> Result<Option<nowhear::PlayerInfo>, String> {
    use nowhear::{MediaSource, MediaSourceBuilder, PlaybackState};

    fn player_score(info: &nowhear::PlayerInfo) -> u8 {
        let has_track = info
            .current_track
            .as_ref()
            .and_then(|track| clean_text(&track.title))
            .is_some();
        let state_score = match info.playback_state {
            PlaybackState::Playing => 3,
            PlaybackState::Paused => 2,
            PlaybackState::Stopped => 1,
        };
        if has_track {
            state_score + 3
        } else {
            state_score
        }
    }

    let source = MediaSourceBuilder::new()
        .build()
        .await
        .map_err(|e| format!("Failed to build media source: {:?}", e))?;
    let players = source
        .list_players()
        .await
        .map_err(|e| format!("Failed to list players: {:?}", e))?;

    let mut best: Option<(u8, nowhear::PlayerInfo)> = None;
    for player in players {
        if let Ok(info) = source.get_player(&player).await {
            let score = player_score(&info);
            if best
                .as_ref()
                .is_none_or(|(best_score, _)| score > *best_score)
            {
                best = Some((score, info));
            }
        }
    }

    Ok(best.map(|(_, info)| info))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn get_media_info() -> Result<Option<MediaData>, String> {
    use nowhear::{PlaybackState, PlayerInfo, Track};
    use std::time::Duration;

    fn artist_text(track: &Track) -> String {
        track
            .artist
            .iter()
            .filter_map(|artist| clean_text(artist))
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn media_data_from_player(info: &PlayerInfo) -> Option<MediaData> {
        let track = info.current_track.as_ref()?;
        let title = clean_text(&track.title)?;

        Some(MediaData {
            title,
            artist: artist_text(track),
            album: track
                .album
                .as_deref()
                .and_then(clean_text)
                .unwrap_or_default(),
            source: clean_text(&info.player_name),
            playing: info.playback_state == PlaybackState::Playing,
            position: info
                .position
                .unwrap_or(Duration::from_secs(0))
                .as_secs_f64(),
            duration: track
                .duration
                .unwrap_or(Duration::from_secs(0))
                .as_secs_f64(),
            art_url: track.art_url.as_deref().and_then(clean_text),
        })
    }

    Ok(best_player_info()
        .await?
        .as_ref()
        .and_then(media_data_from_player))
}

#[cfg(target_os = "linux")]
async fn seek_linux_relative(delta_seconds: f64) -> Result<(), String> {
    let _ = delta_seconds;
    Err("Linux 미디어 이동은 현재 데스크톱 셸 경계에서 지원하지 않는다.".to_string())
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn control_media(action: String) -> Result<(), String> {
    match action.as_str() {
        "toggle" | "seek_backward" | "seek_forward" | "next_track" | "previous_track" => {
            Err("Linux 미디어 제어는 현재 데스크톱 셸 경계에서 지원하지 않는다.".to_string())
        }
        other => return Err(format!("알 수 없는 미디어 제어 액션: {other}")),
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn seek_media(position: f64) -> Result<(), String> {
    let current = best_player_info()
        .await?
        .and_then(|info| info.position)
        .map(|value| value.as_secs_f64())
        .ok_or_else(|| "현재 재생 위치를 알 수 없다.".to_string())?;
    seek_linux_relative(position - current).await
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn control_media(action: String) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    const SEEK_TICKS: i64 = 15 * 10_000_000;

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|error| format!("Windows 미디어 세션 매니저 요청에 실패했다: {error}"))?
        .await
        .map_err(|error| format!("Windows 미디어 세션 매니저를 열지 못했다: {error}"))?;
    let session = manager
        .GetCurrentSession()
        .map_err(|error| format!("현재 Windows 미디어 세션이 없다: {error}"))?;

    let ok = match action.as_str() {
        "toggle" => session
            .TryTogglePlayPauseAsync()
            .map_err(|error| format!("재생/일시정지 명령 생성 실패: {error}"))?
            .await
            .map_err(|error| format!("재생/일시정지 명령 실행 실패: {error}"))?,
        "seek_backward" | "seek_forward" => {
            let timeline = session
                .GetTimelineProperties()
                .map_err(|error| format!("미디어 타임라인을 읽지 못했다: {error}"))?;
            let current = timeline.Position().map(|value| value.Duration).unwrap_or(0);
            let end = timeline.EndTime().map(|value| value.Duration).unwrap_or(0);
            let offset = if action == "seek_backward" {
                -SEEK_TICKS
            } else {
                SEEK_TICKS
            };
            let target = (current + offset).max(0);
            let target = if end > 0 { target.min(end) } else { target };
            session
                .TryChangePlaybackPositionAsync(target)
                .map_err(|error| format!("15초 이동 명령 생성 실패: {error}"))?
                .await
                .map_err(|error| format!("15초 이동 명령 실행 실패: {error}"))?
        }
        "next_track" => session
            .TrySkipNextAsync()
            .map_err(|error| format!("다음 트랙 명령 생성 실패: {error}"))?
            .await
            .map_err(|error| format!("다음 트랙 명령 실행 실패: {error}"))?,
        "previous_track" => session
            .TrySkipPreviousAsync()
            .map_err(|error| format!("이전 트랙 명령 생성 실패: {error}"))?
            .await
            .map_err(|error| format!("이전 트랙 명령 실행 실패: {error}"))?,
        other => return Err(format!("알 수 없는 미디어 제어 액션: {other}")),
    };

    if ok {
        Ok(())
    } else {
        Err("OS가 미디어 제어 명령을 거부했다.".to_string())
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn seek_media(position: f64) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|error| format!("Windows 미디어 세션 매니저 요청에 실패했다: {error}"))?
        .await
        .map_err(|error| format!("Windows 미디어 세션 매니저를 열지 못했다: {error}"))?;
    let session = manager
        .GetCurrentSession()
        .map_err(|error| format!("현재 Windows 미디어 세션이 없다: {error}"))?;
    let timeline = session
        .GetTimelineProperties()
        .map_err(|error| format!("미디어 타임라인을 읽지 못했다: {error}"))?;
    let end = timeline.EndTime().map(|value| value.Duration).unwrap_or(0);
    let target = (position * 10_000_000.0).round() as i64;
    let target = if end > 0 { target.min(end) } else { target };
    let ok = session
        .TryChangePlaybackPositionAsync(target.max(0))
        .map_err(|error| format!("이동 명령 생성 실패: {error}"))?
        .await
        .map_err(|error| format!("이동 명령 실행 실패: {error}"))?;
    if ok {
        Ok(())
    } else {
        Err("OS가 미디어 이동 명령을 거부했다.".to_string())
    }
}
