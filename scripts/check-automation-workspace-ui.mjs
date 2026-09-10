// 새 자동화 화면 검사. 모든 업무 요청과 응답은 모의 처리하며 외부 모델·메시지를 호출하지 않는다.
async (page) => {
  await page.route('**/automation-workspace-fixtures', route => route.fulfill({path:'output/playwright/grok-gateway-fixtures.json',contentType:'application/json'}));
  const fixtures=await page.evaluate(async()=>(await fetch('/automation-workspace-fixtures')).json());
  if(!fixtures.automation) throw Error('자동화 실제 서버 계약 검사가 먼저 완료되어야 합니다.');
  const clone=value=>JSON.parse(JSON.stringify(value));
  let items=[], businessSocket, heldCreate, holdCreate=true, rejectEdit=true, holdDetail=false, pendingDetails=[];
  const requests=[];
  const latestTime=fixtures.automation.detail.ts;
  const olderTime=latestTime-86400000;
  function send(socket,message,type,fields){socket.send(JSON.stringify({...fields,type,requestId:message.requestId}));}
  function summary(form,previous) {
    return {...clone(previous||fixtures.automation.created),title:form.title||'모의 자동화',request:form.text,timeOfDay:form.scheduleTime,scheduleKind:form.scheduleKind,weekdays:form.weekdays||[],dayOfMonth:form.dayOfMonth,timezoneId:form.timezoneId,executionMode:form.executionMode,notifyTelegram:form.notifyTelegram,notifyPolicy:form.notifyPolicy,maxRetries:form.maxRetries,retryDelaySeconds:form.retryDelaySeconds,
      scheduleText:form.scheduleKind==='weekly'?`매주 월, 수, 금 ${form.scheduleTime}`:`매일 ${form.scheduleTime}`,running:false};
  }
  function detail(message) {
    const output=message.timestamp===olderTime?'이전 실행에서 저장한 결과입니다.':'오늘 확인한 소식을 정리했습니다.\n\n- 항목 하나\n- 항목 둘\n\n| 항목 | 결과 |\n| --- | --- |\n| 확인 | 완료 |';
    return {...clone(fixtures.automation.detail),requestId:message.requestId,routineId:message.routineId,ts:message.timestamp,status:'ok',error:null,output,content:'# 실행 원본\n\n- routineId: fixture\n\n## Output\n\n'+output,artifactPath:'/isolated/automation/'+('long-name-'.repeat(35))+'/result.md'};
  }
  await page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//, socket=>{
    socket.send(JSON.stringify({type:'auth_result',ok:true}));
    socket.onMessage(raw=>{
      const message=JSON.parse(raw);requests.push(message);
      if(message.requestId?.startsWith('automation-'))businessSocket=socket;
      if(message.type==='ping')send(socket,message,'pong',{webSocketAcceptedCount:1,webSocketRoundTripCount:1});
      if(message.type==='get_routines')send(socket,message,'routines_state',{items:clone(items)});
      if(message.type==='get_routine_scheduler_status')send(socket,message,'routine_scheduler_status',{enabled:true,lastError:null});
      if(message.type==='preview_routine')send(socket,message,'routine_preview',{...clone(fixtures.automation.preview),scheduleText:`매주 월, 수, 금 ${message.scheduleTime}`,warnings:[]});
      if(message.type==='create_routine'){heldCreate=message;if(!holdCreate){items=[summary(message)];send(socket,message,'routine_result',{ok:true,routine:items[0]});}}
      if(message.type==='update_routine'){if(rejectEdit){rejectEdit=false;send(socket,message,'routine_result',{ok:false,message:'모의 저장 오류. 입력을 확인해 주세요.'});}else{items=[summary(message,items[0])];send(socket,message,'routine_result',{ok:true,routine:items[0]});}}
      if(message.type==='toggle_routine'){items[0].enabled=message.enabled;send(socket,message,'routine_result',{ok:true,routine:clone(items[0])});}
      if(message.type==='run_routine'){
        items[0].running=false;items[0].lastStatus='ok';items[0].runs=[{...clone(fixtures.automation.run.runs[0]),ts:latestTime,status:'ok',summary:'오늘 확인한 소식을 정리했습니다.',error:null},{...clone(fixtures.automation.run.runs[0]),ts:olderTime,status:'ok',summary:'이전 실행 결과',error:null}];
        send(socket,message,'routine_result',{ok:true,routine:clone(items[0])});
      }
      if(message.type==='get_routine_run_detail'){if(holdDetail)pendingDetails.push(message);else socket.send(JSON.stringify(detail(message)));}
      if(message.type==='delete_routine'){items=[];send(socket,message,'routine_result',{ok:true});}
      if(message.type==='resend_routine_run_telegram')send(socket,message,'routine_result',{ok:true,routine:clone(items[0])});
    });
  });
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):41880\//, route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true}'}));
  await page.route("**/media", route=>route.fulfill({contentType:"application/json",body:"null"}));
  await page.reload();
  await page.evaluate(()=>{window.__automationImport=path=>{
    const urls=performance.getEntriesByType('resource').map(entry=>new URL(entry.name)).filter(url=>url.pathname===path).sort((a,b)=>Number(b.searchParams.get('t')||0)-Number(a.searchParams.get('t')||0));return import(urls[0]?.href||path);
  };});
  await page.evaluate(async()=>{
    (await window.__automationImport('/src/features/auth/auth-store.ts')).useDesktopAuthStore.setState(state=>({auth:{...state.auth,status:'authenticated'}}));
    (await window.__automationImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light');
    (await window.__automationImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('automate');
    window.__automationStore=(await window.__automationImport('/src/features/automation-workspace/automation-state.ts')).useAutomationWorkspace;
  });
  const timezoneCheck=await page.evaluate(async()=>{
    const {parseAutomation}=await window.__automationImport('/src/features/automation-workspace/automation-model.ts');
    const value=parseAutomation({id:'time',timezoneId:'America/New_York',nextRunAtMs:Date.UTC(2026,8,8,0,0),runs:[{ts:Date.UTC(2026,8,8,0,0),runAtLocal:'다른 서버 시간'}]});
    return value.next.includes('20:00')&&value.runs[0].time.includes('20:00');
  });
  if(!timezoneCheck)throw Error('선택한 시간대의 다음 예약과 실행 시각이 다릅니다.');
  const root=page.locator('[data-surface="automation"]');await root.waitFor();
  await page.waitForFunction(()=>!window.__automationStore.getState().pending.list);
  const layouts=[];
  async function layout(state,width){
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:`output/playwright/automation-fresh-${state}-${width}.png`,animations:'disabled'});
    const geometry=await root.evaluate(element=>{
      const r=element.getBoundingClientRect(),p=element.parentElement.getBoundingClientRect();
      return{left:r.left-p.left,right:p.right-r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:[...element.querySelectorAll('button,input,select,textarea')].filter(node=>{if(!node.getClientRects().length)return false;const b=node.getBoundingClientRect();if(!(b.left<-1||b.right>innerWidth+1))return false;let parent=node.parentElement;while(parent&&parent!==element){const ox=getComputedStyle(parent).overflowX;if(ox==='auto'||ox==='scroll')return false;parent=parent.parentElement;}return true;}).map(node=>node.textContent.slice(0,40))};
    });
    if(geometry.overflow||geometry.outside.length||Math.abs(geometry.left-geometry.right)>1)throw Error(JSON.stringify({state,width,...geometry}));
    layouts.push({state,width,...geometry});
  }
  for(const width of [1440,768,390,320])await layout('empty',width);
  await root.getByRole('button',{name:'새 자동화',exact:true}).click();
  const form=root.getByRole('region',{name:'자동화 작성',exact:true});await form.waitFor();
  if(await form.getByLabel('자동화 이름',{exact:true}).isVisible())throw Error('추가 설정이 기본으로 노출됩니다.');
  await form.getByRole('textbox',{name:'자동으로 할 일',exact:true}).fill('매일 오전 8시 요청이지만 선택한 시간에 소식을 정리해 주세요.');
  await form.getByRole('combobox',{name:'반복',exact:true}).selectOption('weekly');
  await form.getByLabel('실행 시간',{exact:true}).fill('17:40');
  await form.getByRole('checkbox',{name:'화',exact:true}).uncheck();await form.getByRole('checkbox',{name:'목',exact:true}).uncheck();
  for(const width of [1440,768,390,320])await layout('form',width);
  const advanced=form.locator('summary').filter({hasText:'이름과 추가 설정'});await advanced.focus();await advanced.press('Enter');
  await form.getByLabel('자동화 이름',{exact:true}).fill('나의 소식 모으기');
  await form.getByRole('combobox',{name:'실행 방식',exact:true}).selectOption('web');
  await form.getByLabel('실패 시 재시도',{exact:true}).fill('0');
  await form.getByRole('button',{name:'시간 확인',exact:true}).click();
  await page.waitForFunction(()=>!!window.__automationStore.getState().preview);
  await layout('advanced',320);await advanced.press('Space');
  await form.getByRole('button',{name:'자동화 저장',exact:true}).click();
  await page.waitForFunction(()=>!!window.__automationStore.getState().pending.change);
  await layout('saving',320);
  const submitted=heldCreate;
  if(!submitted||submitted.runImmediately!==false||submitted.scheduleSourceMode!=='manual'||submitted.scheduleTime!=='17:40'||submitted.weekdays.join(',')!=='1,3,5'||submitted.notifyTelegram!==false)throw Error('저장 요청이 폼과 다릅니다.');
  await page.evaluate(async()=>(await window.__automationImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('home'));
  holdCreate=false;items=[summary(submitted)];send(businessSocket,submitted,'routine_result',{ok:true,routine:items[0]});
  await page.waitForFunction(()=>!!window.__automationStore.getState().selectedId&&!window.__automationStore.getState().pending.change);
  await page.evaluate(async()=>(await window.__automationImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('automate'));
  const selected=root.getByRole('region',{name:'선택한 자동화'});await selected.waitFor();
  await root.locator('summary').filter({hasText:/^저장한 자동화/}).click();
  await root.getByRole('combobox',{name:'자동화 선택',exact:true}).selectOption('');
  const catalog=root.getByRole('region',{name:'저장한 자동화',exact:true});await catalog.waitFor();
  await catalog.getByRole('button',{name:'나의 소식 모으기 예약 끄기',exact:true}).click();
  await page.waitForFunction(()=>window.__automationStore.getState().items[0]?.enabled===false);
  if(await page.evaluate(()=>window.__automationStore.getState().selectedId))throw Error('예약 토글이 상세 화면으로 이동했습니다.');
  for(const width of [1440,768,390,320])await layout('list',width);
  await catalog.getByRole('button',{name:/^나의 소식 모으기 다음|^나의 소식 모으기 예약 꺼짐/}).click();
  await selected.waitFor();
  await selected.getByRole('button',{name:'예약 켜기',exact:true}).click();
  await selected.getByRole('button',{name:'편집',exact:true}).click();
  const edit=root.getByRole('region',{name:'자동화 편집',exact:true});await edit.waitFor();
  await edit.getByRole('textbox',{name:'자동으로 할 일',exact:true}).fill('수정 중인 요청은 저장이 실패해도 그대로 남겨 주세요.');
  await edit.getByRole('button',{name:'변경 저장',exact:true}).click();
  await root.getByRole('alert').filter({hasText:'모의 저장 오류'}).waitFor();
  if(await edit.getByRole('textbox',{name:'자동으로 할 일',exact:true}).inputValue()!=='수정 중인 요청은 저장이 실패해도 그대로 남겨 주세요.')throw Error('실패한 편집 입력을 잃었습니다.');
  await layout('error',320);
  await edit.getByRole('button',{name:'변경 저장',exact:true}).click();await selected.waitFor();
  await selected.getByRole('button',{name:'예약 끄기',exact:true}).click();
  await selected.getByRole('button',{name:'예약 켜기',exact:true}).waitFor();
  await selected.getByRole('button',{name:'지금 실행',exact:true}).click();
  await selected.getByLabel('실행 결과',{exact:true}).waitFor();
  if(await selected.getByRole('combobox',{name:'실행 선택',exact:true}).isVisible()||await selected.getByRole('button',{name:'자동화 삭제',exact:true}).isVisible())throw Error('상세 관리가 기본으로 펼쳐져 있습니다.');
  for(const width of [1440,768,390,320])await layout('result',width);
  const history=selected.locator('summary').filter({hasText:/^이전 실행 기록/});await history.click();
  holdDetail=true;
  await selected.getByRole('combobox',{name:'실행 선택',exact:true}).selectOption(String(olderTime));
  await page.waitForFunction(()=>window.__automationStore.getState().pending.detail?.fields.timestamp===window.__automationStore.getState().selectedTime);
  await selected.getByRole('combobox',{name:'실행 선택',exact:true}).selectOption(String(latestTime));
  await page.waitForFunction(()=>window.__automationStore.getState().pending.detail?.fields.timestamp===window.__automationStore.getState().selectedTime);
  const current=pendingDetails.find(message=>message.timestamp===latestTime),stale=pendingDetails.find(message=>message.timestamp===olderTime);
  if(!current||!stale)throw Error('서로 다른 출력 요청이 필요합니다.');
  businessSocket.send(JSON.stringify(detail(current)));businessSocket.send(JSON.stringify(detail(stale)));
  await page.waitForFunction(()=>window.__automationStore.getState().detail?.content.startsWith('오늘 확인한'));
  if(await selected.getByLabel('실행 결과',{exact:true}).textContent()==='이전 실행에서 저장한 결과입니다.')throw Error('늦은 응답이 선택을 덮어썼습니다.');
  holdDetail=false;await selected.getByRole('combobox',{name:'실행 선택',exact:true}).selectOption(String(olderTime));
  await selected.getByLabel('실행 결과',{exact:true}).getByText('이전 실행에서 저장한 결과입니다.',{exact:true}).waitFor();
  await layout('history',390);
  if(await selected.locator('.automation-raw-record:visible').count())throw Error('원본 내부 기록이 기본으로 펼쳐져 있습니다.');
  if((await selected.getByLabel('실행 결과',{exact:true}).textContent()).includes('routineId:'))throw Error('결과에 내부 메타데이터가 섞였습니다.');
  const manage=selected.locator('summary').filter({hasText:'상세 정보와 관리'});await manage.click();
  for(const width of [1440,768,390,320])await layout('details',width);
  await selected.getByRole('button',{name:'자동화 삭제',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'자동화 삭제',exact:true});await dialog.waitFor();await layout('dialog',320);
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  if(requests.some(message=>message.type==='delete_routine'))throw Error('삭제 취소가 삭제를 보냈습니다.');
  await manage.click();await history.click();
  for(const theme of ['dark','glass']){await page.evaluate(async theme=>(await window.__automationImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme(theme),theme);await layout(theme,390);}
  await page.evaluate(async()=>(await window.__automationImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light'));
  await manage.click();await selected.getByRole('button',{name:'자동화 삭제',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();
  await page.waitForFunction(()=>!window.__automationStore.getState().selectedId&&!window.__automationStore.getState().items.length);
  await root.getByRole('button',{name:'새 자동화',exact:true}).click();
  await root.getByRole('textbox',{name:'자동으로 할 일',exact:true}).fill('연결이 끊겨도 작성한 내용은 유지되어야 합니다.');
  await page.evaluate(async()=>(await window.__automationImport('/src/shell-store.ts')).useDesktopShellStore.getState().markBridgeStatus('closed'));
  await root.getByText('서버에 연결하면 자동화를 불러올 수 있습니다.',{exact:true}).waitFor();
  if(await root.getByRole('button',{name:'자동화 저장',exact:true}).isEnabled())throw Error('연결 없이 저장할 수 있습니다.');
  await layout('offline',320);
  await page.evaluate(async()=>(await window.__automationImport('/src/shell-store.ts')).useDesktopShellStore.getState().markBridgeStatus('connected'));
  await page.waitForFunction(()=>!window.__automationStore.getState().pending.list);
  if(await root.getByRole('textbox',{name:'자동으로 할 일',exact:true}).inputValue()!=='연결이 끊겨도 작성한 내용은 유지되어야 합니다.')throw Error('재연결로 입력을 잃었습니다.');
  await page.evaluate(async()=>(await window.__automationImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('automate',{create:true,input:'빠른 시작에서 전달한 자동화 요청입니다.'}));
  await root.getByRole('alert').filter({hasText:'작성 중인 자동화가 있습니다.'}).waitFor();
  if(await root.getByRole('textbox',{name:'자동으로 할 일',exact:true}).inputValue()!=='연결이 끊겨도 작성한 내용은 유지되어야 합니다.')throw Error('전달받은 요청이 기존 초안을 덮어썼습니다.');
  await root.getByRole('button',{name:'취소',exact:true}).click();
  await page.waitForFunction(()=>window.__automationStore.getState().form.request==='빠른 시작에서 전달한 자동화 요청입니다.');
  await layout('handoff',320);
  if(requests.some(message=>message.type.startsWith('llm_')||message.type.startsWith('grok_login')))throw Error('추론/로그인 요청을 보내면 안 됩니다.');
  return {checks:layouts.length,layouts,operations:requests.filter(message=>message.requestId?.startsWith('automation-')).map(message=>message.type)};
}
