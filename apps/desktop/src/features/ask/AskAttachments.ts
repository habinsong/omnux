import { type AskInputAttachment } from "./ask-store";
import { formatBytes } from "./ask-view-utils";

export const MAX_ATTACHMENT_COUNT = 6;

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return (dataTransfer.files && dataTransfer.files.length > 0) || types.includes("Files") || types.includes("application/x-moz-file");
}

export function readFileAsAttachment(file: File): Promise<AskInputAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const marker = "base64,";
      const idx = result.indexOf(marker);
      const dataBase64 = idx >= 0 ? result.slice(idx + marker.length) : "";
      if (!dataBase64) {
        reject(new Error(`첨부 인코딩 실패: ${file.name}`));
        return;
      }
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
        sizeBytes: file.size || 0,
        isImage: (file.type || "").startsWith("image/")
      });
    };
    reader.onerror = () => reject(new Error(`첨부 읽기 실패: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function filesToAttachments(files: FileList | File[] | null, existingCount: number): Promise<{ items: AskInputAttachment[]; error: string | null; }> {
  const list = Array.from(files || []);
  const items: AskInputAttachment[] = [];
  for (const file of list) {
    if (existingCount + items.length >= MAX_ATTACHMENT_COUNT) {
      return { items, error: `첨부는 최대 ${MAX_ATTACHMENT_COUNT}개까지 가능합니다.` };
    }
    if ((file.size || 0) > MAX_ATTACHMENT_BYTES) {
      return { items, error: `첨부 파일 크기 제한 초과: ${file.name} (최대 ${formatBytes(MAX_ATTACHMENT_BYTES)})` };
    }
    items.push(await readFileAsAttachment(file));
  }
  return { items, error: null };
}
