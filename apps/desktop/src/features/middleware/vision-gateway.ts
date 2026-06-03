import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

type VisionAttachmentPayload = {
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  isImage: boolean;
};

registerDesktopRequestTypes("clipboard_vision_preflight");

export const requestDesktopVision = {
  preflight(input: { provider: string; model: string; text: string; attachments: VisionAttachmentPayload[] }) {
    return sendDesktopRequest({
      type: "clipboard_vision_preflight",
      provider: input.provider,
      model: input.model,
      text: input.text,
      attachments: input.attachments
    });
  }
};
