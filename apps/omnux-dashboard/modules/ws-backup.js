export function requestBackupExport(send, options = {}) {
  return send({ type: "backup_export_prepare" }, options);
}

export function requestBackupImportPreview(send, fileName, contentBase64, options = {}) {
  return send({
    type: "backup_import_preview",
    fileName,
    contentBase64,
  }, options);
}

export function requestBackupImportApply(send, previewId, overwrite = false, options = {}) {
  return send({
    type: "backup_import_apply",
    previewId,
    overwrite,
  }, options);
}
