/* omnux — Settings screen */
(function () {
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s, fb) => window.t(s, fb);

  function Row({ label, sub, children }) {
    return React.createElement("div", { className: "set-row" },
      React.createElement("div", { className: "sr-label" }, React.createElement("b", null, label), sub ? React.createElement("span", null, sub) : null),
      React.createElement("div", null, children));
  }

  function GeneralTab({ ctx }) {
    return React.createElement("div", null,
      React.createElement("div", { className: "card-title", style: { marginBottom: 4 } }, t("General")),
      React.createElement("div", { className: "card card-pad mt12" },
        React.createElement(Row, { label: t("Appearance"), sub: t("Light, dark, or follow your system.") },
          React.createElement("div", { className: "seg" },
            React.createElement("button", { className: ctx.theme === "light" ? "on" : "", onClick: () => ctx.setTheme("light") }, t("Light")),
            React.createElement("button", { className: ctx.theme === "dark" ? "on" : "", onClick: () => ctx.setTheme("dark") }, t("Dark")),
          )),
        React.createElement(Row, { label: t("Language"), sub: t("Interface language.") },
          React.createElement("div", { className: "seg" },
            React.createElement("button", { className: ctx.lang === "en" ? "on" : "", onClick: () => ctx.setLang("en") }, "English"),
            React.createElement("button", { className: ctx.lang === "ko" ? "on" : "", onClick: () => ctx.setLang("ko") }, "한국어"),
          )),
        React.createElement(Row, { label: t("Detail level"), sub: t("Advanced reveals model routes, console & logs.") },
          React.createElement("div", { className: "seg" },
            React.createElement("button", { className: !ctx.advanced ? "on" : "", onClick: () => ctx.setAdvanced(false) }, t("Simple")),
            React.createElement("button", { className: ctx.advanced ? "on" : "", onClick: () => ctx.setAdvanced(true) }, t("Advanced")),
          )),
        React.createElement(Row, { label: t("Default project"), sub: t("Where new tasks start.") },
          React.createElement("select", { className: "field" }, D.projects.map((p) => React.createElement("option", { key: p.id }, p.name)))),
        React.createElement(Row, { label: t("Start on launch"), sub: t("Open omnux when you log in.") },
          React.createElement(window.Toggle, { on: true, onClick: () => {} })),
      ),
    );
  }

  function MemoryTab({ ctx }) {
    const {
      search,
      setSearch,
      selected,
      preview,
      filtered,
      refresh,
      readNote,
      deleteNote,
      renameNote,
      clearMemory,
      backup,
      requestBackupExport,
      importBackupFile,
      applyBackupImport,
    } = ctx.memory;
    const exportResult = backup && backup.exportResult;
    const previewResult = backup && backup.previewResult;
    const importResult = backup && backup.importResult;
    const pending = backup && backup.pending ? backup.pending : { export: false, preview: false, apply: false };
    const scopeOptions = backup && Array.isArray(backup.scopeOptions) ? backup.scopeOptions : [];
    const selectedBackupScopes = backup && Array.isArray(backup.selectedScopes) ? backup.selectedScopes : [];
    const toggleBackupScope = backup && typeof backup.toggleScope === "function" ? backup.toggleScope : () => {};
    const selectAllBackupScopes = backup && typeof backup.selectAllScopes === "function" ? backup.selectAllScopes : () => {};
    const previewId = previewResult && previewResult.previewId ? previewResult.previewId : "";
    const conflicts = previewResult && Array.isArray(previewResult.conflicts) ? previewResult.conflicts : [];
    const exportScopes = exportResult && Array.isArray(exportResult.scope) && exportResult.scope.length > 0
      ? exportResult.scope
      : selectedBackupScopes;
    const { syncConfig, saveSyncConfig, requestCloudSyncUpload, requestCloudSyncDownload } = ctx.memory;
    const [localGistId, setLocalGistId] = React.useState("");
    const [localToken, setLocalToken] = React.useState("");
    const [isEditingSync, setIsEditingSync] = React.useState(false);

    React.useEffect(() => {
      if (syncConfig) {
        setLocalGistId(syncConfig.gistId || "");
        setLocalToken(syncConfig.gitHubTokenSet ? "********" : "");
      }
    }, [syncConfig]);

    return React.createElement("div", null,
      React.createElement("div", { className: "between", style: { marginBottom: 4 } },
        React.createElement("div", { className: "card-title" }, "Memory & portable package"),
        React.createElement("div", { className: "items-center gap8" },
          React.createElement("button", { className: "btn sm ghost", style: { color: "var(--red-text)" }, onClick: () => clearMemory("chat"), title: "이 범위의 대화와 메모리 노트를 모두 삭제" }, I.x({ size: 14 }), "메모리 비우기"),
          React.createElement("button", { className: "btn sm", onClick: refresh }, I.refresh({ size: 14 }), "새로고침"))),
      React.createElement("div", { className: "card card-pad mt12" },
        React.createElement(Row, { label: "메모리 검색", sub: "메모리 노트 파일을 찾습니다." },
          React.createElement("input", {
            className: "field",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "노트 이름, 요약, 경로"
          })),
        React.createElement("div", { className: "memory-list", style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 8 } },
          filtered.length === 0
            ? React.createElement("div", { className: "empty", style: { padding: "28px 0" } }, "메모리 노트 없음")
            : filtered.slice(0, 12).map((note) =>
              React.createElement("button", {
                key: note.name,
                className: "row",
                style: { width: "100%", textAlign: "left" },
                onClick: () => readNote(note.name),
              },
                React.createElement("div", { className: "row-ico" }, I.mem({ size: 15 })),
                React.createElement("div", { style: { minWidth: 0 } },
                  React.createElement("div", { className: "row-title" }, note.name),
                  React.createElement("div", { className: "row-meta" }, note.excerpt || note.fullPath || "")
                ),
                React.createElement("div", { className: "spacer" }),
                React.createElement("span", { className: "badge soft" }, String(note.sizeBytes || 0)),
              )
            )
        ),
        React.createElement("div", { className: "card card-pad mt16", style: { background: "var(--surface-2)" } },
          React.createElement("div", { className: "between", style: { marginBottom: 10 } },
            React.createElement("div", { className: "card-title" }, selected || "선택한 메모리 내용"),
            selected ? React.createElement("div", { className: "items-center gap8" },
              React.createElement("button", { className: "btn sm ghost", onClick: () => renameNote(selected) }, "이름 변경"),
              React.createElement("button", { className: "btn sm ghost", style: { color: "var(--red-text)" }, onClick: () => deleteNote(selected) }, I.x({ size: 13 }), "삭제")
            ) : null),
          React.createElement("pre", { style: { whiteSpace: "pre-wrap", margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-2)" } }, preview || "메모리 노트를 선택하면 내용이 표시됩니다.")
        ),
      ),
      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "card-title", style: { marginBottom: 10 } }, "Portable backup package"),
        React.createElement("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6, marginBottom: 12 } },
          "대화, 루틴, 라우팅 정책, 메모리, 계획, task, notebook, skill, command template를 포함합니다. API 키, Telegram token, auth session, runtime log는 제외됩니다. 동기화 브릿지는 현재 portable package 전용이며 충돌은 preview에서 확인한 뒤 overwrite=false면 건너뛰고 overwrite=true면 교체합니다."),
        React.createElement("div", { className: "between", style: { alignItems: "flex-start", gap: 12, marginBottom: 8 } },
          React.createElement("div", null,
            React.createElement("div", { className: "eyebrow", style: { marginBottom: 6 } }, "포함 범위"),
            React.createElement("div", { className: "muted", style: { fontSize: 12, lineHeight: 1.5 } },
              "선택한 범위만 ZIP과 manifest sync scope에 기록됩니다.")),
          React.createElement("button", { className: "btn sm", onClick: selectAllBackupScopes }, "전체 선택")),
        React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 12 } },
          scopeOptions.map((option) =>
            React.createElement("label", {
              key: option.id,
              className: "chip",
              style: { display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }
            },
              React.createElement("input", {
                type: "checkbox",
                checked: selectedBackupScopes.includes(option.id),
                onChange: () => toggleBackupScope(option.id)
              }),
              option.label || option.id
            )
          )),
        React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap" } },
          React.createElement("button", { className: "btn", onClick: requestBackupExport, disabled: pending.export || selectedBackupScopes.length === 0 }, pending.export ? React.createElement(React.Fragment, null, React.createElement("span", { className: "spin" }, I.refresh({ size: 14 })), "내보내는 중…") : React.createElement(React.Fragment, null, I.download({ size: 14 }), "백업 내보내기")),
          React.createElement("button", {
            className: "btn",
            onClick: async () => {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = ".zip";
              fileInput.onchange = async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                await importBackupFile(file);
              };
              fileInput.click();
            },
            disabled: pending.preview
          }, pending.preview ? React.createElement(React.Fragment, null, React.createElement("span", { className: "spin" }, I.refresh({ size: 14 })), "미리보기 중…") : React.createElement(React.Fragment, null, I.upload ? I.upload({ size: 14 }) : I.attach({ size: 14 }), "백업 미리보기"))
        ),
        React.createElement("div", { className: "card card-pad mt16", style: { background: "var(--surface-2)" } },
          React.createElement("div", { className: "card-title", style: { marginBottom: 10 } }, "Cloud Sync (GitHub Gist)"),
          React.createElement("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6, marginBottom: 12 } },
            "동기화 데이터를 클라우드 Gist와 연동합니다. GitHub 토큰이 필요합니다."),
          React.createElement(Row, { label: "Gist ID", sub: "비워두면 새 Gist 생성됨." },
            React.createElement("input", {
              className: "field",
              value: localGistId,
              disabled: !isEditingSync,
              onChange: (e) => setLocalGistId(e.target.value),
              placeholder: "ex) a1b2c3d4..."
            })),
          React.createElement(Row, { label: "GitHub Token", sub: "Gist를 생성하고 수정할 권한 (repo or gist)" },
            React.createElement("input", {
              type: "password",
              className: "field",
              value: localToken,
              disabled: !isEditingSync,
              onChange: (e) => setLocalToken(e.target.value),
              placeholder: syncConfig?.gitHubTokenSet ? "******** (설정됨)" : "ghp_..."
            })),
          React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap", padding: "0 16px 16px" } },
            !isEditingSync ? React.createElement("button", { className: "btn", onClick: () => setIsEditingSync(true) }, "설정 변경") : React.createElement(React.Fragment, null,
              React.createElement("button", { className: "btn primary", onClick: () => {
                saveSyncConfig(localGistId, localToken === "********" ? "" : localToken);
                setIsEditingSync(false);
              }}, "저장"),
              React.createElement("button", { className: "btn", onClick: () => {
                setIsEditingSync(false);
                setLocalGistId(syncConfig?.gistId || "");
                setLocalToken(syncConfig?.gitHubTokenSet ? "********" : "");
              }}, "취소")
            ),
            React.createElement("button", { className: "btn", disabled: !syncConfig?.gitHubTokenSet || pending.cloudSync, onClick: requestCloudSyncUpload }, pending.cloudSync ? "업로드 중..." : "클라우드 업로드"),
            React.createElement("button", { className: "btn", disabled: !syncConfig?.gitHubTokenSet || !syncConfig?.gistId || pending.cloudSync, onClick: () => requestCloudSyncDownload(syncConfig?.gistId) }, pending.cloudSync ? "다운로드 중..." : "클라우드 다운로드")
          ),
          syncConfig?.lastSyncUtc ? React.createElement("div", { className: "muted mt12", style: { padding: "0 16px 16px", fontSize: 12 } }, "마지막 동기화: ", new Date(syncConfig.lastSyncUtc).toLocaleString()) : null
        ),
        exportResult ? React.createElement("div", { className: "card card-pad mt16", style: { background: "var(--surface-2)" } },
          React.createElement("div", { className: "between", style: { marginBottom: 8 } },
            React.createElement("div", { className: "card-title" }, exportResult.ok ? "내보내기 완료" : "내보내기 실패"),
            React.createElement("span", { className: "badge " + (exportResult.ok ? "completed" : "needs_review") }, exportResult.ok ? "ok" : "error")),
          React.createElement("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6 } }, exportResult.fileName ? exportResult.fileName : "파일명이 없습니다."),
          React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
            React.createElement("span", { className: "chip mono", style: { fontSize: 12 } }, "size " + String(exportResult.sizeBytes || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "scope " + String(exportScopes.length || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "included " + String((exportResult.included || []).length)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "excluded " + String((exportResult.excluded || []).length))),
          exportScopes.length > 0 ? React.createElement("div", { className: "mt12", style: { display: "flex", flexWrap: "wrap", gap: 8 } },
            exportScopes.slice(0, 12).map((item) => React.createElement("span", { key: item, className: "chip", style: { fontSize: 12 } }, item))) : null,
          exportResult.error ? React.createElement("div", { className: "mt12", style: { color: "var(--red-text)", fontSize: 13, lineHeight: 1.6 } }, exportResult.error) : null,
        ) : null,
        previewResult ? React.createElement("div", { className: "card card-pad mt16", style: { background: "var(--surface-2)" } },
          React.createElement("div", { className: "between", style: { marginBottom: 8 } },
            React.createElement("div", { className: "card-title" }, previewResult.ok ? "미리보기 완료" : "미리보기 실패"),
            React.createElement("span", { className: "badge " + (previewResult.ok ? "completed" : "needs_review") }, previewResult.ok ? "ready" : "error")),
          React.createElement("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6 } }, previewResult.fileName || "backup.zip"),
          React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
            React.createElement("span", { className: "chip mono", style: { fontSize: 12 } }, "preview " + (previewId || "-")),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "conversations " + String(previewResult.conversationCount || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "conflicts " + String(previewResult.conflictCount || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "file conflicts " + String(previewResult.fileConflictCount || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "files " + String(previewResult.fileCount || 0))),
          React.createElement("div", { className: "muted mt12", style: { fontSize: 12, lineHeight: 1.6 } },
            "sync=" + (previewResult.syncMode || "unknown") + " · conflict=" + (previewResult.syncConflictPolicy || "unknown")),
          conflicts.length > 0 ? React.createElement("div", { className: "mt12", style: { display: "flex", flexWrap: "wrap", gap: 8 } },
            conflicts.slice(0, 8).map((item) => React.createElement("span", { key: item, className: "chip", style: { fontSize: 12 } }, item))) : null,
          (previewResult.fileConflicts || []).length > 0 ? React.createElement("div", { className: "mt12", style: { display: "flex", flexWrap: "wrap", gap: 8 } },
            (previewResult.fileConflicts || []).slice(0, 8).map((item) => React.createElement("span", { key: item, className: "chip", style: { fontSize: 12 } }, item))) : null,
          previewResult.error ? React.createElement("div", { className: "mt12", style: { color: "var(--red-text)", fontSize: 13, lineHeight: 1.6 } }, previewResult.error) : null,
          previewId ? React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
            React.createElement("button", { className: "btn", onClick: () => applyBackupImport(previewId, false), disabled: pending.apply || !previewResult.ok }, pending.apply ? React.createElement(React.Fragment, null, React.createElement("span", { className: "spin" }, I.refresh({ size: 14 })), "적용 중…") : React.createElement(React.Fragment, null, I.check({ size: 14 }), "적용")),
            React.createElement("button", { className: "btn", onClick: () => applyBackupImport(previewId, true), disabled: pending.apply || !previewResult.ok }, I.refresh({ size: 14 }), "덮어쓰기 적용"))
          : null,
        ) : null,
        importResult ? React.createElement("div", { className: "card card-pad mt16", style: { background: "var(--surface-2)" } },
          React.createElement("div", { className: "between", style: { marginBottom: 8 } },
            React.createElement("div", { className: "card-title" }, importResult.ok ? "적용 완료" : "적용 실패"),
            React.createElement("span", { className: "badge " + (importResult.ok ? "completed" : "needs_review") }, importResult.ok ? "ok" : "error")),
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap" } },
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "imported conversations " + String(importResult.importedConversations || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "skipped conversations " + String(importResult.skippedConversations || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "overwritten conversations " + String(importResult.overwrittenConversations || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "imported files " + String(importResult.importedFiles || 0)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, "skipped files " + String(importResult.skippedFiles || 0))),
          importResult.error ? React.createElement("div", { className: "mt12", style: { color: "var(--red-text)", fontSize: 13, lineHeight: 1.6 } }, importResult.error) : null,
        ) : null,
      ),
    );
  }

  function ModelsTab({ ctx }) {
    return React.createElement("div", null,
      React.createElement("div", { className: "between", style: { marginBottom: 4 } },
        React.createElement("div", { className: "card-title" }, t("Models & services")),
        React.createElement("button", { className: "btn sm", onClick: () => ctx.toast("Add provider") }, I.plus({ size: 14 }), t("Add provider"))),
      React.createElement("p", { className: "muted", style: { fontSize: 13, marginBottom: 12 } }, t("omnux routes each task to the best available model. Drag to set priority.")),
      React.createElement("div", { className: "card" },
        D.providers.map((p, i) => React.createElement("div", { key: p.id, className: "row", style: { padding: "14px 16px", borderTop: i ? "1px solid var(--border)" : "none", borderRadius: 0 } },
          React.createElement("div", { className: "prov-logo", style: { background: p.color } }, p.glyph),
          React.createElement("div", { style: { minWidth: 0 } },
            React.createElement("div", { className: "prov-name" }, p.name),
            React.createElement("div", { className: "faint mono", style: { fontSize: 11.5 } }, p.route + " · " + p.latency)),
          React.createElement("div", { className: "spacer" }),
          React.createElement("span", { className: "badge soft" }, p.kind === "cli" ? t("Local CLI") : t("API")),
          React.createElement("span", { className: "badge " + (p.status === "online" ? "completed" : "automate"), style: { marginLeft: 8 } }, p.status === "online" ? t("Online") : t("Ready")),
          React.createElement("button", { className: "icon-btn", style: { width: 32, height: 32, marginLeft: 8 }, onClick: () => ctx.toast("Configure " + p.name) }, I.settings({ size: 15 })),
        )),
      ),
      React.createElement("div", { className: "card card-pad mt16", style: { display: "flex", gap: 12, alignItems: "center" } },
        React.createElement("span", { style: { color: "var(--accent)" } }, I.key({ size: 20 })),
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("b", { style: { fontWeight: 700 } }, t("API keys are stored locally")),
          React.createElement("div", { className: "muted", style: { fontSize: 13 } }, t("Keys never leave your machine. omnux is local-first by default."))),
        React.createElement("button", { className: "btn", onClick: () => ctx.toast("Manage keys") }, t("Manage keys"))),
    );
  }

  function PermsTab({ ctx }) {
    const { state, setState } = ctx.permissions;
    const PERMS = ctx.perms;
    return React.createElement("div", null,
      React.createElement("div", { className: "card-title", style: { marginBottom: 4 } }, t("Permissions")),
      React.createElement("p", { className: "muted", style: { fontSize: 13, marginBottom: 12 } }, t("Global defaults. Each automation can tighten these further.")),
      React.createElement("div", { className: "card card-pad" },
        PERMS.map((p, i) => React.createElement("div", { key: p.k, className: "set-row", style: i === PERMS.length - 1 ? { borderBottom: "none" } : null },
          React.createElement("div", { className: "sr-label" }, React.createElement("b", null, t(p.label)), React.createElement("span", null, t(p.sub))),
          React.createElement("div", { className: "perm-seg" },
            ["allow", "ask", "deny"].map((v) => React.createElement("button", { key: v, className: v + (state[p.k] === v ? " on" : ""), onClick: () => setState((s) => ({ ...s, [p.k]: v })) }, v === "allow" ? t("perm.allow", "Allow") : v === "ask" ? t("perm.ask", "Ask") : t("perm.deny", "Deny")))),
        )),
      ),
    );
  }

  function IntegrationsTab({ ctx }) {
    return React.createElement("div", null,
      React.createElement("div", { className: "card-title", style: { marginBottom: 12 } }, t("Integrations")),
      React.createElement("div", { className: "card card-pad", style: { marginBottom: 14 } },
        React.createElement("div", { className: "items-center gap12" },
          React.createElement("div", { className: "quick-ico", style: { background: "var(--accent-soft)", color: "var(--accent)" } }, I.telegram({ size: 22 })),
          React.createElement("div", { style: { flex: 1 } },
            React.createElement("div", { className: "items-center gap8" }, React.createElement("b", { style: { fontWeight: 700, fontSize: 15 } }, t("Telegram")), React.createElement("span", { className: "badge completed" }, t("Connected"))),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 2 } }, t("Run omnux from a chat with your bot."))),
          React.createElement(window.Toggle, { on: true, onClick: () => {} })),
        React.createElement("div", { className: "mt16", style: { paddingTop: 14, borderTop: "1px solid var(--border)" } },
          React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, t("Active commands")),
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap" } },
            ["/morning-brief", "/repo-check", "/summarize"].map((c) => React.createElement("span", { key: c, className: "chip mono", style: { fontSize: 12.5 } }, c)))),
      ),
      React.createElement("div", { className: "card" },
        [{ n: "GitHub", d: "Sync repos and pull requests.", i: "git", on: false },
         { n: "Local shell", d: "Run commands on this machine.", i: "terminal", on: true }].map((x, i) =>
          React.createElement("div", { key: x.n, className: "set-row", style: { padding: "16px", borderBottom: i ? "none" : "1px solid var(--border)" } },
            React.createElement("div", { className: "items-center gap12" },
              React.createElement("div", { className: "row-ico" }, I[x.i]({ size: 17 })),
              React.createElement("div", { className: "sr-label" }, React.createElement("b", null, t(x.n)), React.createElement("span", null, t(x.d)))),
            React.createElement("button", { className: "btn sm", onClick: () => ctx.toast(x.on ? "Manage " + x.n : "Connect " + x.n) }, x.on ? t("Manage") : t("Connect")))),
      ),
    );
  }

  function AboutTab() {
    return React.createElement("div", null,
      React.createElement("div", { className: "card-title", style: { marginBottom: 12 } }, t("About")),
      React.createElement("div", { className: "card card-pad", style: { textAlign: "center", padding: 30 } },
        React.createElement("div", { className: "brand-mark", style: { width: 56, height: 56, borderRadius: 16, margin: "0 auto 14px" } }, I.layers({ size: 30 })),
        React.createElement("div", { style: { fontSize: 22, fontWeight: 800 } }, "omnux"),
        React.createElement("p", { className: "muted", style: { fontSize: 14, maxWidth: 380, margin: "8px auto 0", lineHeight: 1.55 } }, t("A local-first command center for AI agents, code, routines, and LLM orchestration.")),
        React.createElement("div", { className: "items-center gap8", style: { justifyContent: "center", marginTop: 16 } },
          React.createElement("span", { className: "badge soft" }, t("Version 1.0.0")),
          React.createElement("span", { className: "badge completed" }, t("Local-first")),
          React.createElement("span", { className: "badge soft mono", style: { fontSize: 11 } }, t("formerly Omni-node"))),
      ),
    );
  }

  function SettingsPage({ ctx, payload }) {
    const { tab, setTab, memory, permissions, perms } = window.useSettingsPageState(ctx, payload);
    const tabs = [
      { id: "general", label: "General", icon: "sliders" },
      { id: "models", label: "Models & services", icon: "route" },
      { id: "memory", label: "Memory & backup", icon: "mem" },
      { id: "permissions", label: "Permissions", icon: "shield" },
      { id: "integrations", label: "Integrations", icon: "telegram" },
      { id: "about", label: "About", icon: "info" },
    ];
    const Body = { general: GeneralTab, models: ModelsTab, memory: MemoryTab, permissions: PermsTab, integrations: IntegrationsTab, about: AboutTab }[tab];
    return (
      React.createElement("div", { className: "page" },
        React.createElement("div", { className: "col scroll page-scroll" },
          React.createElement("div", { style: { maxWidth: 920 } },
            React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20 } }, t("Settings")),
            React.createElement("div", { className: "settings-layout", style: { display: "flex", gap: 28, alignItems: "flex-start" } },
              React.createElement("div", { className: "set-nav" },
                tabs.map((tb) => React.createElement("button", { key: tb.id, className: tab === tb.id ? "on" : "", onClick: () => setTab(tb.id) },
                  React.createElement("span", { className: "items-center gap10" }, I[tb.icon]({ size: 16 }), t(tb.label))))),
              React.createElement("div", { style: { flex: 1, minWidth: 0 } }, React.createElement(Body, { ctx: { ...ctx, memory, permissions, perms } })),
            ),
          ),
        ),
      )
    );
  }

  Object.assign(window, { SettingsPage });
})();
