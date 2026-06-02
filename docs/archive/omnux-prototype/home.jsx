/* omnux — Home screen */
(function () {
  const { useState, useRef } = React;
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s) => window.t(s);

  function HeroInput({ ctx }) {
    const [val, setVal] = useState('');
    const [focus, setFocus] = useState(false);
    const ref = useRef(null);
    const intent = val.trim() ? D.classifyIntent(val) : null;
    const ROUTE_INFO = {
      ask: { label: 'Ask', desc: 'a question or analysis', icon: 'ask', col: 'var(--violet)' },
      build: { label: 'Build', desc: 'a code change', icon: 'code', col: 'var(--blue)' },
      automate: { label: 'Automate', desc: 'a repeatable task', icon: 'bot', col: 'var(--accent)' },
    };
    const ri = intent ? ROUTE_INFO[intent] : null;
    const RI_DESC = { ask: 'a question or analysis', build: 'a code change', automate: 'a repeatable task' };

    const submit = () => {
      const text = val.trim();
      if (!text) return;
      ctx.setRoute(intent, { input: text });
      setVal('');
    };
    const onKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    return (
      React.createElement('div', { className: 'hero' + (focus ? ' focus' : '') },
        React.createElement('div', { className: 'hero-top' },
          React.createElement('span', { className: 'hero-spark' }, I.spark({ size: 24 })),
          React.createElement('textarea', {
            ref, value: val, rows: 1, placeholder: t('Ask omnux anything\u2026  Tell it what you want to do.'),
            onChange: (e) => { setVal(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; },
            onKeyDown: onKey, onFocus: () => setFocus(true), onBlur: () => setFocus(false),
          }),
        ),
        React.createElement('div', { className: 'hero-actions' },
          React.createElement('button', { className: 'chip', onClick: () => ctx.toast('Attach files — pick from your project') }, I.attach({ size: 15 }), t('Attach files')),
          React.createElement('button', { className: 'chip', onClick: () => ctx.setRoute('projects') }, I.folder({ size: 15 }), t('Select project')),
          React.createElement('button', { className: 'chip', onClick: () => ctx.toast('Choose model — defaults to best for the task') }, I.model({ size: 15 }), t('Choose model')),
          React.createElement('button', { className: 'hero-send', onClick: submit, title: 'Send (Enter)' }, I.send({ size: 19 })),
        ),
        ri ? React.createElement('div', { className: 'hero-route' },
          I.route({ size: 15, style: { color: ri.col } }),
          React.createElement('span', null, t('omnux will route this to ')),
          React.createElement('b', { style: { color: ri.col } }, t(ri.label)),
          React.createElement('span', { className: 'faint' }, '· ' + t(RI_DESC[intent])),
          React.createElement('span', { style: { marginLeft: 'auto' } }, React.createElement('kbd', null, 'Enter'), ' ', t('to send')),
        ) : null,
      )
    );
  }

  function QuickStart({ ctx }) {
    return (
      React.createElement('div', null,
        React.createElement('div', { className: 'section-label' }, t('Quick start')),
        React.createElement('div', { className: 'quick-grid' },
          D.quickActions.map(q =>
            React.createElement('button', { key: q.id, className: 'quick-card', onClick: () => ctx.setRoute(q.route, q.id === 'compare' ? { mode: 'compare' } : q.id === 'analyze' ? { mode: 'file' } : null) },
              React.createElement('div', { className: 'quick-ico', style: { background: q.soft, color: q.color } }, I[q.icon]({ size: 22 })),
              React.createElement('b', null, t(q.title)),
              React.createElement('p', null, t(q.desc)),
              React.createElement('div', { className: 'quick-arrow' }, I.arrow({ size: 15 })),
            )
          ),
        ),
      )
    );
  }

  function ContinueList({ ctx }) {
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head', style: { marginBottom: 6 } },
          React.createElement('div', { className: 'card-title' }, t('Continue where you left off')),
        ),
        React.createElement('div', null,
          D.continueItems.map(a =>
            React.createElement('div', { key: a.id, className: 'row', onClick: () => ctx.openActivity(a) },
              React.createElement('div', { className: 'row-ico' }, I.file({ size: 16 })),
              React.createElement('div', { style: { minWidth: 0 } },
                React.createElement('div', { className: 'row-title' }, t(a.title)),
              ),
              React.createElement('div', { style: { marginLeft: 12 } }, React.createElement(window.TypeBadge, { type: a.type })),
              React.createElement('div', { className: 'spacer' }),
              React.createElement('div', { className: 'row-meta continue-hide-sm', style: { width: 70 } }, a.project),
              React.createElement('div', { className: 'row-meta continue-hide-sm', style: { width: 76, textAlign: 'right' } }, t(a.when)),
              React.createElement('div', { style: { width: 110, display: 'flex', justifyContent: 'flex-end' } }, React.createElement(window.StatusBadge, { status: a.status })),
            )
          ),
        ),
        React.createElement('button', { className: 'row', style: { marginTop: 4, color: 'var(--accent-text)', fontWeight: 700, justifyContent: 'space-between' }, onClick: () => ctx.setRoute('activity') },
          React.createElement('span', null, t('View all activity')),
          I.arrowR({ size: 16 }),
        ),
      )
    );
  }

  function ActiveProjects({ ctx }) {
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head', style: { marginBottom: 6 } },
          React.createElement('div', { className: 'card-title' }, t('Active projects')),
          React.createElement('button', { className: 'link', onClick: () => ctx.setRoute('projects') }, t('View all')),
        ),
        D.projects.map(p =>
          React.createElement('div', { key: p.id, className: 'proj-card', onClick: () => ctx.openProject(p) },
            React.createElement('div', { className: 'proj-ico', style: { background: p.color + '1a', color: p.color } }, I.folder({ size: 19 })),
            React.createElement('div', { style: { minWidth: 0, flex: 1 } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                React.createElement('b', { style: { fontWeight: 700, fontSize: 14.5 } }, p.name),
                p.isMain ? React.createElement('span', { className: 'badge soft', style: { color: 'var(--accent-text)', background: 'var(--accent-soft)' } }, t('Main workspace')) : null,
              ),
              React.createElement('div', { className: 'row-meta', style: { marginTop: 2 } }, t(p.description)),
              React.createElement('div', { className: 'faint', style: { fontSize: 11.5, marginTop: 3 } }, t(p.lastOpened)),
            ),
          )
        ),
        React.createElement('button', { className: 'btn', style: { width: '100%', marginTop: 10, borderStyle: 'dashed' }, onClick: () => ctx.toast('Add project — choose a local folder') },
          I.plus({ size: 16 }), t('Add project')),
      )
    );
  }

  // ---------- right rail ----------
  function ModelsCard({ ctx, advanced }) {
    const apis = D.providers.filter(p => p.kind === 'api');
    const clis = D.providers.filter(p => p.kind === 'cli');
    const Row = (p) =>
      React.createElement('div', { key: p.id, className: 'prov-row' },
        React.createElement('div', { className: 'prov-logo', style: { background: p.color } }, p.glyph),
        React.createElement('div', { style: { minWidth: 0 } },
          React.createElement('div', { className: 'prov-name' }, p.name),
          advanced ? React.createElement('div', { className: 'faint mono', style: { fontSize: 11 } }, p.route + ' · ' + p.latency) : null,
        ),
        React.createElement('div', { className: 'status-text ' + (p.status === 'online' ? 'online' : 'ready') },
          React.createElement('span', { className: 'dot', style: { background: p.status === 'online' ? 'var(--green)' : 'var(--accent)', boxShadow: '0 0 0 3px ' + (p.status === 'online' ? 'var(--green-soft)' : 'var(--accent-soft)') } }),
          p.status === 'online' ? t('Online') : t('Ready'),
        ),
      );
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('div', { className: 'card-title' }, t('Models & services')),
          React.createElement('button', { className: 'link', onClick: () => ctx.setRoute('settings', { tab: 'models' }) }, t('Manage')),
        ),
        React.createElement('div', null, apis.map(Row)),
        React.createElement('div', { style: { height: 1, background: 'var(--border)', margin: '8px 0' } }),
        React.createElement('div', null, clis.map(Row)),
        React.createElement('button', { className: 'row', style: { marginTop: 6, color: 'var(--accent-text)', fontWeight: 700, justifyContent: 'space-between' }, onClick: () => ctx.setRoute('settings', { tab: 'models' }) },
          React.createElement('span', null, t('View all providers')),
          I.chevR({ size: 16 }),
        ),
      )
    );
  }

  function RecentActivityCard({ ctx }) {
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('div', { className: 'card-title' }, t('Recent activity')),
          React.createElement('button', { className: 'link', onClick: () => ctx.setRoute('activity') }, t('View all')),
        ),
        D.activities.slice(0, 4).map(a =>
          React.createElement('div', { key: a.id, className: 'row', style: { padding: '11px 8px' }, onClick: () => ctx.openActivity(a) },
            React.createElement(window.ActivityStatusIcon, { status: a.status }),
            React.createElement('div', { style: { minWidth: 0 } },
              React.createElement('div', { className: 'row-title', style: { fontSize: 13 } }, t(a.title)),
              React.createElement('div', { className: 'row-meta' }, t(a.summary)),
            ),
            React.createElement('div', { className: 'spacer' }),
            React.createElement('div', { className: 'row-meta' }, t(a.when)),
          )
        ),
      )
    );
  }

  function ResourceCard({ ctx }) {
    const items = [
      { label: 'Local CPU', val: '32%', pct: 32, icon: 'cpu' },
      { label: 'Memory', val: '5.1 GB / 16 GB', pct: 32, icon: 'mem' },
      { label: 'Running tasks', val: '2 active', pct: 18, icon: 'play' },
    ];
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('div', { className: 'card-title' }, t('Resource usage')),
          React.createElement('button', { className: 'link', onClick: () => ctx.toast('System monitor coming soon') }, t('View details')),
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 } },
          items.map(r =>
            React.createElement('div', { key: r.label },
              React.createElement('div', { className: 'between', style: { marginBottom: 7 } },
                React.createElement('div', { className: 'items-center gap8', style: { color: 'var(--text-2)', fontWeight: 600, fontSize: 13 } }, I[r.icon]({ size: 15 }), t(r.label)),
                React.createElement('span', { style: { fontWeight: 700, fontSize: 13 } }, t(r.val)),
              ),
              React.createElement('div', { className: 'bar' }, React.createElement('i', { style: { width: r.pct + '%' } })),
            )
          ),
        ),
      )
    );
  }

  function HomePage({ ctx, advanced }) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { style: { maxWidth: 760 } },
            React.createElement('h1', { className: 'h1' }, t(greet) + ', habinsong ', React.createElement('span', { className: 'wave' }, '\uD83D\uDC4B')),
            React.createElement('p', { className: 'sub' }, t('What would you like to accomplish today?')),
            React.createElement('div', { className: 'mt20' }, React.createElement(HeroInput, { ctx })),
          ),
          React.createElement('div', { className: 'mt36' }, React.createElement(QuickStart, { ctx })),
          React.createElement('div', { className: 'mt36 home-split', style: { display: 'grid', gap: 20, alignItems: 'start' } },
            React.createElement(ContinueList, { ctx }),
            React.createElement(ActiveProjects, { ctx }),
          ),
        ),
        React.createElement('div', { className: 'rail scroll' },
          React.createElement(ModelsCard, { ctx, advanced }),
          React.createElement(RecentActivityCard, { ctx }),
          React.createElement(ResourceCard, { ctx }),
        ),
      )
    );
  }

  Object.assign(window, { HomePage });
})();
