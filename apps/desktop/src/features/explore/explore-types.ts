export type WebSearchResult = {
  url: string;
  title: string;
  description: string;
  published: string;
};

export type WebFetchResult = {
  url: string;
  finalUrl: string;
  status: number | string;
  contentType: string;
  length: number;
  truncated: boolean;
  text: string;
  error: string;
};

export type SessionsHistoryResult = {
  sessionKey: string;
  status: string;
  count: number;
  truncated: boolean;
  messages: Array<{ role: string; text: string }>;
  error: string;
};

export type SessionsSendResult = {
  sessionKey: string;
  requestedSessionKey: string;
  timeoutSeconds: number;
  requestedTimeoutSeconds: number | null;
  status: string;
  runId: string;
  messageTruncated: boolean;
  reply: string;
  error: string;
  delivery: { status: string; mode: string } | null;
};

export type SessionsSpawnResult = {
  action: string;
  task: string;
  label: string;
  requestedRuntime: string;
  requestedMode: string;
  requestedRunTimeoutSeconds: number | null;
  requestedTimeoutSeconds: number | null;
  requestedThread: boolean | null;
  status: string;
  runId: string;
  childSessionKey: string;
  mode: string;
  runtime: string;
  runTimeoutSeconds: number;
  thread: boolean;
  taskTruncated: boolean;
  followUpStatus: string;
  followUpAction: string;
  backendSessionId: string;
  threadBindingKey: string;
  commandPriority: string;
  note: string;
  error: string;
  breakerBlocked: boolean;
  breakerReason: string;
  breakerMessage: string;
  queue: {
    total: number;
    ready: number;
    nextAttemptUtc: string;
    nextEntryId: string;
    nextReason: string;
    nextError: string;
    nextAttemptCount: number;
    nearDeadLetterCount: number;
  } | null;
  active: {
    activeCount: number;
    oldestRunId: string;
    oldestRuntime: string;
    oldestMode: string;
    oldestBackend: string;
    oldestStartedUtc: string;
    oldestAgeSeconds: number | null;
    completedHistoryCount: number;
  } | null;
};
