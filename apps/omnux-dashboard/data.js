/* omnux — static UI options */
(function () {
  const providers = [
    { id: 'auto', name: '자동 라우팅', kind: 'router', role: 'middleware', color: '#2563EB', glyph: 'A' },
    { id: 'groq', name: 'Groq', kind: 'api', role: 'fast', color: '#F55036', glyph: 'G' },
    { id: 'gemini', name: 'Gemini', kind: 'api', role: 'search/general', color: '#4285F4', glyph: 'G' },
    { id: 'cerebras', name: 'Cerebras', kind: 'api', role: 'fast', color: '#EF6A35', glyph: 'C' },
    { id: 'nvidia', name: 'NVIDIA NIM', kind: 'api', role: 'grounding', color: '#76B900', glyph: 'N' },
    { id: 'codex', name: 'Codex', kind: 'cli/api', role: 'code', color: '#111418', glyph: 'C' },
    { id: 'copilot', name: 'Copilot', kind: 'cli', role: 'code', color: '#5B5EF0', glyph: 'P' },
  ];

  const templates = [
    { id: 't1', name: 'Morning project brief', desc: 'A daily summary of what changed.', trigger: 'schedule' },
    { id: 't2', name: 'Repo health check', desc: 'Build + test, report failures.', trigger: 'schedule' },
    { id: 't3', name: 'Summarize recent changes', desc: 'Plain-language commit digest.', trigger: 'telegram' },
    { id: 't4', name: 'Telegram command bot', desc: 'Run omnux from a chat.', trigger: 'telegram' },
    { id: 't5', name: 'Daily build check', desc: 'Catch breakages early.', trigger: 'schedule' },
    { id: 't6', name: 'Model comparison report', desc: 'Compare models on a prompt.', trigger: 'manual' },
  ];

  const suggestions = [
    'Summarize this file for me',
    'Explain this code',
    'Compare two model answers',
    'Draft a README',
  ];

  const quickActions = [
    { id: 'ask', title: 'Ask AI', desc: 'Get answers, explanations, summaries, and ideas.', icon: 'msg', route: 'ask', color: '#7C3AED', soft: 'var(--violet-soft)' },
    { id: 'build', title: 'Work on code', desc: 'Edit, refactor, debug, and build your project.', icon: 'code', route: 'build', color: '#2563EB', soft: 'var(--blue-soft)' },
    { id: 'analyze', title: 'Analyze files', desc: 'Analyze documents, logs, images, or data.', icon: 'doc', route: 'ask', color: '#D97706', soft: 'var(--amber-soft)' },
    { id: 'automate', title: 'Create automation', desc: 'Automate tasks and connect with Telegram.', icon: 'bot', route: 'automate', color: '#6366F1', soft: 'var(--accent-soft)' },
    { id: 'compare', title: 'Compare models', desc: 'Compare responses from multiple LLMs.', icon: 'scale', route: 'ask', color: '#0D9488', soft: 'rgba(13,148,136,0.1)' },
    { id: 'project', title: 'Open project', desc: 'Continue working on an existing project.', icon: 'folder', route: 'projects', color: '#16A34A', soft: 'var(--green-soft)' },
  ];

  // intent classifier
  function classifyIntent(text) {
    const t = text.toLowerCase();
    if (/(automat|every|daily|schedul|repeat|telegram|remind|routine|each (morning|day|night))/i.test(t)) return 'automate';
    if (/(code|build|refactor|debug|error|bug|readme|package|src|function|rename|replace|fix|compile|test|deploy|implement)/i.test(t)) return 'build';
    return 'ask';
  }

  window.OMNUX_DATA = { providers, templates, suggestions, quickActions, classifyIntent };
})();
