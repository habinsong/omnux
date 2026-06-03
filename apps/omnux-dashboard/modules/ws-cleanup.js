export function requestCleanupPreview(send, options = {}) {
  return send({ type: "cleanup_preview" }, options);
}

export function requestCleanupApply(send, previewId, options = {}) {
  return send({ type: "cleanup_apply", previewId }, options);
}
