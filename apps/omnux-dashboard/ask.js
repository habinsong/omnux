/* omnux — Ask screen */
(function () {
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s) => window.t(s);

  function formatUpdated(value) {
    const parsed = new Date(value || "");
    if (Number.isNaN(parsed.getTime())) return "";
    const now = new Date();
    if (parsed.toDateString() === now.toDateString()) {
      return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return parsed.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  }

  function ChatMessage({ m, ctx }) {
    if (m.role === "user") return React.createElement("div", { className: "bubble-user" }, m.text);
    return (
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: "88%" } },
        React.createElement("div", { className: "bubble-ai" },
          m.text.split("\n\n").map((p, i) => React.createElement("p", { key: i }, p)),
        ),
        React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", paddingLeft: 4 } },
          React.createElement("button", { className: "btn sm ghost", onClick: () => navigator.clipboard?.writeText(m.text).then(() => ctx.toast("복사했습니다.")) }, I.copy({ size: 14 }), t("Copy")),
          React.createElement("button", { className: "btn sm ghost", onClick: () => {
            if (!ctx.activeConversationId) {
              ctx.toast("저장할 대화가 없습니다.");
              return;
            }
            if (!ctx.send({ type: "create_memory_note", conversationId: ctx.activeConversationId, compactConversation: false }, { queueIfClosed: true })) {
              ctx.toast("미들웨어 연결이 필요합니다.");
            }
          } }, I.save({ size: 14 }), t("Save")),
          React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.setRoute('automate', { create: true }) }, I.bot({ size: 14 }), t("Turn into automation")),
          React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.setRoute("build") }, I.code({ size: 14 }), t("Open in Build")),
        ),
      )
    );
  }

  function CompareView({ result, pending }) {
    const providers = [
      { key: "groq", label: "Groq", model: "groqModel", color: "#F55036", glyph: "G" },
      { key: "gemini", label: "Gemini", model: "geminiModel", color: "#4285F4", glyph: "G" },
      { key: "cerebras", label: "Cerebras", model: "cerebrasModel", color: "#EF6A35", glyph: "C" },
      { key: "nvidia", label: "NVIDIA NIM", model: "nvidiaModel", color: "#76B900", glyph: "N" },
      { key: "copilot", label: "Copilot", model: "copilotModel", color: "#5B5EF0", glyph: "P" },
      { key: "codex", label: "Codex", model: "codexModel", color: "#111418", glyph: "C" },
    ];
    const rows = providers
      .map((item) => ({
        ...item,
        text: String(result && result[item.key] ? result[item.key] : "").trim(),
        modelName: String(result && result[item.model] ? result[item.model] : "").trim(),
      }))
      .filter((item) => item.text || item.modelName);

    if (!result) {
      return React.createElement("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
        React.createElement("div", { className: "card-title" }, "실제 다중 모델 비교"),
        React.createElement("p", { className: "muted", style: { fontSize: 13, marginTop: 6, lineHeight: 1.6 } },
          pending ? "다중 모델 응답을 기다리는 중입니다." : "아래 입력창에 질문을 보내면 llm_chat_multi 결과를 provider별로 표시합니다.")
      );
    }

    return (
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
        result.summary ? React.createElement("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
          React.createElement("div", { className: "card-title" }, "요약"),
          React.createElement("p", { style: { lineHeight: 1.7, color: "var(--text-2)", whiteSpace: "pre-wrap" } }, result.summary)
        ) : null,
        rows.length === 0 ? React.createElement("div", { className: "empty", style: { padding: "24px 12px" } }, "표시할 모델 응답이 없습니다.") : null,
        rows.map((p) =>
          React.createElement("div", { key: p.key, className: "card card-pad" },
            React.createElement("div", { className: "between", style: { marginBottom: 12 } },
              React.createElement("div", { className: "items-center gap10" },
                React.createElement("div", { className: "prov-logo", style: { background: p.color, width: 26, height: 26, fontSize: 12 } }, p.glyph),
                React.createElement("b", { style: { fontWeight: 700 } }, p.label),
              ),
              p.modelName ? React.createElement("span", { className: "badge soft mono" }, p.modelName) : null,
            ),
            React.createElement("p", { style: { lineHeight: 1.7, color: "var(--text-2)", whiteSpace: "pre-wrap" } }, p.text || "응답 없음")
          )
        ),
      )
    );
  }

  function ConversationRow({ item, onOpen, onRename, onSaveMemory, onDelete }) {
    return React.createElement("div", { className: "row", style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement("button", {
        onClick: () => onOpen(item),
        style: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: 0 },
      },
        React.createElement("div", { className: "row-ico" }, I.msg({ size: 16 })),
        React.createElement("div", { style: { minWidth: 0 } },
          React.createElement("div", { className: "row-title" }, item.title || "제목 없음"),
          React.createElement("div", { className: "row-meta" }, item.preview || `${item.messageCount || 0}개 메시지`)
        )
      ),
      React.createElement("span", { className: "badge soft" }, item.category || "일반"),
      React.createElement("div", { className: "row-meta", style: { width: 48, textAlign: "right" } }, formatUpdated(item.updatedUtc)),
      React.createElement("div", { className: "items-center gap8" },
        React.createElement("button", { className: "btn sm ghost", title: "제목 변경", onClick: () => onRename(item) }, "이름"),
        React.createElement("button", { className: "btn sm ghost", title: "이 대화를 메모리로 저장", onClick: () => onSaveMemory(item) }, I.save({ size: 13 })),
        React.createElement("button", { className: "btn sm ghost", title: "대화 삭제", style: { color: "var(--red-text)" }, onClick: () => onDelete(item) }, I.x({ size: 13 }))
      )
    );
  }

  function RecentConversations({ ctx, conversations, onOpen, onNew, onRename, onSaveMemory, onDelete, onSearch, onClearSearch, searchQuery, setSearchQuery, searchResults, searching }) {
    const hasSearch = (searchQuery || "").trim().length > 0;
    return React.createElement("div", { className: "card card-pad mt28" },
      React.createElement("div", { className: "between", style: { marginBottom: 10 } },
        React.createElement("div", { className: "card-title" }, "최근 대화"),
        React.createElement("div", { className: "items-center gap8" },
          React.createElement("button", { className: "btn sm", onClick: onNew }, I.plus({ size: 14 }), "새 대화"),
          React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.send({ type: "list_conversations", scope: "chat", mode: "single" }, { queueIfClosed: true }) }, I.refresh({ size: 14 }), "새로고침")
        )
      ),
      React.createElement("div", { className: "items-center gap8", style: { marginBottom: 12 } },
        React.createElement("span", { style: { color: "var(--text-2)" } }, I.search({ size: 15 })),
        React.createElement("input", {
          className: "field",
          style: { flex: 1 },
          value: searchQuery,
          placeholder: "대화 검색 후 Enter",
          onChange: (e) => setSearchQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); onSearch(searchQuery); } },
        }),
        hasSearch ? React.createElement("button", { className: "btn sm ghost", onClick: onClearSearch }, I.x({ size: 14 })) : null
      ),
      searching
        ? React.createElement("div", { className: "muted", style: { padding: "20px 4px", fontSize: 13 } }, "검색 중…")
        : (hasSearch && Array.isArray(searchResults) && searchResults.length > 0)
          ? React.createElement("div", { style: { display: "flex", flexDirection: "column" } },
              React.createElement("div", { className: "eyebrow", style: { marginBottom: 6 } }, `검색 결과 ${searchResults.length}`),
              searchResults.slice(0, 8).map((hit, i) =>
                React.createElement("button", {
                  key: `${hit.conversationId}-${i}`,
                  className: "row",
                  style: { width: "100%", textAlign: "left" },
                  onClick: () => onOpen({ id: hit.conversationId, title: hit.title }),
                },
                  React.createElement("div", { className: "row-ico" }, I.search({ size: 15 })),
                  React.createElement("div", { style: { minWidth: 0 } },
                    React.createElement("div", { className: "row-title" }, hit.title || "제목 없음"),
                    React.createElement("div", { className: "row-meta" }, hit.snippet || "")
                  )
                )
              )
            )
          : (hasSearch
              ? React.createElement("div", { className: "empty", style: { padding: "24px 12px" } }, "검색 결과가 없습니다.")
              : conversations.length === 0
                ? React.createElement("div", { className: "empty", style: { padding: "28px 12px" } }, "아직 불러온 대화가 없습니다.")
                : conversations.slice(0, 6).map((item) =>
                    React.createElement(ConversationRow, { key: item.id, item, onOpen, onRename, onSaveMemory, onDelete })
                  ))
    );
  }

  function MemorySummary({ ctx, notes }) {
    return React.createElement("div", { className: "card card-pad mt16" },
      React.createElement("div", { className: "between", style: { marginBottom: 10 } },
        React.createElement("div", { className: "card-title" }, "메모리 노트"),
        React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.setRoute("settings", { tab: "memory" }) }, I.settings({ size: 14 }), "관리")
      ),
      notes.length === 0
        ? React.createElement("div", { className: "muted", style: { fontSize: 13 } }, "연결된 메모리 노트가 없습니다.")
        : notes.slice(0, 3).map((note) =>
          React.createElement("div", { key: note.name, className: "row", style: { padding: "10px 0", borderRadius: 0 } },
            React.createElement("div", { className: "row-ico" }, I.mem({ size: 15 })),
            React.createElement("div", { style: { minWidth: 0 } },
              React.createElement("div", { className: "row-title", style: { fontSize: 13 } }, note.name),
              React.createElement("div", { className: "row-meta" }, note.excerpt || note.fullPath || "")
            )
          )
        )
    );
  }

  function AskPage({ ctx, payload }) {
    const {
      compareMode,
      msgs,
      val,
      setVal,
      model,
      setModel,
      showModels,
      setShowModels,
      pending,
      multiResult,
      scrollRef,
      conversations,
      memoryNotes,
      openConversation,
      newConversation,
      deleteConversation,
      renameConversation,
      saveConversationToMemory,
      searchConversations,
      clearSearch,
      searchQuery,
      setSearchQuery,
      searchResults,
      searching,
      send,
      empty
    } = window.useAskPageState(ctx, payload);

    return (
      React.createElement("div", { className: "page" },
        React.createElement("div", { className: "col", style: { display: "flex", flexDirection: "column", minHeight: 0 } },
          React.createElement("div", { className: "scroll", ref: scrollRef, style: { flex: 1, padding: "8px 30px 20px" } },
            React.createElement("div", { style: { maxWidth: 820, margin: "0 auto" } },
              React.createElement("div", { className: "between", style: { marginBottom: 20 } },
                React.createElement("div", null,
                  React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" } }, compareMode ? t("Compare models") : t("Ask omnux")),
                  React.createElement("p", { className: "muted", style: { fontSize: 14, marginTop: 2 } }, compareMode ? t("Same prompt, multiple models, side by side.") : "대화, 메모리, 모델 라우팅을 한 화면에서 확인합니다."),
                ),
                React.createElement("div", { style: { position: "relative" } },
                  React.createElement("button", { className: "btn sm", onClick: () => setShowModels((s) => !s) },
                    React.createElement("span", { className: "prov-logo", style: { background: model.color, width: 18, height: 18, fontSize: 10 } }, model.glyph),
                    model.name, I.chevD({ size: 14 })),
                  showModels ? React.createElement("div", { className: "card", style: { position: "absolute", right: 0, top: 44, width: 230, padding: 6, zIndex: 20, boxShadow: "var(--shadow-lg)" } },
                    D.providers.map((p) => React.createElement("button", { key: p.id, className: "palette-item", style: { width: "100%" }, onClick: () => { setModel(p); setShowModels(false); } },
                      React.createElement("span", { className: "prov-logo", style: { background: p.color, width: 24, height: 24, fontSize: 11 } }, p.glyph),
                      React.createElement("div", null, React.createElement("div", { className: "pi-title", style: { fontSize: 13.5 } }, p.name), React.createElement("div", { className: "pi-sub" }, t("Best for ") + p.role)))),
                  ) : null,
                ),
              ),

              compareMode ? React.createElement(CompareView, { result: multiResult, pending }) : null,

              empty ? React.createElement("div", { style: { marginTop: 30 } },
                React.createElement("div", { className: "eyebrow", style: { marginBottom: 12 } }, t("Suggested prompts")),
                React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 10 } },
                  D.suggestions.map((s) => React.createElement("button", { key: s, className: "chip", onClick: () => send(s) }, I.spark({ size: 14 }), t(s))),
                ),
                React.createElement("div", { className: "card card-pad mt28", style: { display: "flex", gap: 14, alignItems: "center", background: "var(--surface-2)", border: "none" } },
                  React.createElement("div", { className: "quick-ico", style: { background: "var(--accent-soft)", color: "var(--accent)" } }, I.attach({ size: 20 })),
                  React.createElement("div", { style: { flex: 1 } },
                    React.createElement("b", { style: { fontWeight: 700 } }, t("Ask about a file")),
                    React.createElement("div", { className: "muted", style: { fontSize: 13 } }, "대화, 메모리, 파일을 함께 확인할 수 있습니다.")),
                  React.createElement("button", { className: "btn", onClick: () => ctx.setRoute("projects") }, t("Attach file")),
                ),
                React.createElement(RecentConversations, {
                  ctx, conversations, onOpen: openConversation,
                  onNew: newConversation, onRename: renameConversation,
                  onSaveMemory: saveConversationToMemory, onDelete: deleteConversation,
                  onSearch: searchConversations, onClearSearch: clearSearch,
                  searchQuery, setSearchQuery, searchResults, searching
                }),
                React.createElement(MemorySummary, { ctx, notes: memoryNotes }),
              ) : null,

              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 22, marginTop: 22 } },
                msgs.map((m, i) => React.createElement("div", { key: i, style: { display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" } },
                  React.createElement(ChatMessage, { m, ctx }))),
                pending ? React.createElement("div", { className: "bubble-ai", style: { width: "fit-content" } }, "응답 생성 중...") : null,
              ),
            ),
          ),
          React.createElement("div", { style: { padding: "14px 30px 22px", borderTop: "1px solid var(--border)" } },
            React.createElement("div", { className: "hero", style: { maxWidth: 820, margin: "0 auto", padding: "14px 14px 12px" } },
              React.createElement("div", { className: "hero-top" },
                React.createElement("span", { className: "hero-spark", style: { width: 22, height: 22 } }, I.spark({ size: 20 })),
                React.createElement("textarea", { value: val, rows: 1, placeholder: t("Message omnux…"), style: { fontSize: 16 },
                  onChange: (e) => setVal(e.target.value),
                  onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(val); } } }),
                React.createElement("button", { className: "hero-send", style: { width: 40, height: 40 }, onClick: () => send(val), disabled: pending }, I.send({ size: 18 })),
              ),
            ),
          ),
        ),
      )
    );
  }

  Object.assign(window, { AskPage });
})();
