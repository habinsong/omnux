export function createDoctorState() {
  return {
    report: null,
    loaded: false,
    loading: false,
    pending: false,
    lastAction: "",
    lastError: "",
    receivedAt: "",
    fixPreview: null,
    fixApply: null,
    fixPreviewId: ""
  };
}
