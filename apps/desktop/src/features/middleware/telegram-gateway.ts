import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Telegram credential 설정은 secret 설정 영역이라 도메인 gateway에서만 WS 전송한다.
registerDesktopRequestTypes(
  "get_settings",
  "set_telegram_credentials",
  "delete_telegram_credentials",
  "test_telegram"
);

export const requestDesktopTelegram = {
  settings() {
    return sendDesktopRequest({ type: "get_settings" });
  },
  save(botToken: string, chatId: string, persist = true) {
    return sendDesktopRequest({
      type: "set_telegram_credentials",
      telegramBotToken: botToken.trim() || undefined,
      telegramChatId: chatId.trim() || undefined,
      persist
    });
  },
  test() {
    return sendDesktopRequest({ type: "test_telegram" });
  },
  deleteCredentials(persist = true) {
    return sendDesktopRequest({ type: "delete_telegram_credentials", persist });
  }
};
