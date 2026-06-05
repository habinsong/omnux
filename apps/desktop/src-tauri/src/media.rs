use serde::Serialize;

#[derive(Serialize)]
pub struct MediaData {
    title: String,
    artist: String,
    album: String,
    source: Option<String>,
    playing: bool,
    position: u64,
    duration: u64,
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

fn seek_target(position: u64, duration: u64, offset: i64) -> u64 {
    let raw_target = position as i64 + offset;
    let lower_bound = raw_target.max(0) as u64;
    if duration > 0 {
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

    Some(MediaData {
        title,
        artist,
        album,
        source,
        playing: info.is_playing.unwrap_or(false),
        position: info.elapsed_time.unwrap_or(0.0) as u64,
        duration: info.duration.unwrap_or(0.0) as u64,
        art_url: album_cover_data_url(info),
    })
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn get_media_info() -> Result<Option<MediaData>, String> {
    use media_remote::{NowPlayingJXA, NowPlayingPerl};
    use std::{sync::OnceLock, time::Duration};

    static NOW_PLAYING_PERL: OnceLock<NowPlayingPerl> = OnceLock::new();
    static NOW_PLAYING_JXA: OnceLock<NowPlayingJXA> = OnceLock::new();

    let perl = NOW_PLAYING_PERL.get_or_init(NowPlayingPerl::new);
    let perl_info = perl.get_info();
    if let Some(data) = perl_info.as_ref().and_then(media_data_from_info) {
        return Ok(Some(data));
    }
    drop(perl_info);

    let jxa = NOW_PLAYING_JXA.get_or_init(|| NowPlayingJXA::new(Duration::from_secs(2)));
    let jxa_info = jxa.get_info();

    Ok(jxa_info.as_ref().and_then(media_data_from_info))
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
            let offset = if action == "seek_backward" { -15 } else { 15 };
            if let Some(data) = get_media_info().await? {
                set_elapsed_time(seek_target(data.position, data.duration, offset) as f64);
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
        other => Err(format!("알 수 없는 미디어 제어 액션: {other}")),
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn seek_media(position: u64) -> Result<(), String> {
    use media_remote::set_elapsed_time;

    let data = get_media_info()
        .await?
        .ok_or_else(|| "이동할 미디어 세션이 없다.".to_string())?;
    set_elapsed_time(seek_target(0, data.duration, position as i64) as f64);
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
            position: info.position.unwrap_or(Duration::from_secs(0)).as_secs(),
            duration: track.duration.unwrap_or(Duration::from_secs(0)).as_secs(),
            art_url: track.art_url.as_deref().and_then(clean_text),
        })
    }

    Ok(best_player_info()
        .await?
        .as_ref()
        .and_then(media_data_from_player))
}

#[cfg(target_os = "linux")]
async fn seek_linux_relative(delta_seconds: i64) -> Result<(), String> {
    use std::process::Command;

    let player = best_player_info()
        .await?
        .map(|info| info.player_name)
        .ok_or_else(|| "미디어 제어 명령을 보낼 플레이어가 없다.".to_string())?;
    let offset = delta_seconds.saturating_mul(1_000_000);
    let status = Command::new("dbus-send")
        .args([
            "--session".to_string(),
            "--type=method_call".to_string(),
            format!("--dest=org.mpris.MediaPlayer2.{player}"),
            "/org/mpris/MediaPlayer2".to_string(),
            "org.mpris.MediaPlayer2.Player.Seek".to_string(),
            format!("int64:{offset}"),
        ])
        .status()
        .map_err(|error| format!("dbus-send 실행에 실패했다: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("MPRIS 미디어 이동 명령이 실패했다: {status}"))
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn control_media(action: String) -> Result<(), String> {
    use std::process::Command;

    let player = best_player_info()
        .await?
        .map(|info| info.player_name)
        .ok_or_else(|| "미디어 제어 명령을 보낼 플레이어가 없다.".to_string())?;
    let method = match action.as_str() {
        "toggle" => "org.mpris.MediaPlayer2.Player.PlayPause",
        "seek_backward" | "seek_forward" => "org.mpris.MediaPlayer2.Player.Seek",
        other => return Err(format!("알 수 없는 미디어 제어 액션: {other}")),
    };
    let mut args = vec![
        "--session".to_string(),
        "--type=method_call".to_string(),
        format!("--dest=org.mpris.MediaPlayer2.{player}"),
        "/org/mpris/MediaPlayer2".to_string(),
        method.to_string(),
    ];
    if action == "seek_backward" || action == "seek_forward" {
        let offset = if action == "seek_backward" {
            -15_000_000
        } else {
            15_000_000
        };
        args.push(format!("int64:{offset}"));
    }

    let status = Command::new("dbus-send")
        .args(args)
        .status()
        .map_err(|error| format!("dbus-send 실행에 실패했다: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("MPRIS 미디어 제어 명령이 실패했다: {status}"))
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn seek_media(position: u64) -> Result<(), String> {
    let current = best_player_info()
        .await?
        .and_then(|info| info.position)
        .map(|value| value.as_secs())
        .ok_or_else(|| "현재 재생 위치를 알 수 없다.".to_string())?;
    seek_linux_relative(position as i64 - current as i64).await
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
pub async fn seek_media(position: u64) -> Result<(), String> {
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
    let target = (position as i64).saturating_mul(10_000_000);
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
