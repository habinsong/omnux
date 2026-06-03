/* omnux — Explore screen (Phase 3: web search / url fetch / sessions) */
(function () {
  const I = window.Icons;
  const h = React.createElement;

  function SearchTab({ st }) {
    const r = st.webResult;
    return h("div", null,
      h("div", { className: "items-center gap8", style: { marginBottom: 12 } },
        h("span", { style: { color: "var(--text-2)" } }, I.search({ size: 16 })),
        h("input", {
          className: "field", style: { flex: 1 },
          value: st.webQuery, placeholder: "웹 검색어 입력 후 Enter",
          onChange: (e) => st.setWebQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); st.runWebSearch(st.webQuery); } }
        }),
        h("button", { className: "btn", onClick: () => st.runWebSearch(st.webQuery), disabled: st.webSearching }, st.webSearching ? "검색 중…" : "검색")
      ),
      st.webSearching
        ? h("div", { className: "muted", style: { padding: "24px 4px", fontSize: 13 } }, "검색 중…")
        : !r
          ? h("div", { className: "empty", style: { padding: "32px 12px" } }, "검색어를 입력하면 결과가 표시됩니다.")
          : h("div", null,
              h("div", { className: "items-center gap8", style: { marginBottom: 10 } },
                h("span", { className: "badge soft" }, r.provider || "web"),
                h("span", { className: "row-meta" }, `결과 ${r.results.length}`)
              ),
              r.error ? h("div", { style: { color: "var(--red-text)", fontSize: 13, marginBottom: 10 } }, r.error) : null,
              r.results.length === 0 && !r.error
                ? h("div", { className: "empty", style: { padding: "24px 12px" } }, "검색 결과가 없습니다.")
                : h("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
                    r.results.map((hit, i) =>
                      h("div", { key: `${hit.url}-${i}`, className: "card card-pad", style: { background: "var(--surface-2)" } },
                        h("a", { href: hit.url, target: "_blank", rel: "noopener noreferrer", className: "row-title", style: { color: "var(--accent)", textDecoration: "none" } }, hit.title || hit.url || "제목 없음"),
                        h("div", { className: "row-meta mono", style: { fontSize: 11.5, margin: "2px 0 6px" } }, hit.url || ""),
                        h("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6 } }, hit.description || ""),
                        hit.published ? h("div", { className: "row-meta", style: { fontSize: 11.5, marginTop: 6 } }, hit.published) : null
                      )
                    )
                  )
            )
    );
  }

  function FetchTab({ st }) {
    const r = st.fetchResult;
    return h("div", null,
      h("div", { className: "items-center gap8", style: { marginBottom: 12 } },
        h("span", { style: { color: "var(--text-2)" } }, I.code({ size: 16 })),
        h("input", {
          className: "field", style: { flex: 1 },
          value: st.fetchUrl, placeholder: "https://example.com 입력 후 Enter",
          onChange: (e) => st.setFetchUrl(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); st.runWebFetch(st.fetchUrl); } }
        }),
        h("button", { className: "btn", onClick: () => st.runWebFetch(st.fetchUrl), disabled: st.fetchLoading }, st.fetchLoading ? "가져오는 중…" : "가져오기")
      ),
      st.fetchLoading
        ? h("div", { className: "muted", style: { padding: "24px 4px", fontSize: 13 } }, "가져오는 중…")
        : !r
          ? h("div", { className: "empty", style: { padding: "32px 12px" } }, "URL을 입력하면 본문이 표시됩니다.")
          : h("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
              h("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 8 } },
                h("span", { className: "badge " + (r.error ? "needs_review" : "completed") }, r.error ? "error" : (r.status ? `HTTP ${r.status}` : "ok")),
                r.contentType ? h("span", { className: "chip", style: { fontSize: 12 } }, r.contentType) : null,
                h("span", { className: "chip", style: { fontSize: 12 } }, `${r.length} chars`),
                r.truncated ? h("span", { className: "chip", style: { fontSize: 12 } }, "truncated") : null
              ),
              h("a", { href: r.finalUrl || r.url, target: "_blank", rel: "noopener noreferrer", className: "row-meta mono", style: { fontSize: 11.5, color: "var(--accent)", display: "block", marginBottom: 8, textDecoration: "none" } }, r.finalUrl || r.url || ""),
              r.error ? h("div", { style: { color: "var(--red-text)", fontSize: 13 } }, r.error) : null,
              r.text ? h("pre", { style: { whiteSpace: "pre-wrap", margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", maxHeight: 420, overflow: "auto" } }, r.text) : null
            )
    );
  }

  function SessionsTab({ st }) {
    const hist = st.history;
    return h("div", null,
      h("div", { className: "between", style: { marginBottom: 12 } },
        h("div", { className: "card-title" }, "세션 이력"),
        h("button", { className: "btn sm", onClick: st.loadSessions, disabled: st.sessionsLoading }, I.refresh({ size: 14 }), st.sessionsLoading ? "불러오는 중…" : "새로고침")
      ),
      h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 16, alignItems: "start" } },
        h("div", { className: "card card-pad" },
          st.sessionsLoading
            ? h("div", { className: "muted", style: { padding: "20px 4px", fontSize: 13 } }, "불러오는 중…")
            : st.sessions.length === 0
              ? h("div", { className: "empty", style: { padding: "24px 12px" } }, "세션이 없습니다.")
              : h("div", { style: { display: "flex", flexDirection: "column" } },
                  st.sessions.map((s) =>
                    h("button", {
                      key: s.key,
                      className: "row" + (s.key === st.selectedSessionKey ? " active" : ""),
                      style: { width: "100%", textAlign: "left" },
                      onClick: () => st.openSession(s.key)
                    },
                      h("div", { className: "row-ico" }, I.msg({ size: 15 })),
                      h("div", { style: { minWidth: 0 } },
                        h("div", { className: "row-title" }, s.displayName || s.label || s.key),
                        h("div", { className: "row-meta" }, s.preview || `${s.messageCount || 0}개 메시지`)
                      ),
                      h("div", { className: "spacer" }),
                      h("span", { className: "badge soft" }, s.kind || s.scope || "session")
                    )
                  )
                )
        ),
        h("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
          h("div", { className: "card-title", style: { marginBottom: 10 } }, hist ? (hist.sessionKey || "세션 메시지") : "세션 메시지"),
          st.historyLoading
            ? h("div", { className: "muted", style: { padding: "16px 4px", fontSize: 13 } }, "불러오는 중…")
            : !hist
              ? h("div", { className: "muted", style: { fontSize: 13 } }, "왼쪽에서 세션을 선택하면 메시지가 표시됩니다.")
              : hist.error
                ? h("div", { style: { color: "var(--red-text)", fontSize: 13 } }, hist.error)
                : hist.messages.length === 0
                  ? h("div", { className: "muted", style: { fontSize: 13 } }, "메시지가 없습니다.")
                  : h("div", { style: { display: "flex", flexDirection: "column", gap: 10, maxHeight: 460, overflow: "auto" } },
                      hist.messages.map((m, i) =>
                        h("div", { key: i, style: { display: "flex", flexDirection: "column", gap: 2 } },
                          h("div", { className: "row-meta", style: { fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" } }, m.role || "msg"),
                          h("div", { style: { fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", whiteSpace: "pre-wrap" } }, m.text || "")
                        )
                      )
                    )
        )
      )
    );
  }

  function BrowserTab({ st }) {
    const r = st.browserResult;
    return h("div", null,
      h("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 12 } },
        h("button", { className: "btn sm", onClick: () => st.runBrowser("status"), disabled: st.browserLoading }, I.refresh({ size: 13 }), "상태"),
        h("button", { className: "btn sm ghost", onClick: () => st.runBrowser("start"), disabled: st.browserLoading }, "시작"),
        h("button", { className: "btn sm ghost", onClick: () => st.runBrowser("stop"), disabled: st.browserLoading }, "중지")
      ),
      h("div", { className: "items-center gap8", style: { marginBottom: 12 } },
        h("input", {
          className: "field", style: { flex: 1 },
          value: st.browserUrl, placeholder: "https://… 열기",
          onChange: (e) => st.setBrowserUrl(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); st.runBrowser("open", { url: st.browserUrl }); } }
        }),
        h("button", { className: "btn", onClick: () => st.runBrowser("open", { url: st.browserUrl }), disabled: st.browserLoading }, "열기")
      ),
      st.browserLoading
        ? h("div", { className: "muted", style: { padding: "20px 4px", fontSize: 13 } }, "실행 중…")
        : !r
          ? h("div", { className: "empty", style: { padding: "28px 12px" } }, "상태를 눌러 브라우저 세션 정보를 확인하세요.")
          : h("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
              h("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 8 } },
                h("span", { className: "badge " + (r.running ? "completed" : "soft") }, r.running ? "running" : "stopped"),
                r.disabled ? h("span", { className: "badge needs_review" }, "disabled") : null,
                r.adapter ? h("span", { className: "chip", style: { fontSize: 12 } }, r.adapter) : null
              ),
              r.activeUrl ? h("div", { className: "row-meta mono", style: { fontSize: 11.5, marginBottom: 8 } }, r.activeUrl) : null,
              r.error ? h("div", { style: { color: "var(--red-text)", fontSize: 13, marginBottom: 8 } }, r.error) : null,
              r.tabs.length === 0
                ? h("div", { className: "muted", style: { fontSize: 13 } }, "열린 탭이 없습니다.")
                : h("div", { style: { display: "flex", flexDirection: "column" } },
                    r.tabs.map((tb, i) =>
                      h("button", {
                        key: tb.targetId || i, className: "row", style: { width: "100%", textAlign: "left" },
                        onClick: () => st.runBrowser("focus", { targetId: tb.targetId })
                      },
                        h("div", { style: { minWidth: 0 } },
                          h("div", { className: "row-title" }, tb.title || tb.url || "탭"),
                          h("div", { className: "row-meta mono", style: { fontSize: 11.5 } }, tb.url || "")
                        ),
                        h("div", { className: "spacer" }),
                        tb.active ? h("span", { className: "badge soft" }, "active") : null
                      )
                    )
                  )
            )
    );
  }

  function CanvasTab({ st }) {
    const r = st.canvasResult;
    const snap = r && r.snapshot;
    return h("div", null,
      h("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 12 } },
        h("button", { className: "btn sm", onClick: () => st.runCanvas("status"), disabled: st.canvasLoading }, I.refresh({ size: 13 }), "상태"),
        h("button", { className: "btn sm ghost", onClick: () => st.runCanvas("present"), disabled: st.canvasLoading }, "표시"),
        h("button", { className: "btn sm ghost", onClick: () => st.runCanvas("hide"), disabled: st.canvasLoading }, "숨김"),
        h("button", { className: "btn sm ghost", onClick: () => st.runCanvas("snapshot"), disabled: st.canvasLoading }, "스냅샷")
      ),
      h("div", { className: "items-center gap8", style: { marginBottom: 12 } },
        h("input", {
          className: "field", style: { flex: 1 },
          value: st.canvasUrl, placeholder: "https://… 이동",
          onChange: (e) => st.setCanvasUrl(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); st.runCanvas("navigate", { url: st.canvasUrl }); } }
        }),
        h("button", { className: "btn", onClick: () => st.runCanvas("navigate", { url: st.canvasUrl }), disabled: st.canvasLoading }, "이동")
      ),
      st.canvasLoading
        ? h("div", { className: "muted", style: { padding: "20px 4px", fontSize: 13 } }, "실행 중…")
        : !r
          ? h("div", { className: "empty", style: { padding: "28px 12px" } }, "상태를 눌러 캔버스 정보를 확인하세요.")
          : h("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
              h("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 8 } },
                h("span", { className: "badge " + (r.visible ? "completed" : "soft") }, r.visible ? "visible" : "hidden"),
                r.disabled ? h("span", { className: "badge needs_review" }, "disabled") : null,
                r.adapter ? h("span", { className: "chip", style: { fontSize: 12 } }, r.adapter) : null
              ),
              r.url ? h("div", { className: "row-meta mono", style: { fontSize: 11.5, marginBottom: 8 } }, r.url) : null,
              snap ? h("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 8 } },
                h("span", { className: "chip", style: { fontSize: 12 } }, snap.format || "snapshot"),
                h("span", { className: "chip", style: { fontSize: 12 } }, `${snap.width || 0}×${snap.height || 0}`)
              ) : null,
              r.evalResult ? h("pre", { style: { whiteSpace: "pre-wrap", margin: 0, fontSize: 12.5, color: "var(--text-2)" } }, r.evalResult) : null,
              r.error ? h("div", { style: { color: "var(--red-text)", fontSize: 13 } }, r.error) : null
            )
    );
  }

  function ExplorePage({ ctx, payload }) {
    const st = window.useExplorePageState(ctx, payload);
    const tabs = [
      { id: "search", label: "웹 검색" },
      { id: "fetch", label: "URL 가져오기" },
      { id: "sessions", label: "세션" },
      { id: "browser", label: "브라우저" },
      { id: "canvas", label: "캔버스" },
    ];
    const Body = { search: SearchTab, fetch: FetchTab, sessions: SessionsTab, browser: BrowserTab, canvas: CanvasTab }[st.tab] || SearchTab;
    return h("div", { className: "page" },
      h("div", { className: "col scroll page-scroll" },
        h("div", { style: { maxWidth: 920 } },
          h("h1", { style: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 } }, "탐색"),
          h("p", { className: "muted", style: { fontSize: 14, marginBottom: 18 } }, "웹 검색, URL 본문 가져오기, 세션 이력을 한 화면에서 확인합니다."),
          h("div", { className: "seg", style: { marginBottom: 18, display: "inline-flex" } },
            tabs.map((tb) => h("button", { key: tb.id, className: st.tab === tb.id ? "on" : "", onClick: () => st.setTab(tb.id) }, tb.label))
          ),
          h(Body, { st })
        )
      )
    );
  }

  Object.assign(window, { ExplorePage });
})();
