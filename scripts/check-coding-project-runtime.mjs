import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import path from "node:path";

export async function verifyCodingProjects(session, runtimeRoot, baseUrl, grokBinary) {
  const marker=path.join(path.dirname(grokBinary),"project-mode");
  writeFileSync(marker,"project");
  try {
  const results={};
  for(const mode of ["single","orchestration","multi"]){
    const source=path.join(runtimeRoot,`registered-${mode}`);mkdirSync(source,{recursive:true});
    writeFileSync(path.join(source,'AGENTS.md'),'# Project instructions\nREGISTERED_PROJECT_GUIDANCE\nPreserve source.txt and modify main.py only.\n');
    writeFileSync(path.join(source,'source.txt'),'11');writeFileSync(path.join(source,'main.py'),"print('original')\n");
    session.sendJson({type:'project_create',requestId:`project-create-${mode}`,title:`Registered ${mode}`,filePath:source});
    const created=await session.waitForJson(message=>message.type==='project_result'&&message.action==='create'&&message.item?.path===source,'프로젝트 등록');
    assert.equal(created.ok,true,JSON.stringify(created));
    const workers={groqModel:'none',geminiModel:'none',cerebrasModel:'none',nvidiaModel:'none',copilotModel:'none',codexModel:'none',grokModel:'grok-fixture-custom'};
    session.sendJson({type:`coding_run_${mode}`,mode,requestId:`project-run-${mode}`,projectKey:created.item.projectKey,text:'GROK_FIXTURE_PROJECT source.txt를 읽고 main.py에서 값의 두 배를 출력하도록 수정한 뒤 Python으로 실행해 주세요.',provider:'grok',model:'grok-fixture-custom',language:'python',webSearchEnabled:false,...workers});
    const result=await session.waitForJson(message=>message.requestId===`project-run-${mode}`&&(message.type==='coding_result'||message.type==='error'),'프로젝트의 실제 파일 변경',90000);
    assert.equal(result.type,'coding_result',JSON.stringify(result));
    assert.equal(result.execution.status,'ok',JSON.stringify(result));
    assert.equal(result.conversation.codingProject.key,created.item.projectKey);
    assert.equal(result.conversation.codingProject.path,realpathSync(source));
    assert.ok(result.execution.stdOut.includes('22'),JSON.stringify(result.execution));
    assert.equal(readFileSync(path.join(source,'source.txt'),'utf8'),'11');
    if(mode==='multi'){
      assert.notEqual(realpathSync(result.execution.runDirectory),realpathSync(source));
      assert.equal(readFileSync(path.join(source,'main.py'),'utf8'),"print('original')\n");
    }else{
      assert.equal(realpathSync(result.execution.runDirectory),realpathSync(source));
      assert.ok(readFileSync(path.join(source,'main.py'),'utf8').includes('source.txt'));
      assert.deepEqual(result.changedFiles,[path.join(realpathSync(source),'main.py')]);
    }
    const preview=await fetch(`${baseUrl}/api/coding-preview/${result.conversationId}/main/main.py`,{headers:{Origin:'http://localhost:1420'}});
    assert.equal(preview.status,200);
    assert.ok((await preview.text()).includes('source.txt'));
    session.sendJson({type:'get_conversation',requestId:`project-history-${mode}`,conversationId:result.conversationId});
    const history=await session.waitForJson(message=>message.type==='conversation_detail'&&message.requestId===`project-history-${mode}`,'프로젝트 연결 기록 조회');
    assert.deepEqual(history.conversation.codingProject,result.conversation.codingProject);
    results[mode]={result,project:created.item,history};
  }
  session.sendJson({type:'coding_run_single',requestId:'project-missing',projectKey:'missing-project',text:'GROK_FIXTURE_PROJECT 파일을 수정해 주세요.',provider:'grok',model:'grok-fixture-custom',webSearchEnabled:false});
  const missing=await session.waitForJson(message=>message.type==='error'&&message.requestId==='project-missing','없는 프로젝트에서 실행 거부');
  assert.match(missing.message,/등록된 프로젝트/);
  return results;
  } finally { unlinkSync(marker); }
}
