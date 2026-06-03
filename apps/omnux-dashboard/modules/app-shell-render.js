/* omnux — app shell renderer */
(function () {
  const PAGES = {
    home: window.HomePage,
    ask: window.AskPage,
    build: window.BuildPage,
    automate: window.AutomatePage,
    explore: window.ExplorePage,
    projects: window.ProjectsPage,
    activity: window.ActivityPage,
    settings: window.SettingsPage,
  };

  function resolveOmnuxPage(route) {
    return PAGES[route] || window.HomePage;
  }

  function buildOmnuxAppView(state) {
    const Page = resolveOmnuxPage(state.route);

    return (
      React.createElement('div', { className: 'app' + (state.mobileNav ? ' nav-open' : '') },
        state.mobileNav ? React.createElement('div', { className: 'nav-scrim', onClick: () => state.setMobileNav(false) }) : null,
        React.createElement(window.Sidebar, { route: state.route, setRoute: state.ctx.setRoute }),
        React.createElement('div', { className: 'main' },
          React.createElement(window.TopBar, { openPalette: () => state.setPaletteOpen(true), advanced: state.advanced, setAdvanced: state.setAdvanced, theme: state.theme, toggleTheme: state.toggleTheme, openNav: () => state.setMobileNav(true), runtime: state.runtime }),
          React.createElement(Page, { key: state.route + state.lang + JSON.stringify(state.payload), ctx: state.ctx, advanced: state.advanced, payload: state.payload, routines: state.routines, conversations: state.conversations, memoryNotes: state.memoryNotes, send: state.send }),
        ),
        state.paletteOpen ? React.createElement(window.CommandPalette, { ctx: state.ctx, onClose: () => state.setPaletteOpen(false) }) : null,
        state.perm ? React.createElement(window.PermissionModal, { req: state.perm, onClose: () => state.setPerm(null) }) : null,
        state.activity ? React.createElement(window.ActivityDetail, { a: state.activity, ctx: state.ctx, onClose: () => state.setActivity(null) }) : null,
        React.createElement(window.Toasts, { toasts: state.toasts }),
      )
    );
  }

  Object.assign(window, {
    resolveOmnuxPage,
    buildOmnuxAppView
  });
})();
