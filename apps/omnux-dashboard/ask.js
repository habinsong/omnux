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
          React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.toast("Saved to project") }, I.save({ size: 14 }), t("Save")),
          React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.setRoute('automate', { create: true }) }, I.bot({ size: 14 }), t("Turn into automation")),
          React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.setRoute("build") }, I.code({ size: 14 }), t("Open in Build")),
        ),
      )
    );
  }

  function CompareView({ ctx }) {
    const pair = [D.providers[0], D.providers[1]];
    const ans = [
      "같은 프롬프트를 여러 모델에 보내는 기능은 Build/Chat 고급 화면의 다중 LLM 모드에 연결되어 있습니다.",
      "빠른 비교가 필요하면 기존 대화의 다중 LLM 모드를 열어 실제 모델 응답을 비교하세요.",
    ];
    return (
      React.createElement("div", { className: "compare-grid", style: { display: "grid", gap: 16 } },
        pair.map((p, i) =>
          React.createElement("div", { key: p.id, className: "card card-pad" },
            React.createElement("div", { className: "between", style: { marginBottom: 12 } },
              React.createElement("div", { className: "items-center gap10" },
                React.createElement("div", { className: "prov-logo", style: { background: p.color, width: 26, height: 26, fontSize: 12 } }, p.glyph),
                React.createElement("b", { style: { fontWeight: 700 } }, p.name),
              ),
              React.createElement("span", { className: "badge soft" }, i === 0 ? t("Most complete") : t("4× faster")),
            ),
            React.createElement("p", { style: { lineHeight: 1.6, color: "var(--text-2)" } }, ans[i]),
            React.createElement("div", { className: "items-center gap8 mt16" },
              React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.toast("다중 LLM 모드는 기존 Chat 화면에서 사용하세요.") }, I.scale({ size: 14 }), t("Compare")),
              React.createElement("span", { className: "faint mono", style: { fontSize: 11, marginLeft: "auto" } }, p.latency),
            ),
          )
        ),
      )
    );
  }

  function RecentConversations({ ctx, conversations, onOpen }) {
    return React.createElement("div", { className: "card card-pad mt28" },
      React.createElement("div", { className: "between", style: { marginBottom: 10 } },
        React.createElement("div", { className: "card-title" }, "최근 대화"),
        React.createElement("button", { className: "btn sm ghost", onClick: () => ctx.send({ type: "list_conversations", scope: "chat", mode: "single" }, { queueIfClosed: true }) }, I.refresh({ size: 14 }), "새로고침")
      ),
      conversations.length === 0
        ? React.createElement("div", { className: "empty", style: { padding: "28px 12px" } }, "아직 불러온 대화가 없습니다.")
        : conversations.slice(0, 5).map((item) =>
          React.createElement("button", {
            key: item.id,
            className: "row",
            style: { width: "100%", textAlign: "left" },
            onClick: () => onOpen(item),
          },
            React.createElement("div", { className: "row-ico" }, I.msg({ size: 16 })),
            React.createElement("div", { style: { minWidth: 0 } },
              React.createElement("div", { className: "row-title" }, item.title || "제목 없음"),
              React.createElement("div", { className: "row-meta" }, item.preview || `${item.messageCount || 0}개 메시지`)
            ),
            React.createElement("div", { className: "spacer" }),
            React.createElement("span", { className: "badge soft" }, item.category || "일반"),
            React.createElement("div", { className: "row-meta", style: { width: 54, textAlign: "right" } }, formatUpdated(item.updatedUtc))
          )
        )
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
      scrollRef,
      conversations,
      memoryNotes,
      openConversation,
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

              compareMode ? React.createElement(CompareView, { ctx }) : null,

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
                  React.createElement("button", { className: "btn", onClick: () => ctx.toast("Attach a file to analyze") }, t("Attach file")),
                ),
                React.createElement(RecentConversations, { ctx, conversations, onOpen: openConversation }),
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
