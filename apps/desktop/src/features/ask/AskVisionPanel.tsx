import { X } from "lucide-react";
import { Badge, Button, Spinner } from "../../components/ui/primitives";
import type { AskVisionAttachment, AskVisionPreflight } from "./ask-vision";

function visionTone(value: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const normalized = value.toLowerCase();
  if (/(ready|ok|selected|supported)/.test(normalized)) return "success";
  if (/(manual|warning|fallback|skipped)/.test(normalized)) return "warning";
  if (/(blocked|failed|unsupported|invalid|empty|too_large)/.test(normalized)) return "destructive";
  if (/(route|candidate|preflight)/.test(normalized)) return "primary";
  return "default";
}

function formatBytes(value: number): string {
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function AskVisionPanel({
  files,
  preflight,
  pending,
  onClear
}: {
  files: AskVisionAttachment[];
  preflight: AskVisionPreflight | null;
  pending: boolean;
  onClear: () => void;
}) {
  if (files.length === 0 && !preflight) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">Vision preflight</Badge>
            <Badge tone="outline">{files.length} files</Badge>
            {preflight ? <Badge tone={visionTone(preflight.status)}>{preflight.status}</Badge> : null}
            {pending ? <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Spinner size={12} /> 점검 중</span> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">Vision API 호출 없음 · 이미지와 라우팅 준비 상태만 확인</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Vision preflight 닫기" onClick={onClear}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
        <div className="min-w-0 space-y-1">
          {files.map((file) => (
            <div key={`${file.name}-${file.sizeBytes}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{file.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{file.mimeType || "image"} · {formatBytes(file.sizeBytes)}</span>
              </span>
              <Badge tone="outline">local</Badge>
            </div>
          ))}
          {preflight?.images.slice(0, 3).map((image) => (
            <div key={`${image.name}-${image.status}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{image.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{image.message} · {formatBytes(image.decodedSizeBytes || image.declaredSizeBytes)}</span>
              </span>
              <Badge tone={visionTone(image.status)}>{image.status}</Badge>
            </div>
          ))}
        </div>
        <div className="min-w-0 space-y-1">
          {preflight?.providerCandidates.slice(0, 3).map((candidate) => (
            <div key={`${candidate.provider}-${candidate.status}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{candidate.provider} {candidate.model || ""}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{candidate.message}</span>
              </span>
              <Badge tone={visionTone(candidate.status)}>{candidate.status}</Badge>
            </div>
          ))}
          {preflight?.checks.slice(0, 4).map((check) => (
            <div key={check.name} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{check.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{check.message}</span>
              </span>
              <Badge tone={visionTone(check.status)}>{check.status}</Badge>
            </div>
          ))}
        </div>
      </div>
      {preflight?.warnings.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {preflight.warnings.slice(0, 4).map((warning) => <Badge key={warning} tone="warning" className="max-w-full truncate">{warning}</Badge>)}
        </div>
      ) : null}
      {preflight?.suggestedPrompt ? (
        <p className="mt-2 max-h-10 overflow-hidden rounded-md bg-background/50 px-2 py-1.5 text-xs text-muted-foreground">{preflight.suggestedPrompt}</p>
      ) : null}
    </div>
  );
}
