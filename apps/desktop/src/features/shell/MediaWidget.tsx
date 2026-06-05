import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Music, Play, Pause, SkipBack, SkipForward, ChevronRight, ChevronLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Card, IconButton, cn } from "../../components/ui/primitives";
import { useDraggableWidget } from "./useDraggableWidget";

interface MediaData {
  title: string;
  artist: string;
  album: string;
  source: string | null;
  playing: boolean;
  position: number;
  duration: number;
  art_url: string | null;
}

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

export function MediaWidget() {
  const [open, setOpen] = useState(false);
  const widgetHeight = open ? 300 : 96;
  const { y, isDragging, pointerHandlers } = useDraggableWidget("media-player", "calc(50% + 80px)", {
    height: widgetHeight,
    order: 1
  });

  // 실제 데이터 상태
  const [mediaData, setMediaData] = useState<MediaData | null>(null);
  const [controlPending, setControlPending] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  useEffect(() => {
    // 1초마다 백엔드 폴링
    const fetchMedia = async () => {
      try {
        const data = await invoke<MediaData | null>("get_media_info");
        setMediaData(data);
      } catch (err) {
        console.error("Failed to fetch media info:", err);
      }
    };
    
    fetchMedia();
    const interval = setInterval(fetchMedia, 1000);
    return () => clearInterval(interval);
  }, []);

  const playing = mediaData?.playing ?? false;
  const progress = mediaData?.position ?? 0;
  const duration = mediaData?.duration ?? 0;
  const displayedProgress = scrubPosition ?? progress;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayedProgress / duration) * 100)) : 0;
  const canSeek = Boolean(mediaData && duration > 0 && !controlPending);
  const title = mediaData?.title || "미디어 없음";
  const detailText = mediaData
    ? [mediaData.artist, mediaData.album]
        .filter((value) => value.trim().length > 0)
        .join(" · ") || mediaData.source || "재생 중"
    : "시스템 미디어 세션 없음";
  const artUrl = mediaData?.art_url;

  const runControl = async (action: "toggle" | "seek_backward" | "seek_forward") => {
    if (!mediaData || controlPending) return;
    setControlPending(true);
    try {
      await invoke("control_media", { action });
      const data = await invoke<MediaData | null>("get_media_info");
      setMediaData(data);
    } catch (err) {
      console.error("Failed to control media:", err);
    } finally {
      setControlPending(false);
    }
  };

  const clampPosition = (value: number) => Math.min(duration, Math.max(0, Math.round(value)));

  const positionFromPointer = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || duration <= 0) return progress;
    return clampPosition(((clientX - rect.left) / rect.width) * duration);
  };

  const seekTo = async (position: number) => {
    if (!mediaData || duration <= 0 || controlPending) return;
    const target = clampPosition(position);
    setScrubPosition(target);
    setControlPending(true);
    try {
      await invoke("seek_media", { position: target });
      const data = await invoke<MediaData | null>("get_media_info");
      setMediaData(data);
    } catch (err) {
      console.error("Failed to seek media:", err);
    } finally {
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
        <Music size={18} className="text-primary" aria-hidden="true" />
        {open ? <ChevronRight size={14} className="text-muted-foreground mt-1" aria-hidden="true" /> : <ChevronLeft size={14} className="text-muted-foreground mt-1" aria-hidden="true" />}
      </button>
      
      <Card className={cn(
        "flex w-[17rem] flex-col overflow-hidden p-0 rounded-l-none border-l-0 transition-[max-height] duration-300 ease-out",
        open ? "max-h-[300px]" : "max-h-[96px]"
      )}>
        <div className="flex-1 min-w-0 p-3 bg-card/60 backdrop-blur-md h-full flex flex-col justify-center">
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

          {/* 진행률 바 */}
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
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
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

          {/* 컨트롤 바 */}
          <div className="flex items-center justify-center gap-4">
            <IconButton 
              icon={SkipBack} 
              label="15초 뒤로" 
              disabled={!mediaData || controlPending}
              onClick={() => void runControl("seek_backward")} 
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
              label="15초 앞으로" 
              disabled={!mediaData || controlPending}
              onClick={() => void runControl("seek_forward")} 
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
