/* omnux — app shell UI state */
(function () {
  function useOmnuxUiState() {
    const navigation = window.useOmnuxNavigationState();
    const preferences = window.useOmnuxPreferenceState();

    return {
      ...navigation,
      ...preferences
    };
  }

  Object.assign(window, {
    useOmnuxUiState
  });
})();
