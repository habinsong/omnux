/* omnux - app shell event and adapter bridges */
(function () {
  const { useEffect, useCallback } = React;

  function useOmnuxKeyboardBridge(overlay) {
    useEffect(() => window.wireOmnuxKeyboardShortcuts(
      () => overlay.setPaletteOpen((open) => !open),
      () => overlay.setPaletteOpen(false)
    ), [overlay.setPaletteOpen]);
  }

  function useOmnuxSendBridge(adapter) {
    return useCallback((body, options) => {
      if (adapter && typeof adapter.send === "function") {
        return adapter.send(body, options);
      }
      return false;
    }, [adapter]);
  }

  function useOmnuxOpenProjectAction(ui, overlay) {
    return useCallback((project) => {
      overlay.toast("Opened " + project.name);
      ui.setRoute("build");
    }, [overlay.toast, ui.setRoute]);
  }

  Object.assign(window, {
    useOmnuxKeyboardBridge,
    useOmnuxSendBridge,
    useOmnuxOpenProjectAction
  });
})();
