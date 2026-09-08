// 질문 화면의 실제 조작 검사. 모든 서버 응답을 모의 처리하며 실제 LLM/OAuth를 호출하지 않는다.
async (page) => {
  const requests=[], layouts=[], records=new Map();
  let fixtures, socketRef, heldChat, holdChat=false, rejectMeta=true, heldMeta, holdMeta=false, rejectRead=false, rejectDelete=false;
  let heldNote;
  const answer=['## 확인한 내용','질문에 대한 모의 답변입니다.','', '| 항목 | 내용 |','| --- | --- |','| 입력 | 파일과 질문을 함께 확인합니다. |','','```python','print("chat fixture")','```','','긴 문자열: '+ 'long_identifier_'.repeat(45),'','[허용하지 않는 주소](javascript:alert(1))'].join('\n');
  const clone=value=>JSON.parse(JSON.stringify(value));
  function send(socket,request,type,fields={}) {socket.send(JSON.stringify({...fields,type,requestId:request.requestId}));}
  function result(request) {
    const source=clone(request.mode==='multi'?fixtures.multi:request.mode==='orchestration'?fixtures.orchestration:fixtures.single);
    const id=request.conversationId||`chat-${records.size+1}`;
    source.conversation={...source.conversation,id,scope:'chat',mode:request.mode,title:'검사 대화',project:request.project||'기본',linkedMemoryNotes:request.memoryNotes||[],messages:[{role:'user',text:request.text},{role:'assistant',text:answer,provider:request.provider||'grok',model:request.model||'grok-fixture-custom'}]};
    source.conversationId=id;source.text=answer;source.requestId=request.requestId;
    source.citations=[{id:'one',url:'https://example.com/reference',title:'모의 참고 자료',snippet:'출처 본문'}, {id:'unsafe',url:'javascript:alert(1)',title:'차단할 링크'}];
    source.actionSuggestions=[{kind:'routine',label:'매주 자동화',prompt:'매주 요청한 내용을 확인해 주세요.',scheduleKind:'weekly',scheduleTime:'10:30',scheduleWeekdays:[1,3]}];
    if(request.mode==='multi'){source.codex='비교할 Codex 답변';source.codexModel='fixture-codex';}
    records.set(id,source.conversation);return source;
  }
  await page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//,socket=>{
    socket.send(JSON.stringify({type:'auth_result',ok:true}));
    socket.onMessage(raw=>{
      const m=JSON.parse(raw);requests.push(m);if(m.requestId?.startsWith('ask-'))socketRef=socket;
      if(m.type==='ping')send(socket,m,'pong',{webSocketAcceptedCount:1,webSocketRoundTripCount:1});
      if(/^get_.*_models$/.test(m.type))send(socket,m,m.type.slice(4),{items:m.type==='get_codex_models'?['fixture-codex']:['grok-4.6','grok-fixture-custom'],selected:'background-default'});
      if(m.type==='list_memory_notes')send(socket,m,'memory_notes',{items:[{name:'작업 규칙.md',excerpt:'실제 결과를 확인합니다.'}]});
      if(m.type==='read_memory_note')send(socket,m,'memory_note_content',{name:m.name,content:'모의 메모리 전체 내용'});
      if(m.type==='logic_path_list')send(socket,m,'logic_path_list_result',{ok:true,scope:m.scope,rootKey:m.rootKey||'workspace',rootLabel:'작업 폴더',displayPath:'workspace',browsePath:'',directorySelectPath:'workspace',roots:[],items:[{name:'reference.txt',isDirectory:false,browsePath:'reference.txt',selectPath:'reference.txt',description:'참고 파일'}]});
      if(m.type==='read_workspace_file')send(socket,m,'workspace_file_preview',{ok:true,path:m.filePath,content:'실제 요청에 포함할 모의 참고 파일 내용'});
      if(m.type==='list_conversations')send(socket,m,'conversations',{scope:m.scope,mode:m.mode,items:[...records.values()].filter(record=>record.mode===m.mode)});
      if(m.type==='get_conversation') {
        if(rejectRead){rejectRead=false;send(socket,m,'error',{requestType:m.type,message:'모의 대화 읽기 실패'});}
        else send(socket,m,'conversation_detail',{conversation:records.get(m.conversationId)});
      }
      if(m.type==='create_conversation') {
        const record={id:`new-${records.size+1}`,scope:m.scope,mode:m.mode,title:'새 대화',project:'기본',tags:[],linkedMemoryNotes:[],messages:[]};records.set(record.id,record);send(socket,m,'conversation_created',{conversation:record});
      }
      if(m.type==='update_conversation_meta') {
        heldMeta=m;
        if(rejectMeta){rejectMeta=false;send(socket,m,'error',{requestType:m.type,message:'모의 대화 저장 실패'});}
        else if(!holdMeta){const record=records.get(m.conversationId);Object.assign(record,{title:m.conversationTitle,project:m.project,category:m.category,tags:m.tags});send(socket,m,'conversation_detail',{conversation:record});}
      }
      if(m.type==='conversation_search')send(socket,m,'conversation_search_result',{query:m.query,results:[...records.values()].filter(record=>record.title.includes(m.query)).map(record=>({conversationId:record.id,title:record.title,snippet:record.messages[0]?.text,scope:'chat',mode:record.mode}))});
      if(m.type==='delete_conversation') {
        if(rejectDelete){rejectDelete=false;send(socket,m,'error',{requestType:m.type,message:'모의 삭제 실패'});}
        else{records.delete(m.conversationId);send(socket,m,'conversation_deleted',{scope:'chat',ok:true,conversationId:m.conversationId});}
      }
      if(m.type.startsWith('llm_chat_')){heldChat=m;if(!holdChat)socket.send(JSON.stringify(result(m)));}
      if(m.type==='notebook_append')heldNote=m;
      if(m.type==='rag_retrieval_preflight')send(socket,m,'error',{requestType:m.type,message:'모의 검색 점검 실패'});
      if(m.type==='clipboard_vision_preflight')send(socket,m,'clipboard_vision_preflight_result',{payload:{status:'ok',images:m.attachments.map(file=>({name:file.name,supported:true,message:'지원하는 이미지'})),warnings:[]}});
    });
  });
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):41880\//,route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true}'}));
  await page.route('**/media',route=>route.fulfill({contentType:'application/json',body:'null'}));
  await page.route('**/chat-fixtures',route=>route.fulfill({path:'output/playwright/grok-gateway-fixtures.json',contentType:'application/json'}));
  await page.goto('http://127.0.0.1:1420/');
  fixtures=await page.evaluate(async()=>(await fetch('/chat-fixtures')).json());
  await page.evaluate(()=>{
    window.__chatImport=path=>{const urls=performance.getEntriesByType('resource').map(entry=>new URL(entry.name)).filter(url=>url.pathname===path).sort((a,b)=>Number(b.searchParams.get('t')||0)-Number(a.searchParams.get('t')||0));return import(urls[0]?.href||path);};
  });
  await page.evaluate(async()=>{
    window.__chatStore=(await window.__chatImport('/src/features/ask/ask-store.ts')).useAskStore;
    window.__chatNavigation=(await window.__chatImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore;
    (await window.__chatImport('/src/features/auth/auth-store.ts')).useDesktopAuthStore.setState(s=>({auth:{...s.auth,status:'authenticated'}}));
    (await window.__chatImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light');
    window.__chatNavigation.getState().setActivePage('ask');
    window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copied.push(text)}});
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
  });
  const root=page.locator('[data-surface="chat"]'), input=page.locator('#chat-request');await root.waitFor();
  async function layout(state,width){
    await page.setViewportSize({width,height:1000});await page.screenshot({path:`output/playwright/chat-fresh-${state}-${width}.png`,animations:'disabled'});
    const geometry=await root.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {left:r.left-p.left,right:p.right-r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:[...el.querySelectorAll('button,input,textarea,select,summary')].filter(node=>node.getClientRects().length&&(()=>{const b=node.getBoundingClientRect();return b.left < -1||b.right>innerWidth+1;})()).map(node=>node.getAttribute('aria-label')||node.textContent.slice(0,35))};});
    if(geometry.overflow||geometry.outside.length||Math.abs(geometry.left-geometry.right)>1)throw Error(JSON.stringify({state,width,...geometry}));layouts.push({state,width,...geometry});
  }
  for(const width of [1440,768,390,320])await layout('empty',width);
  if(await root.getByRole('combobox',{name:'응답 방식',exact:true}).isVisible())throw Error('설정이 기본으로 펼쳐져 있습니다.');
  const options=root.locator('summary').filter({hasText:'모델과 응답 방식'});
  await options.focus();await options.press('Enter');await root.getByRole('combobox',{name:'응답 방식',exact:true}).waitFor();
  await root.getByRole('combobox',{name:'응답 제공자',exact:true}).selectOption('grok');
  await root.getByRole('combobox',{name:'Grok 응답 모델',exact:true}).first().selectOption('grok-fixture-custom');
  await root.getByRole('button',{name:'모델 목록 새로고침',exact:true}).click();
  await page.waitForFunction(()=>window.__chatStore.getState().modelCatalogs.grok.includes('grok-fixture-custom'));
  if(await root.getByRole('combobox',{name:'Grok 응답 모델',exact:true}).first().inputValue()!=='grok-fixture-custom')throw Error('배경 모델 조회가 선택한 모델을 덮어썼습니다.');
  for(const width of [1440,768,390,320])await layout('options',width);
  await options.press('Space');await input.fill('첨부와 한글 조합을 확인해 주세요.');
  await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));
  if(requests.some(m=>m.type.startsWith('llm_chat_')))throw Error('한글 조합 중 질문을 보냈습니다.');
  await input.press('Shift+Enter');if(!(await input.inputValue()).includes('\n'))throw Error('줄바꿈이 동작하지 않습니다.');
  await root.getByLabel('질문 첨부 파일',{exact:true}).setInputFiles('output/playwright/build-fresh-attachment.txt');
  await page.waitForFunction(()=>window.__chatStore.getState().attachments.length===1&&!window.__chatStore.getState().readingFiles);
  const resources=root.locator('summary').filter({hasText:/^참고 자료/});await resources.click();
  await root.locator('summary').filter({hasText:/^공유 메모리$/}).click();
  await root.getByRole('checkbox',{name:'작업 규칙.md',exact:true}).check();
  await root.getByRole('button',{name:'내용 보기',exact:true}).click();await root.getByText('모의 메모리 전체 내용',{exact:true}).waitFor();
  for(const width of [1440,768,390,320])await layout('resources',width);
  const picker=root.locator('summary').filter({hasText:/^메모리·파일 찾아서 추가$/});await picker.click();
  await root.getByRole('combobox',{name:'자료 위치',exact:true}).selectOption('workspace');await root.getByRole('button',{name:'폴더 열기',exact:true}).click();
  const fileRow=root.locator('.chat-row').filter({hasText:'reference.txt'});await fileRow.getByRole('button',{name:'읽기',exact:true}).click();await root.getByText('실제 요청에 포함할 모의 참고 파일 내용',{exact:true}).waitFor();
  await fileRow.getByRole('button',{name:'선택',exact:true}).click();await root.getByRole('button',{name:'질문에 추가',exact:true}).click();
  if(!(await input.inputValue()).includes('실제 요청에 포함할 모의 참고 파일 내용'))throw Error('선택한 참고 내용을 질문에 추가하지 못했습니다.');
  for(const width of [1440,768,390,320])await layout('file-reference',width);await picker.click();
  await root.locator('summary').filter({hasText:/^첨부 이미지 확인$/}).click();await root.getByLabel('확인할 이미지',{exact:true}).setInputFiles('output/playwright/chat-fresh-empty-390.png');
  await page.waitForFunction(()=>window.__chatStore.getState().visionFiles.length===1);await root.getByRole('button',{name:'형식과 모델 지원 확인',exact:true}).click();await root.getByText('chat-fresh-empty-390.png · 지원하는 이미지',{exact:true}).waitFor();
  await layout('image-check',320);await root.getByRole('button',{name:'점검 이미지 지우기',exact:true}).click();
  await resources.click();await root.getByRole('button',{name:'질문 보내기',exact:true}).click();
  await root.getByRole('heading',{name:'확인한 내용',exact:true}).waitFor();
  if(heldChat.model!=='grok-fixture-custom'||heldChat.attachments.length!==1||heldChat.memoryNotes[0]!=='작업 규칙.md')throw Error('선택한 모델이나 자료를 잃었습니다.');
  for(const width of [1440,768,390,320])await layout('answer',width);
  const log=root.getByRole('log',{name:'대화 내용',exact:true});
  if(await log.locator('a[href^="javascript:"]').count())throw Error('위험한 링크가 노출됐습니다.');
  const formatting=await log.evaluate(el=>({padding:parseFloat(getComputedStyle(el.querySelector('th')).paddingLeft),code:parseFloat(getComputedStyle(el.querySelector('pre')).paddingLeft)}));
  if(!formatting.padding||!formatting.code)throw Error('표나 코드의 서식이 없습니다.');
  await log.getByRole('button',{name:'답변 복사',exact:true}).click();if(!await page.evaluate(()=>window.__copied.some(text=>text.includes('확인한 내용'))))throw Error('복사하지 못했습니다.');
  await log.locator('summary').filter({hasText:/^출처 /}).click();await log.getByRole('link',{name:'모의 참고 자료',exact:true}).waitFor();
  await layout('sources',320);
  await log.locator('summary').filter({hasText:/^답변 활용$/}).click();
  await log.getByRole('button',{name:'노트에 저장',exact:true}).click();await root.getByText('노트를 저장하고 있습니다.',{exact:true}).waitFor();
  send(socketRef,heldNote,'notebook_result',{action:'append',payload:{ok:false,message:'모의 노트 저장 실패'}});
  await root.getByRole('alert').filter({hasText:'모의 노트 저장 실패'}).waitFor();
  if(await page.getByText('답변을 노트에 저장했습니다.',{exact:true}).count())throw Error('실패한 저장을 성공으로 표시했습니다.');
  await log.getByRole('button',{name:'노트에 저장',exact:true}).click();const note=heldNote;
  if(!note.text.includes(answer))throw Error('노트로 보낼 때 답변을 잘랐습니다.');
  await page.evaluate(()=>window.__chatNavigation.getState().setActivePage('automate'));
  send(socketRef,note,'notebook_result',{action:'append',payload:{ok:true,message:'저장 완료'}});
  await page.evaluate(()=>window.__chatNavigation.getState().setActivePage('ask'));await root.getByText('답변을 노트에 저장했습니다.',{exact:true}).waitFor();
  await layout('notebook-saved',320);
  const firstId=await page.evaluate(()=>window.__chatStore.getState().activeConversationId);
  holdChat=true;await input.fill('백그라운드 응답을 확인해 주세요.');await root.getByRole('button',{name:'질문 보내기',exact:true}).click();const held=heldChat;
  socketRef.send(JSON.stringify({type:'conversation_detail',requestId:'another-page',conversation:{id:'unrelated',scope:'chat',mode:'single',title:'잘못된 대화',messages:[]}}));
  socketRef.send(JSON.stringify({type:'llm_chat_stream',requestId:'old-turn',delta:'섞이면 안 되는 조각'}));
  socketRef.send(JSON.stringify({type:'error',requestType:'llm_chat_single',requestId:'old-turn',message:'지난 요청의 오류'}));
  socketRef.send(JSON.stringify({type:'llm_chat_stream',requestId:held.requestId,delta:'진행 중인 답변'}));
  await page.waitForFunction(()=>window.__chatStore.getState().streamingText==='진행 중인 답변');
  if(await page.evaluate(()=>window.__chatStore.getState().activeConversationId)!==firstId)throw Error('다른 대화 조회가 현재 응답을 덮어썼습니다.');
  await layout('stream',320);
  await page.evaluate(()=>window.__chatNavigation.getState().setActivePage('automate'));socketRef.send(JSON.stringify(result(held)));
  await page.waitForFunction(()=>!window.__chatStore.getState().pending);await page.evaluate(()=>window.__chatNavigation.getState().setActivePage('ask'));await root.waitFor();
  const history=root.locator('summary').filter({hasText:/^대화 기록$/});await history.click();
  rejectRead=true;await root.locator('.chat-history-item').first().click();await root.getByRole('alert').filter({hasText:'모의 대화 읽기 실패'}).waitFor();
  if(await page.evaluate(()=>window.__chatStore.getState().pending||!window.__chatStore.getState().messages.length))throw Error('조회 실패가 이전 결과를 지우거나 대기를 남겼습니다.');
  await root.locator('summary').filter({hasText:/^대화 이름과 분류$/}).click();
  await root.getByRole('textbox',{name:'대화 이름',exact:true}).fill('저장한 새 이름');await root.getByRole('button',{name:'대화 정보 저장',exact:true}).click();await root.getByRole('alert').filter({hasText:'모의 대화 저장 실패'}).waitFor();
  if(await page.getByText('모의 대화 저장 실패',{exact:true}).count()!==1)throw Error('오류가 화면과 알림에 중복됐습니다.');
  if(await root.getByRole('textbox',{name:'대화 이름',exact:true}).inputValue()!=='저장한 새 이름')throw Error('실패로 편집을 잃었습니다.');
  holdMeta=true;await root.getByRole('button',{name:'대화 정보 저장',exact:true}).click();
  await root.getByRole('textbox',{name:'대화 이름',exact:true}).fill('저장 중 이어서 편집');
  const metaRecord=clone(records.get(heldMeta.conversationId));metaRecord.title=heldMeta.conversationTitle;records.set(metaRecord.id,metaRecord);send(socketRef,heldMeta,'conversation_detail',{conversation:metaRecord});
  await page.waitForFunction(()=>!window.__chatStore.getState().historyRequests.meta);
  if(await root.getByRole('textbox',{name:'대화 이름',exact:true}).inputValue()!=='저장 중 이어서 편집')throw Error('늦은 저장 응답이 새 편집을 지웠습니다.');
  await root.getByRole('searchbox',{name:'대화 검색',exact:true}).fill('저장한');await root.getByRole('button',{name:'검색',exact:true}).click();await page.waitForFunction(()=>!window.__chatStore.getState().searching&&window.__chatStore.getState().searchResults.length===1);
  for(const width of [1440,768,390,320])await layout('history',width);
  await history.click();await options.click();await root.getByRole('combobox',{name:'응답 방식',exact:true}).selectOption('multi');
  for(const provider of ['Groq','Gemini','Cerebras','NVIDIA NIM','Copilot','Codex','Grok'])await root.getByRole('combobox',{name:`${provider} 비교 모델`,exact:true}).selectOption('none');
  await root.getByRole('combobox',{name:'Grok 비교 모델',exact:true}).selectOption('grok-fixture-custom');await root.getByRole('combobox',{name:'Codex 비교 모델',exact:true}).selectOption('fixture-codex');
  await root.getByRole('combobox',{name:'요약 제공자',exact:true}).selectOption('grok');
  for(const width of [1440,768,390,320])await layout('multi-options',width);
  await options.click();holdChat=false;await input.fill('모델별 관점을 비교해 주세요.');await root.getByRole('button',{name:'질문 보내기',exact:true}).click();
  await page.waitForFunction(()=>!!window.__chatStore.getState().multiResult&&!window.__chatStore.getState().pending);
  await root.locator('summary').filter({hasText:/^모델별 답변$/}).click();
  await root.getByRole('combobox',{name:'살펴볼 답변',exact:true}).selectOption({label:'Codex · fixture-codex'});await root.getByText('비교할 Codex 답변',{exact:true}).waitFor();
  for(const width of [1440,768,390,320])await layout('comparison',width);
  await root.getByRole('button',{name:'새 대화',exact:true}).click();await page.waitForFunction(()=>window.__chatStore.getState().activeConversation?.title==='새 대화'&&!window.__chatStore.getState().pending);
  await input.fill('지우면 안 되는 초안');await root.getByRole('button',{name:'새 대화',exact:true}).click();const dialog=page.getByRole('dialog',{name:'새 대화 시작',exact:true});await dialog.waitFor();await layout('dialog',320);await dialog.getByRole('button',{name:'취소',exact:true}).click();
  if(await input.inputValue()!=='지우면 안 되는 초안')throw Error('새 대화 취소로 입력을 잃었습니다.');
  await input.fill('자료 검색 실패를 확인해 주세요.');await resources.click();await root.locator('summary').filter({hasText:/^검색할 자료 확인$/}).click();await root.getByRole('button',{name:'질문에 맞는 자료 찾기',exact:true}).click();await root.getByRole('alert').filter({hasText:'모의 검색 점검 실패'}).waitFor();if(await page.evaluate(()=>window.__chatStore.getState().ragPending))throw Error('자료 오류 뒤에도 대기 중입니다.');await resources.click();
  holdChat=true;await root.getByRole('button',{name:'질문 보내기',exact:true}).click();const failing=heldChat;
  send(socketRef,failing,'llm_chat_stream',{delta:'실패 전 부분 답변'});await page.waitForFunction(()=>window.__chatStore.getState().streamingText==='실패 전 부분 답변');send(socketRef,failing,'error',{requestType:failing.type,message:'모의 생성 실패'});
  await root.getByRole('alert').filter({hasText:'모의 생성 실패'}).waitFor();await root.getByText('실패 전 부분 답변',{exact:true}).waitFor();await root.getByRole('button',{name:'질문 다시 쓰기',exact:true}).click();if(await input.inputValue()!==failing.text)throw Error('실패한 요청을 복원하지 못했습니다.');
  await layout('failed',320);
  await page.evaluate(()=>window.__chatNavigation.getState().setActivePage('ask',{input:'다른 화면의 요청'}));await root.getByText('다른 화면에서 전달받은 요청이 있습니다.',{exact:true}).waitFor();if(await input.inputValue()!==failing.text)throw Error('전달받은 요청이 기존 초안을 덮어썼습니다.');
  await input.fill('');await root.getByRole('button',{name:'입력에 가져오기',exact:true}).click();if(await input.inputValue()!=='다른 화면의 요청')throw Error('전달된 초안을 가져오지 못했습니다.');
  holdChat=false;await root.getByRole('button',{name:'질문 보내기',exact:true}).click();await page.waitForFunction(()=>!window.__chatStore.getState().pending);
  await log.locator('summary').filter({hasText:/^답변 활용$/}).last().click();await log.getByRole('button',{name:'매주 자동화',exact:true}).last().click();await page.locator('[data-surface="automation"]').waitFor();
  const automatic=await page.evaluate(async()=>(await window.__chatImport('/src/features/automation-workspace/automation-state.ts')).useAutomationWorkspace.getState().form);
  if(automatic.kind!=='weekly'||automatic.time!=='10:30'||automatic.weekdays.join(',')!=='1,3')throw Error('자동화 제안의 예약을 잃었습니다.');
  if(requests.some(request=>request.type==='create_routine'||request.type==='plan_create'))throw Error('화면 이동만으로 생성 요청을 보냈습니다.');
  await page.evaluate(()=>window.__chatNavigation.getState().setActivePage('ask'));await root.waitFor();
  await history.click();await page.waitForFunction(()=>!window.__chatStore.getState().loadingConversations);
  if(await root.getByRole('button',{name:'전체 기록',exact:true}).count())await root.getByRole('button',{name:'전체 기록',exact:true}).click();
  const currentRow=root.locator('.chat-row').filter({has:page.locator('.chat-history-item[aria-current="true"]')});
  await currentRow.locator('summary').click();rejectDelete=true;
  const beforeDelete=await page.evaluate(()=>window.__chatStore.getState().activeConversationId);
  await currentRow.getByRole('button',{name:'삭제',exact:true}).click();
  await page.getByRole('dialog',{name:'대화 삭제',exact:true}).getByRole('button',{name:'취소',exact:true}).click();
  if(requests.some(request=>request.type==='delete_conversation'))throw Error('삭제 취소 후 요청을 보냈습니다.');
  await currentRow.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('dialog',{name:'대화 삭제',exact:true}).getByRole('button',{name:'삭제',exact:true}).click();
  await root.getByRole('alert').filter({hasText:'모의 삭제 실패'}).waitFor();
  if(await page.evaluate(()=>window.__chatStore.getState().activeConversationId)!==beforeDelete)throw Error('삭제 실패로 현재 대화를 지웠습니다.');
  await layout('delete-failed',320);
  await currentRow.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('dialog',{name:'대화 삭제',exact:true}).getByRole('button',{name:'삭제',exact:true}).click();
  await page.waitForFunction(()=>!window.__chatStore.getState().activeConversationId&&!window.__chatStore.getState().loadingConversations);
  await history.click();await options.click();await root.getByRole('combobox',{name:'응답 방식',exact:true}).selectOption('orchestration');await options.click();
  await input.fill('역할 분담 응답을 확인해 주세요.');await root.getByRole('button',{name:'질문 보내기',exact:true}).click();await page.waitForFunction(()=>!window.__chatStore.getState().pending);
  if(heldChat.type!=='llm_chat_orchestration'||heldChat.grokModel!=='grok-fixture-custom'||heldChat.groqModel!=='none')throw Error('역할 분담 요청의 모델 선택을 잃었습니다.');
  await layout('orchestration',390);
  await page.evaluate(async()=>{
    const {sendFromHome}=await window.__chatImport('/src/features/home/composer-send.ts');
    await sendFromHome({intent:'ask',text:'홈에서 시작한 대화',chatMode:'single',provider:'grok',model:'grok-fixture-custom',thinkPlus:false,files:[]});
  });
  await page.waitForFunction(()=>!window.__chatStore.getState().pending&&window.__chatStore.getState().messages[0]?.text==='홈에서 시작한 대화');
  const homeId=heldChat.conversationId||await page.evaluate(()=>window.__chatStore.getState().activeConversationId);
  await page.evaluate(async()=>{
    const {sendFromHome}=await window.__chatImport('/src/features/home/composer-send.ts');
    await sendFromHome({intent:'ask',text:'홈에서 이어지는 질문',chatMode:'single',provider:'auto',model:null,thinkPlus:false,files:[]});
  });
  await page.waitForFunction(()=>!window.__chatStore.getState().pending&&window.__chatStore.getState().messages[0]?.text==='홈에서 이어지는 질문');
  if(heldChat.conversationId!==homeId||heldChat.provider)throw Error('홈의 후속 대화나 자동 모델 선택이 반영되지 않았습니다.');
  await layout('home-followup',390);
  holdChat=true;await input.fill('연결 종료 중 부분 답변 보존');await root.getByRole('button',{name:'질문 보내기',exact:true}).click();
  send(socketRef,heldChat,'llm_chat_stream',{delta:'연결이 끊겨도 남겨야 할 부분 답변'});await page.waitForFunction(()=>window.__chatStore.getState().streamingText==='연결이 끊겨도 남겨야 할 부분 답변');
  await socketRef.close({code:1000,reason:'fixture disconnect'});
  await page.waitForFunction(()=>!window.__chatStore.getState().pending&&window.__chatStore.getState().messages.some(message=>message.text==='연결이 끊겨도 남겨야 할 부분 답변'));
  await layout('disconnected',390);
  await root.getByRole('button',{name:'질문 다시 쓰기',exact:true}).click();await input.fill('');holdChat=false;
  await page.waitForFunction(()=>window.__chatStore.getState().historyRequests.list===undefined);
  await root.getByRole('button',{name:'새 대화',exact:true}).click();await page.waitForFunction(()=>!window.__chatStore.getState().pending&&window.__chatStore.getState().activeConversation?.title==='새 대화');
  await input.fill('연결 실패 후에도 보존할 입력');const before=await page.evaluate(()=>window.__chatStore.getState().messages.length);
  await page.evaluate(async()=>(await window.__chatImport('/src/features/middleware/desktop-message-gateway.ts')).bindDesktopSessionSocket(null));await root.getByRole('button',{name:'질문 보내기',exact:true}).click();await root.getByRole('alert').filter({hasText:'전송하지 못했습니다'}).waitFor();
  if(await input.inputValue()!=='연결 실패 후에도 보존할 입력'||await page.evaluate(()=>window.__chatStore.getState().messages.length)!==before)throw Error('전송 실패로 입력·결과를 잃었습니다.');
  await page.evaluate(async()=>(await window.__chatImport('/src/shell-store.ts')).useDesktopShellStore.getState().markBridgeStatus('closed'));
  if(await root.getByRole('button',{name:'질문 보내기',exact:true}).isEnabled())throw Error('오프라인 전송이 활성화되어 있습니다.');await layout('offline',320);
  for(const theme of ['dark','glass']){await page.evaluate(async theme=>(await window.__chatImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme(theme),theme);await layout(theme,390);}
  return {checks:layouts.length,layouts,requests:requests.filter(request=>request.requestId?.startsWith('ask-')).map(request=>({type:request.type,requestId:request.requestId}))};
}
