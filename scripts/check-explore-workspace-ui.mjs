// 새 탐색 화면의 UI 계약. 실제 브라우저/캔버스 런타임 검사의 캡처를 모의 WS 응답으로 사용한다.
async (page) => {
  let fixtures, socketRef, heldSearch, heldBrowser, heldSpawn, heldHistory, holdSearch=false, holdBrowser=false, holdSpawn=false, rejectRead=false, rejectMessage=true, rejectCanvas=false;
  const requests=[], layouts=[];
  const sessions=[{key:'session-one',scope:'chat',mode:'single',displayName:'검사할 대화',label:'검사할 대화',messageCount:2},{key:'session-two',scope:'coding',mode:'single',displayName:'다른 작업',messageCount:1}];
  let browser={ok:true,running:false,tabs:[],activeTargetId:'',activeUrl:''}, canvas={ok:true,visible:false,adapter:'playwright',url:'about:blank',a2uiRevision:0};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const send=(socket,request,type,fields={})=>socket.send(JSON.stringify({...fields,type,requestId:request.requestId}));
  function browserResult(request) {
    if(['start','open'].includes(request.action)){browser={...clone(fixtures.browser),activeUrl:request.url||'about:blank',tabs:[{targetId:'first',title:'첫 페이지',url:'https://example.com/first',active:false},{targetId:'second',title:'현재 페이지',url:request.url||'about:blank',active:true}],activeTargetId:'second'};}
    if(request.action==='focus'){browser.activeTargetId=request.targetId;browser.tabs.forEach(tab=>tab.active=tab.targetId===request.targetId);}
    if(request.action==='close'){browser.tabs=browser.tabs.filter(tab=>tab.targetId!==request.targetId);browser.activeTargetId=browser.tabs[0]?.targetId||'';browser.tabs.forEach((tab,index)=>tab.active=index===0);}
    if(request.action==='stop')browser={ok:true,running:false,tabs:[],activeTargetId:'',activeUrl:''};
    return {...browser,action:request.action,profile:request.profile,...(request.action==='snapshot'?{snapshot:fixtures.browserImage.snapshot}:{})};
  }
  const searchResult=request=>({provider:'fixture',query:request.query,results:[{title:'공식 자료를 확인하는 방법',url:'https://example.com/reference',description:'검색 결과의 본문과 출처를 확인합니다. '+ '긴설명'.repeat(100),published:'2026-09-07'}]});
  await page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//,socket=>{
    socket.send(JSON.stringify({type:'auth_result',ok:true}));
    socket.onMessage(raw=>{
      const m=JSON.parse(raw);requests.push(m);if(m.requestId?.startsWith('explore-'))socketRef=socket;
      if(m.type==='ping')send(socket,m,'pong',{webSocketAcceptedCount:1,webSocketRoundTripCount:1});
      if(m.type==='web_search'){heldSearch=m;if(!holdSearch)send(socket,m,'web_search_result',searchResult(m));}
      if(m.type==='web_fetch')send(socket,m,'web_fetch_result',{url:m.url,finalUrl:m.url,status:200,contentType:'text/html',truncated:true,length:9000,text:'가져온 페이지 본문\n'+ '긴 문자열과 자세한 설명입니다. '.repeat(110)});
      if(m.type==='browser'){heldBrowser=m;if(!holdBrowser||m.action==='snapshot')send(socket,m,'browser_result',browserResult(m));}
      if(m.type==='canvas') {
        if(rejectCanvas&&m.action==='eval'){rejectCanvas=false;send(socket,m,'canvas_result',{...canvas,action:m.action,ok:false,error:'모의 스크립트 오류'});return;}
        if(m.action==='present'||m.action==='navigate'){canvas.visible=true;if(m.url)canvas.url=m.url;}
        if(m.action==='hide')canvas.visible=false;
        if(m.action==='a2ui_push'){canvas.visible=true;canvas.a2uiRevision++;}
        if(m.action==='a2ui_reset')canvas.a2uiRevision=0;
        send(socket,m,'canvas_result',{...canvas,action:m.action,...(m.action==='eval'?{evalResult:'42'}:{}),...(m.action==='snapshot'?{snapshot:fixtures.captured.snapshot}:{})});
      }
      if(m.type==='sessions_list')send(socket,m,'sessions_list_result',{sessions});
      if(m.type==='sessions_history') {
        heldHistory=m;
        if(rejectRead){rejectRead=false;send(socket,m,'sessions_history_result',{status:'error',sessionKey:m.sessionKey,error:'모의 이력 조회 실패'});}
        else send(socket,m,'sessions_history_result',{status:'ok',sessionKey:m.sessionKey,count:2,messages:[{role:'user',text:'지금까지 작업한 내용을 확인합니다.'},{role:'assistant',text:'검증 결과와 다음에 할 일입니다.\n'+ '긴작업기록'.repeat(120)}]});
      }
      if(m.type==='sessions_send') {
        if(rejectMessage){rejectMessage=false;send(socket,m,'sessions_send_result',{status:'error',sessionKey:m.sessionKey,error:'모의 메시지 저장 실패'});}
        else send(socket,m,'sessions_send_result',{status:'accepted',sessionKey:m.sessionKey,messageTruncated:false});
      }
      if(m.type==='sessions_spawn') {
        if(m.action==='status')send(socket,m,'sessions_spawn_result',{action:'status',queue:{total:2},active:{activeCount:1},breakerBlocked:false});
        else {heldSpawn=m;if(!holdSpawn)send(socket,m,'sessions_spawn_result',{status:'queued',childSessionKey:'session-two',task:m.task,note:'연결한 실행 환경에서 작업을 기다리고 있습니다.'});}
      }
      if(m.type==='list_conversations')send(socket,m,'conversations',{scope:m.scope,mode:m.mode,items:[]});
      if(m.type==='get_conversation')send(socket,m,'conversation_detail',{conversation:{id:m.conversationId,scope:'chat',mode:'single',title:'검사할 대화',messages:[{role:'user',text:'이어갈 대화입니다.'}]}});
    });
  });
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):41880\//,route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true}'}));
  await page.route('**/media',route=>route.fulfill({contentType:'application/json',body:'null'}));
  await page.route('**/explore-fixtures',route=>route.fulfill({path:'output/playwright/explore-runtime-fixtures.json',contentType:'application/json'}));
  await page.goto('http://127.0.0.1:1420/');fixtures=await page.evaluate(async()=>(await fetch('/explore-fixtures')).json());
  await page.evaluate(()=>{window.__exploreImport=path=>{const urls=performance.getEntriesByType('resource').map(entry=>new URL(entry.name)).filter(url=>url.pathname===path).sort((a,b)=>Number(b.searchParams.get('t')||0)-Number(a.searchParams.get('t')||0));return import(urls[0]?.href||path);};});
  await page.evaluate(async()=>{
    window.__webExplore=(await window.__exploreImport('/src/features/explore-workspace/web-explore-state.ts')).useWebExplore;
    window.__runtimeExplore=(await window.__exploreImport('/src/features/explore-workspace/runtime-explore-state.ts')).useRuntimeExplore;
    window.__sessionExplore=(await window.__exploreImport('/src/features/explore-workspace/session-explore-state.ts')).useSessionExplore;
    window.__exploreNavigation=(await window.__exploreImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore;
    (await window.__exploreImport('/src/features/auth/auth-store.ts')).useDesktopAuthStore.setState(s=>({auth:{...s.auth,status:'authenticated'}}));
    (await window.__exploreImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light');
    window.__exploreNavigation.getState().setActivePage('explore');
    window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copied.push(text)}});
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
  });
  const root=page.locator('[data-surface="explore"]');await root.waitFor();
  async function layout(state,width) {
    await page.setViewportSize({width,height:1000});await page.screenshot({path:`output/playwright/explore-fresh-${state}-${width}.png`,animations:'disabled'});
    const geometry=await root.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return{left:r.left-p.left,right:p.right-r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:[...el.querySelectorAll('input,select,textarea,button,summary,img')].filter(node=>{if(!node.getClientRects().length)return false;const b=node.getBoundingClientRect();if(!(b.left<-1||b.right>innerWidth+1))return false;let parent=node.parentElement;while(parent&&parent!==el){const ox=getComputedStyle(parent).overflowX;if(ox==='auto'||ox==='scroll')return false;parent=parent.parentElement;}return true;}).map(node=>node.getAttribute('aria-label')||node.textContent.slice(0,40))};});
    if(geometry.overflow||geometry.outside.length||Math.abs(geometry.left-geometry.right)>1)throw Error(JSON.stringify({state,width,...geometry}));layouts.push({state,width,...geometry});
  }
  for(const width of [1440,768,390,320])await layout('empty',width);
  const query=root.getByRole('searchbox',{name:'찾을 내용이나 웹 주소',exact:true});await query.fill('TypeScript: 타입 좁히기');
  await query.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));if(requests.some(m=>m.type==='web_search'))throw Error('한글 조합 중 검색했습니다.');
  await root.getByRole('button',{name:'찾기',exact:true}).click();await root.getByRole('region',{name:'검색 결과',exact:true}).waitFor();
  if(heldSearch.query!=='TypeScript: 타입 좁히기')throw Error('콜론을 포함한 검색어를 URL로 잘못 처리했습니다.');
  for(const width of [1440,768,390,320])await layout('search',width);
  await root.getByRole('button',{name:'본문 읽기',exact:true}).click();const document=root.getByRole('region',{name:'페이지 본문',exact:true});await document.waitFor();
  if(requests.filter(m=>m.type==='web_fetch').slice(-1)[0].url!=='https://example.com/reference')throw Error('선택한 URL이 전달되지 않았습니다.');
  await document.getByRole('button',{name:'본문 복사',exact:true}).click();if(!await page.evaluate(()=>window.__copied.some(text=>text.includes('가져온 페이지 본문'))))throw Error('본문 복사가 실패했습니다.');
  for(const width of [1440,768,390,320])await layout('document',width);
  holdSearch=true;await query.fill('화면 이동 중에도 보존할 검색');await root.getByRole('button',{name:'찾기',exact:true}).click();
  send(socketRef,{requestId:'explore-stale'},'error',{requestType:'web_search',message:'관련 없는 오류'});await page.waitForFunction(()=>!!window.__webExplore.getState().pending);
  await page.evaluate(()=>window.__exploreNavigation.getState().setActivePage('ask'));send(socketRef,heldSearch,'web_search_result',searchResult(heldSearch));await page.waitForFunction(()=>!window.__webExplore.getState().pending);
  await page.evaluate(()=>window.__exploreNavigation.getState().setActivePage('explore'));await root.getByRole('region',{name:'검색 결과',exact:true}).waitFor();
  await page.getByRole('tab',{name:'브라우저',exact:true}).click();
  await root.getByRole('textbox',{name:'열 웹 주소',exact:true}).fill('https://example.com/browser');holdBrowser=true;await root.getByRole('button',{name:'열기',exact:true}).click();await page.waitForFunction(()=>!!window.__runtimeExplore.getState().browser.pending);const opening=heldBrowser;
  await page.evaluate(()=>window.__exploreNavigation.getState().setActivePage('ask'));send(socketRef,opening,'browser_result',browserResult(opening));holdBrowser=false;
  await page.waitForFunction(()=>!window.__runtimeExplore.getState().browser.pending&&!!window.__runtimeExplore.getState().browser.frame);
  await page.evaluate(()=>window.__exploreNavigation.getState().setActivePage('explore'));await page.getByRole('tab',{name:'브라우저',exact:true}).click();
  await root.getByRole('combobox',{name:'열린 페이지',exact:true}).selectOption('first');await page.waitForFunction(()=>!window.__runtimeExplore.getState().browser.pending&&window.__runtimeExplore.getState().browser.result.activeTargetId==='first');
  for(const width of [1440,768,390,320])await layout('browser',width);
  await root.getByRole('button',{name:'선택한 페이지 닫기',exact:true}).click();await page.waitForFunction(()=>!window.__runtimeExplore.getState().browser.pending&&window.__runtimeExplore.getState().browser.result.tabs.length===1);
  await page.getByRole('tab',{name:'캔버스',exact:true}).click();
  await root.getByRole('button',{name:'캔버스 열기',exact:true}).click();await page.waitForFunction(()=>!window.__runtimeExplore.getState().canvas.pending&&!!window.__runtimeExplore.getState().canvas.frame);
  for(const width of [1440,768,390,320])await layout('canvas',width);
  await root.getByRole('button',{name:'화면 숨기기',exact:true}).click();await page.waitForFunction(()=>window.__runtimeExplore.getState().canvas.result.visible===false&&!window.__runtimeExplore.getState().canvas.pending);
  if(await root.getByAltText('브라우저에서 실제로 캡처한 화면').isVisible())throw Error('숨긴 캔버스가 보입니다.');
  await root.getByRole('button',{name:'캔버스 열기',exact:true}).click();await page.waitForFunction(()=>!window.__runtimeExplore.getState().canvas.pending);
  await root.locator('summary').filter({hasText:/^화면 만들기와 점검$/}).click();await root.locator('summary').filter({hasText:/^JavaScript 실행$/}).click();
  const script=root.getByRole('textbox',{name:'캔버스에서 실행할 JavaScript',exact:true});await script.fill('6 * 7');rejectCanvas=true;await root.getByRole('button',{name:'실행',exact:true}).click();await root.getByRole('alert').filter({hasText:'모의 스크립트 오류'}).waitFor();
  if(await script.inputValue()!=='6 * 7'||await page.getByText('모의 스크립트 오류',{exact:true}).count()!==1)throw Error('스크립트 오류로 입력을 잃었거나 알림이 중복됩니다.');
  await root.getByRole('button',{name:'실행',exact:true}).click();await root.getByRole('region',{name:'JavaScript 실행 결과',exact:true}).getByText('42',{exact:true}).waitFor();await page.waitForFunction(()=>!window.__runtimeExplore.getState().canvas.pending);
  await root.getByRole('combobox',{name:'캡처 너비',exact:true}).selectOption('390');await root.getByRole('button',{name:'화면 새로 캡처',exact:true}).click();await page.waitForFunction(()=>!window.__runtimeExplore.getState().canvas.pending);
  if(requests.filter(m=>m.type==='canvas'&&m.action==='snapshot').slice(-1)[0].maxWidth!==390)throw Error('캡처 너비를 전달하지 못했습니다.');
  await root.locator('summary').filter({hasText:/^선언형 UI$/}).click();await root.getByRole('textbox',{name:'A2UI JSONL',exact:true}).fill('{"version":"v0.9.1","createSurface":{"surfaceId":"test","catalogId":"https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json"}}');await root.getByRole('button',{name:'화면에 적용',exact:true}).click();await page.waitForFunction(()=>!window.__runtimeExplore.getState().canvas.pending&&window.__runtimeExplore.getState().canvas.result.a2uiRevision===1);
  for(const width of [1440,768,390,320])await layout('canvas-tools',width);
  await root.getByRole('button',{name:'캔버스 초기화',exact:true}).click();const dialog=page.getByRole('dialog',{name:'캔버스 초기화',exact:true});await dialog.waitFor();await layout('dialog',320);await dialog.getByRole('button',{name:'취소',exact:true}).click();if(requests.some(m=>m.action==='a2ui_reset'))throw Error('취소한 초기화가 실행됐습니다.');
  await root.getByRole('button',{name:'캔버스 초기화',exact:true}).click();await dialog.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>!window.__runtimeExplore.getState().canvas.pending&&window.__runtimeExplore.getState().canvas.result.a2uiRevision===0);
  await page.getByRole('tab',{name:'기록',exact:true}).click();await page.waitForFunction(()=>window.__sessionExplore.getState().items.length===2&&!window.__sessionExplore.getState().pending.list);
  await root.getByRole('combobox',{name:'저장된 작업',exact:true}).selectOption('session-one');await page.waitForFunction(()=>!!window.__sessionExplore.getState().history&&!window.__sessionExplore.getState().pending.history);
  rejectRead=true;await root.getByRole('combobox',{name:'저장된 작업',exact:true}).selectOption('session-two');await root.getByRole('alert').filter({hasText:'모의 이력 조회 실패'}).waitFor();if(await page.evaluate(()=>window.__sessionExplore.getState().selected)!=='session-one')throw Error('조회 실패로 이전 작업을 잃었습니다.');
  await root.locator('summary').filter({hasText:/^메시지 남기기$/}).click();const message=root.getByRole('textbox',{name:'이 작업에 남길 메시지',exact:true});await message.fill('보존할 후속 메시지');await root.getByRole('button',{name:'메시지 남기기',exact:true}).click();await root.getByRole('alert').filter({hasText:'모의 메시지 저장 실패'}).waitFor();if(await message.inputValue()!=='보존할 후속 메시지')throw Error('저장 실패로 메시지가 지워졌습니다.');
  await root.getByRole('button',{name:'메시지 남기기',exact:true}).click();await root.getByText('메시지를 작업 기록에 남겼습니다.',{exact:true}).waitFor();
  for(const width of [1440,768,390,320])await layout('sessions',width);
  await root.locator('summary').filter({hasText:/^새 에이전트 작업$/}).click();await root.getByRole('textbox',{name:'에이전트에게 맡길 일',exact:true}).fill('모의 에이전트 작업');await root.locator('summary').filter({hasText:/^이름과 실행 설정$/}).click();
  await root.getByRole('textbox',{name:'작업 이름',exact:true}).fill('확인할 작업');await root.getByRole('combobox',{name:'실행 환경',exact:true}).selectOption('codex');await root.getByRole('combobox',{name:'작업 방식',exact:true}).selectOption('session');await root.getByRole('spinbutton',{name:'최대 실행 시간(초)',exact:true}).fill('300');
  holdSpawn=true;await root.getByRole('button',{name:'작업 시작',exact:true}).click();await root.locator('summary').filter({hasText:/^실행 대기 상태$/}).click();await root.getByRole('button',{name:'상태 확인',exact:true}).click();await page.waitForFunction(()=>!!window.__sessionExplore.getState().status&&!window.__sessionExplore.getState().pending.status);
  if(!await page.evaluate(()=>!!window.__sessionExplore.getState().pending.spawn))throw Error('상태 조회가 생성 중 표시를 해제했습니다.');
  if(heldSpawn.task!=='모의 에이전트 작업'||heldSpawn.runtime!=='codex'||heldSpawn.mode!=='session'||heldSpawn.runTimeoutSeconds!==300)throw Error('작업 설정이 전달되지 않았습니다.');
  send(socketRef,heldSpawn,'sessions_spawn_result',{status:'queued',childSessionKey:'session-two',note:'실행을 기다리고 있습니다.'});await page.waitForFunction(()=>!window.__sessionExplore.getState().pending.spawn);
  for(const width of [1440,768,390,320])await layout('agent',width);
  await root.getByRole('button',{name:'이 작업에서 계속하기',exact:true}).click();await page.locator('[data-surface="chat"]').waitFor();await page.getByText('이어갈 대화입니다.',{exact:true}).waitFor();
  await page.evaluate(()=>window.__exploreNavigation.getState().setActivePage('explore'));await root.waitFor();await query.fill('보내지 못해도 유지할 검색');
  await page.evaluate(async()=>(await window.__exploreImport('/src/features/middleware/desktop-message-gateway.ts')).bindDesktopSessionSocket(null));await root.getByRole('button',{name:'찾기',exact:true}).click();await root.getByRole('alert').filter({hasText:'요청을 보내지 못했습니다.'}).waitFor();if(await query.inputValue()!=='보내지 못해도 유지할 검색')throw Error('전송 실패로 검색어를 잃었습니다.');
  await layout('send-failed',320);
  await page.evaluate(async()=>(await window.__exploreImport('/src/shell-store.ts')).useDesktopShellStore.getState().markBridgeStatus('closed'));if(await root.getByRole('button',{name:'찾기',exact:true}).isEnabled())throw Error('오프라인 검색이 활성화됩니다.');await layout('offline',320);
  for(const theme of ['dark','glass']){await page.evaluate(async theme=>(await window.__exploreImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme(theme),theme);await layout(theme,390);}
  if(requests.some(m=>m.type.startsWith('llm_chat')||m.type.startsWith('coding_run')||m.type.includes('_login')))throw Error('실제 추론이나 로그인 경로가 호출됐습니다.');
  return {checks:layouts.length,layouts,requests:requests.filter(m=>m.requestId?.startsWith('explore-')).map(m=>({type:m.type,action:m.action,requestId:m.requestId}))};
}
