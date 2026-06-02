/* omnux — app shell preference state */
(function () {
  const { useState, useEffect, useCallback } = React;

  function useOmnuxPreferenceState() {
    const [theme, setThemeRaw] = useState(() => window.readOmnuxTheme());
    const [lang, setLangRaw] = useState(() => window.readOmnuxLang());
    const [advanced, setAdvancedRaw] = useState(() => window.readOmnuxAdvanced());

    useEffect(() => {
      document.documentElement.setAttribute("data-theme", theme);
      window.writeOmnuxTheme(theme);
    }, [theme]);

    useEffect(() => {
      window.writeOmnuxLang(lang);
      document.documentElement.setAttribute("lang", lang);
      window.OMNUX_I18N.lang = lang;
    }, [lang]);

    useEffect(() => {
      window.writeOmnuxAdvanced(advanced);
    }, [advanced]);

    const setTheme = useCallback((nextTheme) => setThemeRaw(nextTheme), []);
    const toggleTheme = useCallback(() => setThemeRaw((value) => value === "dark" ? "light" : "dark"), []);
    const setAdvanced = useCallback((value) => setAdvancedRaw(value), []);
    const setLang = useCallback((value) => setLangRaw(value), []);

    return {
      theme,
      setTheme,
      toggleTheme,
      advanced,
      setAdvanced,
      lang,
      setLang
    };
  }

  Object.assign(window, {
    useOmnuxPreferenceState
  });
})();
