namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public ConversationSearchResult SearchConversations(string query, int? maxResults = null)
        => _conversationAppService.SearchConversations(query, maxResults);

    public BackupExportResult ExportBackup(BackupExportOptions? options = null)
        => _conversationAppService.ExportBackup(options);

    public BackupImportPreviewResult PreviewBackupImport(string fileName, string contentBase64)
        => _conversationAppService.PreviewBackupImport(fileName, contentBase64);

    public BackupImportApplyResult ApplyBackupImport(string previewId, bool overwrite)
        => _conversationAppService.ApplyBackupImport(previewId, overwrite);
}
