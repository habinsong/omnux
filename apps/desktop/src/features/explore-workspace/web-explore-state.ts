import { create } from "zustand";
import { exploreRequestId, sendExploreCommand } from "../middleware/explore-workspace-gateway";
import { externalUrl, rows, text, number, type Payload } from "./explore-model";

type SearchItem = { title: string; url: string; description: string; published: string };
type WebDocument = { url: string; text: string; truncated: boolean; contentType: string; status: string };
type WebExploreState = {
  input: string;
  pending: { id: string; kind: "search" | "document" } | null;
  results: SearchItem[] | null;
  document: WebDocument | null;
  provider: string;
  query: string;
  error: string;
  maxChars: number;
  search: () => void;
};
export const useWebExplore = create<WebExploreState>((set, get) => ({
  input: "", pending: null, results: null, document: null, provider: "", query: "", error: "", maxChars: 20000,
  search: () => {
    const state = get(), input = state.input.trim();
    if (!input || state.pending) return;
    const address = externalUrl(input);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) && !address) { set({ error: "http 또는 https 주소를 입력해 주세요." }); return; }
    const id = exploreRequestId(), kind = address ? "document" : "search";
    set({ pending: { id, kind }, error: "" });
    const sent = sendExploreCommand(address ? "web_fetch" : "web_search", id, address ? { url: address, extractMode: "text", maxChars: state.maxChars } : { query: input, count: 8 });
    if (!sent) set({ pending: null, error: "요청을 보내지 못했습니다. 입력과 이전 결과는 유지됩니다." });
  }
}));

export function receiveWebExplore(message: Payload) {
  const pending = useWebExplore.getState().pending;
  if (!pending || message.requestId !== pending.id) return;
  if (message.type === "error") { useWebExplore.setState({ pending: null, error: text(message.message) || "요청에 실패했습니다." }); return; }
  if (message.type === "web_search_result" && pending.kind === "search") {
    const error = text(message.error);
    useWebExplore.setState({ pending: null, error,
      ...(!error ? { results: rows(message.results).map(item => ({ title: text(item.title), url: externalUrl(item.url), description: text(item.description), published: text(item.published) })), document: null, provider: text(message.provider), query: text(message.query) } : {})
    });
  }
  if (message.type === "web_fetch_result" && pending.kind === "document") {
    const error = text(message.error);
    useWebExplore.setState({ pending: null, error,
      ...(!error ? { document: { url: externalUrl(message.finalUrl || message.url), text: text(message.text), truncated: message.truncated === true, contentType: text(message.contentType), status: String(number(message.status) || message.status || "") }, results: null } : {})
    });
  }
}
export function disconnectWebExplore() {
  if (useWebExplore.getState().pending) useWebExplore.setState({ pending: null, error: "연결이 끊겨 결과를 확인하지 못했습니다. 작성한 내용은 유지됩니다." });
}
