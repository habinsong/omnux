/* omnux — app shell navigation state */
(function () {
  const { useState, useCallback } = React;

  function useOmnuxNavigationState() {
    const [route, setRouteRaw] = useState("home");
    const [payload, setPayload] = useState(null);
    const [mobileNav, setMobileNav] = useState(false);

    const setRoute = useCallback((nextRoute, nextPayload = null) => {
      setRouteRaw(nextRoute);
      setPayload(nextPayload);
      setMobileNav(false);
    }, []);

    return {
      route,
      payload,
      mobileNav,
      setMobileNav,
      setRoute
    };
  }

  Object.assign(window, {
    useOmnuxNavigationState
  });
})();
