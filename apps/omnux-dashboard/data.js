/* omnux — mock data */
(function () {
  const providers = [
    { id: 'gemini-pro', name: 'Gemini 3 Pro', kind: 'api', status: 'online', role: 'general', color: '#4285F4', glyph: 'G', route: 'google/gemini-3-pro-preview', latency: '420ms' },
    { id: 'gemini-flash', name: 'Gemini 3 Flash', kind: 'api', status: 'online', role: 'fast', color: '#34A853', glyph: 'F', route: 'google/gemini-3-flash-preview', latency: '180ms' },
    { id: 'gemini-flash-lite', name: 'Gemini 3.1 Flash-Lite', kind: 'api', status: 'online', role: 'light/search', color: '#FBBC04', glyph: 'L', route: 'google/gemini-3.1-flash-lite', latency: '120ms' },
    { id: 'groq', name: 'Groq', kind: 'api', status: 'online', role: 'fast', color: '#F55036', glyph: 'q', route: 'groq/llama-3.1-70b', latency: '90ms' },
    { id: 'cerebras', name: 'Cerebras', kind: 'api', status: 'online', role: 'fast', color: '#EF6A35', glyph: 'C', route: 'cerebras/llama-3.1', latency: '110ms' },
    { id: 'nim', name: 'NVIDIA NIM', kind: 'api', status: 'online', role: 'grounding', color: '#76B900', glyph: 'N', route: 'nvidia/nim', latency: '350ms' },
    { id: 'codex', name: 'Codex CLI', kind: 'cli', status: 'ready', role: 'code', color: '#111418', glyph: '⌁', route: 'local/codex', latency: 'local' },
    { id: 'copilot', name: 'Copilot CLI', kind: 'cli', status: 'ready', role: 'code', color: '#5B5EF0', glyph: '⊚', route: 'local/copilot', latency: 'local' },
  ];

  const projects = [
    { id: 'omnux', name: 'omnux', path: '~/Projects/omnux', description: 'Local-first AI command center', lastOpened: 'Active now', isMain: true, color: '#6366F1', runs: 48, automations: 3 },
    { id: 'swingfit', name: 'SwingFit', path: '~/Projects/SwingFit', description: 'Golf ball tracking Android app', lastOpened: '3 days ago', color: '#16A34A', runs: 21, automations: 1 },
    { id: 'personal', name: 'Personal', path: '~/Documents/Personal', description: 'Notes, ideas, and experiments', lastOpened: 'Last week', color: '#D97706', runs: 9, automations: 0 },
  ];

  const activities = [
    { id: 'a1', title: 'README branding update', type: 'build', project: 'omnux', status: 'completed', when: '2h ago', day: 'Today', summary: 'Changed 4 files', detail: 'Rebranded README and package metadata to omnux, and refreshed the product description.', files: ['README.md', 'package.json', 'src/app/layout.tsx', 'tauri.conf.json'] },
    { id: 'a2', title: 'Build check', type: 'build', project: 'omnux', status: 'needs_review', when: '5h ago', day: 'Today', summary: '1 warning, 0 errors', detail: 'Ran the local build pipeline. One unused-import warning in src/lib/intent.ts.', files: ['src/lib/intent.ts'] },
    { id: 'a3', title: 'Telegram routine: morning brief', type: 'automate', project: 'omnux', status: 'completed', when: '1d ago', day: 'Today', summary: 'Created /morning-brief', detail: 'New scheduled automation that posts a project summary to Telegram every morning at 8:00.', files: [] },
    { id: 'a4', title: 'Fix build errors in main.ts', type: 'build', project: 'omnux', status: 'failed', when: 'Yesterday', day: 'Yesterday', summary: 'Type error in main.ts', detail: 'Build failed: Property "trace" does not exist on type "RunContext". main.ts:142.', files: ['src/main.ts'] },
    { id: 'a5', title: 'Model comparison: Groq vs Gemini', type: 'compare', project: 'omnux', status: 'completed', when: 'Yesterday', day: 'Yesterday', summary: 'Compared 2 models', detail: 'Side-by-side answers to "explain the run scheduler". Gemini scored higher on completeness, Groq was 4× faster.', files: [] },
    { id: 'a6', title: 'Swing arc detection tuning', type: 'build', project: 'swingfit', status: 'completed', when: '3d ago', day: 'Earlier', summary: 'Changed 2 files', detail: 'Adjusted the Kalman filter thresholds for ball-arc detection.', files: ['app/Tracker.kt', 'app/Filter.kt'] },
  ];

  const continueItems = activities.slice(0, 4);

  const automations = [
    { id: 'au1', name: 'Morning project brief', trigger: 'schedule', when: 'Daily · 8:00 AM', prompt: 'Summarize what changed in omnux since yesterday and post it to Telegram.', project: 'omnux', enabled: true, command: '/morning-brief', perms: { read: 'allow', write: 'deny', run: 'ask', network: 'allow' } },
    { id: 'au2', name: 'Repo health check', trigger: 'schedule', when: 'Daily · 9:00 PM', prompt: 'Run the build and tests, flag any failures, and write a short report.', project: 'omnux', enabled: true, command: '/repo-check', perms: { read: 'allow', write: 'ask', run: 'ask', network: 'ask' } },
    { id: 'au3', name: 'Summarize recent changes', trigger: 'telegram', when: 'On /summarize', prompt: 'Summarize the latest 10 commits in plain language.', project: 'omnux', enabled: false, command: '/summarize', perms: { read: 'allow', write: 'deny', run: 'deny', network: 'allow' } },
    { id: 'au4', name: 'Swing data nightly export', trigger: 'schedule', when: 'Daily · 2:00 AM', prompt: 'Export the day\'s swing tracking data to CSV and archive it.', project: 'swingfit', enabled: true, command: null, perms: { read: 'allow', write: 'allow', run: 'ask', network: 'deny' } },
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

  window.OMNUX_DATA = { providers, projects, activities, continueItems, automations, templates, suggestions, quickActions, classifyIntent };
})();
