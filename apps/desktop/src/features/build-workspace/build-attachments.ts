import type { Attachment } from "./build-model";

export const attachmentLimit = 10 * 1024 * 1024;
export async function readAttachments(files: File[], existing: Attachment[]): Promise<Attachment[]> {
  if (files.length + existing.length > 6) throw new Error("파일은 최대 6개까지 첨부할 수 있습니다.");
  if (files.reduce((sum, file) => sum + file.size, existing.reduce((sum, file) => sum + file.sizeBytes, 0)) > attachmentLimit) throw new Error("첨부 파일의 전체 크기는 10MB 이하여야 합니다.");
  return Promise.all(files.map(file => new Promise<Attachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`파일을 읽지 못했습니다: ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || "");
      const marker = result.indexOf("base64,");
      if (marker < 0) { reject(new Error(`파일을 첨부하지 못했습니다: ${file.name}`)); return; }
      resolve({ name: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, dataBase64: result.slice(marker + 7), isImage: file.type.startsWith("image/") });
    };
    reader.readAsDataURL(file);
  })));
}
