// 새 빌드의 실제 UI 조작 검사. HTTP/WS 응답은 모의 처리하며 LLM/OAuth를 호출하지 않는다.
async (page) => {
  await page.route('**/build-workspace-fixtures',route=>route.fulfill({path:'output/playwright/grok-gateway-fixtures.json',contentType:'application/json'}));
  const fixtures=await page.evaluate(async()=>(await fetch('/build-workspace-fixtures')).json());
  if(!fixtures.codingVariants)throw Error('새 빌드의 실제 서버 계약 검사가 먼저 완료되어야 합니다.');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const requests=[], records=new Map();let socketRef, heldRun, holdRun=true, holdExecution=false, heldExecution, rejectMeta=true;
  function send(socket,request,type,fields={}){socket.send(JSON.stringify({...fields,type,requestId:request.requestId}));}
  function resultFor(request){
    const source=clone(request.mode==='single'?fixtures.coding:fixtures.codingVariants[request.mode]);
    source.summary='요청한 파일을 만들었습니다.';
    source.changedFiles.push(source.execution.runDirectory+'/preview-fixture.html');
    source.conversation.title=request.conversationTitle||'나의 첫 빌드';source.conversation.project=request.project||'';source.conversation.messages=[{role:'user',text:request.text},{role:'assistant',text:source.summary}];
    source.conversation.latestCodingResult={...source,conversation:undefined};records.set(source.conversationId,source.conversation);return source;
  }
  function executed(request){
    const record=records.get(request.conversationId), result=record.latestCodingResult;
    const target=request.target==='main'?result:result.workers[Number(request.target.replace('worker-',''))];
    return {ok:true,conversationId:request.conversationId,targetProvider:target.provider,targetModel:target.model,message:'선택한 결과를 실행했습니다.',runMode:'command',previewUrl:'',execution:{...target.execution,stdOut:'입력: '+request.standardInput,programStdOut:'입력: '+request.standardInput,stdErr:'',programStdErr:'',status:'ok'}};
  }
  await page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//,socket=>{
    socket.send(JSON.stringify({type:'auth_result',ok:true}));
    socket.onMessage(raw=>{
      const request=JSON.parse(raw);requests.push(request);if(request.requestId?.startsWith('build-workspace-'))socketRef=socket;
      if(request.type==='ping')send(socket,request,'pong',{webSocketAcceptedCount:1,webSocketRoundTripCount:1});
      if(/^get_.*_models$/.test(request.type))send(socket,request,request.type.slice(4),{items:['fixture-custom-model']});
      if(request.type==='skills_list')send(socket,request,'skills_list_result',{payload:{items:[{name:'code-review',scope:'project',description:'코드를 확인합니다.'}]}});
      if(request.type==='list_memory_notes')send(socket,request,'memory_notes',{items:[{name:'작업 규칙.md',excerpt:'간결한 코드를 작성합니다.'}]});
      if(request.type==='list_conversations')send(socket,request,'conversations',{scope:'coding',mode:request.mode,items:[...records.values()].filter(record=>record.mode===request.mode)});
      if(request.type==='get_conversation')send(socket,request,'conversation_detail',{conversation:records.get(request.conversationId)});
      if(request.type==='update_conversation_meta'){
        if(rejectMeta){rejectMeta=false;send(socket,request,'error',{message:'모의 이름 저장 오류',requestType:request.type});}
        else{const record=records.get(request.conversationId);record.title=request.conversationTitle;record.project=request.project;send(socket,request,'conversation_detail',{conversation:record});}
      }
      if(request.type==='delete_conversation'){records.delete(request.conversationId);send(socket,request,'conversation_deleted',{ok:true,conversationId:request.conversationId});}
      if(request.type.startsWith('coding_run_')){
        heldRun=request;const source=request.mode==='single'?fixtures.coding:fixtures.codingVariants[request.mode];
        send(socket,request,'coding_progress',{scope:'coding',mode:request.mode,conversationId:request.text.includes('중단 복구')?fixtures.checkpoint.conversationId:source.conversationId,message:'파일을 작성하고 있습니다.',phase:'write',percent:40});
        if(!holdRun)send(socket,request,'coding_result',resultFor(request));
      }
      if(request.type==='coding_execute_result'){heldExecution=request;if(!holdExecution)send(socket,request,'coding_execute_result',executed(request));}
      if(request.type==='coding_cancel'){
        if(heldExecution?.requestId===request.requestId)send(socket,request,'coding_cancelled',{conversationId:heldExecution.conversationId,message:'실행을 중단했습니다.'});
        else {records.set(fixtures.checkpoint.conversationId,clone(fixtures.checkpoint.conversation));send(socket,request,'coding_cancelled',clone(fixtures.checkpoint));}
      }
    });
  });
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):41880\//,route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true}'}));
  await page.route('**/api/coding-preview/**',route=>route.fulfill({contentType:route.request().url().endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8',headers:{'access-control-allow-origin':'*'},body:route.request().url().endsWith('.html')?fixtures.preview.html:'def triangular(n):\n    return n * (n + 1) // 2\n\nprint(triangular(10))\n'}));
  await page.route('**/media',route=>route.fulfill({contentType:'application/json',body:'null'}));
  await page.reload();
  await page.evaluate(()=>{window.__freshBuildImport=path=>{const urls=performance.getEntriesByType('resource').map(entry=>new URL(entry.name)).filter(url=>url.pathname===path).sort((a,b)=>Number(b.searchParams.get('t')||0)-Number(a.searchParams.get('t')||0));return import(urls[0]?.href||path);};});
  await page.evaluate(async()=>{
    (await window.__freshBuildImport('/src/features/auth/auth-store.ts')).useDesktopAuthStore.setState(state=>({auth:{...state.auth,status:'authenticated'}}));
    (await window.__freshBuildImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light');
    (await window.__freshBuildImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('build');
    window.__freshBuildStore=(await window.__freshBuildImport('/src/features/build-workspace/build-state.ts')).useBuildWorkspace;
  });
  const root=page.locator('[data-surface="build-workspace"]');await root.waitFor();const layouts=[];
  async function layout(state,width){await page.setViewportSize({width,height:1000});await page.screenshot({path:`output/playwright/build-fresh-${state}-${width}.png`,animations:'disabled'});
    const geometry=await root.evaluate(element=>{const r=element.getBoundingClientRect(),p=element.parentElement.getBoundingClientRect();return{left:r.left-p.left,right:p.right-r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:[...element.querySelectorAll('button,input,select,textarea,iframe')].filter(node=>{if(!node.getClientRects().length)return false;const b=node.getBoundingClientRect();if(!(b.left<-1||b.right>innerWidth+1))return false;let parent=node.parentElement;while(parent&&parent!==element){const ox=getComputedStyle(parent).overflowX;if(ox==='auto'||ox==='scroll')return false;parent=parent.parentElement;}return true;}).map(node=>node.textContent.slice(0,40))};});
    if(geometry.overflow||geometry.outside.length||Math.abs(geometry.left-geometry.right)>1)throw Error(JSON.stringify({state,width,...geometry}));layouts.push({state,width,...geometry});}
  for(const width of [1440,768,390,320])await layout('empty',width);
  const composer=root.getByRole('region',{name:'빌드 요청',exact:true});
  if(await composer.getByRole('combobox',{name:'모드',exact:true}).isVisible())throw Error('작업 설정이 기본으로 펼쳐져 있습니다.');
  await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).fill('파일을 만들고 동작을 확인해 주세요.');
  const settings=page.getByRole('tab',{name:'설정',exact:true});await settings.click();
  await root.getByRole('button',{name:'모델 목록 새로고침',exact:true}).click();
  await root.getByRole('combobox',{name:'담당 모델 제공자',exact:true}).selectOption('grok');
  await root.getByRole('combobox',{name:'담당 모델',exact:true}).selectOption('fixture-custom-model');
  await root.getByRole('combobox',{name:'모드',exact:true}).selectOption('orchestration');
  await page.getByRole('tab',{name:'빌드',exact:true}).click();
  await composer.getByRole('button',{name:'만들기',exact:true}).click();await root.getByRole('alert').filter({hasText:'한 개 이상'}).waitFor();
  if(requests.some(request=>request.type.startsWith('coding_run_')))throw Error('워커 모델 없이 요청했습니다.');
  await settings.click();
  await root.getByRole('combobox',{name:'Grok 워커 모델',exact:true}).selectOption('fixture-custom-model');
  await root.getByRole('textbox',{name:'빌드 이름',exact:true}).fill('나의 첫 빌드');
  await root.getByRole('textbox',{name:'프로젝트 이름',exact:true}).fill('새 프로젝트');
  for(const width of [1440,768,390,320])await layout('settings',width);
  await page.getByRole('tab',{name:'빌드',exact:true}).click();
  await composer.locator('input[type=file]').setInputFiles('output/playwright/build-fresh-attachment.txt');
  await page.waitForFunction(()=>window.__freshBuildStore.getState().attachments.length===1&&!window.__freshBuildStore.getState().readingFiles);
  const references=page.getByRole('tab',{name:'참고',exact:true});await references.click();
  await root.getByRole('combobox',{name:'적용할 스킬',exact:true}).selectOption('project:code-review');await root.getByRole('checkbox',{name:'작업 규칙.md',exact:true}).check();
  await page.getByRole('tab',{name:'빌드',exact:true}).click();
  await composer.getByRole('button',{name:'만들기',exact:true}).click();await page.waitForFunction(()=>!!window.__freshBuildStore.getState().pending.run);
  const submitted=heldRun;
  for(const provider of ['groq','gemini','cerebras','nvidia','codex','copilot'])if(submitted[provider+'Model']!=='none')throw Error('사용하지 않는 모델 선택을 잃었습니다: '+provider);
  if(submitted.grokModel!=='fixture-custom-model'||submitted.skillName!=='code-review'||submitted.memoryNotes[0]!=='작업 규칙.md'||submitted.attachments.length!==1)throw Error('참고 자료나 모델 설정을 잃었습니다.');
  await layout('running',320);
  socketRef.send(JSON.stringify({type:'error',requestId:'build-workspace-stale-run',requestType:'coding_run_orchestration',message:'지난 오류'}));
  await page.evaluate(async()=>(await window.__freshBuildImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('automate'));
  send(socketRef,submitted,'coding_result',resultFor(submitted));
  await page.waitForFunction(()=>!!window.__freshBuildStore.getState().currentResult&&!window.__freshBuildStore.getState().pending.run);
  await page.evaluate(async()=>(await window.__freshBuildImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('build'));
  const result=root.getByRole('region',{name:'빌드 결과',exact:true});await result.waitFor();
  if((await result.getByLabel('프로그램 출력',{exact:true}).textContent()).includes('quality-gate'))throw Error('내부 점검 로그가 프로그램 출력에 섞였습니다.');
  if(await result.locator('.build-technical-record:visible').count())throw Error('기술 기록이 기본으로 펼쳐져 있습니다.');
  for(const width of [1440,768,390,320])await layout('result',width);
  await result.getByRole('button',{name:'main.py',exact:true}).click();await result.getByRole('region',{name:'선택한 파일',exact:true}).getByText('def triangular(n):',{exact:false}).waitFor();
  await layout('file',390);await result.getByRole('button',{name:'파일 닫기',exact:true}).click();
  await result.getByRole('button',{name:'미리 보기',exact:true}).click();
  const frame=page.frameLocator('iframe[title="만든 결과 미리보기"]');await frame.locator('#preview-action').click();await frame.getByText('동작 확인',{exact:true}).waitFor();
  for(const width of [1440,768,390,320])await layout('preview',width);
  await result.locator('summary').filter({hasText:'멀티 결과'}).click();
  const record=records.get(submitted.mode==='single'?fixtures.coding.conversationId:fixtures.codingVariants[submitted.mode].conversationId);
  const workerIndex=record.latestCodingResult.workers.findIndex(worker=>worker.execution.status==='ok'&&worker.changedFiles.length>0);
  await result.getByRole('combobox',{name:'살펴볼 결과',exact:true}).selectOption(`worker-${workerIndex}`);
  if(await result.locator('iframe').count())throw Error('다른 모델의 미리보기가 남았습니다.');
  await result.locator('summary').filter({hasText:'다시 실행하기'}).click();
  await result.getByRole('textbox',{name:'프로그램에 전달할 입력',exact:true}).fill('42\n');await result.getByRole('button',{name:'선택한 결과 실행',exact:true}).click();
  await page.waitForFunction(()=>!!window.__freshBuildStore.getState().runtime&&!window.__freshBuildStore.getState().pending.execute);
  if(heldExecution.target!==`worker-${workerIndex}`||heldExecution.standardInput!=='42\n')throw Error('선택한 실행 대상이나 입력을 잃었습니다.');
  await result.getByRole('combobox',{name:'살펴볼 결과',exact:true}).selectOption('main');
  if((await result.getByLabel('프로그램 출력',{exact:true}).textContent()).includes('입력:'))throw Error('같은 모델 이름의 다른 실행 결과가 대표 결과를 덮어썼습니다.');
  holdExecution=true;await result.getByRole('button',{name:'선택한 결과 실행',exact:true}).click();await root.getByRole('button',{name:'작업 중단',exact:true}).click();
  await page.waitForFunction(()=>!window.__freshBuildStore.getState().pending.execute);holdExecution=false;
  await settings.click();await root.getByRole('textbox',{name:'빌드 이름',exact:true}).fill('바꾼 빌드 이름');await root.getByRole('button',{name:'이름·프로젝트 저장',exact:true}).click();
  await root.getByRole('alert').filter({hasText:'모의 이름 저장 오류'}).waitFor();if(await page.getByText('모의 이름 저장 오류',{exact:true}).count()!==1)throw Error('화면 오류와 전역 알림을 중복으로 표시했습니다.');if(await root.getByRole('textbox',{name:'빌드 이름',exact:true}).inputValue()!=='바꾼 빌드 이름')throw Error('저장 오류로 이름을 잃었습니다.');
  await layout('error',320);await root.getByRole('button',{name:'이름·프로젝트 저장',exact:true}).click();await result.getByRole('heading',{name:'바꾼 빌드 이름',exact:true}).waitFor();await settings.click();
  await root.getByRole('button',{name:'새 빌드',exact:true}).click();
  await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).fill('중단 복구를 확인해 주세요.');
  await settings.click();await root.getByRole('combobox',{name:'모드',exact:true}).selectOption('single');await settings.click();
  await composer.getByRole('button',{name:'만들기',exact:true}).click();await root.getByRole('button',{name:'작업 중단',exact:true}).click();
  await result.getByRole('button',{name:'중단한 요청 이어 쓰기',exact:true}).waitFor();await result.getByRole('button',{name:'중단한 요청 이어 쓰기',exact:true}).click();
  if(await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).inputValue()!==fixtures.checkpoint.conversation.latestCodingResult.resumeInput)throw Error('중단된 원래 요청을 복원하지 못했습니다.');
  for(const width of [1440,768,390,320])await layout('resume',width);
  await root.getByRole('button',{name:'새 빌드',exact:true}).click();const dialog=page.getByRole('dialog',{name:'새 빌드 시작',exact:true});await dialog.waitFor();await layout('dialog',320);await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  if(!await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).inputValue())throw Error('새 빌드 취소로 요청을 잃었습니다.');
  for(const theme of ['dark','glass']){await page.evaluate(async theme=>(await window.__freshBuildImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme(theme),theme);await layout(theme,390);}
  await page.evaluate(async()=>(await window.__freshBuildImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light'));
  await page.evaluate(async()=>(await window.__freshBuildImport('/src/shell-store.ts')).useDesktopShellStore.getState().markBridgeStatus('closed'));
  await layout('offline',320);if(await composer.getByRole('button',{name:'요청 보내기',exact:true}).isEnabled())throw Error('연결 없이 빌드를 실행할 수 있습니다.');
  await page.evaluate(async()=>(await window.__freshBuildImport('/src/shell-store.ts')).useDesktopShellStore.getState().markBridgeStatus('connected'));
  await composer.getByRole('button',{name:'요청 보내기',exact:true}).click();
  await page.waitForFunction(()=>!!window.__freshBuildStore.getState().pending.run);
  if(heldRun.conversationId!==fixtures.checkpoint.conversationId||heldRun.mode!=='single'||heldRun.provider!==fixtures.checkpoint.conversation.latestCodingResult.provider)throw Error('재개 요청이 원래 작업으로 연결되지 않았습니다.');
  await root.getByRole('button',{name:'작업 중단',exact:true}).click();await page.waitForFunction(()=>!window.__freshBuildStore.getState().pending.run);
  await root.getByRole('button',{name:'새 빌드',exact:true}).click();
  const history=page.getByRole('tab',{name:'기록',exact:true});await history.click();
  await page.waitForFunction(()=>!Object.entries(window.__freshBuildStore.getState().pending).some(([key,value])=>key.startsWith('list-')&&value));
  await root.getByRole('combobox',{name:'빌드 선택',exact:true}).selectOption(fixtures.codingVariants.orchestration.conversationId);
  await page.waitForFunction(()=>!!window.__freshBuildStore.getState().active&&!window.__freshBuildStore.getState().pending.detail);
  const reopened=await page.evaluate(()=>({model:window.__freshBuildStore.getState().settings.models.grok,mode:window.__freshBuildStore.getState().settings.mode,output:window.__freshBuildStore.getState().currentResult.execution.stdout}));
  if(reopened.model!==fixtures.codingVariants.orchestration.model||reopened.mode!=='orchestration'||reopened.output.includes('quality-gate'))throw Error('저장한 빌드의 모델이나 출력이 바뀌었습니다.');
  await layout('history',390);
  await root.getByRole('button',{name:'새 빌드',exact:true}).click();await history.click();
  await settings.click();await root.getByRole('combobox',{name:'모드',exact:true}).selectOption('multi');await settings.click();
  await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).fill('모델별 결과를 비교해 주세요.');holdRun=false;
  await composer.getByRole('button',{name:'만들기',exact:true}).click();await page.waitForFunction(()=>window.__freshBuildStore.getState().currentResult?.mode==='multi'&&!window.__freshBuildStore.getState().pending.run);
  if(heldRun.type!=='coding_run_multi')throw Error('비교 모드가 다른 실행 경로로 전달되었습니다.');
  for(const width of [1440,768,390,320])await layout('multi',width);
  await page.evaluate(async()=>{
    const {sendFromHome}=await window.__freshBuildImport('/src/features/home/composer-send.ts');
    await sendFromHome({intent:'build',text:'홈에서 시작한 빌드 요청입니다.',chatMode:'single',provider:'grok',model:'fixture-custom-model',thinkPlus:false,files:[]});
  });
  await page.waitForFunction(()=>window.__freshBuildStore.getState().currentResult?.mode==='single'&&!window.__freshBuildStore.getState().pending.run);
  if(heldRun.mode!=='single'||heldRun.model!=='fixture-custom-model'||heldRun.conversationId)throw Error('홈에서 다른 방식으로 시작할 때 이전 작업 문맥이 섞였습니다.');
  await layout('home-entry',390);
  await page.evaluate(async()=>{
    window.__freshBuildStore.setState({error:'이전 요청 오류'});
    const {sendFromHome}=await window.__freshBuildImport('/src/features/home/composer-send.ts');
    await sendFromHome({intent:'build',text:'홈에서 다시 요청합니다.',chatMode:'single',provider:'grok',model:'fixture-custom-model',thinkPlus:false,files:[]});
  });
  await page.waitForFunction(()=>window.__freshBuildStore.getState().active?.messages[0]?.text==='홈에서 다시 요청합니다.'&&!window.__freshBuildStore.getState().pending.run);
  if(heldRun.conversationId!==fixtures.coding.conversationId)throw Error('같은 빌드의 후속 요청 문맥을 잃었습니다.');
  await layout('home-retry',320);

  await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).fill('연결이 끊겨도 이 요청과 이전 결과는 남겨 주세요.');
  await page.evaluate(async()=>(await window.__freshBuildImport('/src/features/middleware/desktop-message-gateway.ts')).bindDesktopSessionSocket(null));
  await composer.getByRole('button',{name:'요청 보내기',exact:true}).click();await root.getByRole('alert').filter({hasText:'요청을 보내지 못했습니다.'}).waitFor();
  if(await composer.getByRole('textbox',{name:'만들거나 바꾸고 싶은 내용',exact:true}).inputValue()!=='연결이 끊겨도 이 요청과 이전 결과는 남겨 주세요.')throw Error('전송 실패로 입력을 잃었습니다.');
  if(await page.evaluate(()=>window.__freshBuildStore.getState().currentResult?.mode)!=='single')throw Error('전송 실패로 이전 결과를 잃었습니다.');
  await layout('send-failed',320);
  await page.evaluate(async()=>{
    window.__freshBuildStore.getState().fresh();
    window.__freshBuildStore.getState().patchSettings({mode:'single'});
    (await window.__freshBuildImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('build',{input:'작업에서 넘긴 빌드입니다.',mode:'orchestration'});
  });
  await page.waitForFunction(()=>window.__freshBuildStore.getState().settings.mode==='orchestration'&&window.__freshBuildStore.getState().input==='작업에서 넘긴 빌드입니다.');
  if(requests.some(request=>request.type.startsWith('llm_')||request.type.includes('_login')))throw Error('실제 추론·로그인 경로를 요청했습니다.');
  return {checks:layouts.length,layouts,requests:requests.filter(request=>request.requestId?.startsWith('build-workspace-')).map(request=>request.type)};
}
