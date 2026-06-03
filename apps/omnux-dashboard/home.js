/* omnux — Home screen */
(function () {
  const { useState, useRef } = React;
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s) => window.t(s);

  function runtimeProjects(ctx) {
    const items = Array.isArray(ctx.runtime?.projects) ? ctx.runtime.projects : [];
    return items.map((item) => ({
      id: item.projectKey || item.name,
      projectKey: item.projectKey || '',
      name: item.name || 'Project',
      description: item.description || '등록된 로컬 프로젝트',
      path: item.path || '',
      color: item.color || '#2563EB',
      isMain: !!item.isMain,
      lastOpened: item.lastOpenedUtc ? new Date(item.lastOpenedUtc).toLocaleString() : '등록됨',
    }));
  }

  function runtimeActivities(ctx, limit) {
    const events = Array.isArray(ctx.runtime?.events) ? ctx.runtime.events : [];
    return events.slice(0, limit).map((event) => ({
      id: event.id,
      title: event.title || event.type || 'event',
      summary: event.detail || '-',
      type: event.type || 'run',
      project: 'runtime',
      when: event.when || '',
      status: event.status === 'failed' ? 'failed' : event.status === 'running' ? 'running' : 'completed',
      detail: event.detail || event.title || '',
    }));
  }

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
          React.createElement('button', { className: 'chip', onClick: () => ctx.setRoute('ask', { mode: 'file' }) }, I.attach({ size: 15 }), t('Attach files')),
          React.createElement('button', { className: 'chip', onClick: () => ctx.setRoute('projects') }, I.folder({ size: 15 }), t('Select project')),
          React.createElement('button', { className: 'chip', onClick: () => ctx.setRoute('settings', { tab: 'models' }) }, I.model({ size: 15 }), t('Choose model')),
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
    const items = runtimeActivities(ctx, 4);
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head', style: { marginBottom: 6 } },
          React.createElement('div', { className: 'card-title' }, t('Continue where you left off')),
        ),
        React.createElement('div', null,
          items.map(a =>
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
          items.length === 0 ? React.createElement('div', { className: 'empty', style: { padding: '16px 8px' } }, '아직 실행 기록이 없습니다.') : null,
        ),
        React.createElement('button', { className: 'row', style: { marginTop: 4, color: 'var(--accent-text)', fontWeight: 700, justifyContent: 'space-between' }, onClick: () => ctx.setRoute('activity') },
          React.createElement('span', null, t('View all activity')),
          I.arrowR({ size: 16 }),
        ),
      )
    );
  }

  function ActiveProjects({ ctx }) {
    const projects = runtimeProjects(ctx);
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head', style: { marginBottom: 6 } },
          React.createElement('div', { className: 'card-title' }, t('Active projects')),
          React.createElement('button', { className: 'link', onClick: () => ctx.setRoute('projects') }, t('View all')),
        ),
        projects.map(p =>
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
        projects.length === 0 ? React.createElement('div', { className: 'empty', style: { padding: '16px 8px' } }, '등록된 프로젝트가 없습니다.') : null,
        React.createElement('button', { className: 'btn', style: { width: '100%', marginTop: 10, borderStyle: 'dashed' }, onClick: () => ctx.setRoute('projects') },
          I.plus({ size: 16 }), t('Add project')),
      )
    );
  }

  // ---------- right rail ----------
  function modelStatusLabel(row) {
    if (row.status === 'connected') return '설정됨';
    if (row.status === 'authenticated') return '인증됨';
    if (row.status === 'unauthenticated') return '미인증';
    if (row.status === 'missing') return '미설정';
    if (row.status === 'not_installed') return '미설치';
    return '연결 대기';
  }

  function modelStatusClass(row) {
    if (row.status === 'connected' || row.status === 'authenticated') return 'online';
    if (row.status === 'pending') return 'ready';
    return 'ready';
  }

  function modelStatusColor(row) {
    if (row.status === 'connected' || row.status === 'authenticated') return 'var(--green)';
    if (row.status === 'missing' || row.status === 'unauthenticated' || row.status === 'not_installed') return 'var(--amber)';
    return 'var(--text-3)';
  }

  function buildModelServiceRows(runtime) {
    const settings = runtime?.settings || {};
    const groqModels = runtime?.groqModels || {};
    const copilotStatus = runtime?.copilotStatus || null;
    const codexStatus = runtime?.codexStatus || null;
    const apiRows = [
      {
        id: 'groq',
        name: 'Groq',
        glyph: 'G',
        color: '#F55036',
        status: settings.groqApiKeySet ? 'connected' : 'missing',
        detail: groqModels.selected || 'API key'
      },
      {
        id: 'gemini',
        name: 'Gemini',
        glyph: 'G',
        color: '#4285F4',
        status: settings.geminiApiKeySet ? 'connected' : 'missing',
        detail: 'API key'
      },
      {
        id: 'cerebras',
        name: 'Cerebras',
        glyph: 'C',
        color: '#EF6A35',
        status: settings.cerebrasApiKeySet ? 'connected' : 'missing',
        detail: 'API key'
      },
      {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        glyph: 'N',
        color: '#76B900',
        status: settings.nvidiaApiKeySet ? 'connected' : 'missing',
        detail: 'API key'
      },
      {
        id: 'codex-api',
        name: 'Codex API',
        glyph: 'C',
        color: '#111418',
        status: settings.codexApiKeySet ? 'connected' : 'missing',
        detail: 'API key'
      }
    ];
    const cliRows = [
      {
        id: 'copilot-cli',
        name: 'Copilot CLI',
        glyph: '⊚',
        color: '#5B5EF0',
        status: !copilotStatus ? 'pending' : !copilotStatus.installed ? 'not_installed' : copilotStatus.authenticated ? 'authenticated' : 'unauthenticated',
        detail: copilotStatus?.mode || 'status'
      },
      {
        id: 'codex-cli',
        name: 'Codex CLI',
        glyph: '⌁',
        color: '#111418',
        status: !codexStatus ? 'pending' : !codexStatus.installed ? 'not_installed' : codexStatus.authenticated ? 'authenticated' : 'unauthenticated',
        detail: codexStatus?.mode || 'status'
      }
    ];
    return { apiRows, cliRows };
  }

  function ModelsCard({ ctx, advanced }) {
    const runtime = ctx.runtime || {};
    const connected = !!runtime.connected || runtime.status === 'connected';
    const { apiRows, cliRows } = buildModelServiceRows(runtime);
    const Row = (p) =>
      React.createElement('div', { key: p.id, className: 'prov-row' },
        React.createElement('div', { className: 'prov-logo', style: { background: p.color } }, p.glyph),
        React.createElement('div', { style: { minWidth: 0 } },
          React.createElement('div', { className: 'prov-name' }, p.name),
          advanced ? React.createElement('div', { className: 'faint mono', style: { fontSize: 11 } }, p.detail || '-') : null,
        ),
        React.createElement('div', { className: 'status-text ' + modelStatusClass(p) },
          React.createElement('span', { className: 'dot', style: { background: modelStatusColor(p), boxShadow: '0 0 0 3px var(--surface-2)' } }),
          connected ? modelStatusLabel(p) : '연결 대기',
        ),
      );
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('div', { className: 'card-title' }, t('Models & services')),
          React.createElement('button', { className: 'link', onClick: () => ctx.setRoute('settings', { tab: 'models' }) }, t('Manage')),
        ),
        React.createElement('div', null, apiRows.map(Row)),
        React.createElement('div', { style: { height: 1, background: 'var(--border)', margin: '8px 0' } }),
        React.createElement('div', null, cliRows.map(Row)),
        React.createElement('button', { className: 'row', style: { marginTop: 6, color: 'var(--accent-text)', fontWeight: 700, justifyContent: 'space-between' }, onClick: () => ctx.setRoute('settings', { tab: 'models' }) },
          React.createElement('span', null, '모델 설정 열기'),
          I.chevR({ size: 16 }),
        ),
      )
    );
  }

  function RecentActivityCard({ ctx }) {
    const items = runtimeActivities(ctx, 4);
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('div', { className: 'card-title' }, t('Recent activity')),
          React.createElement('button', { className: 'link', onClick: () => ctx.setRoute('activity') }, t('View all')),
        ),
        items.map(a =>
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
        items.length === 0 ? React.createElement('div', { className: 'empty', style: { padding: '12px 8px' } }, '최근 이벤트 없음') : null,
      )
    );
  }

  function flattenMetricRows(value) {
    if (!value || typeof value !== 'object') return [];
    const payload = value.payload && typeof value.payload === 'object' ? value.payload : value;
    const rows = [];
    Object.entries(payload).forEach(([key, metric]) => {
      if (key === 'type') return;
      if (metric && typeof metric === 'object') {
        const val = metric.value ?? metric.current ?? metric.used ?? metric.status ?? JSON.stringify(metric).slice(0, 80);
        const pct = Number(metric.percent ?? metric.pct ?? metric.usagePercent ?? 0);
        rows.push({ label: key, val: String(val), pct: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0, icon: key.toLowerCase().includes('mem') ? 'mem' : key.toLowerCase().includes('task') ? 'play' : 'cpu' });
      } else if (typeof metric !== 'undefined') {
        rows.push({ label: key, val: String(metric), pct: 0, icon: 'cpu' });
      }
    });
    return rows.slice(0, 4);
  }

  function ResourceCard({ ctx }) {
    const items = flattenMetricRows(ctx.runtime?.metrics);
    return (
      React.createElement('div', { className: 'card card-pad' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('div', { className: 'card-title' }, t('Resource usage')),
          React.createElement('button', { className: 'link', onClick: () => ctx.send({ type: 'get_metrics' }, { queueIfClosed: true }) }, t('View details')),
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
          items.length === 0 ? React.createElement('div', { className: 'empty', style: { padding: '12px 8px' } }, '메트릭 수신 대기 중') : null,
        ),
      )
    );
  }

  function HomePage({ ctx, advanced }) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const [bottomOpen, setBottomOpen] = useState(false);
    return (
      React.createElement('div', { className: 'page home-page' + (bottomOpen ? ' bottom-open' : '') },
        React.createElement('div', { className: 'col scroll page-scroll home-scroll' },
          React.createElement('div', { className: 'home-main' },
            React.createElement('div', { className: 'home-primary' },
              React.createElement('h1', { className: 'h1' }, t(greet) + ', habinsong ', React.createElement('span', { className: 'wave' }, '\uD83D\uDC4B')),
              React.createElement('p', { className: 'sub' }, t('What would you like to accomplish today?')),
              React.createElement('div', { className: 'mt20' }, React.createElement(HeroInput, { ctx })),
            ),
            React.createElement('div', { className: 'home-quick' }, React.createElement(QuickStart, { ctx })),
          ),
        ),
        React.createElement('div', {
          className: 'home-bottom-dock',
          onClick: () => { if (!bottomOpen) setBottomOpen(true); }
        },
          React.createElement('button', {
            className: 'home-dock-handle',
            type: 'button',
            'aria-expanded': bottomOpen ? 'true' : 'false',
            onClick: (event) => {
              event.stopPropagation();
              setBottomOpen((open) => !open);
            }
          },
            React.createElement('span', null, bottomOpen ? '아래로 접기' : '이어서 보기'),
            I.chevD({ size: 16 })
          ),
          React.createElement('div', { className: 'home-split', style: { display: 'grid', gap: 20, alignItems: 'start' } },
            React.createElement(ContinueList, { ctx }),
            React.createElement(ActiveProjects, { ctx }),
          ),
        ),
      )
    );
  }

  Object.assign(window, { HomePage });
})();
