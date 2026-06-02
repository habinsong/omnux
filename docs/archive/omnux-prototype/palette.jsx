/* omnux — Command Palette + Permission Modal + Toasts */
(function () {
  const { useState, useEffect, useRef } = React;
  const I = window.Icons;
  const t = (s) => window.t(s);

  function CommandPalette({ ctx, onClose }) {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const inputRef = useRef(null);

    const commands = [
      { id: 'c-ask', group: 'Actions', title: 'Ask anything', sub: 'Open a new conversation', icon: 'ask', kw: 'ask question chat', run: () => ctx.setRoute('ask') },
      { id: 'c-build', group: 'Actions', title: 'Work on current project', sub: 'Plan & apply a code change', icon: 'code', kw: 'build code work edit', run: () => ctx.setRoute('build') },
      { id: 'c-auto', group: 'Actions', title: 'Create automation', sub: 'Schedule, Telegram or file trigger', icon: 'bot', kw: 'automate routine telegram', run: () => ctx.setRoute('automate', { create: true }) },
      { id: 'c-compare', group: 'Actions', title: 'Compare models', sub: 'Side-by-side LLM answers', icon: 'scale', kw: 'compare models llm', run: () => ctx.setRoute('ask', { mode: 'compare' }) },
      { id: 'c-check', group: 'Actions', title: 'Run build check', sub: 'npm run build on omnux', icon: 'terminal', kw: 'build check run test', run: () => ctx.setRoute('build', { check: true }) },
      { id: 'c-proj', group: 'Navigate', title: 'Open project', sub: 'Browse local projects', icon: 'folder', kw: 'project open folder', run: () => ctx.setRoute('projects') },
      { id: 'c-activity', group: 'Navigate', title: 'Open recent activity', sub: 'Runs, logs & artifacts', icon: 'activity', kw: 'activity runs history', run: () => ctx.setRoute('activity') },
      { id: 'c-providers', group: 'Navigate', title: 'Open provider settings', sub: 'Models, API keys & routes', icon: 'route', kw: 'providers models settings keys', run: () => ctx.setRoute('settings', { tab: 'models' }) },
      { id: 'c-home', group: 'Navigate', title: 'Go home', sub: 'Back to the dashboard', icon: 'home', kw: 'home dashboard', run: () => ctx.setRoute('home') },
      { id: 'c-adv', group: 'Preferences', title: (ctx.advanced ? 'Hide advanced details' : 'Show advanced details'), sub: 'Provider route, console & logs', icon: 'sliders', kw: 'advanced details console toggle simple', run: () => ctx.setAdvanced(!ctx.advanced) },
      { id: 'c-theme', group: 'Preferences', title: 'Toggle theme', sub: (ctx.theme === 'dark' ? 'Switch to light' : 'Switch to dark'), icon: ctx.theme === 'dark' ? 'sun' : 'moon', kw: 'theme dark light mode', run: () => ctx.toggleTheme() },
    ];

    const filtered = commands.filter(c => {
      if (!q.trim()) return true;
      const s = (c.title + ' ' + c.sub + ' ' + c.kw).toLowerCase();
      return q.toLowerCase().split(' ').every(w => s.includes(w));
    });

    useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
    useEffect(() => { setSel(0); }, [q]);

    const choose = (c) => { onClose(); setTimeout(() => c.run(), 10); };

    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); filtered[sel] && choose(filtered[sel]); }
      else if (e.key === 'Escape') { onClose(); }
    };

    let lastGroup = null;
    return (
      React.createElement('div', { className: 'overlay', onMouseDown: onClose },
        React.createElement('div', { className: 'palette', onMouseDown: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'palette-input' },
            React.createElement('span', { style: { color: 'var(--text-3)' } }, I.search({ size: 19 })),
            React.createElement('input', { ref: inputRef, value: q, placeholder: t('Type a command or search\u2026'), onChange: (e) => setQ(e.target.value), onKeyDown: onKey }),
            React.createElement('kbd', null, 'Esc'),
          ),
          React.createElement('div', { className: 'palette-list' },
            filtered.length === 0
              ? React.createElement('div', { className: 'empty', style: { padding: '36px 20px' } }, t('No commands match \u201C') + q + '\u201D')
              : filtered.map((c, i) => {
                const showGroup = c.group !== lastGroup; lastGroup = c.group;
                return React.createElement(React.Fragment, { key: c.id },
                  showGroup ? React.createElement('div', { className: 'palette-group' }, t(c.group)) : null,
                  React.createElement('div', {
                    className: 'palette-item' + (i === sel ? ' sel' : ''),
                    onMouseEnter: () => setSel(i), onClick: () => choose(c),
                  },
                    React.createElement('div', { className: 'pi-ico' }, I[c.icon]({ size: 17 })),
                    React.createElement('div', { style: { minWidth: 0 } },
                      React.createElement('div', { className: 'pi-title' }, t(c.title)),
                      React.createElement('div', { className: 'pi-sub' }, t(c.sub)),
                    ),
                    i === sel ? React.createElement('kbd', { className: 'pi-kbd' }, '\u21B5') : null,
                  ),
                );
              }),
          ),
          React.createElement('div', { className: 'palette-foot' },
            React.createElement('span', { className: 'kf' }, React.createElement('kbd', null, '\u2191'), React.createElement('kbd', null, '\u2193'), t('navigate')),
            React.createElement('span', { className: 'kf' }, React.createElement('kbd', null, '\u21B5'), t('select')),
            React.createElement('span', { className: 'kf' }, React.createElement('kbd', null, 'esc'), t('close')),
            React.createElement('span', { style: { marginLeft: 'auto' } }, t('omnux command palette')),
          ),
        )
      )
    );
  }

  function PermissionModal({ req, onClose }) {
    // req: { title, actions:[], files:[], project, onAllow }
    return (
      React.createElement('div', { className: 'overlay', onMouseDown: onClose },
        React.createElement('div', { className: 'modal', onMouseDown: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'modal-head' },
            React.createElement('div', { className: 'modal-ico' }, I.shield({ size: 22 })),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' } }, req.title ? t(req.title) : t('omnux wants to change files')),
              React.createElement('div', { className: 'muted', style: { fontSize: 13, marginTop: 3 } }, t('Review what omnux will do in '), React.createElement('b', { style: { color: 'var(--text)' } }, req.project || 'omnux'), t(' before it runs.')),
            ),
          ),
          React.createElement('div', { className: 'modal-body' },
            req.actions && req.actions.length ? React.createElement('div', { style: { marginBottom: 14 } },
              React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Actions')),
              React.createElement('ul', { style: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 } },
                req.actions.map((a, i) => React.createElement('li', { key: i, className: 'items-center gap8', style: { fontSize: 13.5, fontWeight: 500 } },
                  React.createElement('span', { style: { color: 'var(--accent)' } }, I.arrowR({ size: 14 })), t(a))),
              ),
            ) : null,
            req.files && req.files.length ? React.createElement('div', null,
              React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Files to change')),
              req.files.map((f, i) => React.createElement('div', { key: i, className: 'perm-file' },
                React.createElement('span', { style: { color: 'var(--text-3)' } }, I.file({ size: 15 })), f)),
            ) : null,
          ),
          React.createElement('div', { className: 'modal-foot' },
            React.createElement('button', { className: 'btn ghost', onClick: onClose }, I.eye({ size: 15 }), t('Preview diff')),
            React.createElement('div', { className: 'spacer' }),
            React.createElement('button', { className: 'btn', onClick: onClose }, t('Cancel')),
            React.createElement('button', { className: 'btn', onClick: () => { req.onAllow && req.onAllow('project'); onClose(); } }, t('Always allow here')),
            React.createElement('button', { className: 'btn primary', onClick: () => { req.onAllow && req.onAllow('once'); onClose(); } }, I.check({ size: 15 }), t('Allow once')),
          ),
        )
      )
    );
  }

  function Toasts({ toasts }) {
    return React.createElement('div', { className: 'toast-wrap' },
      toasts.map(t => React.createElement('div', { key: t.id, className: 'toast' },
        React.createElement('span', { className: 't-ico' }, I.checkCircle({ size: 17 })), t.msg)));
  }

  Object.assign(window, { CommandPalette, PermissionModal, Toasts });
})();
