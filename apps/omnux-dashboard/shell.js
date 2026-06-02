/* omnux — app shell: Sidebar, TopBar, shared bits */
(function () {
  const { useState } = React;
  const I = window.Icons;
  const t = (s) => window.t(s);

  const NAV = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'ask', label: 'Ask', icon: 'ask' },
    { id: 'build', label: 'Build', icon: 'build' },
    { id: 'automate', label: 'Automate', icon: 'automate' },
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'activity', label: 'Activity', icon: 'activity', badge: 1 },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  function Sidebar({ route, setRoute }) {
    return (
      React.createElement('aside', { className: 'sidebar' },
        React.createElement('div', { className: 'brand' },
          React.createElement('div', { className: 'brand-mark' }, I.layers({ size: 21 })),
          React.createElement('div', { className: 'brand-name' }, 'omnux'),
        ),
        React.createElement('nav', { className: 'nav' },
          NAV.map(n =>
            React.createElement('button', {
              key: n.id, className: 'nav-item' + (route === n.id ? ' active' : ''),
              onClick: () => setRoute(n.id),
            },
              I[n.icon]({ size: 19 }),
              React.createElement('span', null, t(n.label)),
              n.badge ? React.createElement('span', { className: 'nav-badge' }, n.badge) : null,
            )
          ),
        ),
        React.createElement('div', { className: 'tip-card' },
          React.createElement('div', { className: 'tip-row' }, I.spark({ size: 16 }), t('Tip')),
          React.createElement('p', null,
            t('Press '), React.createElement('kbd', null, '⌘K'), t(' anytime to open the command palette.')),
        ),
        React.createElement('button', { className: 'user-chip', onClick: () => setRoute('settings') },
          React.createElement('div', { className: 'user-avatar', style: { background: 'linear-gradient(135deg,#6f72f6,#9d5ef0)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 } }, 'h'),
          React.createElement('div', { className: 'meta' },
            React.createElement('b', null, 'habinsong'),
            React.createElement('span', null, t('Local Workspace')),
          ),
          React.createElement('div', { style: { marginLeft: 'auto', color: 'var(--text-3)' } }, I.chevD({ size: 16 })),
        ),
      )
    );
  }

  function TopBar({ openPalette, advanced, setAdvanced, theme, toggleTheme, openNav, runtime }) {
    const liveLabel = runtime?.status === 'connected'
      ? (runtime.authRequired && !runtime.authenticated ? 'Auth needed' : 'Live middleware')
      : runtime?.status === 'connecting'
        ? 'Connecting'
        : runtime?.status === 'offline'
          ? 'Offline'
          : 'Static dashboard';
    const liveClass = runtime?.status === 'connected' ? ' online' : '';
    return (
      React.createElement('header', { className: 'topbar' },
        React.createElement('button', { className: 'icon-btn nav-toggle', onClick: openNav, title: 'Menu' }, I.grid({ size: 18 })),
        React.createElement('button', { className: 'search', onClick: openPalette },
          I.search({ size: 17 }),
          React.createElement('span', { style: { fontWeight: 500 } }, t('Search or run a command')),
          React.createElement('kbd', { className: 'sk' }, '⌘K'),
        ),
        React.createElement('div', { className: 'topbar-right' },
          React.createElement('div', { className: 'seg', title: 'Simple shows the essentials. Advanced reveals routes, logs & console.' },
            React.createElement('button', { className: !advanced ? 'on' : '', onClick: () => setAdvanced(false) }, t('Simple')),
            React.createElement('button', { className: advanced ? 'on' : '', onClick: () => setAdvanced(true) }, t('Advanced')),
          ),
          React.createElement('div', { className: 'pill-status' + liveClass },
            React.createElement('span', { className: 'dot' }),
            t(liveLabel),
          ),
          React.createElement('button', { className: 'icon-btn', title: 'Notifications' },
            I.bell({ size: 18 }), React.createElement('span', { className: 'ping' }),
          ),
          React.createElement('button', { className: 'icon-btn', onClick: toggleTheme, title: 'Toggle theme' },
            theme === 'dark' ? I.sun({ size: 18 }) : I.moon({ size: 18 }),
          ),
        ),
      )
    );
  }

  // ---- shared atoms ----
  function Badge({ kind, children }) {
    return React.createElement('span', { className: 'badge ' + kind }, children);
  }

  const STATUS_LABEL = { completed: 'Completed', running: 'Running', failed: 'Failed', needs_review: 'Needs review' };
  function StatusBadge({ status }) {
    return React.createElement(Badge, { kind: status }, t(STATUS_LABEL[status] || status));
  }

  const TYPE_LABEL = { ask: 'Ask', build: 'Build', automate: 'Automate', compare: 'Compare' };
  function TypeBadge({ type }) {
    return React.createElement(Badge, { kind: type }, t(TYPE_LABEL[type] || type));
  }

  function ActivityStatusIcon({ status }) {
    const map = {
      completed: { ico: 'checkCircle', col: 'var(--green)' },
      needs_review: { ico: 'warn', col: 'var(--amber)' },
      failed: { ico: 'warn', col: 'var(--red)' },
      running: { ico: 'refresh', col: 'var(--blue)' },
    };
    const m = map[status] || map.completed;
    return React.createElement('span', { style: { color: m.col, display: 'grid', placeItems: 'center' } }, I[m.ico]({ size: 18 }));
  }

  function Toggle({ on, onClick }) {
    return React.createElement('button', { className: 'switch' + (on ? ' on' : ''), onClick }, React.createElement('i'));
  }

  Object.assign(window, { Sidebar, TopBar, Badge, StatusBadge, TypeBadge, ActivityStatusIcon, Toggle, NAV });
})();
