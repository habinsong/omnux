import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Music, Play, Pause, SkipBack, SkipForward, ChevronRight, ChevronLeft } from "lucide-react";
import { Card, IconButton, cn } from "../../components/ui/primitives";
import { useDraggableWidget } from "./useDraggableWidget";
import {
  controlMedia,
  getMediaInfo,
  seekMedia,
  type MediaControlAction,
  type MediaData
} from "./media-transport";

// 임시 스펙트럼 애니메이션 바
function AudioSpectrum({ playing }: { playing: boolean }) {
  const [bars, setBars] = useState([40, 70, 30, 90, 50]);

  useEffect(() => {
    if (!playing) {
      setBars([20, 20, 20, 20, 20]);
      return;
    }
    const interval = setInterval(() => {
      setBars(bars.map(() => Math.floor(Math.random() * 80) + 20));
    }, 150);
    return () => clearInterval(interval);
  }, [playing]);

  return (
    <div className="flex items-end gap-0.5 h-6 w-8 shrink-0">
      {bars.map((height, i) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className="w-1 bg-primary rounded-t-[1px] transition-all duration-150"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** long press 감지를 위한 상수 */
const LONG_PRESS_THRESHOLD_MS = 500;

export function MediaWidget() {
  const [open, setOpen] = useState(false);
  const widgetHeight = open ? 218 : 96;
  const { y, isDragging, pointerHandlers } = useDraggableWidget("media-player", "calc(50% + 80px)", {
    height: widgetHeight,
    order: 1
  });

  // 실제 데이터 상태
  const [mediaData, setMediaData] = useState<MediaData | null>(null);
  const [controlPending, setControlPending] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  const mediaRequestIdRef = useRef(0);
  const mediaOperationRef = useRef(false);

  // 보간용 refs: 마지막으로 확인된 position + 시각
  const pollAnchorRef = useRef({ position: 0, time: 0, playing: false, duration: 0 });
  const lastOsPositionRef = useRef(-1);
  const lastSeekRef = useRef({ time: 0, target: -1 });
  const [localElapsed, setLocalElapsed] = useState(0);

  // rAF로 로컬 초 증가 — 폴링 응답 사이 빈틈 메움
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const anchor = pollAnchorRef.current;
      if (anchor.playing && anchor.time > 0) {
        const dt = (performance.now() - anchor.time) / 1000;
        setLocalElapsed(Math.min(anchor.duration, anchor.position + dt));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const applyMediaData = useCallback((data: MediaData | null) => {
    if (!data) {
      setMediaData(null);
      lastOsPositionRef.current = -1;
      return;
    }

    const now = performance.now();
    let isStaleSeek = false;
    if (now - lastSeekRef.current.time < 2000) {
      if (Math.abs(data.position - lastSeekRef.current.target) > 2.0) {
        isStaleSeek = true;
      } else {
        lastSeekRef.current.time = 0;
      }
    }

    const effectiveData = isStaleSeek ? { ...data, position: lastSeekRef.current.target } : data;
    setMediaData(effectiveData);

    const prev = pollAnchorRef.current;
    const osPositionChanged = !isStaleSeek && (lastOsPositionRef.current < 0 || Math.abs(effectiveData.position - lastOsPositionRef.current) > 0.1);
    const resumedPlaying = effectiveData.playing && !prev.playing;
    
    if (!isStaleSeek) {
      lastOsPositionRef.current = effectiveData.position;
    }

    if (osPositionChanged || resumedPlaying) {
      pollAnchorRef.current = {
        position: effectiveData.position,
        time: now,
        playing: effectiveData.playing,
        duration: effectiveData.duration,
      };
      setLocalElapsed(effectiveData.position);
    } else {
      pollAnchorRef.current.playing = effectiveData.playing;
      pollAnchorRef.current.duration = effectiveData.duration;
    }
  }, []);

  const fetchMedia = useCallback(async () => {
    if (mediaOperationRef.current) return;
    const requestId = ++mediaRequestIdRef.current;
    try {
      const data = await getMediaInfo();
      if (requestId !== mediaRequestIdRef.current) return;
      applyMediaData(data);
    } catch (err) {
      console.error("Failed to fetch media info:", err);
    }
  }, [applyMediaData]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    const poll = async () => {
      await fetchMedia();
      if (!disposed) timer = window.setTimeout(poll, 250);
    };
    void poll();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [fetchMedia]);

  const playing = mediaData?.playing ?? false;
  const duration = mediaData?.duration ?? 0;
  const rawPosition = mediaData?.position ?? 0;
  const livePosition = playing && !seeking && !controlPending ? localElapsed : rawPosition;
  const displayedProgress = scrubPosition ?? livePosition;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayedProgress / duration) * 100)) : 0;
  const canSeek = Boolean(mediaData && duration > 0 && !controlPending);
  const title = mediaData?.title || "미디어 없음";
  const detailText = mediaData
    ? [mediaData.artist, mediaData.album]
        .filter((value) => value.trim().length > 0)
        .join(" · ") || mediaData.source || "재생 중"
    : "시스템 미디어 세션 없음";
  const artUrl = mediaData?.art_url;

  const runControl = async (action: MediaControlAction) => {
    if (!mediaData || controlPending) return;
    mediaOperationRef.current = true;
    mediaRequestIdRef.current += 1;
    setControlPending(true);
    try {
      await controlMedia(action);
      const data = await getMediaInfo();
      applyMediaData(data);
    } catch (err) {
      console.error("Failed to control media:", err);
    } finally {
      mediaOperationRef.current = false;
      setControlPending(false);
    }
  };

  const clampPosition = (value: number) => Math.min(duration, Math.max(0, value));

  const positionFromPointer = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || duration <= 0) return displayedProgress;
    return clampPosition(((clientX - rect.left) / rect.width) * duration);
  };

  const seekTo = async (position: number) => {
    if (!mediaData || duration <= 0 || controlPending) return;
    const target = clampPosition(position);
    setScrubPosition(target);
    setMediaData((previous) => {
      if (!previous) return previous;
      return { ...previous, position: target };
    });
    mediaOperationRef.current = true;
    mediaRequestIdRef.current += 1;
    setControlPending(true);
    try {
      await seekMedia(target);
      lastSeekRef.current = { time: performance.now(), target };
      pollAnchorRef.current = {
        position: target,
        time: performance.now(),
        playing: pollAnchorRef.current.playing,
        duration: pollAnchorRef.current.duration,
      };
      lastOsPositionRef.current = target;
      setLocalElapsed(target);
    } catch (err) {
      console.error("Failed to seek media:", err);
    } finally {
      mediaOperationRef.current = false;
      setSeeking(false);
      setScrubPosition(null);
      setControlPending(false);
    }
  };

  const handleSeekPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSeeking(true);
    setScrubPosition(positionFromPointer(event.clientX, event.currentTarget));
  };

  const handleSeekPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!seeking || !canSeek) return;
    event.preventDefault();
    event.stopPropagation();
    setScrubPosition(positionFromPointer(event.clientX, event.currentTarget));
  };

  const handleSeekPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!seeking || !canSeek) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    void seekTo(positionFromPointer(event.clientX, event.currentTarget));
  };

  const handleSeekPointerCancel = () => {
    setSeeking(false);
    setScrubPosition(null);
  };

  const handleSeekKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const keyTarget: Record<string, number> = {
      ArrowLeft: displayedProgress - 5,
      ArrowRight: displayedProgress + 5,
      Home: 0,
      End: duration
    };
    const target = keyTarget[event.key];
    if (target === undefined) return;
    event.preventDefault();
    void seekTo(target);
  };

  // ---------- long press 핸들러 (꾹 → 이전/다음 트랙) ----------
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const handleSkipPointerDown = (direction: "backward" | "forward") => {
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      void runControl(direction === "backward" ? "previous_track" : "next_track");
    }, LONG_PRESS_THRESHOLD_MS);
  };

  const handleSkipPointerUp = (direction: "backward" | "forward") => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!longPressFiredRef.current) {
      const offset = direction === "backward" ? -15 : 15;
      void seekTo((mediaData?.position ?? 0) + offset);
    }
  };

  const handleSkipPointerLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  return (
    <div
      className={cn(
        "draggable-widget-container absolute right-0 z-20 flex items-start transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "translate-x-[calc(100%-3rem)]"
      )}
      style={{ top: typeof y === "number" ? `${y}px` : y }}
    >
      <button
        type="button"
        onClick={(e) => {
          if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          setOpen((value) => !value);
        }}
        {...pointerHandlers}
        aria-label={open ? "미디어 제어 닫기" : "미디어 제어 열기"}
        className="flex h-24 w-12 shrink-0 cursor-grab flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0 border-border bg-card/60 backdrop-blur-md shadow-sm transition-colors hover:bg-accent active:cursor-grabbing"
      >
        <span className="relative block h-[18px] w-[18px]" aria-hidden="true">
          <Music size={18} className="absolute inset-0 text-muted-foreground/30" />
          {playing ? (
            <span className="media-icon-color-wave absolute inset-0 overflow-hidden">
              <Music size={18} className="text-primary" />
            </span>
          ) : null}
        </span>
        {open ? <ChevronRight size={14} className="text-muted-foreground mt-1" aria-hidden="true" /> : <ChevronLeft size={14} className="text-muted-foreground mt-1" aria-hidden="true" />}
      </button>
      
      <Card className={cn(
        "flex w-[17rem] flex-col overflow-hidden p-0 rounded-tl-none border-l-0 transition-[height] duration-300 ease-out",
        open ? "h-[218px]" : "h-[96px]"
      )}>
        <div className="flex-1 min-w-0 p-3 bg-card/60 backdrop-blur-md h-full flex flex-col">
          {/* 헤더 및 스펙트럼 */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="truncate text-sm font-semibold">현재 재생 중</span>
            <AudioSpectrum playing={playing} />
          </div>

          {/* 미디어 정보 (썸네일 + 곡 정보) */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden bg-muted relative">
              {artUrl ? (
                <img src={artUrl} alt="Album Art" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-500 opacity-80" />
                  <Music className="absolute inset-0 m-auto text-white/50" size={24} />
                </>
              )}
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="truncate text-sm font-bold leading-tight">{title}</span>
              <span className="truncate text-xs text-muted-foreground">{detailText}</span>
            </div>
          </div>

          {/* 진행률 바 — transition 제거하여 실시간 갱신 */}
          <div className="space-y-1.5 mb-4">
            <div
              role="slider"
              tabIndex={canSeek ? 0 : -1}
              aria-label="재생 위치"
              aria-disabled={!canSeek}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(displayedProgress)}
              aria-valuetext={`${formatTime(displayedProgress)} / ${formatTime(duration)}`}
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              onPointerUp={handleSeekPointerUp}
              onPointerCancel={handleSeekPointerCancel}
              onKeyDown={handleSeekKeyDown}
              className={cn("relative h-4 w-full touch-none outline-none", canSeek ? "cursor-pointer" : "cursor-not-allowed opacity-70")}
            >
              <div className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-card shadow-sm"
                style={{ left: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums font-medium">
              <span>{formatTime(displayedProgress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 컨트롤 바 — long press로 이전/다음 트랙 */}
          <div className="flex items-center justify-center gap-4">
            <IconButton 
              icon={SkipBack} 
              label="15초 뒤로 (꾹: 이전 트랙)"
              disabled={!mediaData || controlPending}
              onPointerDown={() => handleSkipPointerDown("backward")}
              onPointerUp={() => handleSkipPointerUp("backward")}
              onPointerLeave={handleSkipPointerLeave}
              onPointerCancel={handleSkipPointerLeave}
            />
            <button
              type="button"
              onClick={() => void runControl("toggle")}
              disabled={!mediaData || controlPending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95 hover:bg-primary/90"
              aria-label={playing ? "일시정지" : "재생"}
            >
              {playing ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-0.5" />}
            </button>
            <IconButton 
              icon={SkipForward} 
              label="15초 앞으로 (꾹: 다음 트랙)"
              disabled={!mediaData || controlPending}
              onPointerDown={() => handleSkipPointerDown("forward")}
              onPointerUp={() => handleSkipPointerUp("forward")}
              onPointerLeave={handleSkipPointerLeave}
              onPointerCancel={handleSkipPointerLeave}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
