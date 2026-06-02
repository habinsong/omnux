/* omnux — Automate screen */
(function () {
  const { useState } = React;
  const I = window.Icons;
  const D = window.OMNUX_DATA;
  const t = (s, fb) => window.t(s, fb);

  const TRIGGERS = {
    schedule: { label: 'Schedule', icon: 'clock', color: 'var(--blue)' },
    telegram: { label: 'Telegram', icon: 'telegram', color: 'var(--accent)' },
    manual: { label: 'Manual', icon: 'play', color: 'var(--violet)' },
    file: { label: 'File change', icon: 'file', color: 'var(--amber)' },
  };

  function PermPill({ k, v }) {
    const map = { allow: 'completed', ask: 'needs_review', deny: 'failed' };
    const label = { allow: 'Allow', ask: 'Ask', deny: 'Deny' };
    return React.createElement('span', { className: 'badge ' + map[v], style: { fontSize: 10.5 } }, t(k.charAt(0).toUpperCase() + k.slice(1)) + ': ' + t('perm.' + v, label[v]));
  }

  function AutomationCard({ a, ctx, onToggle, onOpen }) {
    const tr = TRIGGERS[a.trigger];
    return (
      React.createElement('div', { className: 'card card-pad', style: { cursor: 'pointer' }, onClick: () => onOpen(a) },
        React.createElement('div', { className: 'between' },
          React.createElement('div', { className: 'items-center gap12' },
            React.createElement('div', { className: 'tile-ico', style: { color: tr.color, background: 'var(--surface-2)' } }, I[tr.icon]({ size: 19 })),
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, t(a.name)),
              React.createElement('div', { className: 'items-center gap8', style: { marginTop: 3 } },
                React.createElement('span', { className: 'badge soft', style: { color: tr.color } }, t(tr.label)),
                React.createElement('span', { className: 'row-meta' }, a.when),
                a.command ? React.createElement('span', { className: 'mono faint', style: { fontSize: 12 } }, a.command) : null,
              ),
            ),
          ),
          React.createElement('div', { onClick: (e) => e.stopPropagation() },
            React.createElement(window.Toggle, { on: a.enabled, onClick: () => onToggle(a.id) }),
          ),
        ),
        React.createElement('p', { className: 'muted', style: { fontSize: 13, marginTop: 12, lineHeight: 1.5 } }, '\u201C' + a.prompt + '\u201D'),
        React.createElement('div', { className: 'items-center gap6', style: { marginTop: 12, flexWrap: 'wrap' } },
          Object.entries(a.perms).map(([k, v]) => React.createElement(PermPill, { key: k, k, v })),
        ),
      )
    );
  }

  function CreatePanel({ ctx, onClose }) {
    const [trigger, setTrigger] = useState('schedule');
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [perms, setPerms] = useState({ read: 'allow', write: 'ask', run: 'ask', network: 'allow' });

    const PERMS = [
      { k: 'read', label: 'Read files' },
      { k: 'write', label: 'Write / edit files' },
      { k: 'run', label: 'Run commands' },
      { k: 'network', label: 'Network access' },
    ];

    return (
      React.createElement('div', { className: 'card card-pad', style: { border: '1.5px solid var(--accent-soft-2)' } },
        React.createElement('div', { className: 'between', style: { marginBottom: 16 } },
          React.createElement('div', { className: 'card-title items-center gap8' }, I.spark({ size: 17, style: { color: 'var(--accent)' } }), t('New automation')),
          React.createElement('button', { className: 'icon-btn', style: { width: 32, height: 32 }, onClick: onClose }, I.x({ size: 16 })),
        ),
        React.createElement('label', { className: 'eyebrow', style: { display: 'block', marginBottom: 8 } }, t('Trigger')),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 } },
          Object.entries(TRIGGERS).map(([k, tr]) => React.createElement('button', { key: k, className: 'tile' + (trigger === k ? ' on' : ''), onClick: () => setTrigger(k) },
            React.createElement('div', { className: 'tile-ico', style: { color: tr.color } }, I[tr.icon]({ size: 18 })),
            React.createElement('b', { style: { fontSize: 13.5 } }, t(tr.label)))),
        ),
        React.createElement('label', { className: 'eyebrow', style: { display: 'block', marginBottom: 8 } }, t('Name')),
        React.createElement('input', { className: 'field', value: name, onChange: (e) => setName(e.target.value), placeholder: t('e.g. Morning project brief'), style: { width: '100%', marginBottom: 16 } }),
        React.createElement('label', { className: 'eyebrow', style: { display: 'block', marginBottom: 8 } }, t('What should omnux do?')),
        React.createElement('textarea', { value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: t('Describe the task in plain language\u2026'),
          style: { width: '100%', minHeight: 70, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 14.5, outline: 'none', background: 'var(--surface-2)', marginBottom: 18 } }),

        trigger === 'telegram' ? React.createElement('div', { className: 'card card-pad', style: { background: 'var(--accent-soft)', border: 'none', marginBottom: 18 } },
          React.createElement('div', { className: 'items-center gap10' },
            React.createElement('span', { style: { color: 'var(--accent)' } }, I.telegram({ size: 20 })),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('b', { style: { fontWeight: 700, fontSize: 13.5 } }, t('Telegram command')),
              React.createElement('div', { className: 'muted', style: { fontSize: 12.5 } }, t('Trigger this from your chat with the omnux bot.'))),
            React.createElement('span', { className: 'mono', style: { fontWeight: 700, color: 'var(--accent-text)' } }, '/' + (name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'command'))),
        ) : null,

        React.createElement('label', { className: 'eyebrow', style: { display: 'block', marginBottom: 10 } }, t('Permissions')),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 } },
          PERMS.map(p => React.createElement('div', { key: p.k, className: 'between' },
            React.createElement('span', { style: { fontWeight: 600, fontSize: 13.5 } }, t(p.label)),
            React.createElement('div', { className: 'perm-seg' },
              ['allow', 'ask', 'deny'].map(v => React.createElement('button', { key: v, className: v + (perms[p.k] === v ? ' on' : ''), onClick: () => setPerms(s => ({ ...s, [p.k]: v })) }, v === 'allow' ? t('perm.allow', 'Allow') : v === 'ask' ? t('perm.ask', 'Ask') : t('perm.deny', 'Deny')))),
          ))),

        React.createElement('div', { className: 'items-center gap8' },
          React.createElement('button', { className: 'btn ghost', onClick: onClose }, t('Cancel')),
          React.createElement('div', { className: 'spacer' }),
          React.createElement('button', { className: 'btn primary', onClick: () => { ctx.toast('Automation created'); onClose(); } }, I.check({ size: 15 }), t('Create automation')),
        ),
      )
    );
  }

  function AutomatePage({ ctx, payload }) {
    const [autos, setAutos] = useState(D.automations);
    const [creating, setCreating] = useState(!!(payload && payload.create));
    const onToggle = (id) => setAutos(a => a.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x));

    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { style: { maxWidth: 900 } },
            React.createElement('div', { className: 'between' },
              React.createElement('div', null,
                React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' } }, t('Automate')),
                React.createElement('p', { className: 'muted', style: { fontSize: 14, marginTop: 2 } }, t('Turn any task into a routine \u2014 on a schedule, a Telegram command, or a file change.')),
              ),
              !creating ? React.createElement('button', { className: 'btn primary', onClick: () => setCreating(true) }, I.plus({ size: 16 }), t('New automation')) : null,
            ),

            creating ? React.createElement('div', { className: 'mt20' }, React.createElement(CreatePanel, { ctx, onClose: () => setCreating(false) })) : null,

            // telegram banner
            !creating ? React.createElement('div', { className: 'card card-pad mt20', style: { display: 'flex', gap: 16, alignItems: 'center', background: 'linear-gradient(120deg, var(--accent-soft), var(--surface))' } },
              React.createElement('div', { className: 'quick-ico', style: { background: 'var(--surface)', color: 'var(--accent)', width: 48, height: 48 } }, I.telegram({ size: 24 })),
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('b', { style: { fontWeight: 700, fontSize: 15 } }, t('Telegram is connected')),
                React.createElement('div', { className: 'muted', style: { fontSize: 13, marginTop: 2 } }, t('Run omnux from your phone. Active commands: '),
                  React.createElement('span', { className: 'mono', style: { color: 'var(--accent-text)' } }, '/morning-brief'), ', ',
                  React.createElement('span', { className: 'mono', style: { color: 'var(--accent-text)' } }, '/repo-check'), ', ',
                  React.createElement('span', { className: 'mono', style: { color: 'var(--accent-text)' } }, '/summarize')),
              ),
              React.createElement('button', { className: 'btn', onClick: () => ctx.setRoute('settings', { tab: 'integrations' }) }, t('Manage')),
            ) : null,

            React.createElement('div', { className: 'section-label mt28' }, t('Your automations')),
            React.createElement('div', { className: 'auto-grid', style: { display: 'grid', gap: 16 } },
              autos.map(a => React.createElement(AutomationCard, { key: a.id, a, ctx, onToggle, onOpen: (au) => ctx.toast('Opening \u201C' + au.name + '\u201D') })),
            ),

            React.createElement('div', { className: 'section-label mt36' }, t('Start from a template')),
            React.createElement('div', { className: 'tpl-grid', style: { display: 'grid', gap: 14 } },
              D.templates.map(tpl => React.createElement('button', { key: tpl.id, className: 'tile', onClick: () => setCreating(true) },
                React.createElement('div', { className: 'items-center gap10' },
                  React.createElement('div', { className: 'tile-ico', style: { color: TRIGGERS[tpl.trigger].color, width: 32, height: 32 } }, I[TRIGGERS[tpl.trigger].icon]({ size: 16 })),
                  React.createElement('b', { style: { fontSize: 13.5 } }, t(tpl.name))),
                React.createElement('p', { className: 'muted', style: { fontSize: 12.5, lineHeight: 1.45 } }, t(tpl.desc)))),
            ),
          ),
        ),
      )
    );
  }

  Object.assign(window, { AutomatePage });
})();
