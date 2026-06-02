/* omnux — Settings screen */
(function () {
  const { useState } = React;
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s, fb) => window.t(s, fb);

  function Row({ label, sub, children }) {
    return React.createElement('div', { className: 'set-row' },
      React.createElement('div', { className: 'sr-label' }, React.createElement('b', null, label), sub ? React.createElement('span', null, sub) : null),
      React.createElement('div', null, children));
  }

  function GeneralTab({ ctx }) {
    return React.createElement('div', null,
      React.createElement('div', { className: 'card-title', style: { marginBottom: 4 } }, t('General')),
      React.createElement('div', { className: 'card card-pad mt12' },
        React.createElement(Row, { label: t('Appearance'), sub: t('Light, dark, or follow your system.') },
          React.createElement('div', { className: 'seg' },
            React.createElement('button', { className: ctx.theme === 'light' ? 'on' : '', onClick: () => ctx.setTheme('light') }, t('Light')),
            React.createElement('button', { className: ctx.theme === 'dark' ? 'on' : '', onClick: () => ctx.setTheme('dark') }, t('Dark')),
          )),
        React.createElement(Row, { label: t('Language'), sub: t('Interface language.') },
          React.createElement('div', { className: 'seg' },
            React.createElement('button', { className: ctx.lang === 'en' ? 'on' : '', onClick: () => ctx.setLang('en') }, 'English'),
            React.createElement('button', { className: ctx.lang === 'ko' ? 'on' : '', onClick: () => ctx.setLang('ko') }, '한국어'),
          )),
        React.createElement(Row, { label: t('Detail level'), sub: t('Advanced reveals model routes, console & logs.') },
          React.createElement('div', { className: 'seg' },
            React.createElement('button', { className: !ctx.advanced ? 'on' : '', onClick: () => ctx.setAdvanced(false) }, t('Simple')),
            React.createElement('button', { className: ctx.advanced ? 'on' : '', onClick: () => ctx.setAdvanced(true) }, t('Advanced')),
          )),
        React.createElement(Row, { label: t('Default project'), sub: t('Where new tasks start.') },
          React.createElement('select', { className: 'field' }, D.projects.map(p => React.createElement('option', { key: p.id }, p.name)))),
        React.createElement(Row, { label: t('Start on launch'), sub: t('Open omnux when you log in.') },
          React.createElement(window.Toggle, { on: true, onClick: () => {} })),
      ),
    );
  }

  function ModelsTab({ ctx }) {
    return React.createElement('div', null,
      React.createElement('div', { className: 'between', style: { marginBottom: 4 } },
        React.createElement('div', { className: 'card-title' }, t('Models & services')),
        React.createElement('button', { className: 'btn sm', onClick: () => ctx.toast('Add provider') }, I.plus({ size: 14 }), t('Add provider'))),
      React.createElement('p', { className: 'muted', style: { fontSize: 13, marginBottom: 12 } }, t('omnux routes each task to the best available model. Drag to set priority.')),
      React.createElement('div', { className: 'card' },
        D.providers.map((p, i) => React.createElement('div', { key: p.id, className: 'row', style: { padding: '14px 16px', borderTop: i ? '1px solid var(--border)' : 'none', borderRadius: 0 } },
          React.createElement('div', { className: 'prov-logo', style: { background: p.color } }, p.glyph),
          React.createElement('div', { style: { minWidth: 0 } },
            React.createElement('div', { className: 'prov-name' }, p.name),
            React.createElement('div', { className: 'faint mono', style: { fontSize: 11.5 } }, p.route + ' \u00B7 ' + p.latency)),
          React.createElement('div', { className: 'spacer' }),
          React.createElement('span', { className: 'badge soft' }, p.kind === 'cli' ? t('Local CLI') : t('API')),
          React.createElement('span', { className: 'badge ' + (p.status === 'online' ? 'completed' : 'automate'), style: { marginLeft: 8 } }, p.status === 'online' ? t('Online') : t('Ready')),
          React.createElement('button', { className: 'icon-btn', style: { width: 32, height: 32, marginLeft: 8 }, onClick: () => ctx.toast('Configure ' + p.name) }, I.settings({ size: 15 })),
        )),
      ),
      React.createElement('div', { className: 'card card-pad mt16', style: { display: 'flex', gap: 12, alignItems: 'center' } },
        React.createElement('span', { style: { color: 'var(--accent)' } }, I.key({ size: 20 })),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('b', { style: { fontWeight: 700 } }, t('API keys are stored locally')),
          React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, t('Keys never leave your machine. omnux is local-first by default.'))),
        React.createElement('button', { className: 'btn', onClick: () => ctx.toast('Manage keys') }, t('Manage keys'))),
    );
  }

  function PermsTab({ ctx }) {
    const PERMS = [
      { k: 'read', label: 'Read files', sub: 'Let omnux open and read project files.', v: 'allow' },
      { k: 'write', label: 'Write / edit files', sub: 'Always ask before changing files.', v: 'ask' },
      { k: 'run', label: 'Run commands', sub: 'Build, test and shell commands.', v: 'ask' },
      { k: 'network', label: 'Network access', sub: 'Call APIs and fetch remote data.', v: 'allow' },
      { k: 'delete', label: 'Delete files', sub: 'Removing files always needs approval.', v: 'deny' },
    ];
    const [state, setState] = useState(Object.fromEntries(PERMS.map(p => [p.k, p.v])));
    return React.createElement('div', null,
      React.createElement('div', { className: 'card-title', style: { marginBottom: 4 } }, t('Permissions')),
      React.createElement('p', { className: 'muted', style: { fontSize: 13, marginBottom: 12 } }, t('Global defaults. Each automation can tighten these further.')),
      React.createElement('div', { className: 'card card-pad' },
        PERMS.map((p, i) => React.createElement('div', { key: p.k, className: 'set-row', style: i === PERMS.length - 1 ? { borderBottom: 'none' } : null },
          React.createElement('div', { className: 'sr-label' }, React.createElement('b', null, t(p.label)), React.createElement('span', null, t(p.sub))),
          React.createElement('div', { className: 'perm-seg' },
            ['allow', 'ask', 'deny'].map(v => React.createElement('button', { key: v, className: v + (state[p.k] === v ? ' on' : ''), onClick: () => setState(s => ({ ...s, [p.k]: v })) }, v === 'allow' ? t('perm.allow', 'Allow') : v === 'ask' ? t('perm.ask', 'Ask') : t('perm.deny', 'Deny')))),
        )),
      ),
    );
  }

  function IntegrationsTab({ ctx }) {
    return React.createElement('div', null,
      React.createElement('div', { className: 'card-title', style: { marginBottom: 12 } }, t('Integrations')),
      React.createElement('div', { className: 'card card-pad', style: { marginBottom: 14 } },
        React.createElement('div', { className: 'items-center gap12' },
          React.createElement('div', { className: 'quick-ico', style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, I.telegram({ size: 22 })),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { className: 'items-center gap8' }, React.createElement('b', { style: { fontWeight: 700, fontSize: 15 } }, t('Telegram')), React.createElement('span', { className: 'badge completed' }, t('Connected'))),
            React.createElement('div', { className: 'muted', style: { fontSize: 13, marginTop: 2 } }, t('Run omnux from a chat with your bot.'))),
          React.createElement(window.Toggle, { on: true, onClick: () => {} })),
        React.createElement('div', { className: 'mt16', style: { paddingTop: 14, borderTop: '1px solid var(--border)' } },
          React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Active commands')),
          React.createElement('div', { className: 'items-center gap8', style: { flexWrap: 'wrap' } },
            ['/morning-brief', '/repo-check', '/summarize'].map(c => React.createElement('span', { key: c, className: 'chip mono', style: { fontSize: 12.5 } }, c)))),
      ),
      React.createElement('div', { className: 'card' },
        [{ n: 'GitHub', d: 'Sync repos and pull requests.', i: 'git', on: false },
         { n: 'Local shell', d: 'Run commands on this machine.', i: 'terminal', on: true }].map((x, i) =>
          React.createElement('div', { key: x.n, className: 'set-row', style: { padding: '16px', borderBottom: i ? 'none' : '1px solid var(--border)' } },
            React.createElement('div', { className: 'items-center gap12' },
              React.createElement('div', { className: 'row-ico' }, I[x.i]({ size: 17 })),
              React.createElement('div', { className: 'sr-label' }, React.createElement('b', null, t(x.n)), React.createElement('span', null, t(x.d)))),
            React.createElement('button', { className: 'btn sm', onClick: () => ctx.toast(x.on ? 'Manage ' + x.n : 'Connect ' + x.n) }, x.on ? t('Manage') : t('Connect')))),
      ),
    );
  }

  function AboutTab() {
    return React.createElement('div', null,
      React.createElement('div', { className: 'card-title', style: { marginBottom: 12 } }, t('About')),
      React.createElement('div', { className: 'card card-pad', style: { textAlign: 'center', padding: 30 } },
        React.createElement('div', { className: 'brand-mark', style: { width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px' } }, I.layers({ size: 30 })),
        React.createElement('div', { style: { fontSize: 22, fontWeight: 800 } }, 'omnux'),
        React.createElement('p', { className: 'muted', style: { fontSize: 14, maxWidth: 380, margin: '8px auto 0', lineHeight: 1.55 } }, t('A local-first command center for AI agents, code, routines, and LLM orchestration.')),
        React.createElement('div', { className: 'items-center gap8', style: { justifyContent: 'center', marginTop: 16 } },
          React.createElement('span', { className: 'badge soft' }, t('Version 1.0.0')),
          React.createElement('span', { className: 'badge completed' }, t('Local-first')),
          React.createElement('span', { className: 'badge soft mono', style: { fontSize: 11 } }, t('formerly omnux'))),
      ),
    );
  }

  function SettingsPage({ ctx, payload }) {
    const [tab, setTab] = useState((payload && payload.tab) || 'general');
    const tabs = [
      { id: 'general', label: 'General', icon: 'sliders' },
      { id: 'models', label: 'Models & services', icon: 'route' },
      { id: 'permissions', label: 'Permissions', icon: 'shield' },
      { id: 'integrations', label: 'Integrations', icon: 'telegram' },
      { id: 'about', label: 'About', icon: 'info' },
    ];
    const Body = { general: GeneralTab, models: ModelsTab, permissions: PermsTab, integrations: IntegrationsTab, about: AboutTab }[tab];
    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { style: { maxWidth: 920 } },
            React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 20 } }, t('Settings')),
            React.createElement('div', { className: 'settings-layout', style: { display: 'flex', gap: 28, alignItems: 'flex-start' } },
              React.createElement('div', { className: 'set-nav' },
                tabs.map(tb => React.createElement('button', { key: tb.id, className: tab === tb.id ? 'on' : '', onClick: () => setTab(tb.id) },
                  React.createElement('span', { className: 'items-center gap10' }, I[tb.icon]({ size: 16 }), t(tb.label))))),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } }, React.createElement(Body, { ctx })),
            ),
          ),
        ),
      )
    );
  }

  Object.assign(window, { SettingsPage });
})();
