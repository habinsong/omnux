export const DESKTOP_MIDDLEWARE_HOST = "127.0.0.1";
export const DESKTOP_MIDDLEWARE_PORT = 41880;
export const DESKTOP_MIDDLEWARE_HTTP_ORIGIN = `http://${DESKTOP_MIDDLEWARE_HOST}:${DESKTOP_MIDDLEWARE_PORT}`;
export const DESKTOP_MIDDLEWARE_WS_URL = `ws://${DESKTOP_MIDDLEWARE_HOST}:${DESKTOP_MIDDLEWARE_PORT}/ws/`;
export const DESKTOP_MIDDLEWARE_HEALTH_URL = `${DESKTOP_MIDDLEWARE_HTTP_ORIGIN}/healthz`;
export const DESKTOP_MIDDLEWARE_READY_URL = `${DESKTOP_MIDDLEWARE_HTTP_ORIGIN}/readyz`;

export type DesktopMiddlewareEndpointCandidate = {
  port: number;
  wsUrl: string;
  healthUrl: string;
  readyUrl: string;
};

export function buildDesktopMiddlewareEndpoint(port: number): DesktopMiddlewareEndpointCandidate {
  const httpOrigin = `http://${DESKTOP_MIDDLEWARE_HOST}:${port}`;
  return {
    port,
    wsUrl: `ws://${DESKTOP_MIDDLEWARE_HOST}:${port}/ws/`,
    healthUrl: `${httpOrigin}/healthz`,
    readyUrl: `${httpOrigin}/readyz`
  };
}

export const DESKTOP_MIDDLEWARE_ENDPOINT_CANDIDATES = [41880, 8080]
  .map(buildDesktopMiddlewareEndpoint);

export const DESKTOP_RECONNECT_POLICY = {
  mode: "manual-until-sidecar",
  initialDelayMs: 1500,
  maxDelayMs: 15000,
  maxAttempts: 5
} as const;
