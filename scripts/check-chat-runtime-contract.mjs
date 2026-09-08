import assert from "node:assert/strict";

// 상위 검사가 만든 임시 서버에서 대화 저장소만 검사한다. 모델 생성 요청은 보내지 않는다.
export async function verifyChatRuntime(session) {
  let sequence = 0;
  async function request(type, fields, responseType) {
    const requestId = `chat-record-contract-${++sequence}`;
    session.sendJson({ type, requestId, ...fields });
    const result = await session.waitForJson(message => message.type === responseType && (message.requestId === requestId || responseType === "conversation_search_result"), `${type} 응답`, 30000);
    assert.equal(result.requestId, requestId, `${type}의 요청 식별자가 응답에 있어야 합니다.`);
    return result;
  }
  const created = await request("create_conversation", { scope: "chat", mode: "single", conversationTitle: "질문 기록 검사", project: "검사 프로젝트" }, "conversation_created");
  const conversationId = created.conversation.id;
  const updated = await request("update_conversation_meta", { conversationId, conversationTitle: "검색할 새 대화", project: "분류 저장", tags: ["회귀"] }, "conversation_detail");
  assert.equal(updated.conversation.title, "검색할 새 대화");
  const listed = await request("list_conversations", { scope: "chat", mode: "single" }, "conversations");
  assert.ok(listed.items.some(item => item.id === conversationId));
  const detail = await request("get_conversation", { conversationId }, "conversation_detail");
  assert.equal(detail.conversation.project, "분류 저장");
  const searchStarted = performance.now();
  const search = await request("conversation_search", { query: "검색할 새 대화", maxResults: 20 }, "conversation_search_result");
  const searchMs = Math.round(performance.now() - searchStarted);
  assert.ok(search.results.some(item => item.conversationId === conversationId));
  assert.equal(search.query, "검색할 새 대화");
  assert.ok(Array.isArray(search.results));
  const invalid = await request("conversation_search", { query: "" }, "error");
  assert.equal(invalid.requestType, "conversation_search");
  const noteText = `답변 시작\n${"보존할 내용 ".repeat(500)}\n답변 끝`;
  const note = await request("notebook_append", { kind: "learning", text: noteText, source: "chat", conversationId }, "notebook_result");
  assert.equal(note.payload.ok, true);
  assert.ok(note.payload.snapshot.learnings.content.includes(noteText));
  const invalidNote = await request("notebook_append", { kind: "invalid", text: "실패 확인" }, "notebook_result");
  assert.equal(invalidNote.payload.ok, false);
  const deleted = await request("delete_conversation", { conversationId, scope: "chat", mode: "single" }, "conversation_deleted");
  assert.equal(deleted.ok, true);
  const missing = await request("get_conversation", { conversationId }, "error");
  assert.match(missing.message, /not found/);
  return { conversationId, search: { query: search.query, requestId: search.requestId, count: search.results.length, elapsedMs: searchMs }, notebookSaved: note.payload.ok, deleted: deleted.ok };
}
