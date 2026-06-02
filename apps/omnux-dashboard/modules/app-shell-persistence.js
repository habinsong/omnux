/* omnux — app shell persistence helpers */
(function () {
  const THEME_KEY = "omnux-theme";
  const LANG_KEY = "omnux-lang";
  const ADVANCED_KEY = "omnux-advanced";

  function readTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || "light";
    } catch (_err) {
      return "light";
    }
  }

  function readLang() {
    try {
      return localStorage.getItem(LANG_KEY) || "ko";
    } catch (_err) {
      return "ko";
    }
  }

  function readAdvanced() {
    try {
      return localStorage.getItem(ADVANCED_KEY) === "1";
    } catch (_err) {
      return false;
    }
  }

  function writeTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_err) {
    }
  }

  function writeLang(lang) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (_err) {
    }
  }

  function writeAdvanced(advanced) {
    try {
      localStorage.setItem(ADVANCED_KEY, advanced ? "1" : "0");
    } catch (_err) {
    }
  }

  Object.assign(window, {
    readOmnuxTheme: readTheme,
    readOmnuxLang: readLang,
    readOmnuxAdvanced: readAdvanced,
    writeOmnuxTheme: writeTheme,
    writeOmnuxLang: writeLang,
    writeOmnuxAdvanced: writeAdvanced
  });
})();
