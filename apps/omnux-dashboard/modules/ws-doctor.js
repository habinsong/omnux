export function requestDoctorRun(send, options = {}) {
  return send({ type: "doctor_run" }, options);
}

export function requestDoctorLast(send, options = {}) {
  return send({ type: "doctor_get_last" }, options);
}

export function requestDoctorFixPreview(send, options = {}) {
  return send({ type: "doctor_fix_preview" }, options);
}

export function requestDoctorFixApply(send, previewId, options = {}) {
  return send({ type: "doctor_fix_apply", previewId }, options);
}
