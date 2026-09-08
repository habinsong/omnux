# 미디어 위젯 재생시간 버그 기록

작성일: 2026-06-08

## 현재 상태

미디어 위젯의 현재 재생시간 표시 문제는 아직 해결되지 않았다.

사용자 관찰:

- 대시보드/데스크톱 셸을 새로고침한 뒤 미디어 위젯이 실제 현재 재생시간을 바로 반영하지 않는다.
- 새로고침 직전의 재생시간을 계속 보여주는 것으로 보인다.
- 앱 새로고침 버튼뿐 아니라 웹브라우저 새로고침까지 고려해야 한다.
- 사용자는 "새로고침한뒤 2초뒤에 실제 재생시간 가져오게"를 요구했다.
- 2026-06-08 기준, 아래 시도 이후에도 사용자는 "문제 해결 안됨"이라고 확인했다.

## 관련 파일

- `/Users/songhabin/omnux/apps/desktop/src/features/shell/MediaWidget.tsx`
  - 미디어 위젯 렌더링, 재생시간 보간, 폴링, seek/control 상태 관리.
- `/Users/songhabin/omnux/apps/desktop/src/features/shell/media-transport.ts`
  - Tauri invoke 또는 로컬 HTTP 브리지로 미디어 정보를 가져오는 계층.
  - 새로고침 감지 플래그와 이벤트가 추가되어 있다.
- `/Users/songhabin/omnux/apps/desktop/src/features/shell/DesktopTopBar.tsx`
  - 상단 새로고침 버튼.
  - 현재는 새로고침 전 미디어 재검증 플래그를 세팅한다.
- `/Users/songhabin/omnux/apps/desktop/src-tauri/src/media.rs`
  - OS별 실제 미디어 정보 조회/제어/seek 구현.
  - macOS는 `media_remote::NowPlayingPerl`을 먼저 사용하고, 실패하면 JXA 경로를 사용한다.
- `/Users/songhabin/omnux/apps/desktop/src-tauri/src/media_bridge.rs`
  - 개발/브라우저 경로에서 `/media`, `/media/control`, `/media/seek`를 제공하는 로컬 브리지.
- `/Users/songhabin/omnux/scripts/check-desktop-shell-boundary-contract.mjs`
  - 데스크톱 셸 계약 검증.
  - 현재 미디어 위젯의 폴링/보간 관련 문자열 검사도 포함한다.

## 이미 시도한 작업과 결과

### 1. 빠른 250ms 폴링 제거

기존 `MediaWidget.tsx`는 초기/반복 폴링에서 `setTimeout(poll, 250)` 형태로 매우 자주 OS 미디어 정보를 조회했다.

변경 내용:

- `MEDIA_STARTUP_DELAY_MS = 32` 추가.
- `MEDIA_POLL_INTERVAL_MS = 5000` 추가.
- 첫 조회는 셸 paint 이후로 미루고, 반복 폴링은 5초로 낮춤.

결과:

- 빌드와 계약 검증은 통과했지만 사용자 체감 문제는 해결되지 않았다.
- 단순히 폴링 빈도만 조절해서는 "새로고침 직전 시간 표시" 문제가 해결되지 않았다.

### 2. `requestAnimationFrame` 기반 시간 tick 제거

기존에는 `requestAnimationFrame(tick)`으로 React state를 매 프레임 갱신했다.

변경 내용:

- `MEDIA_POSITION_TICK_MS = 1000` 추가.
- `requestAnimationFrame` 대신 `setInterval`로 1초마다 `localElapsed`를 보간하도록 변경.
- `clampMediaPosition()`을 추가해 음수/NaN/Duration 초과를 막음.

결과:

- 렌더 과부하 가능성은 줄었지만 사용자 체감 문제는 해결되지 않았다.
- `requestAnimationFrame` 제거 자체가 이 버그의 핵심 원인은 아니었다.

### 3. 새로고침 재검증 플래그 추가

`media-transport.ts`에 새로고침 감지 로직을 추가했다.

변경 내용:

- `MEDIA_REFRESH_RECHECK_KEY = "omnux:media-refresh-recheck"` 추가.
- `MEDIA_REFRESH_RECHECK_DELAY_MS = 2000` 추가.
- `MEDIA_REFRESH_RECHECK_EVENT = "omnux:media-refresh-recheck"` 추가.
- `markMediaRefreshRecheck()` 추가.
- `consumeMediaRefreshRecheck()` 추가.
- `PerformanceNavigationTiming.type === "reload"`로 브라우저 reload 진입을 감지.

`DesktopTopBar.tsx` 변경 내용:

- 새로고침 버튼 클릭 시 `markMediaRefreshRecheck()` 호출.
- 2초 뒤 `MEDIA_REFRESH_RECHECK_EVENT`를 dispatch하는 fallback 추가.
- 이후 `window.location.reload()` 호출.

결과:

- 사용자가 요구한 "앱 새로고침 버튼 + 브라우저 새로고침" 경로를 코드상 반영했지만, 실제 문제는 해결되지 않았다.
- 중요한 의심점:
  - `DesktopTopBar.tsx`에서 `setTimeout(...dispatch...)`를 잡은 뒤 곧바로 `window.location.reload()`를 호출하므로, 실제 reload가 성공하면 이전 페이지의 타이머는 취소될 가능성이 높다.
  - 그래서 이 fallback은 "reload가 실패하거나 지연된 경우"에만 의미가 있을 수 있다.
  - 새 페이지에서는 `sessionStorage` 플래그 또는 navigation type으로 recheck를 감지하지만, 그것만으로 실제 OS 위치가 새로 들어온다는 보장은 없다.

### 4. 첫 fetch를 2초 뒤로 미루는 방식

한 시점에는 새로고침 감지 시 첫 미디어 조회를 `MEDIA_REFRESH_RECHECK_DELAY_MS`만큼 늦추는 구조였다.

문제:

- 사용자는 "새로고침 직전의 재생시간을 보여준다"고 했다.
- 첫 fetch를 2초 뒤로 미루면 새 페이지에서 상태가 비어야 정상인데, 사용자는 여전히 이전 시간이 보인다고 했다.
- 따라서 단순히 첫 fetch를 늦추는 방식은 현상과 맞지 않거나, 실제 앱에서는 reload/remount가 기대대로 발생하지 않는 가능성이 있다.

### 5. 접힌 상태의 `open` 조건 제거

`MediaWidget.tsx`에서 한때 다음 조건이 있었다.

```ts
const livePosition = playing && open && !seeking && !controlPending ? localElapsed : rawPosition;
```

문제:

- `open === false`인 접힌 위젯에서는 재생 중이어도 `localElapsed` 보간값을 버리고 OS에서 마지막으로 받은 `rawPosition`을 표시한다.
- 따라서 접힌 상태에서는 시간이 멈춘 것처럼 보일 수 있다.

변경 내용:

```ts
const livePosition = playing && !seeking && !controlPending ? localElapsed : rawPosition;
```

결과:

- 이론상 접힌 상태 표시 문제는 해결되어야 하지만, 사용자 확인 기준으로 전체 버그는 해결되지 않았다.
- 즉 `open` 조건은 실제 문제의 일부일 수 있지만 단독 원인은 아니다.

### 6. 폴링 간격 5초에서 2초로 변경

사용자가 `MEDIA_POLL_INTERVAL_MS`를 줄여도 될 것 같다고 했다.

변경 내용:

```ts
const MEDIA_POLL_INTERVAL_MS = 2000;
```

결과:

- 계약 검증은 이 값을 요구하도록 바뀌었고 통과했다.
- 그러나 사용자 체감 문제는 아직 해결되지 않았다.
- 폴링 간격도 단독 원인은 아니다.

### 7. 새로고침 직후 빠른 fetch + 2초 후 강제 fetch

마지막 시도에서는 새로고침 직후 첫 fetch를 2초 뒤로 미루지 않고, 다음처럼 바꿨다.

- 첫 fetch는 `MEDIA_STARTUP_DELAY_MS = 32` 뒤 실행.
- 새로고침 진입이면 별도 `recheckTimer`로 2초 뒤 `fetchMedia()` 강제 호출.

현재 구조:

```ts
pollTimer = window.setTimeout(() => void poll(), MEDIA_STARTUP_DELAY_MS);
if (refreshRecheckOnMountRef.current) {
  recheckTimer = window.setTimeout(() => {
    if (!disposed) void fetchMedia();
  }, MEDIA_REFRESH_RECHECK_DELAY_MS);
}
```

결과:

- 계약 검증, 빌드, LSP 진단은 통과했다.
- 하지만 사용자 확인 기준으로 문제는 해결되지 않았다.
- 따라서 "2초 뒤 fetch가 호출되지 않는다" 또는 "호출되어도 OS/브리지 응답이 stale이다"를 런타임에서 확인해야 한다.

## 검증 이력

### 실패를 확인한 계약 검증

계약을 먼저 바꾼 뒤 실행했을 때 아래 이유로 실패했다.

```text
desktop media widget refreshes system media often enough to avoid stale playback time:
expected to include const MEDIA_POLL_INTERVAL_MS = 2000;
```

이후 구현을 맞춘 뒤 통과했다.

### 통과한 명령

```bash
node scripts/check-desktop-shell-boundary-contract.mjs
```

결과:

```text
[check-desktop-shell-boundary-contract] ok (1114 assertions, inspected 29 files)
```

```bash
npm run build
```

작업 디렉터리:

```text
/Users/songhabin/omnux/apps/desktop
```

결과:

- `tsc` 통과.
- `vite build` 통과.
- 큰 chunk 경고만 있음.

LSP 진단:

- `MediaWidget.tsx`: No diagnostics found.
- `media-transport.ts`: No diagnostics found.
- `DesktopTopBar.tsx`: No diagnostics found.

### 로컬 브리지 확인

브리지 포트:

```bash
lsof -iTCP:41881 -sTCP:LISTEN -nP
```

결과:

```text
omnux_des ... TCP 127.0.0.1:41881 (LISTEN)
```

`/media`를 직접 조회했을 때 한 시점의 결과:

```json
{
  "title": "공감도 지능이다",
  "source": "com.apple.WebKit.GPU",
  "playing": false,
  "position": 0,
  "duration": 0
}
```

2.1초 간격 재조회 결과:

```json
{
  "first": {
    "playing": false,
    "position": 0
  },
  "second": {
    "playing": false,
    "position": 0
  },
  "delta": 0
}
```

주의:

- 이 확인 시점에는 OS가 `playing: false`를 반환했다.
- 따라서 실제 재생 중 position 증가 여부는 이 검증으로 증명하지 못했다.
- 다만 `source`가 `com.apple.WebKit.GPU`로 잡힌 점은 이상하다. 실제 재생 세션 선택이 잘못되거나, macOS MediaRemote가 기대한 앱 세션 대신 WebKit/GPU 관련 세션을 반환하는 가능성이 있다.

## 외부 자료 확인 내용

### `media_remote::NowPlayingPerl::get_info()`

확인한 소스:

- https://github.com/nohackjustnoobb/media-remote/blob/d3d8e9ab8187ef4869bb73aec81f715372550a86/src/high_level/now_playing_perl.rs#L163-L175

요점:

- `NowPlayingPerl::get_info()`는 내부에 저장된 `NowPlayingInfo`를 반환하기 전에, 재생 중이면 `elapsed_time + SystemTime::now() - info_update_time` 방식으로 elapsed를 갱신한다.
- 그리고 `info_update_time`도 현재 시각으로 갱신한다.

중요한 함의:

- 현재 `/Users/songhabin/omnux/apps/desktop/src-tauri/src/media.rs`도 `media_data_from_info()`에서 `info.elapsed_time`에 `info.info_update_time` 이후 경과 시간을 다시 더한다.
- Perl 경로에서는 crate 내부가 이미 갱신한 뒤라 추가분이 거의 0초일 수 있지만, 이중 보정 가능성은 계속 확인해야 한다.
- JXA fallback에서는 이 추가 보정이 필요할 수 있으므로 단순 삭제하면 다른 경로를 깨뜨릴 수 있다.

### 브라우저 reload 감지

확인한 문서:

- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type

요점:

- `PerformanceNavigationTiming.type`의 `"reload"`는 브라우저 reload, `location.reload()`, refresh pragma를 포함한다.
- 따라서 `pageLoadedByRefresh()`의 방향 자체는 맞다.

### React timer/effect 관련

확인한 문서:

- https://react.dev/reference/react/useEffect
- https://react.dev/reference/react/useEffectEvent

요점:

- interval을 effect에서 둘 때 최신 상태를 어떻게 읽는지 조심해야 한다.
- 현재 `MediaWidget.tsx`는 `pollAnchorRef`를 사용하므로 interval 콜백이 stale closure로 마지막 상태를 놓치는 문제는 비교적 낮다.

## 아직 남은 가능성이 큰 원인

### 1. 실제 reload/remount가 일어나지 않거나, 사용자가 보는 화면이 reload 전 상태일 가능성

`DesktopTopBar.tsx`는 `window.location.reload()`를 호출한다.

확인 필요:

- Tauri 웹뷰에서 이 호출이 실제로 새 document를 만드는지.
- 브라우저 개발 서버 경로에서 reload 후 `MediaWidget`이 진짜 unmount/remount되는지.
- reload 직후 `refreshRecheckOnMountRef.current`가 true인지.
- 2초 timer가 실제로 실행되는지.

필요한 다음 작업:

- 임시 로그를 추가해 mount 시각, navigation type, sessionStorage flag, fetch 실행 시각을 확인해야 한다.
- 사용자가 직접 테스트하는 흐름이면, 로그를 UI 로그나 콘솔에 남기는 방식이 필요하다.

### 2. `fetchMedia()`는 실행되지만 `/media` 응답 자체가 stale일 가능성

현재 프론트 로직을 아무리 바꿔도, OS/브리지가 stale position을 반환하면 위젯은 틀린 시간을 표시한다.

확인 필요:

- 실제 재생 중에 `/media`를 0초, 2초, 4초 간격으로 조회했을 때 `position`이 증가하는지.
- 새로고침 직전과 직후의 `/media` 응답이 같은지.
- Tauri invoke 경로와 HTTP bridge 경로가 같은 값을 반환하는지.

추천 명령:

```bash
node -e 'let n=0; const tick=async()=>{ const r=await fetch("http://127.0.0.1:41881/media",{cache:"no-store"}); const d=await r.json(); console.log(new Date().toISOString(), JSON.stringify({n:n++, title:d?.title, source:d?.source, playing:d?.playing, position:d?.position, duration:d?.duration})); if(n<8)setTimeout(tick,1000); }; tick().catch(e=>console.error(e));'
```

주의:

- album art는 출력하지 말아야 한다. base64가 매우 커질 수 있다.

### 3. macOS MediaRemote 세션 선택이 잘못됐을 가능성

관찰된 응답에서 `source`가 `com.apple.WebKit.GPU`였다.

이상한 점:

- 실제 재생 앱 이름이나 bundle id가 아니라 WebKit GPU 프로세스처럼 보인다.
- `duration: 0`, `position: 0`도 같이 반환됐다.

가능한 원인:

- `media_remote::NowPlayingPerl`이 현재 재생 세션이 아닌 보조 프로세스를 source로 잡고 있을 수 있다.
- `title`은 들어오지만 duration/elapsed가 0인 불완전한 세션이 선택되고 있을 수 있다.
- `media_data_from_info()`가 title만 있으면 세션을 유효하다고 보고 반환하기 때문에, duration/position이 없는 세션도 UI에 들어간다.

다음 확인:

- `NowPlayingPerl` raw info와 JXA fallback raw info를 비교해야 한다.
- title만 있고 elapsed/duration이 없는 세션을 거를지 결정해야 한다.
- `bundle_name`, `bundle_id`, `elapsed_time`, `duration`, `is_playing`, `info_update_time`을 로그로 찍어야 한다.

### 4. `NowPlayingPerl`의 static cache가 stale일 가능성

`media.rs`는 macOS에서 다음 static을 쓴다.

```rust
static NOW_PLAYING_PERL: OnceLock<NowPlayingPerl> = OnceLock::new();
```

가능한 문제:

- `NowPlayingPerl` 자체가 내부 RwLock에 마지막 info를 들고 있고, `get_info()`는 그 info를 보정해서 반환한다.
- 실제 OS 세션이 바뀌었는데 내부 info 갱신이 늦거나 실패하면, 프론트는 계속 과거 세션의 보정값을 받게 된다.

다음 확인:

- 매 호출마다 새 `NowPlayingPerl`을 만드는 실험을 해보고 값이 달라지는지 확인.
- JXA fallback을 강제로 쓰면 새로고침 후 position이 맞는지 확인.
- Perl 경로와 JXA 경로를 동시에 읽어 비교하는 임시 디버그 명령을 만들기.

### 5. `MediaWidget.tsx`의 anchor 갱신 조건이 부족할 가능성

현재 anchor는 주로 position 변화 또는 paused -> playing 전환에서 갱신된다.

```ts
const osPositionChanged = !isStaleSeek && (lastOsPositionRef.current < 0 || Math.abs(effectiveData.position - lastOsPositionRef.current) > 0.1);
const resumedPlaying = effectiveData.playing && !prev.playing;
```

가능한 문제:

- 트랙/source/title/duration이 바뀌었지만 position이 비슷하면 anchor가 재설정되지 않을 수 있다.
- duration이 0에서 정상 값으로 바뀌는 순간의 anchor 갱신이 충분하지 않을 수 있다.
- source가 이상한 세션으로 바뀌어도 position 변화가 작으면 기존 anchor가 유지될 수 있다.

다음 확인:

- anchor reset 조건에 title/source/duration 변경도 포함해야 하는지 검토.
- `lastMediaIdentityRef` 같은 식별자를 두고 `title`, `artist`, `album`, `source`, `duration` 변화 시 anchor를 리셋하는 실험.

### 6. `mediaOperationRef.current` 때문에 2초 forced fetch가 skip될 가능성

`fetchMedia()` 시작부:

```ts
if (mediaOperationRef.current) return;
```

가능한 문제:

- 새로고침 직후 또는 control/seek 직후 2초 forced fetch가 실행되어도, operation pending 중이면 아무 것도 하지 않고 끝난다.
- 이후 즉시 재시도하지 않는다.

다음 확인:

- forced recheck는 operation pending이면 짧게 retry하도록 해야 하는지 확인.

## 현재 계약 스크립트 상태

`scripts/check-desktop-shell-boundary-contract.mjs`는 현재 다음을 요구한다.

- `MEDIA_STARTUP_DELAY_MS` 존재.
- `const MEDIA_POLL_INTERVAL_MS = 2000;` 존재.
- `requestAnimationFrame(tick)` 미사용.
- `setTimeout(poll, 250)` 미사용.
- `playing && !seeking && !controlPending` 존재.
- `clampMediaPosition` 존재.

주의:

- 이 계약은 문자열 기반이다.
- 런타임에서 2초 뒤 실제 fetch가 호출되는지까지 보장하지 않는다.
- 이 계약 통과를 "버그 해결"로 해석하면 안 된다.

## 다음 작업 권장 순서

1. 실제 재생 중 `/media` 응답을 1초 간격으로 관찰한다.
   - `position`이 증가하지 않으면 프론트 문제가 아니라 Rust/MediaRemote/세션 선택 문제다.
2. `MediaWidget.tsx`에 임시 디버그 로그를 추가한다.
   - mount 시각.
   - navigation type.
   - sessionStorage flag 존재 여부.
   - fetchMedia 호출 시각.
   - fetch 결과의 `{title, source, playing, position, duration}`.
   - displayedProgress 계산 결과.
3. Tauri invoke 경로와 HTTP bridge 경로를 분리해서 비교한다.
   - 브라우저/Vite에서 보는 값과 Tauri 앱 내부에서 보는 값이 같은지 확인한다.
4. macOS `media.rs`에서 Perl/JXA 값을 동시에 비교하는 임시 디버그 출력 또는 별도 test binary를 만든다.
5. `source === "com.apple.WebKit.GPU"` 같은 불완전 세션을 거르는 조건을 검토한다.
   - 단, title만 있는 정상 케이스도 있을 수 있으므로 사용자 재생 앱별로 확인 후 적용해야 한다.
6. anchor reset 조건을 트랙 identity 변화까지 넓히는 실험을 한다.
7. 위 관찰이 끝나기 전에는 `MEDIA_POLL_INTERVAL_MS`를 더 줄이는 방식으로 해결됐다고 판단하지 않는다.

## 현재 변경 파일

2026-06-08 기록 시점에 미디어 문제와 직접 관련해 수정된 파일:

```text
M apps/desktop/src/features/shell/DesktopTopBar.tsx
M apps/desktop/src/features/shell/MediaWidget.tsx
M apps/desktop/src/features/shell/media-transport.ts
M scripts/check-desktop-shell-boundary-contract.mjs
```

주의:

- 저장소 전체에는 OTP, 미들웨어, 모델 레지스트리 등 다른 변경도 많이 존재한다.
- 후속 작업자는 미디어 버그를 다룰 때 위 네 파일 외 변경을 임의로 되돌리면 안 된다.

## 결론

지금까지의 변경은 타입/빌드/계약 수준에서는 통과하지만 실제 사용자 문제를 해결하지 못했다.

가장 중요한 다음 확인은 UI 코드를 더 만지는 것이 아니라, 실제 재생 중에 `/media`와 `fetchMedia()`가 어떤 값을 언제 반환하는지 관찰하는 것이다.

특히 아래 둘 중 어느 쪽인지 먼저 분리해야 한다.

1. `fetchMedia()`가 2초 뒤 실행되지 않는다.
2. 실행되지만 `/media` 또는 Tauri invoke가 stale/불완전한 position을 반환한다.

이 분리가 끝나기 전까지는 "폴링 간격", "open 조건", "2초 타이머"만 더 조정해도 같은 문제가 반복될 가능성이 높다.
