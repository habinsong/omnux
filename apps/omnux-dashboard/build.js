/* omnux — Build screen (request -> plan -> diff -> apply -> check) */
(function () {
  const I = window.Icons;
  const t = (s) => window.t(s);

  function DetailToggle({ open, onClick, children }) {
    return React.createElement('button', { className: 'detail-toggle' + (open ? ' open' : ''), onClick }, I.chevR({ size: 15 }), children);
  }

  function BuildPage({ ctx, advanced, payload }) {
    const {
      project,
      req,
      setReq,
      stage,
      setStage,
      showDetails,
      setShowDetails,
      showCheck,
      setShowCheck,
      rollbackId,
      setRollbackId,
      rollbackStatus,
      restoreRollback,
      genPlan,
      runCheck,
      examples,
      progress,
      result,
      checkOutput,
      plan,
      diff,
    } = window.useBuildPageState(ctx, payload);

    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { className: 'page-wide page-wide-build' },
            React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' } }, t('Build')),
            React.createElement('p', { className: 'muted', style: { fontSize: 14, marginTop: 2 } }, t('Describe a change. omnux drafts a plan — nothing happens until you approve.')),

            // project + request
            React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement('div', { className: 'between', style: { marginBottom: 14 } },
                React.createElement('div', { className: 'items-center gap10' },
                  React.createElement('span', { className: 'faint', style: { fontSize: 13, fontWeight: 600 } }, t('Project')),
                  React.createElement('button', { className: 'btn sm', onClick: () => ctx.setRoute('projects') },
                    React.createElement('span', { className: 'proj-ico', style: { width: 20, height: 20, background: project.color + '1a', color: project.color } }, I.folder({ size: 12 })),
                    project.name, I.chevD({ size: 13 })),
                ),
                React.createElement('span', { className: 'badge soft mono', style: { fontSize: 11 } }, project.path),
              ),
              React.createElement('label', { className: 'eyebrow', style: { display: 'block', marginBottom: 8 } }, t('What should change?')),
              React.createElement('textarea', {
                value: req, placeholder: t('e.g. Rename Omni-node to omnux in README and package.json'),
                onChange: (e) => setReq(e.target.value),
                style: { width: '100%', minHeight: 80, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '13px 15px', fontSize: 15, outline: 'none', background: 'var(--surface-2)', lineHeight: 1.5 },
              }),
              stage === 'compose' ? React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 } },
                examples.map(ex => React.createElement('button', { key: ex, className: 'chip', style: { fontSize: 12 }, onClick: () => setReq(ex) }, t(ex))),
              ) : null,
              React.createElement('div', { className: 'items-center gap8 mt16' },
                React.createElement('button', { className: 'btn ghost', onClick: runCheck }, I.terminal({ size: 15 }), t('Run check')),
                React.createElement('div', { className: 'spacer' }),
                stage !== 'compose' ? React.createElement('button', { className: 'btn', onClick: () => { setStage('compose'); } }, t('Reset')) : null,
                React.createElement('button', { className: 'btn primary', onClick: genPlan, disabled: stage === 'planning' },
                  stage === 'planning' ? React.createElement(React.Fragment, null, React.createElement('span', { className: 'spin' }, I.refresh({ size: 15 })), t('Planning…'))
                    : React.createElement(React.Fragment, null, I.spark({ size: 15 }), stage === 'compose' ? '코딩 실행' : '다시 실행')),
              ),
            ),

            // plan
            (stage === 'planning' || stage === 'result') ? React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement('div', { className: 'card-head', style: { marginBottom: 6 } },
                React.createElement('div', { className: 'card-title items-center gap8' }, I.route({ size: 17 }), '실행 결과'),
                React.createElement('span', { className: 'badge soft' }, result?.mode || 'coding_run_single'),
              ),
              progress ? React.createElement('div', { className: 'muted', style: { fontSize: 13, marginBottom: 10 } }, progress) : null,
              React.createElement('div', null, plan.map((s, i) =>
                React.createElement('div', { key: i, className: 'plan-step' + (stage === 'result' ? ' done' : '') },
                  React.createElement('span', { className: 'plan-num' }, stage === 'result' ? I.check({ size: 13 }) : (i + 1)),
                  React.createElement('div', { style: { paddingTop: 2 } },
                    React.createElement('div', { style: { fontWeight: 600 } }, t(s)),
                  ),
                ))),

              // diff preview
              React.createElement('div', { className: 'mt16' },
                React.createElement('div', { className: 'eyebrow', style: { marginBottom: 10 } }, `변경 파일 · ${diff.length}`),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                  diff.length ? diff.map(d => React.createElement('div', { key: d.file, className: 'diff' },
                    React.createElement('div', { className: 'diff-file' }, I.file({ size: 14 }), d.file,
                      React.createElement('span', { className: 'spacer' }),
                      React.createElement('span', { style: { color: 'var(--green-text)' } }, '+' + d.lines.filter(l => l.k === 'add').length),
                      React.createElement('span', { style: { color: 'var(--red-text)', marginLeft: 8 } }, '−' + d.lines.filter(l => l.k === 'del').length)),
                    d.lines.map((l, i) => React.createElement('div', { key: i, className: 'diff-line ' + l.k },
                      React.createElement('span', { className: 'ln' }, l.n),
                      React.createElement('span', { className: 'tx' }, (l.k === 'add' ? '+ ' : '− ') + l.t))),
                  )) : React.createElement('div', { className: 'empty', style: { padding: 14 } }, '변경 파일 정보 없음'),
                ),
              ),

              // actions
              React.createElement('div', { className: 'items-center gap8 mt20' },
                React.createElement('button', { className: 'btn', onClick: runCheck }, I.terminal({ size: 15 }), t('Run check')),
                React.createElement('div', { className: 'spacer' }),
                result?.conversationId ? React.createElement('span', { className: 'badge soft mono', style: { fontSize: 11 } }, result.conversationId) : null,
              ),
              stage === 'result' ? React.createElement('div', { className: 'items-center gap8 mt16', style: { paddingTop: 14, borderTop: '1px solid var(--border)' } },
                React.createElement('button', { className: 'btn sm', onClick: () => ctx.setRoute('activity') }, t('View in Activity')),
                React.createElement('button', { className: 'btn sm', onClick: () => ctx.setRoute('automate', { create: true }) }, I.bot({ size: 14 }), t('Save as automation')),
              ) : null,
            ) : null,

            // build check console
            showCheck ? React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement('div', { className: 'between', style: { marginBottom: 12 } },
                React.createElement('div', { className: 'card-title items-center gap8' }, I.terminal({ size: 17 }), t('Build check')),
                React.createElement('span', { className: 'badge soft' }, 'command_result'),
              ),
              React.createElement('div', { className: 'console' },
                (checkOutput || '아직 체크 결과가 없습니다.').split('\n').slice(0, 80).map((line, index) =>
                  React.createElement('div', { key: index, className: line.toLowerCase().includes('error') ? 'c-amber' : '' }, line || ' ')
                ),
              ),
              React.createElement('div', { className: 'items-center gap8 mt16' },
                React.createElement('button', { className: 'btn primary', onClick: () => { setReq('Fix the latest npm test failure'); setStage('compose'); } }, I.fix({ size: 15 }), t('Fix with omnux')),
                React.createElement('button', { className: 'btn ghost', onClick: () => setShowCheck(false) }, t('Dismiss')),
              ),
            ) : null,

            // rollback restore
            React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement('div', { className: 'between', style: { marginBottom: 12 } },
                React.createElement('div', { className: 'card-title items-center gap8' }, I.refresh({ size: 17 }), '롤백 복원'),
                React.createElement('span', { className: 'badge soft mono', style: { fontSize: 11 } }, rollbackStatus.pending ? '진행 중' : (rollbackStatus.ok === true ? '완료' : (rollbackStatus.ok === false ? '확인 필요' : '대기'))),
              ),
              React.createElement('div', { className: 'items-center gap8', style: { alignItems: 'flex-start', flexWrap: 'wrap' } },
                React.createElement('div', { style: { minWidth: 240, flex: '1 1 320px' } },
                  React.createElement('label', { className: 'eyebrow', style: { display: 'block', marginBottom: 8 } }, '롤백 ID'),
                  React.createElement('input', {
                    className: 'input compact',
                    value: rollbackId,
                    placeholder: 'rollback_... ID 붙여넣기',
                    onChange: (e) => setRollbackId(e.target.value),
                    style: { width: '100%', padding: '11px 13px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', outline: 'none' },
                  }),
                ),
                React.createElement('button', { className: 'btn danger', onClick: restoreRollback, disabled: rollbackStatus.pending || !rollbackId.trim(), style: { marginTop: 24 } }, rollbackStatus.pending ? React.createElement(React.Fragment, null, React.createElement('span', { className: 'spin' }, I.refresh({ size: 15 })), '복원 중…') : React.createElement(React.Fragment, null, I.refresh({ size: 15 }), '롤백 복원')),
              ),
              React.createElement('div', { className: 'mt12' },
                React.createElement('div', { className: 'faint', style: { fontSize: 12.5 } }, rollbackStatus.message || '이전 리팩터링 스냅샷을 복원하려면 rollback ID를 입력하세요.'),
                rollbackStatus.result && Array.isArray(rollbackStatus.result.changedPaths) && rollbackStatus.result.changedPaths.length > 0
                  ? React.createElement('div', { className: 'mt12', style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
                    rollbackStatus.result.changedPaths.map((path) => React.createElement('span', { key: path, className: 'chip', style: { fontSize: 12 } }, path)))
                  : null,
              ),
            ),

            // advanced details
            (advanced && (stage === 'planning' || stage === 'result')) ? React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement(DetailToggle, { open: showDetails, onClick: () => setShowDetails(s => !s) }, t('Advanced details — model route, logs & console')),
              showDetails ? React.createElement('div', { className: 'mt12', style: { display: 'flex', flexDirection: 'column', gap: 16 } },
                React.createElement('div', null,
                  React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Model route')),
                  React.createElement('div', { className: 'console', style: { background: 'var(--surface-2)', color: 'var(--text-2)' } },
                    React.createElement('div', null, 'mode      → ', React.createElement('span', { style: { color: 'var(--text)' } }, result?.mode || 'coding_run_single')),
                    React.createElement('div', null, 'provider  → ', React.createElement('span', { style: { color: 'var(--text)' } }, result?.provider || '-')),
                    React.createElement('div', null, 'model     → ', React.createElement('span', { style: { color: 'var(--text)' } }, result?.model || '-')),
                  )),
                React.createElement('div', null,
                  React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Runner logs (stdout)')),
                  React.createElement('div', { className: 'console' },
                    React.createElement('div', { className: 'c-dim' }, progress || result?.summary || '로그 없음'),
                  )),
              ) : null,
            ) : null,

            !advanced ? React.createElement('div', { className: 'faint', style: { fontSize: 12.5, marginTop: 16, textAlign: 'center' } },
              t('Switch to '), React.createElement('b', { style: { color: 'var(--accent-text)' } }, t('Advanced')), t(' (top bar) to see the model route, console & raw logs.')) : null,
          ),
        ),
      )
    );
  }

  Object.assign(window, { BuildPage });
})();
