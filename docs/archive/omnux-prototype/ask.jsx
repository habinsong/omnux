/* omnux — Ask screen */
(function () {
  const { useState, useEffect, useRef } = React;
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s) => window.t(s);

  const MOCK_REPLY = {
    default: 'Here\u2019s a clear breakdown. The run scheduler in omnux keeps a queue of pending runs and pulls the next one whenever a worker frees up. Each run carries its project context, the selected provider route, and a permission policy. When a run starts, omnux emits live events so Activity and the console can update in real time \u2014 nothing blocks the UI.\n\nWant me to turn this into a short doc, or open it in Build to wire it up?',
    file: 'I read the file you attached. It\u2019s a configuration module of ~180 lines. Key takeaways:\n\n\u2022 It exports a single default config object with provider routes and permission defaults.\n\u2022 Three values look environment-specific and should move to settings.\n\u2022 There\u2019s one unused import (line 12).\n\nI can refactor those for you in Build.',
  };

  function ChatMessage({ m, ctx }) {
    if (m.role === 'user') return React.createElement('div', { className: 'bubble-user' }, m.text);
    return (
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: '88%' } },
        React.createElement('div', { className: 'bubble-ai' },
          m.text.split('\n\n').map((p, i) => React.createElement('p', { key: i }, p)),
        ),
        React.createElement('div', { className: 'items-center gap8', style: { flexWrap: 'wrap', paddingLeft: 4 } },
          React.createElement('button', { className: 'btn sm ghost', onClick: () => ctx.toast('Copied to clipboard') }, I.copy({ size: 14 }), t('Copy')),
          React.createElement('button', { className: 'btn sm ghost', onClick: () => ctx.toast('Saved to project') }, I.save({ size: 14 }), t('Save')),
          React.createElement('button', { className: 'btn sm ghost', onClick: () => ctx.setRoute('ask', { mode: 'compare' }) }, I.scale({ size: 14 }), t('Compare')),
          React.createElement('button', { className: 'btn sm ghost', onClick: () => ctx.setRoute('automate', { create: true }) }, I.bot({ size: 14 }), t('Turn into automation')),
          React.createElement('button', { className: 'btn sm ghost', onClick: () => ctx.setRoute('build') }, I.code({ size: 14 }), t('Open in Build')),
        ),
      )
    );
  }

  function CompareView({ ctx }) {
    const pair = [D.providers[0], D.providers[1]];
    const ans = [
      'The scheduler uses a priority queue. Runs are dequeued when a worker is free, carrying project + route + permissions. Live events stream to the UI. It favors completeness and handles retries gracefully.',
      'Priority queue, worker pool, live events. Fast and to the point.',
    ];
    return (
      React.createElement('div', { className: 'compare-grid', style: { display: 'grid', gap: 16 } },
        pair.map((p, i) =>
          React.createElement('div', { key: p.id, className: 'card card-pad' },
            React.createElement('div', { className: 'between', style: { marginBottom: 12 } },
              React.createElement('div', { className: 'items-center gap10' },
                React.createElement('div', { className: 'prov-logo', style: { background: p.color, width: 26, height: 26, fontSize: 12 } }, p.glyph),
                React.createElement('b', { style: { fontWeight: 700 } }, p.name),
              ),
              React.createElement('span', { className: 'badge soft' }, i === 0 ? t('Most complete') : t('4\u00D7 faster')),
            ),
            React.createElement('p', { style: { lineHeight: 1.6, color: 'var(--text-2)' } }, ans[i]),
            React.createElement('div', { className: 'items-center gap8 mt16' },
              React.createElement('button', { className: 'btn sm ghost', onClick: () => ctx.toast('Saved') }, I.copy({ size: 14 }), t('Copy')),
              React.createElement('span', { className: 'faint mono', style: { fontSize: 11, marginLeft: 'auto' } }, p.latency),
            ),
          )
        ),
      )
    );
  }

  function AskPage({ ctx, payload }) {
    const compareMode = payload && payload.mode === 'compare';
    const fileMode = payload && payload.mode === 'file';
    const [msgs, setMsgs] = useState([]);
    const [val, setVal] = useState('');
    const [model, setModel] = useState(D.providers[0]);
    const [showModels, setShowModels] = useState(false);
    const scrollRef = useRef(null);

    const send = (text) => {
      const t = (text || '').trim(); if (!t) return;
      setMsgs(m => [...m, { role: 'user', text: t }]);
      setVal('');
      setTimeout(() => {
        setMsgs(m => [...m, { role: 'ai', text: fileMode ? MOCK_REPLY.file : MOCK_REPLY.default }]);
      }, 500);
    };

    useEffect(() => {
      if (payload && payload.input) send(payload.input);
      // eslint-disable-next-line
    }, [payload && payload.input]);

    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [msgs]);

    const empty = msgs.length === 0 && !compareMode;

    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col', style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
          React.createElement('div', { className: 'scroll', ref: scrollRef, style: { flex: 1, padding: '8px 30px 20px' } },
            React.createElement('div', { style: { maxWidth: 820, margin: '0 auto' } },
              React.createElement('div', { className: 'between', style: { marginBottom: 20 } },
                React.createElement('div', null,
                  React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' } }, compareMode ? t('Compare models') : t('Ask omnux')),
                  React.createElement('p', { className: 'muted', style: { fontSize: 14, marginTop: 2 } }, compareMode ? t('Same prompt, multiple models, side by side.') : t('The easiest way in \u2014 ask anything, attach a file, or compare models.')),
                ),
                React.createElement('div', { style: { position: 'relative' } },
                  React.createElement('button', { className: 'btn sm', onClick: () => setShowModels(s => !s) },
                    React.createElement('span', { className: 'prov-logo', style: { background: model.color, width: 18, height: 18, fontSize: 10 } }, model.glyph),
                    model.name, I.chevD({ size: 14 })),
                  showModels ? React.createElement('div', { className: 'card', style: { position: 'absolute', right: 0, top: 44, width: 230, padding: 6, zIndex: 20, boxShadow: 'var(--shadow-lg)' } },
                    D.providers.map(p => React.createElement('button', { key: p.id, className: 'palette-item', style: { width: '100%' }, onClick: () => { setModel(p); setShowModels(false); } },
                      React.createElement('span', { className: 'prov-logo', style: { background: p.color, width: 24, height: 24, fontSize: 11 } }, p.glyph),
                      React.createElement('div', null, React.createElement('div', { className: 'pi-title', style: { fontSize: 13.5 } }, p.name), React.createElement('div', { className: 'pi-sub' }, t('Best for ') + p.role)))),
                  ) : null,
                ),
              ),

              compareMode ? React.createElement(CompareView, { ctx }) : null,

              empty ? React.createElement('div', { style: { marginTop: 30 } },
                React.createElement('div', { className: 'eyebrow', style: { marginBottom: 12 } }, t('Suggested prompts')),
                React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
                  D.suggestions.map(s => React.createElement('button', { key: s, className: 'chip', onClick: () => send(s) }, I.spark({ size: 14 }), t(s))),
                ),
                React.createElement('div', { className: 'card card-pad mt28', style: { display: 'flex', gap: 14, alignItems: 'center', background: 'var(--surface-2)', border: 'none' } },
                  React.createElement('div', { className: 'quick-ico', style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, I.attach({ size: 20 })),
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('b', { style: { fontWeight: 700 } }, t('Ask about a file')),
                    React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, t('Drop in a document, log, image or data file and ask questions about it.'))),
                  React.createElement('button', { className: 'btn', onClick: () => ctx.toast('Attach a file to analyze') }, t('Attach file')),
                ),
              ) : null,

              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 22, marginTop: 22 } },
                msgs.map((m, i) => React.createElement('div', { key: i, style: { display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' } },
                  React.createElement(ChatMessage, { m, ctx }))),
              ),
            ),
          ),
          // input bar
          React.createElement('div', { style: { padding: '14px 30px 22px', borderTop: '1px solid var(--border)' } },
            React.createElement('div', { className: 'hero', style: { maxWidth: 820, margin: '0 auto', padding: '14px 14px 12px' } },
              React.createElement('div', { className: 'hero-top' },
                React.createElement('span', { className: 'hero-spark', style: { width: 22, height: 22 } }, I.spark({ size: 20 })),
                React.createElement('textarea', { value: val, rows: 1, placeholder: t('Message omnux\u2026'), style: { fontSize: 16 },
                  onChange: (e) => setVal(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(val); } } }),
                React.createElement('button', { className: 'hero-send', style: { width: 40, height: 40 }, onClick: () => send(val) }, I.send({ size: 18 })),
              ),
            ),
          ),
        ),
      )
    );
  }

  Object.assign(window, { AskPage });
})();
