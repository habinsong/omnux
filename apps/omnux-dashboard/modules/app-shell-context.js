/* omnux - app shell render context */
(function () {
  function buildOmnuxPageContext(parts) {
    const { ui, overlay, domain, send, openProject } = parts;

    return {
      route: ui.route,
      setRoute: ui.setRoute,
      theme: ui.theme,
      setTheme: ui.setTheme,
      toggleTheme: ui.toggleTheme,
      advanced: ui.advanced,
      setAdvanced: ui.setAdvanced,
      lang: ui.lang,
      setLang: ui.setLang,
      toast: overlay.toast,
      requestPermission: overlay.requestPermission,
      openActivity: overlay.openActivity,
      openProject,
      runtime: domain.runtime,
      routines: domain.routines,
      conversations: domain.conversations,
      activeConversationId: domain.activeConversationId,
      setActiveConversationId: domain.setActiveConversationId,
      memoryNotes: domain.memoryNotes,
      send
    };
  }

  function buildOmnuxShellRenderState(parts) {
    const { ui, overlay, domain, send, ctx } = parts;

    return {
      route: ui.route,
      payload: ui.payload,
      theme: ui.theme,
      setTheme: ui.setTheme,
      toggleTheme: ui.toggleTheme,
      advanced: ui.advanced,
      setAdvanced: ui.setAdvanced,
      lang: ui.lang,
      setLang: ui.setLang,
      paletteOpen: overlay.paletteOpen,
      setPaletteOpen: overlay.setPaletteOpen,
      perm: overlay.perm,
      setPerm: overlay.setPerm,
      activity: overlay.activity,
      setActivity: overlay.setActivity,
      toasts: overlay.toasts,
      mobileNav: ui.mobileNav,
      setMobileNav: ui.setMobileNav,
      runtime: domain.runtime,
      routines: domain.routines,
      conversations: domain.conversations,
      memoryNotes: domain.memoryNotes,
      send,
      ctx
    };
  }

  Object.assign(window, {
    buildOmnuxPageContext,
    buildOmnuxShellRenderState
  });
})();
