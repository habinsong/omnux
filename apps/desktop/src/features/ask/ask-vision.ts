export type AskVisionAttachment = {
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  isImage: boolean;
};

export type AskVisionPreflight = {
  status: string;
  readOnly: boolean;
  clipboardWatcherEnabled: boolean;
  backendVisionRouteAvailable: boolean;
  visionCallEnabled: boolean;
  scaffoldingExecutionEnabled: boolean;
  attachmentCount: number;
  imageCount: number;
  images: Array<{ name: string; mimeType: string; declaredSizeBytes: number; decodedSizeBytes: number; status: string; supported: boolean; message: string }>;
  providerCandidates: Array<{ provider: string; model: string; status: string; selected: boolean; backendSupported: boolean; message: string }>;
  checks: Array<{ name: string; status: string; message: string }>;
  warnings: string[];
  suggestedPrompt: string;
  scannedAtUtc: string;
};

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function s(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function n(value: unknown): number {
  return Number(value || 0);
}

export function normalizeVisionPreflight(payload: Record<string, unknown>): AskVisionPreflight {
  return {
    status: s(payload.status),
    readOnly: !!payload.readOnly,
    clipboardWatcherEnabled: !!payload.clipboardWatcherEnabled,
    backendVisionRouteAvailable: !!payload.backendVisionRouteAvailable,
    visionCallEnabled: !!payload.visionCallEnabled,
    scaffoldingExecutionEnabled: !!payload.scaffoldingExecutionEnabled,
    attachmentCount: n(payload.attachmentCount),
    imageCount: n(payload.imageCount),
    images: arr(payload.images).map((image) => ({
      name: s(image.name),
      mimeType: s(image.mimeType),
      declaredSizeBytes: n(image.declaredSizeBytes),
      decodedSizeBytes: n(image.decodedSizeBytes),
      status: s(image.status),
      supported: !!image.supported,
      message: s(image.message)
    })),
    providerCandidates: arr(payload.providerCandidates).map((candidate) => ({
      provider: s(candidate.provider),
      model: s(candidate.model),
      status: s(candidate.status),
      selected: !!candidate.selected,
      backendSupported: !!candidate.backendSupported,
      message: s(candidate.message)
    })),
    checks: arr(payload.checks).map((check) => ({
      name: s(check.name),
      status: s(check.status),
      message: s(check.message)
    })),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
    suggestedPrompt: s(payload.suggestedPrompt),
    scannedAtUtc: s(payload.scannedAtUtc)
  };
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

function fileToAttachment(file: File): Promise<AskVisionAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했다.`));
    reader.onload = () => {
      const result = String(reader.result || "");
      const separator = result.indexOf(",");
      resolve({
        name: file.name || "image",
        mimeType: file.type || "application/octet-stream",
        dataBase64: separator >= 0 ? result.slice(separator + 1) : result,
        sizeBytes: file.size,
        isImage: true
      });
    };
    reader.readAsDataURL(file);
  });
}

export async function filesToVisionAttachments(files: FileList | null): Promise<AskVisionAttachment[]> {
  const imageFiles = Array.from(files || []).filter(isImageFile).slice(0, 3);
  return Promise.all(imageFiles.map(fileToAttachment));
}
