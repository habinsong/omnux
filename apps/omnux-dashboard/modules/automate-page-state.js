/* omnux - automate page state */
(function () {
  const { useState, useEffect, useCallback } = React;
  const t = (s, fb) => window.t(s, fb);

  const AUTOMATE_TRIGGERS = {
    schedule: { label: 'Schedule', icon: 'clock', color: 'var(--blue)' },
    telegram: { label: 'Telegram', icon: 'telegram', color: 'var(--accent)' },
    manual: { label: 'Manual', icon: 'play', color: 'var(--violet)' },
    file: { label: 'File change', icon: 'file', color: 'var(--amber)' },
  };

  function routineToTrigger(r) {
    if (r.scheduleKind === 'telegram' || r.scheduleKind === 'telegram_manual') return 'telegram';
    if (r.scheduleKind === 'manual') return 'manual';
    return 'schedule';
  }

  function routineToCard(r) {
    const trigger = routineToTrigger(r);
    const tr = AUTOMATE_TRIGGERS[trigger] || AUTOMATE_TRIGGERS.schedule;
    let whenText = r.scheduleTime || '';
    if (r.scheduleKind === 'daily' && whenText) whenText = 'Daily \u00B7 ' + whenText;
    else if (r.scheduleKind === 'weekly' && r.weekdays && r.weekdays.length) whenText = 'Weekly';
    else if (r.scheduleKind === 'monthly' && r.dayOfMonth) whenText = 'Monthly \u00B7 day ' + r.dayOfMonth;
    else if (trigger === 'telegram') whenText = r.telegramCommand ? 'On ' + r.telegramCommand : 'Telegram';
    else if (trigger === 'manual') whenText = 'Manual';
    return {
      id: r.id,
      name: r.title || r.id,
      trigger,
      when: whenText,
      prompt: r.request || r.text || '',
      project: r.projectId || '',
      enabled: r.enabled !== false,
      command: r.telegramCommand || null,
      perms: { read: 'allow', write: 'ask', run: 'ask', network: 'allow' },
      _raw: r,
    };
  }

  function useCreateAutomationPanelState(ctx, send, onClose) {
    const [trigger, setTrigger] = useState('schedule');
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const scheduleKind = trigger === 'telegram' ? 'telegram_manual' : trigger === 'manual' ? 'manual' : 'daily';

    const submit = useCallback(() => {
      if (!prompt.trim() || !send) return;
      setSubmitting(true);
      const sent = send({
        type: 'create_routine',
        text: prompt.trim(),
        title: name.trim() || undefined,
        scheduleKind,
        runImmediately: trigger === 'manual' ? false : true,
      }, { queueIfClosed: true });
      if (!sent) {
        setSubmitting(false);
        ctx.toast('미들웨어 연결이 필요합니다.');
      }
    }, [ctx, name, onClose, prompt, scheduleKind, send, trigger]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === 'routine_result') {
          setSubmitting(false);
          ctx.toast(msg.message || (msg.ok ? 'Automation created' : 'Automation failed'));
          if (msg.ok) onClose();
        }
      };
      window.addEventListener('omnux:message', onMessage);
      return () => window.removeEventListener('omnux:message', onMessage);
    }, [ctx, onClose]);

    return {
      trigger,
      setTrigger,
      name,
      setName,
      prompt,
      setPrompt,
      submitting,
      scheduleKind,
      submit,
      triggers: AUTOMATE_TRIGGERS,
    };
  }

  function useAutomatePageState(ctx, payload, routines, send) {
    const [creating, setCreating] = useState(!!(payload && payload.create));
    const [deleting, setDeleting] = useState(null);
    const [running, setRunning] = useState(null);
    const items = Array.isArray(routines) ? routines.map(routineToCard) : [];

    useEffect(() => {
      if (payload && payload.create) setCreating(true);
    }, [payload && payload.create]);

    const onToggle = useCallback((id, enabled) => {
      if (send) {
        send({ type: 'toggle_routine', routineId: id, enabled });
      }
    }, [send, ctx]);

    const onRun = useCallback((id) => {
      if (send) {
        send({ type: 'run_routine', routineId: id });
        setRunning(id);
      }
    }, [send, ctx]);

    const onDeleteConfirm = useCallback(() => {
      if (send && deleting) {
        send({ type: 'delete_routine', routineId: deleting.id });
        setDeleting(null);
      }
    }, [send, deleting, ctx]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === 'routine_result') {
          setRunning(null);
          ctx.toast(msg.message || (msg.ok ? '루틴 요청을 처리했습니다.' : '루틴 요청이 실패했습니다.'));
        }
      };
      window.addEventListener('omnux:message', onMessage);
      return () => window.removeEventListener('omnux:message', onMessage);
    }, [ctx]);

    return {
      creating,
      setCreating,
      deleting,
      setDeleting,
      running,
      items,
      triggers: AUTOMATE_TRIGGERS,
      onToggle,
      onRun,
      onDeleteConfirm,
      requestDelete: (id, name) => setDeleting({ id, name }),
    };
  }

  Object.assign(window, {
    AUTOMATE_TRIGGERS,
    routineToAutomationTrigger: routineToTrigger,
    routineToAutomationCard: routineToCard,
    useCreateAutomationPanelState,
    useAutomatePageState,
  });
})();
