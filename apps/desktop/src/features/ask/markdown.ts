import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

// 대시보드 dashboard-markdown.js의 무거운 뷰 로직(마크다운/표/코드/링크 렌더 + 안전 sanitize)을
// 데스크톱 React/TS로 이식한 모듈. presentation 전용 — WS/미들웨어/도메인 로직 없음.
const md = new MarkdownIt({
  html: false, // 모델 출력의 raw HTML 주입 차단 (sanitize 이전 1차 방어)
  linkify: true,
  breaks: true,
  typographer: false
});

// 링크는 새 탭 + noopener 로 연다.
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdownToSafeHtml(value: string): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (!text.trim()) {
    return "";
  }

  const rendered = md.render(text);
  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "form", "input", "iframe", "script"],
    FORBID_ATTR: ["style", "onerror", "onload"]
  });
}
