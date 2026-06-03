/* omnux — Settings screen */
(function () {
  const I = window.Icons;
  const t = (s, fb) => window.t(s, fb);

  function Row({ label, sub, children }) {
    return React.createElement("div", { className: "set-row" },
      React.createElement("div", { className: "sr-label" }, React.createElement("b", null, label), sub ? React.createElement("span", null, sub) : null),
      React.createElement("div", null, children));
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatOpsTime(value) {
    const raw = `${value || ""}`.trim();
    if (!raw) return "-";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function statusBadgeClass(status, ok) {
    const normalized = `${status || ""}`.toLowerCase();
    if (ok === false || normalized === "fail" || normalized === "failed" || normalized === "canceled") return "failed";
    if (ok === true || normalized === "ok" || normalized === "completed" || normalized === "approved") return "completed";
    if (normalized === "warn" || normalized === "running" || normalized === "pending" || normalized === "blocked") return "needs_review";
    return "soft";
  }

  function shortText(value, max = 160) {
    const text = `${value || ""}`.trim();
    return text.length <= max ? text : `${text.slice(0, max)}...`;
  }

  function OpsResultCard({ title, status, children }) {
    return React.createElement("div", { className: "card card-pad mt12", style: { background: "var(--surface-2)" } },
      React.createElement("div", { className: "between", style: { gap: 10, marginBottom: 10 } },
        React.createElement("div", { className: "card-title" }, title),
        status ? React.createElement("span", { className: `badge ${status.className || "soft"}` }, status.label) : null
      ),
      children
    );
  }

  function OperationsTab({ ctx }) {
    const ops = ctx.operations;
    const { doctor, cleanup, plans, tasks } = ops;
    const report = doctor.report || null;
    const checks = Array.isArray(report && report.checks) ? report.checks : [];
    const fixPreview = doctor.fixPreview || null;
    const fixActions = Array.isArray(fixPreview && fixPreview.actions) ? fixPreview.actions : [];
    const cleanupPreview = cleanup.preview || null;
    const cleanupCandidates = Array.isArray(cleanupPreview && cleanupPreview.candidates) ? cleanupPreview.candidates : [];
    const cleanupApply = cleanup.apply || null;
    const planItems = Array.isArray(plans.items) ? plans.items : [];
    const graphItems = Array.isArray(tasks.items) ? tasks.items : [];
    const graph = tasks.snapshot && tasks.snapshot.graph ? tasks.snapshot.graph : null;
    const graphTasks = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
    const selectedTask = graphTasks.find((task) => task.taskId === tasks.selectedTaskId) || graphTasks[0] || null;
    const output = tasks.output || null;
    const busyDoctor = doctor.pending.run || doctor.pending.last || doctor.pending.fixPreview || doctor.pending.fixApply;
    const busyCleanup = cleanup.pending.preview || cleanup.pending.apply;
    const busyTask = tasks.loading || tasks.pending;

    return React.createElement("div", null,
      React.createElement("div", { className: "between", style: { marginBottom: 4, gap: 12, alignItems: "flex-start" } },
        React.createElement("div", null,
          React.createElement("div", { className: "card-title" }, "운영"),
          React.createElement("p", { className: "muted", style: { fontSize: 13, marginTop: 4, lineHeight: 1.5 } }, "Doctor, cleanup, task graph를 실제 미들웨어 WebSocket으로 실행합니다.")
        ),
        React.createElement("button", { className: "btn sm", onClick: () => { ops.refreshDoctorReport(); ops.refreshPlans(); ops.refreshTaskGraphs(); } }, I.refresh({ size: 14 }), "전체 새로고침")
      ),

      React.createElement("div", { className: "card card-pad mt12" },
        React.createElement("div", { className: "between", style: { marginBottom: 10, gap: 12, alignItems: "flex-start" } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title items-center gap8" }, I.warn({ size: 17 }), "Doctor 자동수정"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, report ? `최근 보고서 ${report.reportId || "-"}` : "최근 보고서 없음")
          ),
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", justifyContent: "flex-end" } },
            React.createElement("button", { className: "btn sm", disabled: busyDoctor, onClick: ops.refreshDoctorReport }, doctor.pending.last ? "조회 중..." : "최근 보고서"),
            React.createElement("button", { className: "btn sm", disabled: busyDoctor, onClick: ops.runDoctorReport }, doctor.pending.run ? "실행 중..." : "진단 실행"),
            React.createElement("button", { className: "btn sm", disabled: busyDoctor, onClick: ops.previewDoctorFix }, doctor.pending.fixPreview ? "미리보기 중..." : "수정 미리보기"),
            React.createElement("button", { className: "btn sm primary", disabled: busyDoctor || !doctor.previewId, onClick: ops.applyDoctorFix }, doctor.pending.fixApply ? "적용 중..." : "수정 적용")
          )
        ),
        doctor.lastError ? React.createElement("div", { style: { color: "var(--red-text)", fontSize: 13, marginBottom: 10 } }, doctor.lastError) : null,
        report ? React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 12 } },
          React.createElement("span", { className: "badge completed" }, `ok ${report.okCount || 0}`),
          React.createElement("span", { className: "badge needs_review" }, `warn ${report.warnCount || 0}`),
          React.createElement("span", { className: "badge failed" }, `fail ${report.failCount || 0}`),
          React.createElement("span", { className: "badge soft" }, `skip ${report.skipCount || 0}`),
          React.createElement("span", { className: "chip", style: { fontSize: 12 } }, formatOpsTime(report.createdAtUtc))
        ) : null,
        checks.length === 0
          ? React.createElement("div", { className: "empty", style: { padding: "24px 0" } }, "표시할 doctor check가 없습니다.")
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
            checks.slice(0, 8).map((check) => React.createElement("div", { key: `${check.id}:${check.status}`, className: "row", style: { alignItems: "flex-start" } },
              React.createElement("div", { className: "row-ico" }, check.status === "fail" ? I.x({ size: 15 }) : check.status === "warn" ? I.warn({ size: 15 }) : I.check({ size: 15 })),
              React.createElement("div", { style: { minWidth: 0 } },
                React.createElement("div", { className: "row-title" }, check.id || "-"),
                React.createElement("div", { className: "row-meta", style: { whiteSpace: "normal", lineHeight: 1.5 } }, check.summary || "-")
              ),
              React.createElement("span", { className: `badge ${statusBadgeClass(check.status)}` }, check.status || "-")
            ))
          ),
        fixPreview ? React.createElement(OpsResultCard, {
          title: "수정 미리보기",
          status: { className: statusBadgeClass("", fixPreview.ok), label: fixPreview.ok ? "ready" : "error" }
        },
          React.createElement("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6 } }, fixPreview.message || fixPreview.error || "-"),
          fixActions.length > 0 ? React.createElement("div", { className: "mt12", style: { display: "flex", flexDirection: "column", gap: 8 } },
            fixActions.map((action) => React.createElement("div", { key: action.actionId || action.target, className: "row", style: { padding: "10px 0" } },
              React.createElement("div", { style: { minWidth: 0 } },
                React.createElement("div", { className: "row-title" }, action.description || action.kind || action.actionId || "-"),
                React.createElement("div", { className: "row-meta mono", style: { whiteSpace: "normal" } }, action.target || "-")
              ),
              React.createElement("span", { className: `badge ${statusBadgeClass(action.status, action.status === "applied")}` }, action.status || (action.autoApply ? "auto" : "manual"))
            ))
          ) : null
        ) : null
      ),

      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { marginBottom: 10, gap: 12, alignItems: "flex-start" } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title items-center gap8" }, I.trash ? I.trash({ size: 17 }) : I.x({ size: 17 }), "시스템 클린업"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, cleanupPreview ? `${cleanupCandidates.length}개 후보 · ${formatBytes(cleanupPreview.totalSizeBytes)}` : "미리보기 없음")
          ),
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", justifyContent: "flex-end" } },
            React.createElement("button", { className: "btn sm", disabled: busyCleanup, onClick: ops.previewCleanup }, cleanup.pending.preview ? "미리보기 중..." : "cleanup 미리보기"),
            React.createElement("button", { className: "btn sm primary", disabled: busyCleanup || !cleanup.previewId, onClick: ops.applyCleanup }, cleanup.pending.apply ? "적용 중..." : "cleanup 적용")
          )
        ),
        cleanup.lastError ? React.createElement("div", { style: { color: "var(--red-text)", fontSize: 13, marginBottom: 10 } }, cleanup.lastError) : null,
        cleanupPreview ? React.createElement("div", null,
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", marginBottom: 10 } },
            React.createElement("span", { className: `badge ${statusBadgeClass("", cleanupPreview.ok)}` }, cleanupPreview.ok ? "ready" : "error"),
            React.createElement("span", { className: "chip mono", style: { fontSize: 12 } }, cleanupPreview.previewId || "-"),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, formatBytes(cleanupPreview.totalSizeBytes))
          ),
          cleanupCandidates.length === 0
            ? React.createElement("div", { className: "empty", style: { padding: "20px 0" } }, cleanupPreview.message || "삭제할 후보가 없습니다.")
            : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
              cleanupCandidates.slice(0, 10).map((item) => React.createElement("div", { key: item.path, className: "row", style: { alignItems: "flex-start" } },
                React.createElement("div", { style: { minWidth: 0 } },
                  React.createElement("div", { className: "row-title mono", style: { fontSize: 12.5, whiteSpace: "normal", wordBreak: "break-word" } }, item.path || "-"),
                  React.createElement("div", { className: "row-meta" }, `${item.kind || "-"} · ${item.reason || "-"} · ${formatOpsTime(item.lastModifiedUtc)}`)
                ),
                React.createElement("span", { className: "badge soft" }, formatBytes(item.sizeBytes))
              ))
            )
        ) : React.createElement("div", { className: "empty", style: { padding: "24px 0" } }, "cleanup 미리보기를 먼저 실행하세요."),
        cleanupApply ? React.createElement(OpsResultCard, {
          title: "클린업 적용 결과",
          status: { className: statusBadgeClass("", cleanupApply.ok), label: cleanupApply.ok ? "done" : "error" }
        },
          React.createElement("div", { className: "muted", style: { fontSize: 13, lineHeight: 1.6 } }, cleanupApply.message || cleanupApply.error || "-"),
          React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, `removed ${cleanupApply.removedCount || 0}`),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, formatBytes(cleanupApply.removedSizeBytes)),
            React.createElement("span", { className: "chip", style: { fontSize: 12 } }, `failed ${(cleanupApply.failedPaths || []).length}`)
          )
        ) : null
      ),

      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { marginBottom: 12, gap: 12, alignItems: "flex-start" } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title items-center gap8" }, I.route({ size: 17 }), "Plans / Task graph"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, `${planItems.length}개 계획 · ${graphItems.length}개 Task graph`)
          ),
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", justifyContent: "flex-end" } },
            React.createElement("button", { className: "btn sm", disabled: plans.loading, onClick: ops.refreshPlans }, plans.loading ? "계획 조회 중..." : "계획 새로고침"),
            React.createElement("button", { className: "btn sm", disabled: tasks.loading, onClick: ops.refreshTaskGraphs }, tasks.loading ? "Task 조회 중..." : "Task 새로고침")
          )
        ),
        plans.lastError ? React.createElement("div", { style: { color: "var(--amber-text)", fontSize: 13, marginBottom: 10 } }, plans.lastError) : null,
        tasks.lastError ? React.createElement("div", { style: { color: "var(--red-text)", fontSize: 13, marginBottom: 10 } }, tasks.lastError) : null,
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { className: "eyebrow", style: { display: "block", marginBottom: 8 } }, "계획 선택"),
            React.createElement("select", {
              className: "field",
              style: { width: "100%" },
              value: plans.selectedPlanId,
              onChange: (event) => ops.selectPlan(event.target.value)
            },
            planItems.length === 0 ? React.createElement("option", { value: "" }, "계획 없음") : null,
            planItems.map((plan) => React.createElement("option", { key: plan.planId, value: plan.planId }, plan.title || plan.planId))),
          ),
          React.createElement("div", null,
            React.createElement("label", { className: "eyebrow", style: { display: "block", marginBottom: 8 } }, "Task graph 생성용 계획 ID"),
            React.createElement("div", { className: "items-center gap8" },
              React.createElement("input", {
                className: "field",
                style: { flex: 1, minWidth: 0 },
                value: tasks.createPlanId,
                placeholder: "plan_...",
                onChange: (event) => ops.setTaskCreatePlanId(event.target.value)
              }),
              React.createElement("button", { className: "btn sm primary", disabled: busyTask || !tasks.createPlanId.trim(), onClick: ops.createTaskGraph }, tasks.pending ? "처리 중..." : "생성")
            )
          )
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 16, alignItems: "start" } },
          React.createElement("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
            React.createElement("div", { className: "between", style: { marginBottom: 10 } },
              React.createElement("div", { className: "card-title" }, "Task graph 목록"),
              React.createElement("span", { className: "badge soft" }, `${graphItems.length}건`)
            ),
            graphItems.length === 0
              ? React.createElement("div", { className: "empty", style: { padding: "24px 0" } }, "저장된 Task graph가 없습니다.")
              : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
                graphItems.map((item) => React.createElement("button", {
                  key: item.graphId,
                  className: "row",
                  style: { width: "100%", textAlign: "left" },
                  onClick: () => ops.loadTaskGraph(item.graphId)
                },
                  React.createElement("div", { style: { minWidth: 0 } },
                    React.createElement("div", { className: "row-title mono", style: { fontSize: 12.5 } }, item.graphId || "-"),
                    React.createElement("div", { className: "row-meta" }, `plan ${item.sourcePlanId || "-"} · ${item.completedNodes || 0}/${item.totalNodes || 0}`)
                  ),
                  React.createElement("div", { className: "spacer" }),
                  React.createElement("span", { className: `badge ${statusBadgeClass(item.status)}` }, item.status || "-")
                ))
              )
          ),
          React.createElement("div", { className: "card card-pad", style: { background: "var(--surface-2)" } },
            React.createElement("div", { className: "between", style: { marginBottom: 10, gap: 10 } },
              React.createElement("div", null,
                React.createElement("div", { className: "card-title" }, graph ? graph.graphId : "Task graph 상세"),
                React.createElement("div", { className: "row-meta" }, graph ? `상태 ${graph.status || "-"} · 수정 ${formatOpsTime(graph.updatedAtUtc)}` : "선택한 graph 없음")
              ),
              React.createElement("button", { className: "btn sm primary", disabled: busyTask || !graph, onClick: () => ops.runTaskGraph(graph && graph.graphId) }, "실행")
            ),
            !graph
              ? React.createElement("div", { className: "empty", style: { padding: "28px 0" } }, "Task graph를 선택하세요.")
              : React.createElement("div", null,
                graphTasks.length === 0
                  ? React.createElement("div", { className: "empty", style: { padding: "20px 0" } }, "작업이 없습니다.")
                  : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflow: "auto" } },
                    graphTasks.map((task) => {
                      const active = task.taskId === (selectedTask && selectedTask.taskId);
                      const canCancel = ["running", "pending", "blocked"].includes(`${task.status || ""}`.toLowerCase());
                      return React.createElement("div", { key: task.taskId, className: "row", style: { alignItems: "flex-start", background: active ? "var(--surface)" : undefined, borderRadius: 10 } },
                        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
                          React.createElement("div", { className: "row-title" }, `${task.taskId || "-"} · ${task.title || "-"}`),
                          React.createElement("div", { className: "row-meta", style: { whiteSpace: "normal", lineHeight: 1.5 } }, shortText(task.outputSummary || task.prompt || task.error || "-", 180))
                        ),
                        React.createElement("div", { className: "items-center gap6", style: { flexWrap: "wrap", justifyContent: "flex-end" } },
                          React.createElement("span", { className: `badge ${statusBadgeClass(task.status)}` }, task.status || "-"),
                          React.createElement("button", { className: "btn sm", disabled: !graph, onClick: () => ops.loadTaskOutput(graph.graphId, task.taskId) }, active ? "출력 갱신" : "출력"),
                          React.createElement("button", { className: "btn sm", disabled: busyTask || !graph, onClick: () => ops.retryTask(graph.graphId, task.taskId) }, "재시도"),
                          canCancel ? React.createElement("button", { className: "btn sm ghost", disabled: busyTask || !graph, onClick: () => ops.cancelTask(graph.graphId, task.taskId) }, "취소") : null
                        )
                      );
                    })
                  ),
                selectedTask ? React.createElement(OpsResultCard, {
                  title: `선택 출력 · ${selectedTask.taskId}`,
                  status: { className: statusBadgeClass(selectedTask.status), label: selectedTask.status || "-" }
                },
                  React.createElement("pre", { className: "console", style: { whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" } },
                    [
                      output && output.stdout ? `stdout\n${output.stdout}` : "",
                      output && output.stderr ? `stderr\n${output.stderr}` : "",
                      output && output.resultJson ? `result\n${output.resultJson}` : ""
                    ].filter(Boolean).join("\n\n") || "출력 없음")
                ) : null
              )
          )
        )
      )
    );
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

  function badge(label, ok, tone) {
    const className = tone || (ok ? "completed" : "soft");
    return React.createElement("span", { className: `badge ${className}` }, label);
  }

  function maskPlaceholder(masked, fallback) {
    return masked ? `${masked} (설정됨)` : fallback;
  }

  function numberText(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("ko-KR") : "-";
  }

  function AuthPanel({ live }) {
    const pending = live.pending || {};
    const connected = !!live.connected;
    const authenticated = !!live.authenticated;
    const remote = !!live.remoteDashboardClient;
    const title = !connected ? "미들웨어 연결 대기" : remote ? "외부 접속 제한 모드" : authenticated ? "세션 인증됨" : "OTP 인증 필요";
    const detail = !connected
      ? "라이브 미들웨어 연결 후 설정 저장과 상태 조회를 사용할 수 있습니다."
      : remote
        ? "외부 접속에서는 민감 정보 저장과 CLI 인증 작업이 제한됩니다."
        : authenticated
          ? (live.authExpiresAtLocal ? `인증 만료 ${live.authExpiresAtLocal}` : "민감 설정 저장이 가능합니다.")
          : "Telegram 또는 로컬 콘솔 fallback OTP로 현재 세션을 승인하세요.";

    return React.createElement("div", { className: "card card-pad mt12" },
      React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start" } },
        React.createElement("div", null,
          React.createElement("div", { className: "card-title items-center gap8" }, I.shield({ size: 17 }), title),
          React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 4, lineHeight: 1.5 } }, detail)),
        badge(authenticated || remote ? "접근 가능" : "인증 필요", authenticated || remote, authenticated || remote ? "completed" : "needs_review")),
      !authenticated && connected && !remote ? React.createElement("div", { className: "items-center gap8 mt16", style: { flexWrap: "wrap" } },
        React.createElement("input", {
          className: "field",
          value: live.otp || "",
          inputMode: "numeric",
          placeholder: "OTP 6자리",
          style: { flex: "1 1 180px", minWidth: 0 },
          onChange: (event) => live.setOtp(event.target.value)
        }),
        React.createElement("input", {
          className: "field",
          value: live.authTtlHours || "24",
          inputMode: "numeric",
          title: "인증 유지 시간",
          style: { flex: "0 1 110px", minWidth: 90 },
          onChange: (event) => live.setAuthTtlHours(event.target.value)
        }),
        React.createElement("button", { className: "btn sm", disabled: pending.otpRequest, onClick: live.requestOtp }, pending.otpRequest ? "요청 중..." : "OTP 요청"),
        React.createElement("button", { className: "btn sm primary", disabled: pending.auth || !(live.otp || "").trim(), onClick: live.authenticate }, pending.auth ? "인증 중..." : "인증")
      ) : null,
      live.otpResult && live.otpResult.message ? React.createElement("div", { className: "muted mt12", style: { fontSize: 12, lineHeight: 1.5 } }, live.otpResult.message) : null
    );
  }

  function ResultNote({ result }) {
    if (!result || !result.message) return null;
    return React.createElement("div", {
      className: "card card-pad mt12",
      style: { background: "var(--surface-2)", color: result.ok === false ? "var(--red-text)" : "var(--text-2)", fontSize: 13, lineHeight: 1.5 }
    }, result.message);
  }

  function SecretField({ label, sub, value, onChange, placeholder, isSet, disabled }) {
    return React.createElement("div", { className: "set-row", style: { alignItems: "flex-start" } },
      React.createElement("div", { className: "sr-label" },
        React.createElement("b", null, label),
        React.createElement("span", null, sub),
        React.createElement("div", { className: "mt12" }, badge(isSet ? "저장됨" : "미설정", isSet))),
      React.createElement("input", {
        type: "password",
        className: "field",
        autoComplete: "off",
        spellCheck: false,
        disabled,
        value,
        placeholder,
        style: { width: "min(360px, 100%)" },
        onChange: (event) => onChange(event.target.value)
      }));
  }

  function PersistToggle({ live }) {
    return React.createElement("label", { className: "chip", style: { display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5 } },
      React.createElement("input", {
        type: "checkbox",
        checked: !!live.persist,
        onChange: (event) => live.setPersist(event.target.checked)
      }),
      "보안 저장소에 저장");
  }

  function ModelList({ items, selected }) {
    if (!items.length) {
      return React.createElement("div", { className: "empty", style: { padding: "20px 0" } }, "조회된 모델이 없습니다.");
    }
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 } },
      items.slice(0, 6).map((item) => React.createElement("div", { key: item.id, className: "row", style: { alignItems: "flex-start" } },
        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
          React.createElement("div", { className: "row-title mono", style: { fontSize: 12.5, whiteSpace: "normal", wordBreak: "break-word" } }, item.id || "-"),
          React.createElement("div", { className: "row-meta", style: { whiteSpace: "normal" } },
            [item.tier, item.provider, item.context_window, item.rate_limit || item.speed_tps].filter(Boolean).join(" · ") || "-")),
        item.id === selected ? badge("선택됨", true) : null
      ))
    );
  }

  function UsageSummary({ usage }) {
    const gemini = usage.gemini || {};
    const premium = usage.copilotPremium || {};
    const local = usage.copilotLocal || {};
    return React.createElement("div", { className: "card card-pad mt16" },
      React.createElement("div", { className: "card-title", style: { marginBottom: 12 } }, "사용량"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 } },
        React.createElement("div", null,
          React.createElement("div", { className: "eyebrow" }, "Gemini"),
          React.createElement("div", { style: { fontWeight: 800, marginTop: 4 } }, numberText(gemini.requests), " requests"),
          React.createElement("div", { className: "muted", style: { fontSize: 12 } }, `${numberText(gemini.total_tokens)} tokens · $${gemini.estimated_cost_usd || "0.000000"}`)),
        React.createElement("div", null,
          React.createElement("div", { className: "eyebrow" }, "Copilot Premium"),
          React.createElement("div", { style: { fontWeight: 800, marginTop: 4 } }, premium.available ? `${premium.percent_used || "0"}%` : "조회 안됨"),
          React.createElement("div", { className: "muted", style: { fontSize: 12 } }, premium.message || "-")),
        React.createElement("div", null,
          React.createElement("div", { className: "eyebrow" }, "Copilot Local"),
          React.createElement("div", { style: { fontWeight: 800, marginTop: 4 } }, numberText(local.total_requests), " requests"),
          React.createElement("div", { className: "muted", style: { fontSize: 12 } }, local.selected_model || "-"))
      ));
  }

  function ModelsTab({ ctx }) {
    const live = ctx.live;
    const settings = live.settings || {};
    const pending = live.pending || {};
    const canEditSecrets = !!live.canEditSecrets;
    const canUsePrivileged = !!live.connected && !!live.authenticated;
    const llmFields = [
      { id: "groq", label: "Groq", sub: "Groq OpenAI-compatible API key", value: live.groqApiKey, onChange: live.setGroqApiKey, set: settings.groqApiKeySet, placeholder: maskPlaceholder(settings.groqApiKeyMasked, "gsk_...") },
      { id: "gemini", label: "Gemini", sub: "Google Gemini API key", value: live.geminiApiKey, onChange: live.setGeminiApiKey, set: settings.geminiApiKeySet, placeholder: maskPlaceholder(settings.geminiApiKeyMasked, "AIza...") },
      { id: "cerebras", label: "Cerebras", sub: "Cerebras API key", value: live.cerebrasApiKey, onChange: live.setCerebrasApiKey, set: settings.cerebrasApiKeySet, placeholder: maskPlaceholder(settings.cerebrasApiKeyMasked, "csk_...") },
      { id: "nvidia", label: "NVIDIA NIM", sub: "NVIDIA NIM API key", value: live.nvidiaApiKey, onChange: live.setNvidiaApiKey, set: settings.nvidiaApiKeySet, placeholder: maskPlaceholder(settings.nvidiaApiKeyMasked, "nvapi-...") },
      { id: "codex", label: "Codex", sub: "Codex API key", value: live.codexApiKey, onChange: live.setCodexApiKey, set: settings.codexApiKeySet, placeholder: maskPlaceholder(settings.codexApiKeyMasked, "sk-...") }
    ];
    const groqItems = live.groqModels.items || [];
    const cerebrasItems = live.cerebrasModels.items || [];
    const copilotItems = live.copilotModels.items || [];

    return React.createElement("div", null,
      React.createElement("div", { className: "between", style: { marginBottom: 4, gap: 12, alignItems: "flex-start" } },
        React.createElement("div", null,
          React.createElement("div", { className: "card-title" }, t("Models & services")),
          React.createElement("p", { className: "muted", style: { fontSize: 13, marginTop: 4, lineHeight: 1.5 } }, "LLM 키와 모델 선택을 미들웨어 WebSocket 설정 계약으로 저장합니다.")),
        React.createElement("button", { className: "btn sm", disabled: !live.connected, onClick: live.refreshAll }, I.refresh({ size: 14 }), "전체 새로고침")),
      React.createElement(AuthPanel, { live }),
      React.createElement(ResultNote, { result: live.settingsResult }),
      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start", marginBottom: 8 } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title items-center gap8" }, I.key({ size: 17 }), "LLM API 키"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, "빈 입력은 기존 저장값을 유지합니다. 실제 키 값은 화면에 다시 표시하지 않습니다.")),
          React.createElement(PersistToggle, { live })),
        llmFields.map((field) => React.createElement(SecretField, {
          key: field.id,
          label: field.label,
          sub: field.sub,
          value: field.value,
          onChange: field.onChange,
          placeholder: field.placeholder,
          isSet: field.set,
          disabled: pending.llm || pending.llmDelete
        })),
        React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap", padding: "0 16px 16px" } },
          React.createElement("button", { className: "btn primary", disabled: !canEditSecrets || pending.llm || pending.llmDelete, onClick: live.saveLlm }, pending.llm ? "저장 중..." : "키 저장"),
          React.createElement("button", { className: "btn ghost", disabled: !canEditSecrets || pending.llm || pending.llmDelete, onClick: live.deleteLlm }, pending.llmDelete ? "삭제 중..." : "LLM 키 전체 삭제"),
          !canEditSecrets ? React.createElement("span", { className: "muted", style: { fontSize: 12 } }, live.remoteDashboardClient ? "외부 접속 제한 모드" : "인증 필요") : null
        )),
      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start" } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title" }, "Groq 모델"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, `현재 선택: ${live.groqModels.selected || "-"}`)),
          badge(`${groqItems.length}개`, groqItems.length > 0)),
        React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
          React.createElement("select", {
            className: "field",
            value: live.selectedGroqModel,
            disabled: !canUsePrivileged || groqItems.length === 0,
            onChange: (event) => live.setSelectedGroqModel(event.target.value),
            style: { flex: "1 1 240px", minWidth: 0 }
          },
            groqItems.length === 0 ? React.createElement("option", { value: "" }, "모델 없음") : null,
            groqItems.map((item) => React.createElement("option", { key: item.id, value: item.id }, item.id))),
          React.createElement("button", { className: "btn sm", disabled: !canUsePrivileged || pending.groqRefresh, onClick: live.refreshGroqModels }, pending.groqRefresh ? "조회 중..." : "Groq 모델 새로고침"),
          React.createElement("button", { className: "btn sm primary", disabled: !canUsePrivileged || pending.groqApply || !live.selectedGroqModel, onClick: live.applyGroqModel }, pending.groqApply ? "적용 중..." : "모델 적용")),
        React.createElement(ModelList, { items: groqItems, selected: live.groqModels.selected })),
      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start" } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title" }, "Cerebras 모델"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, `현재 설정: ${live.cerebrasModels.selected || "-"}`)),
          badge(`${cerebrasItems.length}개`, cerebrasItems.length > 0)),
        React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
          React.createElement("button", { className: "btn sm", disabled: !canUsePrivileged || pending.cerebrasRefresh, onClick: live.refreshCerebrasModels }, pending.cerebrasRefresh ? "조회 중..." : "Cerebras 모델 새로고침"),
          React.createElement("span", { className: "muted", style: { fontSize: 12 } }, "모델 적용은 미들웨어 provider 설정 파일을 기준으로 합니다.")),
        React.createElement(ModelList, { items: cerebrasItems, selected: live.cerebrasModels.selected })),
      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start" } },
          React.createElement("div", null,
            React.createElement("div", { className: "card-title" }, "Copilot 모델"),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3 } }, `현재 선택: ${live.copilotModels.selected || "-"}`)),
          badge(`${copilotItems.length}개`, copilotItems.length > 0)),
        React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
          React.createElement("select", {
            className: "field",
            value: live.selectedCopilotModel,
            disabled: !canUsePrivileged || copilotItems.length === 0,
            onChange: (event) => live.setSelectedCopilotModel(event.target.value),
            style: { flex: "1 1 240px", minWidth: 0 }
          },
            copilotItems.length === 0 ? React.createElement("option", { value: "" }, "모델 없음") : null,
            copilotItems.map((item) => React.createElement("option", { key: item.id, value: item.id }, item.id))),
          React.createElement("button", { className: "btn sm", disabled: !canUsePrivileged || pending.copilotRefresh, onClick: live.refreshCopilotModels }, pending.copilotRefresh ? "조회 중..." : "Copilot 모델 새로고침"),
          React.createElement("button", { className: "btn sm primary", disabled: !canUsePrivileged || pending.copilotApply || !live.selectedCopilotModel, onClick: live.applyCopilotModel }, pending.copilotApply ? "적용 중..." : "모델 적용")),
        React.createElement(ModelList, { items: copilotItems, selected: live.copilotModels.selected })),
      React.createElement(UsageSummary, { usage: live.usage || {} })
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

  function cliLabel(status) {
    if (!status) return "조회 전";
    if (!status.installed) return "미설치";
    return status.authenticated ? "인증됨" : "미인증";
  }

  function cliTone(status) {
    if (!status) return "soft";
    if (!status.installed) return "failed";
    return status.authenticated ? "completed" : "needs_review";
  }

  function CliPanel({ title, icon, status, detailFallback, pendingStatus, pendingLogin, pendingLogout, onRefresh, onLogin, onLogout, loginLabel, disabled }) {
    return React.createElement("div", { className: "card card-pad mt16" },
      React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start" } },
        React.createElement("div", { className: "items-center gap12", style: { alignItems: "flex-start" } },
          React.createElement("div", { className: "row-ico" }, icon),
          React.createElement("div", { style: { minWidth: 0 } },
            React.createElement("div", { className: "card-title" }, title),
            React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3, lineHeight: 1.5, wordBreak: "break-word" } }, status?.detail || detailFallback || "-"),
            status?.mode ? React.createElement("div", { className: "mono faint", style: { fontSize: 11.5, marginTop: 6 } }, status.mode) : null)),
        badge(cliLabel(status), !!status?.authenticated, cliTone(status))),
      React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap" } },
        React.createElement("button", { className: "btn sm", disabled: disabled || pendingStatus, onClick: onRefresh }, pendingStatus ? "조회 중..." : "상태 조회"),
        React.createElement("button", { className: "btn sm primary", disabled: disabled || pendingLogin, onClick: onLogin }, pendingLogin ? "시작 중..." : loginLabel),
        onLogout ? React.createElement("button", { className: "btn sm ghost", disabled: disabled || pendingLogout, onClick: onLogout }, pendingLogout ? "처리 중..." : "로그아웃") : null,
        disabled ? React.createElement("span", { className: "muted", style: { fontSize: 12 } }, "인증 또는 로컬 접속 필요") : null
      ));
  }

  function IntegrationsTab({ ctx }) {
    const live = ctx.live;
    const settings = live.settings || {};
    const pending = live.pending || {};
    const telegramReady = !!settings.telegramBotTokenSet && !!settings.telegramChatIdSet;
    const canEditSecrets = !!live.canEditSecrets;
    const canUseCli = !!live.connected && !!live.authenticated && !live.remoteDashboardClient;

    return React.createElement("div", null,
      React.createElement("div", { className: "between", style: { marginBottom: 4, gap: 12, alignItems: "flex-start" } },
        React.createElement("div", null,
          React.createElement("div", { className: "card-title" }, t("Integrations")),
          React.createElement("p", { className: "muted", style: { fontSize: 13, marginTop: 4, lineHeight: 1.5 } }, "Telegram과 로컬 CLI 인증 상태를 실제 미들웨어 WebSocket으로 관리합니다.")),
        React.createElement("button", { className: "btn sm", disabled: !live.connected, onClick: live.refreshAll }, I.refresh({ size: 14 }), "전체 새로고침")),
      React.createElement(AuthPanel, { live }),
      React.createElement(ResultNote, { result: live.settingsResult }),
      React.createElement("div", { className: "card card-pad mt16" },
        React.createElement("div", { className: "between", style: { gap: 12, alignItems: "flex-start", marginBottom: 8 } },
          React.createElement("div", { className: "items-center gap12", style: { alignItems: "flex-start" } },
            React.createElement("div", { className: "quick-ico", style: { background: "var(--accent-soft)", color: "var(--accent)" } }, I.telegram({ size: 22 })),
            React.createElement("div", { style: { minWidth: 0 } },
              React.createElement("div", { className: "card-title" }, "Telegram"),
              React.createElement("div", { className: "muted", style: { fontSize: 13, marginTop: 3, lineHeight: 1.5 } }, "Bot Token과 Chat ID를 저장한 뒤 테스트 메시지를 보낼 수 있습니다."))),
          React.createElement("div", { className: "items-center gap8", style: { flexWrap: "wrap", justifyContent: "flex-end" } },
            badge(telegramReady ? "연동됨" : "미설정", telegramReady),
            React.createElement(PersistToggle, { live }))),
        React.createElement(SecretField, {
          label: "Bot Token",
          sub: "BotFather가 발급한 Telegram bot token",
          value: live.telegramBotToken,
          onChange: live.setTelegramBotToken,
          placeholder: maskPlaceholder(settings.telegramBotTokenMasked, "123456:ABC..."),
          isSet: settings.telegramBotTokenSet,
          disabled: pending.telegram || pending.telegramDelete
        }),
        React.createElement(SecretField, {
          label: "Chat ID",
          sub: "메시지를 받을 chat id",
          value: live.telegramChatId,
          onChange: live.setTelegramChatId,
          placeholder: maskPlaceholder(settings.telegramChatIdMasked, "-100..."),
          isSet: settings.telegramChatIdSet,
          disabled: pending.telegram || pending.telegramDelete
        }),
        React.createElement("div", { className: "items-center gap8 mt12", style: { flexWrap: "wrap", padding: "0 16px 16px" } },
          React.createElement("button", { className: "btn primary", disabled: !canEditSecrets || pending.telegram || pending.telegramDelete, onClick: live.saveTelegram }, pending.telegram ? "저장 중..." : "저장"),
          React.createElement("button", { className: "btn", disabled: !canEditSecrets || pending.telegramTest || !telegramReady, onClick: live.testTelegram }, pending.telegramTest ? "전송 중..." : "테스트 전송"),
          React.createElement("button", { className: "btn ghost", disabled: !canEditSecrets || pending.telegramDelete, onClick: live.deleteTelegram }, pending.telegramDelete ? "삭제 중..." : "연동 삭제"),
          !canEditSecrets ? React.createElement("span", { className: "muted", style: { fontSize: 12 } }, live.remoteDashboardClient ? "외부 접속 제한 모드" : "인증 필요") : null
        )),
      React.createElement(CliPanel, {
        title: "Copilot CLI",
        icon: I.git ? I.git({ size: 17 }) : I.terminal({ size: 17 }),
        status: live.copilotStatus,
        detailFallback: "GitHub Copilot CLI 인증 상태를 조회합니다.",
        pendingStatus: pending.copilotStatus,
        pendingLogin: pending.copilotLogin,
        onRefresh: live.refreshCopilotStatus,
        onLogin: live.startCopilotLogin,
        loginLabel: "로그인 시작",
        disabled: !canUseCli
      }),
      React.createElement(CliPanel, {
        title: "Codex CLI",
        icon: I.terminal({ size: 17 }),
        status: live.codexStatus,
        detailFallback: "Codex CLI 설치와 인증 상태를 조회합니다.",
        pendingStatus: pending.codexStatus,
        pendingLogin: pending.codexLogin,
        pendingLogout: pending.codexLogout,
        onRefresh: live.refreshCodexStatus,
        onLogin: live.startCodexLogin,
        onLogout: live.logoutCodex,
        loginLabel: "로그인 시작",
        disabled: !canUseCli
      })
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
    const { tab, setTab, memory, permissions, perms, operations, live } = window.useSettingsPageState(ctx, payload);
    const tabs = [
      { id: "general", label: "General", icon: "sliders" },
      { id: "models", label: "Models & services", icon: "route" },
      { id: "memory", label: "Memory & backup", icon: "mem" },
      { id: "operations", label: "운영", icon: "activity" },
      { id: "permissions", label: "Permissions", icon: "shield" },
      { id: "integrations", label: "Integrations", icon: "telegram" },
      { id: "about", label: "About", icon: "info" },
    ];
    const Body = { general: GeneralTab, models: ModelsTab, memory: MemoryTab, operations: OperationsTab, permissions: PermsTab, integrations: IntegrationsTab, about: AboutTab }[tab];
    return (
      React.createElement("div", { className: "page" },
        React.createElement("div", { className: "col scroll page-scroll" },
          React.createElement("div", { className: "page-wide" },
            React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20 } }, t("Settings")),
            React.createElement("div", { className: "settings-layout", style: { display: "flex", gap: 28, alignItems: "flex-start" } },
              React.createElement("div", { className: "set-nav" },
                tabs.map((tb) => React.createElement("button", { key: tb.id, className: tab === tb.id ? "on" : "", onClick: () => setTab(tb.id) },
                  React.createElement("span", { className: "items-center gap10" }, I[tb.icon]({ size: 16 }), t(tb.label))))),
              React.createElement("div", { style: { flex: 1, minWidth: 0 } }, React.createElement(Body, { ctx: { ...ctx, memory, permissions, perms, operations, live } })),
            ),
          ),
        ),
      )
    );
  }

  Object.assign(window, { SettingsPage });
})();
