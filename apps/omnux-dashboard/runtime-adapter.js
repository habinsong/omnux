/* omnux — live middleware adapter */
(function () {
  const state = {
    status: 'static',
    connected: false,
    authenticated: false,
    authRequired: false,
    sessionId: '',
    url: '',
    settings: null,
    usage: null,
    copilotStatus: null,
    codexStatus: null,
    groqModels: null,
    cerebrasModels: null,
    geminiModels: null,
    nvidiaModels: null,
    copilotModels: null,
    settingsResult: null,
    otpResult: null,
    metrics: null,
    lastMessageType: '',
    events: [],
  };
  const listeners = new Set();
  const helpers = {};
  const outboundQueue = [];
  let socket = null;
  let started = false;
  let hasOpenedSocket = false;

  function snapshot() {
    return {
      ...state,
      events: state.events.slice(0, 12),
    };
  }

  function emit() {
    const next = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (_err) {
      }
    });
    window.dispatchEvent(new CustomEvent('omnux:runtime', { detail: next }));
  }

  function pushEvent(entry) {
    if (!entry) return;
    state.events = [{ id: Date.now() + '-' + Math.random().toString(36).slice(2), ...entry }, ...state.events].slice(0, 24);
  }

  function summarizeMessage(msg) {
    if (!msg || !msg.type) return null;

    try {
      const runtimeEvents = helpers.observability?.buildProviderRuntimeEventsFromMessage?.(msg) || [];
      if (runtimeEvents.length > 0) {
        runtimeEvents.forEach((event) => pushEvent({
          type: 'provider',
          title: `${event.provider || 'provider'} \u00B7 ${event.statusLabel || 'event'}`,
          detail: event.detail || event.model || msg.type,
          status: event.hasError ? 'failed' : event.statusLabel || 'running',
          when: new Date().toLocaleTimeString(),
        }));
        return;
      }
    } catch (_err) {
    }

    if (msg.type === 'settings_state') {
      pushEvent({ type: 'settings', title: 'settings_state', detail: 'Provider and integration state synced', status: 'completed', when: new Date().toLocaleTimeString() });
      return;
    }

    if (msg.type === 'usage_stats') {
      pushEvent({ type: 'usage', title: 'usage_stats', detail: 'Token usage refreshed', status: 'completed', when: new Date().toLocaleTimeString() });
      return;
    }

    if (msg.type === 'metrics' || msg.type === 'metrics_stream') {
      pushEvent({ type: 'metrics', title: msg.type, detail: 'Runtime metrics updated', status: 'running', when: new Date().toLocaleTimeString() });
      return;
    }

    if (msg.type.endsWith('_result') || msg.type === 'error') {
      pushEvent({ type: msg.type === 'error' ? 'error' : 'result', title: msg.type, detail: msg.message || msg.status || msg.provider || '-', status: msg.type === 'error' ? 'failed' : 'completed', when: new Date().toLocaleTimeString() });
    }
  }

  function handleMessage(msg) {
    state.lastMessageType = msg.type || '';
    window.dispatchEvent(new CustomEvent('omnux:message', { detail: msg }));

    if (msg.type === 'auth_required') {
      state.authRequired = true;
      state.authenticated = false;
      state.sessionId = msg.sessionId || state.sessionId;
      const remoteDashboardClient = helpers.ws?.isRemoteDashboardHost?.(window.location) || false;
      const token = helpers.ws?.getSavedAuthToken?.() || '';
      if (!remoteDashboardClient && token && state.sessionId) {
        send({ type: 'resume_auth', sessionId: state.sessionId, authToken: token });
      }
    } else if (msg.type === 'auth_result') {
      state.authRequired = !msg.ok;
      state.authenticated = !!msg.ok;
      if (msg.ok && msg.authToken) {
        helpers.ws?.persistAuthSession?.(msg.authToken, msg.expiresAtUtc || '');
      } else if (!msg.ok) {
        helpers.ws?.clearPersistedAuthSession?.();
      }
      if (msg.ok) {
        send({ type: 'get_routines' }, { queueIfClosed: true, silent: true });
        send({ type: 'list_conversations', scope: 'chat', mode: 'single' }, { queueIfClosed: true, silent: true });
        send({ type: 'list_memory_notes' }, { queueIfClosed: true, silent: true });
        helpers.ws?.flushQueuedPayloads?.(socket, outboundQueue);
      }
    } else if (msg.type === 'settings_state') {
      state.settings = msg;
    } else if (msg.type === 'settings_result') {
      state.settingsResult = msg;
    } else if (msg.type === 'routines_state') {
      var routineItems = Array.isArray(msg.items) ? msg.items : [];
      window.dispatchEvent(new CustomEvent('omnux:routines', { detail: routineItems }));
    } else if (msg.type === 'conversations') {
      window.dispatchEvent(new CustomEvent('omnux:conversations', { detail: msg }));
    } else if (msg.type === 'conversation_created' || msg.type === 'conversation_detail') {
      window.dispatchEvent(new CustomEvent('omnux:conversation_detail', { detail: msg }));
    } else if (msg.type === 'conversation_deleted') {
      window.dispatchEvent(new CustomEvent('omnux:conversation_deleted', { detail: msg }));
    } else if (msg.type === 'memory_notes') {
      var memoryItems = Array.isArray(msg.items) ? msg.items : (Array.isArray(msg.notes) ? msg.notes : []);
      window.dispatchEvent(new CustomEvent('omnux:memory_notes', { detail: memoryItems }));
    } else if (msg.type === 'memory_note_created' || msg.type === 'memory_note_renamed' || msg.type === 'memory_note_deleted') {
      /* individual note mutations — handled by list refresh */
    } else if (msg.type === 'usage_stats') {
      state.usage = msg;
    } else if (msg.type === 'copilot_status') {
      state.copilotStatus = msg;
    } else if (msg.type === 'copilot_login_result') {
      state.copilotStatus = { ...(state.copilotStatus || {}), ...msg };
    } else if (msg.type === 'codex_status') {
      state.codexStatus = msg;
    } else if (msg.type === 'codex_login_result' || msg.type === 'codex_logout_result') {
      state.codexStatus = { ...(state.codexStatus || {}), ...msg };
    } else if (msg.type === 'groq_models') {
      state.groqModels = msg;
    } else if (msg.type === 'groq_model_set') {
      state.groqModels = { ...(state.groqModels || {}), selected: msg.model || state.groqModels?.selected || '' };
    } else if (msg.type === 'cerebras_models') {
      state.cerebrasModels = msg;
    } else if (msg.type === 'gemini_models') {
      state.geminiModels = msg;
    } else if (msg.type === 'nvidia_models') {
      state.nvidiaModels = msg;
    } else if (msg.type === 'copilot_models') {
      state.copilotModels = msg;
    } else if (msg.type === 'copilot_model_set') {
      state.copilotModels = { ...(state.copilotModels || {}), selected: msg.model || state.copilotModels?.selected || '' };
    } else if (msg.type === 'otp_request_result') {
      state.otpResult = msg;
    } else if (msg.type === 'metrics' || msg.type === 'metrics_stream') {
      state.metrics = msg.payload || msg;
    } else if (msg.type === 'error' && `${msg.message || ''}`.toLowerCase().includes('unauthorized')) {
      state.authRequired = true;
      state.authenticated = false;
      helpers.ws?.clearPersistedAuthSession?.();
    }

    summarizeMessage(msg);
    emit();
  }

  async function probeGateway() {
    if (!/^https?:$/.test(window.location.protocol)) {
      return false;
    }

    try {
      const response = await fetch('/healthz', { cache: 'no-store' });
      if (!response.ok) {
        return false;
      }

      try {
        const payload = await response.json();
        return payload?.ok === true && payload?.probe === 'live';
      } catch (_err) {
        return false;
      }
    } catch (_err) {
      return false;
    }
  }

  async function connect() {
    state.status = 'connecting';
    emit();

    const url = helpers.ws.buildDashboardWsUrl(window.location);
    state.url = url;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      state.status = 'connected';
      state.connected = true;
      hasOpenedSocket = true;
      send({ type: 'ping' });
      emit();
    });

    socket.addEventListener('message', (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch (_err) {
        pushEvent({ type: 'message', title: 'ws_message', detail: String(event.data || '').slice(0, 140), status: 'running', when: new Date().toLocaleTimeString() });
        emit();
      }
    });

    socket.addEventListener('close', () => {
      state.status = 'offline';
      state.connected = false;
      emit();
    });

    socket.addEventListener('error', () => {
      state.status = 'offline';
      state.connected = false;
      emit();
    });
  }

  async function start() {
    if (started) return snapshot();
    started = true;

    try {
      const [ws, observability] = await Promise.all([
        import('./modules/ws-client.js'),
        import('./modules/dashboard-observability.js'),
      ]);
      helpers.ws = ws;
      helpers.observability = observability;
    } catch (_err) {
      state.status = 'static';
      emit();
      return snapshot();
    }

    if (!(await probeGateway())) {
      state.status = 'static';
      emit();
      return snapshot();
    }

    await connect();
    return snapshot();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function send(payload, options = {}) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (options.queueIfClosed) {
        outboundQueue.push(payload);
        return true;
      }
      if (!options.silent && hasOpenedSocket) {
        pushEvent({
          type: 'error',
          title: 'ws_send',
          detail: 'WS 연결이 필요합니다.',
          status: 'failed',
          when: new Date().toLocaleTimeString(),
        });
        emit();
      }
      return false;
    }

    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch (_err) {
      if (options.queueIfClosed) {
        outboundQueue.push(payload);
        return true;
      }
      if (!options.silent) {
        pushEvent({
          type: 'error',
          title: 'ws_send',
          detail: 'WS 전송에 실패했습니다.',
          status: 'failed',
          when: new Date().toLocaleTimeString(),
        });
        emit();
      }
      return false;
    }
  }

  window.OMNUX_ADAPTER = { start, subscribe, send, snapshot };
  window.OMNUX_RUNTIME = snapshot();
  window.addEventListener('DOMContentLoaded', () => start());
})();
