/* omnux — app shell state boundary */
(function () {
  function useOmnuxAppState() {
    const ui = window.useOmnuxUiState();
    const overlay = window.useOmnuxOverlayState();
    const domain = window.useOmnuxDomainState();

    window.useOmnuxKeyboardBridge(overlay);

    const send = window.useOmnuxSendBridge(window.OMNUX_ADAPTER);
    const openProject = window.useOmnuxOpenProjectAction(ui, overlay, send);
    const ctx = window.buildOmnuxPageContext({ ui, overlay, domain, send, openProject });

    return window.buildOmnuxShellRenderState({ ui, overlay, domain, send, ctx });
  }

  Object.assign(window, {
    useOmnuxAppState,
  });
})();
