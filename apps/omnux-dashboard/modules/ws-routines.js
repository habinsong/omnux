export function requestRoutines(send, options = {}) {
  return send({ type: "get_routines" }, options);
}

export function requestRoutineSchedulerStatus(send, options = {}) {
  return send({ type: "get_routine_scheduler_status" }, options);
}

export function requestPreviewRoutine(send, text, params = {}, options = {}) {
  return send({
    type: "preview_routine",
    text,
    executionMode: params.executionMode || "single",
    scheduleSourceMode: params.scheduleSourceMode || "auto",
    scheduleKind: params.scheduleKind || "daily",
    scheduleTime: params.scheduleTime || "",
    weekdays: params.weekdays || [],
    dayOfMonth: params.dayOfMonth || "",
    timezoneId: params.timezoneId || ""
  }, options);
}

export function requestCreateRoutine(send, text, params = {}, options = {}) {
  return send({
    type: "create_routine",
    text,
    title: params.title || "",
    executionMode: params.executionMode || "single",
    agentProvider: params.agentProvider || "",
    agentModel: params.agentModel || "",
    agentStartUrl: params.agentStartUrl || "",
    agentTimeoutSeconds: params.agentTimeoutSeconds || 0,
    agentToolProfile: params.agentToolProfile || "",
    agentUsePlaywright: params.agentUsePlaywright || false,
    scheduleSourceMode: params.scheduleSourceMode || "auto",
    maxRetries: params.maxRetries || 0,
    retryDelaySeconds: params.retryDelaySeconds || 0,
    notifyPolicy: params.notifyPolicy || "",
    notifyTelegram: params.notifyTelegram || false,
    scheduleKind: params.scheduleKind || "daily",
    scheduleTime: params.scheduleTime || "",
    weekdays: params.weekdays || [],
    dayOfMonth: params.dayOfMonth || "",
    timezoneId: params.timezoneId || "",
    runImmediately: params.runImmediately !== undefined ? params.runImmediately : true
  }, options);
}

export function requestUpdateRoutine(send, routineId, text, params = {}, options = {}) {
  return send({
    type: "update_routine",
    routineId,
    text,
    title: params.title || "",
    executionMode: params.executionMode || "single",
    agentProvider: params.agentProvider || "",
    agentModel: params.agentModel || "",
    agentStartUrl: params.agentStartUrl || "",
    agentTimeoutSeconds: params.agentTimeoutSeconds || 0,
    agentToolProfile: params.agentToolProfile || "",
    agentUsePlaywright: params.agentUsePlaywright || false,
    scheduleSourceMode: params.scheduleSourceMode || "auto",
    maxRetries: params.maxRetries || 0,
    retryDelaySeconds: params.retryDelaySeconds || 0,
    notifyPolicy: params.notifyPolicy || "",
    notifyTelegram: params.notifyTelegram || false,
    scheduleKind: params.scheduleKind || "daily",
    scheduleTime: params.scheduleTime || "",
    weekdays: params.weekdays || [],
    dayOfMonth: params.dayOfMonth || "",
    timezoneId: params.timezoneId || ""
  }, options);
}

export function requestDeleteRoutine(send, routineId, options = {}) {
  return send({ type: "delete_routine", routineId }, options);
}

export function requestRunRoutine(send, routineId, options = {}) {
  return send({ type: "run_routine", routineId }, options);
}

export function requestToggleRoutine(send, routineId, enabled, options = {}) {
  return send({ type: "toggle_routine", routineId, enabled }, options);
}

export function requestRoutineRunDetail(send, routineId, ts, options = {}) {
  return send({ type: "get_routine_run_detail", routineId, ts }, options);
}

export function requestTestRoutineTelegram(send, routineId, options = {}) {
  return send({ type: "test_routine_telegram", routineId }, options);
}

export function requestResendRoutineTelegram(send, routineId, ts, options = {}) {
  return send({ type: "resend_routine_run_telegram", routineId, ts }, options);
}
