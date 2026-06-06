import { useAskStore, type AskChatMode, type AskInputAttachment, type AskProvider } from "../ask/ask-store";
import { useBuildStore } from "../build/build-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import type { ComposerIntent } from "./composer-intent";

// File → 스토어 첨부 형태(AskInputAttachment === BuildInputAttachment, 구조 동일)로 변환.
function readBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const marker = "base64,";
      const idx = result.indexOf(marker);
      resolve(idx >= 0 ? result.slice(idx + marker.length) : "");
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export async function filesToInputAttachments(files: File[]): Promise<AskInputAttachment[]> {
  const out: AskInputAttachment[] = [];
  for (const file of files) {
    const dataBase64 = await readBase64(file);
    if (!dataBase64) continue;
    out.push({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      dataBase64,
      sizeBytes: file.size,
      isImage: (file.type || "").startsWith("image/")
    });
  }
  return out;
}

export type SendFromHomeArgs = {
  intent: ComposerIntent;
  text: string;
  chatMode: AskChatMode;
  provider: AskProvider;
  model: string | null;
  thinkPlus: boolean;
  files: File[];
};

// 홈 컴포저의 값을 타깃(Ask/Build) 스토어에 세팅하고 해당 탭으로 이동 + 즉시 전송한다.
// 미연결/미인증이면 sendMessage가 no-op이 되고 입력은 타깃 탭 draft로 남는다.
export async function sendFromHome(args: SendFromHomeArgs): Promise<void> {
  const { intent, text, chatMode, provider, model, thinkPlus, files } = args;
  const attachments = files.length > 0 ? await filesToInputAttachments(files) : [];
  const navigate = useDesktopNavigationStore.getState().setActivePage;

  if (intent === "build") {
    const build = useBuildStore.getState();
    build.setCodingMode(chatMode);
    build.setCodingInput(text);
    if (provider !== "auto") build.setProvider(provider);
    if (provider !== "auto" && model) build.setSelectedModel(provider, model);
    build.setThinkPlus(thinkPlus);
    if (attachments.length > 0) build.addAttachments(attachments);
    navigate("build");
    useBuildStore.getState().runCoding();
    return;
  }

  const ask = useAskStore.getState();
  ask.setChatMode(chatMode);
  ask.setInput(text);
  if (provider !== "auto") ask.setProvider(provider);
  if (provider !== "auto" && model) ask.setSelectedModel(provider, model);
  ask.setThinkPlus(thinkPlus);
  if (attachments.length > 0) ask.addAttachments(attachments);
  navigate("ask");
  useAskStore.getState().sendMessage();
}
