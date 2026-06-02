/* omnux - static dashboard bootstrap */
(function () {
  const HEAD = document.head;
  const ROOT = document.getElementById('root');
  const REACT_SOURCES = [
    {
      name: 'React',
      globalName: 'React',
      src: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    },
    {
      name: 'ReactDOM',
      globalName: 'ReactDOM',
      src: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
    },
  ];
  const APP_SCRIPTS = [
    'icons.js',
    'i18n.js',
    'data.js',
    'shell.js',
    'palette.js',
    'home.js',
    'ask.js',
    'build.js',
    'automate.js',
    'projects.js',
    'settings.js',
    'runtime-adapter.js',
    'modules/app-shell-summary.js',
    'modules/app-shell-persistence.js',
    'modules/app-shell-overlays.js',
    'modules/app-shell-events.js',
    'modules/app-shell-navigation-state.js',
    'modules/app-shell-preference-state.js',
    'modules/app-shell-domain-stores.js',
    'modules/app-shell-domain-state.js',
    'modules/app-shell-ui-state.js',
    'modules/app-shell-bridges.js',
    'modules/app-shell-context.js',
    'modules/app-shell-render.js',
    'modules/ask-page-state.js',
    'modules/settings-page-state.js',
    'modules/build-page-state.js',
    'modules/command-palette-state.js',
    'modules/activity-page-state.js',
    'modules/automate-page-state.js',
    'modules/app-shell-state.js',
    'app.js',
  ];

  function showFallback(title, detail) {
    if (!ROOT) return;
    ROOT.innerHTML = [
      '<main class="boot-fallback" role="alert">',
      '<section class="boot-fallback-card">',
      '<div class="boot-fallback-mark">!</div>',
      `<h1>${escapeHtml(title)}</h1>`,
      `<p>${escapeHtml(detail)}</p>`,
      '<button type="button" onclick="window.location.reload()">다시 시도</button>',
      '</section>',
      '</main>',
    ].join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.crossOrigin = src.startsWith('http') ? 'anonymous' : '';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('script load failed: ' + src));
      HEAD.appendChild(script);
    });
  }

  async function loadReactRuntime() {
    for (const source of REACT_SOURCES) {
      if (!window[source.globalName]) {
        await loadScript(source.src);
      }
      if (!window[source.globalName]) {
        throw new Error(source.name + ' global missing after load');
      }
    }
  }

  async function loadAppScripts() {
    for (const src of APP_SCRIPTS) {
      await loadScript(src);
    }
  }

  window.addEventListener('error', (event) => {
    if (!window.__OMNUX_APP_RENDERED__) {
      showFallback('대시보드를 시작하지 못했습니다', event.message || '초기 스크립트 실행 중 오류가 발생했습니다.');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!window.__OMNUX_APP_RENDERED__) {
      const reason = event.reason && event.reason.message ? event.reason.message : event.reason || '알 수 없는 오류';
      showFallback('대시보드를 시작하지 못했습니다', reason);
    }
  });

  (async function bootstrap() {
    try {
      await loadReactRuntime();
      await loadAppScripts();
    } catch (error) {
      showFallback('대시보드를 시작하지 못했습니다', 'React 또는 대시보드 스크립트를 불러오지 못했습니다. 네트워크와 로컬 서버 상태를 확인하세요.');
      console.error(error);
    }
  })();
})();
