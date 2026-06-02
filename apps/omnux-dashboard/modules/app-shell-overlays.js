/* omnux — app shell overlay state */
(function () {
  const { useState, useCallback } = React;

  function useOmnuxPaletteOverlayState() {
    const [paletteOpen, setPaletteOpen] = useState(false);

    return {
      paletteOpen,
      setPaletteOpen
    };
  }

  function useOmnuxPermissionOverlayState() {
    const [perm, setPerm] = useState(null);

    const requestPermission = useCallback((req) => setPerm(req), []);

    return {
      perm,
      setPerm,
      requestPermission
    };
  }

  function useOmnuxActivityOverlayState() {
    const [activity, setActivity] = useState(null);

    const openActivity = useCallback((item) => setActivity(item), []);

    return {
      activity,
      setActivity,
      openActivity
    };
  }

  function useOmnuxToastOverlayState() {
    const [toasts, setToasts] = useState([]);

    const toast = useCallback((msg) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((items) => [...items, { id, msg }]);
      setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2600);
    }, []);

    return {
      toasts,
      toast
    };
  }

  function useOmnuxOverlayState() {
    const palette = useOmnuxPaletteOverlayState();
    const permission = useOmnuxPermissionOverlayState();
    const activity = useOmnuxActivityOverlayState();
    const toastState = useOmnuxToastOverlayState();

    return {
      ...palette,
      ...permission,
      ...activity,
      ...toastState
    };
  }

  Object.assign(window, {
    useOmnuxPaletteOverlayState,
    useOmnuxPermissionOverlayState,
    useOmnuxActivityOverlayState,
    useOmnuxToastOverlayState,
    useOmnuxOverlayState
  });
})();
