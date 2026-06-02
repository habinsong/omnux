/* omnux — root app */
(function () {
  class AppErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
      return { error };
    }

    componentDidCatch(error) {
      console.error(error);
    }

    render() {
      if (!this.state.error) return this.props.children;
      const message = this.state.error && this.state.error.message
        ? this.state.error.message
        : '화면 렌더링 중 오류가 발생했습니다.';
      return React.createElement('main', { className: 'boot-fallback', role: 'alert' },
        React.createElement('section', { className: 'boot-fallback-card' },
          React.createElement('div', { className: 'boot-fallback-mark' }, '!'),
          React.createElement('h1', null, '대시보드를 표시하지 못했습니다'),
          React.createElement('p', null, message),
          React.createElement('button', { type: 'button', onClick: () => window.location.reload() }, '다시 시도'),
        ),
      );
    }
  }

  function App() {
    return window.buildOmnuxAppView(window.useOmnuxAppState());
  }

  const root = document.getElementById('root');
  if (!window.React || !window.ReactDOM || !root) {
    throw new Error('React runtime or root element is unavailable');
  }

  ReactDOM.createRoot(root).render(
    React.createElement(AppErrorBoundary, null, React.createElement(App)),
  );
  window.__OMNUX_APP_RENDERED__ = true;
})();
