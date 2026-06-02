/* omnux - command palette state */
(function () {
  const { useState, useEffect, useRef } = React;

  function buildCommandPaletteCommands(ctx) {
    return [
      { id: 'c-ask', group: 'Actions', title: 'Ask anything', sub: 'Open a new conversation', icon: 'ask', kw: 'ask question chat', run: () => ctx.setRoute('ask') },
      { id: 'c-build', group: 'Actions', title: 'Work on current project', sub: 'Plan & apply a code change', icon: 'code', kw: 'build code work edit', run: () => ctx.setRoute('build') },
      { id: 'c-auto', group: 'Actions', title: 'Create automation', sub: 'Schedule, Telegram or file trigger', icon: 'bot', kw: 'automate routine telegram', run: () => ctx.setRoute('automate', { create: true }) },
      { id: 'c-compare', group: 'Actions', title: 'Compare models', sub: 'Side-by-side LLM answers', icon: 'scale', kw: 'compare models llm', run: () => ctx.setRoute('ask', { mode: 'compare' }) },
      { id: 'c-check', group: 'Actions', title: 'Run build check', sub: 'npm run build on omnux', icon: 'terminal', kw: 'build check run test', run: () => ctx.setRoute('build', { check: true }) },
      { id: 'c-proj', group: 'Navigate', title: 'Open project', sub: 'Browse local projects', icon: 'folder', kw: 'project open folder', run: () => ctx.setRoute('projects') },
      { id: 'c-activity', group: 'Navigate', title: 'Open recent activity', sub: 'Runs, logs & artifacts', icon: 'activity', kw: 'activity runs history', run: () => ctx.setRoute('activity') },
      { id: 'c-providers', group: 'Navigate', title: 'Open provider settings', sub: 'Models, API keys & routes', icon: 'route', kw: 'providers models settings keys', run: () => ctx.setRoute('settings', { tab: 'models' }) },
      { id: 'c-home', group: 'Navigate', title: 'Go home', sub: 'Back to the dashboard', icon: 'home', kw: 'home dashboard', run: () => ctx.setRoute('home') },
      { id: 'c-adv', group: 'Preferences', title: (ctx.advanced ? 'Hide advanced details' : 'Show advanced details'), sub: 'Provider route, console & logs', icon: 'sliders', kw: 'advanced details console toggle simple', run: () => ctx.setAdvanced(!ctx.advanced) },
      { id: 'c-theme', group: 'Preferences', title: 'Toggle theme', sub: (ctx.theme === 'dark' ? 'Switch to light' : 'Switch to dark'), icon: ctx.theme === 'dark' ? 'sun' : 'moon', kw: 'theme dark light mode', run: () => ctx.toggleTheme() },
    ];
  }

  function useCommandPaletteState(ctx, onClose) {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const inputRef = useRef(null);
    const commands = buildCommandPaletteCommands(ctx);

    const filtered = commands.filter((command) => {
      if (!q.trim()) return true;
      const text = `${command.title} ${command.sub} ${command.kw}`.toLowerCase();
      return q.toLowerCase().split(' ').every((word) => text.includes(word));
    });

    useEffect(() => {
      inputRef.current && inputRef.current.focus();
    }, []);

    useEffect(() => {
      setSel(0);
    }, [q]);

    const choose = (command) => {
      onClose();
      setTimeout(() => command.run(), 10);
    };

    const onKey = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSel((current) => Math.min(current + 1, filtered.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSel((current) => Math.max(current - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        filtered[sel] && choose(filtered[sel]);
      } else if (event.key === 'Escape') {
        onClose();
      }
    };

    return {
      q,
      setQ,
      sel,
      setSel,
      inputRef,
      filtered,
      choose,
      onKey,
    };
  }

  Object.assign(window, {
    buildCommandPaletteCommands,
    useCommandPaletteState,
  });
})();
