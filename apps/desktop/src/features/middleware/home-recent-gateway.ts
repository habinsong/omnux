import { sendDesktopRequest } from "./desktop-message-gateway";

const MODES = ["single", "orchestration", "multi"] as const;

export const HOME_RECENT_PREFIX = "home-recent-";

export function requestDesktopHomeRecent(sequence: number) {
  let sent = 0;
  for (const mode of MODES) {
    if (sendDesktopRequest({ type: "list_conversations", scope: "chat", mode, requestId: `${HOME_RECENT_PREFIX}chat-${mode}-${sequence}` })) sent += 1;
    if (sendDesktopRequest({ type: "list_conversations", scope: "coding", mode, requestId: `${HOME_RECENT_PREFIX}coding-${mode}-${sequence}` })) sent += 1;
  }
  if (sendDesktopRequest({ type: "plan_list", requestId: `${HOME_RECENT_PREFIX}plans-${sequence}` })) sent += 1;
  return sent > 0;
}
