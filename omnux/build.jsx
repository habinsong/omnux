/* omnux — Build screen (request -> plan -> diff -> apply -> check) */
(function () {
  const { useState, useEffect } = React;
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s) => window.t(s);

  const PLAN = [
    'Find files that mention "omnux"',
    'Rename omnux \u2192 omnux',
    'Update the product description',
    'Run build & doc checks',
    'Generate a change summary',
  ];

  const DIFF = [
    { file: 'README.md', lines: [
      { n: 1, t: '# omnux', k: 'del' },
      { n: 1, t: '# omnux', k: 'add' },
      { n: 3, t: 'A local-first command center for AI agents.', k: 'del' },
      { n: 3, t: 'A local-first command center for AI agents, code,', k: 'add' },
      { n: 4, t: 'routines, and LLM orchestration.', k: 'add' },
    ] },
    { file: 'package.json', lines: [
      { n: 2, t: '  "name": "omnux",', k: 'del' },
      { n: 2, t: '  "name": "omnux",', k: 'add' },
      { n: 4, t: '  "description": "omnux desktop app",', k: 'del' },
      { n: 4, t: '  "description": "omnux \u2014 local-first AI command center",', k: 'add' },
    ] },
  ];

  function DetailToggle({ open, onClick, children }) {
    return React.createElement('button', { className: 'detail-toggle' + (open ? ' open' : ''), onClick }, I.chevR({ size: 15 }), children);
  }

  function BuildPage({ ctx, advanced, payload }) {
    const [project] = useState(D.projects[0]);
    const [req, setReq] = useState((payload && payload.input) || '');
    const [stage, setStage] = useState('compose'); // compose | planning | plan | applying | applied
    const [showDetails, setShowDetails] = useState(false);
    const [showCheck, setShowCheck] = useState(!!(payload && payload.check));

    useEffect(() => { if (payload && payload.input) setReq(payload.input); }, [payload && payload.input]);

    const genPlan = () => {
      if (!req.trim()) return;
      setStage('planning');
      setTimeout(() => setStage('plan'), 1100);
    };

    const apply = () => {
      ctx.requestPermission({
        title: 'omnux wants to change files',
        project: project.name,
        actions: ['Replace "omnux" with "omnux"', 'Update the product description'],
        files: DIFF.map(d => d.file),
        onAllow: () => {
          setStage('applying');
          setTimeout(() => { setStage('applied'); ctx.toast('Applied \u00B7 2 files changed'); }, 1200);
        },
      });
    };

    const examples = [
      'Rename omnux to omnux in README and package.json',
      'Add a dark mode toggle to the settings page',
      'Fix the type error in main.ts',
    ];

    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { style: { maxWidth: 780 } },
            React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' } }, t('Build')),
            React.createElement('p', { className: 'muted', style: { fontSize: 14, marginTop: 2 } }, t('Describe a change. omnux drafts a plan \u2014 nothing happens until you approve.')),

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
                value: req, placeholder: t('e.g. Rename omnux to omnux in README and package.json'),
                onChange: (e) => setReq(e.target.value),
                style: { width: '100%', minHeight: 80, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '13px 15px', fontSize: 15, outline: 'none', background: 'var(--surface-2)', lineHeight: 1.5 },
              }),
              stage === 'compose' ? React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 } },
                examples.map(ex => React.createElement('button', { key: ex, className: 'chip', style: { fontSize: 12 }, onClick: () => setReq(ex) }, t(ex))),
              ) : null,
              React.createElement('div', { className: 'items-center gap8 mt16' },
                React.createElement('button', { className: 'btn ghost', onClick: () => { setShowCheck(true); ctx.toast('Running build check\u2026'); } }, I.terminal({ size: 15 }), t('Run check')),
                React.createElement('div', { className: 'spacer' }),
                stage !== 'compose' ? React.createElement('button', { className: 'btn', onClick: () => { setStage('compose'); } }, t('Reset')) : null,
                React.createElement('button', { className: 'btn primary', onClick: genPlan, disabled: stage === 'planning' },
                  stage === 'planning' ? React.createElement(React.Fragment, null, React.createElement('span', { className: 'spin' }, I.refresh({ size: 15 })), t('Planning\u2026'))
                    : React.createElement(React.Fragment, null, I.spark({ size: 15 }), stage === 'compose' ? t('Generate plan') : t('Regenerate plan'))),
              ),
            ),

            // plan
            (stage === 'plan' || stage === 'applying' || stage === 'applied') ? React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement('div', { className: 'card-head', style: { marginBottom: 6 } },
                React.createElement('div', { className: 'card-title items-center gap8' }, I.route({ size: 17 }), t('Plan')),
                React.createElement('span', { className: 'badge soft' }, PLAN.length + ' ' + t(' steps').trim()),
              ),
              React.createElement('div', null, PLAN.map((s, i) =>
                React.createElement('div', { key: i, className: 'plan-step' + (stage === 'applied' ? ' done' : '') },
                  React.createElement('span', { className: 'plan-num' }, stage === 'applied' ? I.check({ size: 13 }) : (i + 1)),
                  React.createElement('div', { style: { paddingTop: 2 } },
                    React.createElement('div', { style: { fontWeight: 600 } }, t(s)),
                  ),
                ))),

              // diff preview
              React.createElement('div', { className: 'mt16' },
                React.createElement('div', { className: 'eyebrow', style: { marginBottom: 10 } }, t('Preview changes \u00B7 2 files')),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                  DIFF.map(d => React.createElement('div', { key: d.file, className: 'diff' },
                    React.createElement('div', { className: 'diff-file' }, I.file({ size: 14 }), d.file,
                      React.createElement('span', { className: 'spacer' }),
                      React.createElement('span', { style: { color: 'var(--green-text)' } }, '+' + d.lines.filter(l => l.k === 'add').length),
                      React.createElement('span', { style: { color: 'var(--red-text)', marginLeft: 8 } }, '\u2212' + d.lines.filter(l => l.k === 'del').length)),
                    d.lines.map((l, i) => React.createElement('div', { key: i, className: 'diff-line ' + l.k },
                      React.createElement('span', { className: 'ln' }, l.n),
                      React.createElement('span', { className: 'tx' }, (l.k === 'add' ? '+ ' : '\u2212 ') + l.t))),
                  )),
                ),
              ),

              // actions
              React.createElement('div', { className: 'items-center gap8 mt20' },
                stage === 'applied'
                  ? React.createElement('div', { className: 'items-center gap8', style: { color: 'var(--green-text)', fontWeight: 700 } }, I.checkCircle({ size: 18 }), t('Applied \u00B7 2 files changed'))
                  : React.createElement(React.Fragment, null,
                    React.createElement('button', { className: 'btn', onClick: () => { setShowCheck(true); ctx.toast('Running build check\u2026'); } }, I.terminal({ size: 15 }), t('Run check')),
                    React.createElement('div', { className: 'spacer' }),
                    React.createElement('button', { className: 'btn', onClick: () => ctx.toast('Diff preview is shown above') }, I.eye({ size: 15 }), t('Preview')),
                    React.createElement('button', { className: 'btn primary', onClick: apply, disabled: stage === 'applying' },
                      stage === 'applying' ? React.createElement(React.Fragment, null, React.createElement('span', { className: 'spin' }, I.refresh({ size: 15 })), t('Applying\u2026'))
                        : React.createElement(React.Fragment, null, I.check({ size: 15 }), t('Apply changes')))),
              ),
              stage === 'applied' ? React.createElement('div', { className: 'items-center gap8 mt16', style: { paddingTop: 14, borderTop: '1px solid var(--border)' } },
                React.createElement('button', { className: 'btn sm', onClick: () => ctx.setRoute('activity') }, t('View in Activity')),
                React.createElement('button', { className: 'btn sm', onClick: () => ctx.setRoute('automate', { create: true }) }, I.bot({ size: 14 }), t('Save as automation')),
              ) : null,
            ) : null,

            // build check console
            showCheck ? React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement('div', { className: 'between', style: { marginBottom: 12 } },
                React.createElement('div', { className: 'card-title items-center gap8' }, I.terminal({ size: 17 }), t('Build check')),
                React.createElement('span', { className: 'badge needs_review' }, t('1 warning')),
              ),
              React.createElement('div', { className: 'console' },
                React.createElement('div', null, React.createElement('span', { className: 'c-dim' }, '$ '), 'npm run build'),
                React.createElement('div', { className: 'c-dim' }, 'omnux@1.0.0 build'),
                React.createElement('div', null, React.createElement('span', { className: 'c-blue' }, 'vite'), ' building for production\u2026'),
                React.createElement('div', { className: 'c-green' }, '\u2713 142 modules transformed'),
                React.createElement('div', { className: 'c-amber' }, '\u26A0 warning: \u2018trace\u2019 imported but never used (src/lib/intent.ts:12)'),
                React.createElement('div', { className: 'c-green' }, '\u2713 built in 1.84s'),
                React.createElement('div', null, React.createElement('span', { className: 'c-dim' }, 'exit code '), React.createElement('span', { className: 'c-green' }, '0')),
              ),
              React.createElement('div', { className: 'items-center gap8 mt16' },
                React.createElement('button', { className: 'btn primary', onClick: () => { setReq('Remove the unused \u2018trace\u2019 import in src/lib/intent.ts'); setStage('compose'); ctx.toast('Loaded fix into Build'); } }, I.fix({ size: 15 }), t('Fix with omnux')),
                React.createElement('button', { className: 'btn ghost', onClick: () => setShowCheck(false) }, t('Dismiss')),
              ),
            ) : null,

            // advanced details
            (advanced && (stage === 'plan' || stage === 'applied')) ? React.createElement('div', { className: 'card card-pad mt20' },
              React.createElement(DetailToggle, { open: showDetails, onClick: () => setShowDetails(s => !s) }, t('Advanced details \u2014 model route, logs & console')),
              showDetails ? React.createElement('div', { className: 'mt12', style: { display: 'flex', flexDirection: 'column', gap: 16 } },
                React.createElement('div', null,
                  React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Model route')),
                  React.createElement('div', { className: 'console', style: { background: 'var(--surface-2)', color: 'var(--text-2)' } },
                    React.createElement('div', null, 'plan      \u2192 ', React.createElement('span', { style: { color: 'var(--text)' } }, 'codex-cli'), ' (local)'),
                    React.createElement('div', null, 'edit      \u2192 ', React.createElement('span', { style: { color: 'var(--text)' } }, 'codex-cli'), ' (local)'),
                    React.createElement('div', null, 'verify    \u2192 ', React.createElement('span', { style: { color: 'var(--text)' } }, 'groq/llama-3.1-70b')),
                  )),
                React.createElement('div', null,
                  React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Runner logs (stdout)')),
                  React.createElement('div', { className: 'console' },
                    React.createElement('div', { className: 'c-dim' }, '[runner] scanning 4 files for matches'),
                    React.createElement('div', { className: 'c-dim' }, '[runner] 6 replacements across 2 files'),
                    React.createElement('div', { className: 'c-green' }, '[runner] patch ready \u2014 awaiting approval'),
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
