/* omnux — root app */
(function () {
  const { useState, useEffect, useCallback } = React;

  function App() {
    const [route, setRouteRaw] = useState('home');
    const [payload, setPayload] = useState(null);
    const [theme, setThemeRaw] = useState(() => localStorage.getItem('omnux-theme') || 'light');
    const [lang, setLangRaw] = useState(() => localStorage.getItem('omnux-lang') || 'en');
    const [advanced, setAdvancedRaw] = useState(() => localStorage.getItem('omnux-advanced') === '1');
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [perm, setPerm] = useState(null);
    const [activity, setActivity] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [mobileNav, setMobileNav] = useState(false);

    // make current language available to the synchronous t() helper before children render
    window.OMNUX_I18N.lang = lang;

    // persist
    useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('omnux-theme', theme); }, [theme]);
    useEffect(() => { localStorage.setItem('omnux-lang', lang); document.documentElement.setAttribute('lang', lang); }, [lang]);
    useEffect(() => { localStorage.setItem('omnux-advanced', advanced ? '1' : '0'); }, [advanced]);

    const setRoute = useCallback((r, p = null) => { setRouteRaw(r); setPayload(p); setMobileNav(false); }, []);
    const setTheme = useCallback((t) => setThemeRaw(t), []);
    const toggleTheme = useCallback(() => setThemeRaw(t => t === 'dark' ? 'light' : 'dark'), []);
    const setAdvanced = useCallback((v) => setAdvancedRaw(v), []);
    const setLang = useCallback((l) => setLangRaw(l), []);

    const toast = useCallback((msg) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(t => [...t, { id, msg }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
    }, []);

    const requestPermission = useCallback((req) => setPerm(req), []);
    const openActivity = useCallback((a) => setActivity(a), []);
    const openProject = useCallback((p) => { toast('Opened ' + p.name); setRoute('build'); }, [toast, setRoute]);

    // ⌘K
    useEffect(() => {
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
        if (e.key === 'Escape') { setPaletteOpen(false); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    const ctx = {
      route, setRoute, theme, setTheme, toggleTheme, advanced, setAdvanced,
      lang, setLang, toast, requestPermission, openActivity, openProject,
    };

    const PAGES = {
      home: window.HomePage, ask: window.AskPage, build: window.BuildPage,
      automate: window.AutomatePage, projects: window.ProjectsPage,
      activity: window.ActivityPage, settings: window.SettingsPage,
    };
    const Page = PAGES[route] || window.HomePage;

    return (
      React.createElement('div', { className: 'app' + (mobileNav ? ' nav-open' : '') },
        mobileNav ? React.createElement('div', { className: 'nav-scrim', onClick: () => setMobileNav(false) }) : null,
        React.createElement(window.Sidebar, { route, setRoute }),
        React.createElement('div', { className: 'main' },
          React.createElement(window.TopBar, { openPalette: () => setPaletteOpen(true), advanced, setAdvanced, theme, toggleTheme, openNav: () => setMobileNav(true) }),
          React.createElement(Page, { key: route + lang + JSON.stringify(payload), ctx, advanced, payload }),
        ),
        paletteOpen ? React.createElement(window.CommandPalette, { ctx, onClose: () => setPaletteOpen(false) }) : null,
        perm ? React.createElement(window.PermissionModal, { req: perm, onClose: () => setPerm(null) }) : null,
        activity ? React.createElement(window.ActivityDetail, { a: activity, ctx, onClose: () => setActivity(null) }) : null,
        React.createElement(window.Toasts, { toasts }),
      )
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
