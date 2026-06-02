/* omnux — activity page state */
(function () {
  const { useState } = React;
  const D = window.OMNUX_DATA;

  const ACTIVITY_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'build', label: 'Build' },
    { id: 'ask', label: 'Ask' },
    { id: 'automate', label: 'Automate' },
    { id: 'compare', label: 'Compare' },
  ];

  function useActivityPageState(ctx, payload) {
    const [filter, setFilter] = useState('all');
    const liveEvents = Array.isArray(ctx.runtime?.events) ? ctx.runtime.events : [];
    const items = D.activities.filter((activity) => filter === 'all' || activity.type === filter);
    const days = [...new Set(items.map((activity) => activity.day))];

    return {
      filter,
      setFilter,
      filters: ACTIVITY_FILTERS,
      liveEvents,
      items,
      days,
    };
  }

  Object.assign(window, {
    ACTIVITY_FILTERS,
    useActivityPageState,
  });
})();
