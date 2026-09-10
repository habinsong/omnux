// 새 작업 화면의 브라우저 회귀 검사. 서버 응답을 모의 처리하며 LLM/OAuth를 호출하지 않는다.
async (page) => {
  await page.goto('http://127.0.0.1:1420/');
  await page.route('**/task-workspace-fixtures', route => route.fulfill({path:'output/playwright/grok-gateway-fixtures.json',contentType:'application/json'}));
  const fixture = await page.evaluate(async () => (await fetch('/task-workspace-fixtures')).json());
  const clone = value => JSON.parse(JSON.stringify(value));
  let run = clone(fixture.tasks.snapshot), catalog = false, socketRef = null, holdOutput = false, holdCreate = true, heldCreate = null, rejectUpdate = true;
  const requests = [], pendingOutputs = [];
  let plan = {
    planId:run.graph.sourcePlanId,title:'새 작업 화면 검증',objective:'파일을 만들고 실행 결과를 확인합니다.',status:'Draft',constraints:['실행 결과를 확인할 것'],
    steps:[{stepId:'first',title:'파일 구현',description:'필요한 파일을 만듭니다.',mustDo:['기존 내용을 확인합니다.'],mustNotDo:['요청 밖 변경을 하지 않습니다.'],verification:['실제 실행을 확인합니다.']}],decisionLog:[]
  };
  let review = null, execution = null;
  const snapshot = () => ({plan:clone(plan),review:clone(review),execution:clone(execution)});
  function send(socket, message, type, payload, action) {socket.send(JSON.stringify({type,requestId:message.requestId,payload,...(action?{action}:{})}));}
  function output(message) {
    const data = clone(message.timestamp === Date.parse(fixture.tasks.oldOutput.payload.execution.startedAtUtc) ? fixture.tasks.oldOutput : fixture.tasks.latestOutput);
    data.requestId = message.requestId;data.payload.taskId=message.taskId;data.payload.execution.taskId=message.taskId;return data;
  }
  await page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//, socket => {
    socket.send(JSON.stringify({type:'auth_result',ok:true}));
    socket.onMessage(raw => {
      const message = JSON.parse(raw);requests.push(message);
      if(message.requestId?.startsWith('task-workspace-')) socketRef=socket;
      if(message.type==='ping') socket.send(JSON.stringify({type:'pong',webSocketAcceptedCount:1,webSocketRoundTripCount:1}));
      if(message.type==='plan_list') send(socket,message,'plan_list_result',{items:catalog?[plan]:[]});
      if(message.type==='task_graph_list') send(socket,message,'task_graph_list_result',{items:execution?[{...run.graph,totalNodes:run.graph.nodes.length}]:[]});
      if(message.type==='plan_get') {if(plan.status==='Running'&&String(run.graph.status).toLowerCase()==='completed'){plan.status='Completed';execution.status='ok';}send(socket,message,'plan_result',{ok:true,snapshot:snapshot()},'get');}
      if(message.type==='plan_create') {catalog=true;plan.objective=message.text;plan.constraints=message.constraints;if(holdCreate)heldCreate=message;else send(socket,message,'plan_result',{ok:true,message:'계획을 작성했습니다.',snapshot:snapshot()},'create');}
      if(message.type==='plan_update') {if(rejectUpdate){rejectUpdate=false;send(socket,message,'plan_result',{ok:false,message:'모의 저장 오류. 입력은 유지됩니다.'},'update');}else{plan={...plan,...message.plan,status:'Draft'};review=null;send(socket,message,'plan_result',{ok:true,message:'변경했습니다.',snapshot:snapshot()},'update');}}
      if(message.type==='plan_review') {review={summary:'검증을 포함한 계획입니다.',findings:['파일 경로를 확인합니다.'],risks:[],missingVerification:['실행 출력 확인'],approvedRecommendation:true,reviewerRoute:'fixture'};plan.status='ReviewPending';send(socket,message,'plan_result',{ok:true,snapshot:snapshot()},'review');}
      if(message.type==='plan_approve') {plan.status='Approved';send(socket,message,'plan_result',{ok:true,snapshot:snapshot()},'approve');}
      if(message.type==='plan_run') {plan.status='Running';execution={status:'running',message:'실행을 시작했습니다.',conversationId:run.graph.graphId};run.graph.status='Running';run.graph.nodes[0].status='Running';run.graph.nodes[1].status='Blocked';send(socket,message,'plan_result',{ok:true,snapshot:snapshot()},'run');}
      if(message.type==='task_graph_get') send(socket,message,'task_graph_result',{ok:true,snapshot:clone(run)},'get');
      if(message.type==='task_cancel') {run.graph.status='Canceled';run.graph.nodes.forEach(node=>node.status='Canceled');send(socket,message,'task_graph_result',{ok:true,snapshot:clone(run)},'cancel');}
      if(message.type==='task_graph_cancel') {run.graph.status='Canceled';run.graph.nodes.forEach(node=>node.status='Canceled');send(socket,message,'task_graph_result',{ok:true,snapshot:clone(run)},'stop');}
      if(message.type==='task_retry'||message.type==='task_resume') {run.graph.status='Running';run.graph.nodes[0].status='Running';run.graph.nodes[1].status='Blocked';send(socket,message,'task_graph_result',{ok:true,snapshot:clone(run)},message.type==='task_retry'?'retry':'resume');}
      if(message.type==='task_graph_update') {run.graph.nodes=message.graph.nodes.map(node=>({...node,status:'Pending'}));run.graph.status='Draft';send(socket,message,'task_graph_result',{ok:true,snapshot:clone(run)},'update');}
      if(message.type==='task_output_get') {if(holdOutput)pendingOutputs.push(message);else socket.send(JSON.stringify(output(message)));}
      if(message.type==='get_conversation') socket.send(JSON.stringify(fixture.tasks.conversation));
      if(message.type==='list_conversations') socket.send(JSON.stringify({type:'conversations',scope:message.scope,mode:message.mode,items:[]}));
    });
  });
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):41880\/(healthz|readyz)/, route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true}'}));
  await page.route('**/api/coding-preview/**', route=>route.fulfill({contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:'print("fixture")'}));
  await page.reload();
  await page.evaluate(()=>{window.__taskImport=path=>{
    const paths=performance.getEntriesByType('resource').map(entry=>new URL(entry.name)).filter(url=>url.pathname===path).sort((a,b)=>Number(b.searchParams.get('t')||0)-Number(a.searchParams.get('t')||0));
    return import(paths[0]?.href||path);
  };});
  await page.evaluate(async()=>{
    (await window.__taskImport('/src/features/auth/auth-store.ts')).useDesktopAuthStore.setState(state=>({auth:{...state.auth,status:'authenticated'}}));
    (await window.__taskImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('light');
    (await window.__taskImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('planning');
    window.__taskStore=(await window.__taskImport('/src/features/task-workspace/task-workspace-state.ts')).useTaskWorkspace;
  });
  const root = page.locator('[data-surface="tasks"]');await root.waitFor();
  const layouts=[];
  async function layout(state,width) {
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:`output/playwright/task-fresh-${state}-${width}.png`,animations:'disabled'});
    const geometry=await root.evaluate(element=>{
      const r=element.getBoundingClientRect(),p=element.parentElement.getBoundingClientRect();
      return {left:r.left-p.left,right:p.right-r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,outside:[...element.querySelectorAll('button,input,select,textarea')].filter(node=>{if(!node.getClientRects().length)return false;const b=node.getBoundingClientRect();if(!(b.left<-1||b.right>innerWidth+1))return false;let parent=node.parentElement;while(parent&&parent!==element){const ox=getComputedStyle(parent).overflowX;if(ox==='auto'||ox==='scroll')return false;parent=parent.parentElement;}return true;}).map(node=>node.textContent.slice(0,40))};
    });
    if(geometry.overflow||geometry.outside.length||Math.abs(geometry.left-geometry.right)>1)throw Error(JSON.stringify({state,width,...geometry}));
    layouts.push({state,width,...geometry});
  }
  for(const width of [1440,768,390,320]) await layout('empty',width);
  await page.setViewportSize({width:1440,height:1000});
  await root.getByLabel('만들고 싶은 결과',{exact:true}).fill('파일을 만들고 실행 결과를 정확히 확인해 주세요.');
  const advanced=root.locator('summary').filter({hasText:'조건과 계획 방식'});await advanced.focus();await advanced.press('Enter');
  await root.getByLabel('지켜야 할 조건',{exact:true}).fill('기존 파일 확인\n실행 검증');
  await root.getByRole('combobox',{name:'계획 방식',exact:true}).selectOption('interview');
  await advanced.press('Space');
  await root.getByRole('button',{name:'계획 만들기',exact:true}).click();
  await root.getByText('계획을 작성하고 있습니다.',{exact:true}).waitFor();
  await layout('loading',320);
  socketRef.send(JSON.stringify({type:'error',requestId:'unrelated',requestType:'get_grok_models',message:'별도 모의 오류'}));
  await page.evaluate(async()=>(await window.__taskImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('ask'));
  const currentCreation=await page.evaluate(()=>window.__taskStore.getState().pending.mutation?.id);
  if(heldCreate?.requestId!==currentCreation)throw Error(JSON.stringify({held:heldCreate?.requestId,current:currentCreation}));
  holdCreate=false;send(socketRef,heldCreate,'plan_result',{ok:true,message:'계획을 작성했습니다.',snapshot:snapshot()},'create');
  await page.waitForFunction(()=>!!window.__taskStore.getState().plan);
  await page.evaluate(async()=>(await window.__taskImport('/src/features/shell/navigation-store.ts')).useDesktopNavigationStore.getState().setActivePage('planning'));
  await page.setViewportSize({width:1440,height:1000});
  const selectedPlan=root.getByRole('region',{name:'선택한 계획'});await selectedPlan.waitFor();
  const create=requests.find(message=>message.type==='plan_create');
  if(create.mode!=='interview'||create.constraints.length!==2)throw Error('new plan form lost fields');
  await selectedPlan.getByRole('button',{name:'계획 편집',exact:true}).click();
  await selectedPlan.getByLabel('계획 이름',{exact:true}).fill('수정한 계획 이름');
  await selectedPlan.getByRole('button',{name:'변경 저장',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'계획 변경'});await dialog.waitFor();
  await dialog.getByRole('button',{name:'변경 저장',exact:true}).click();
  await root.getByRole('alert').filter({hasText:'모의 저장 오류'}).waitFor();
  if(await selectedPlan.getByLabel('계획 이름',{exact:true}).inputValue()!=='수정한 계획 이름')throw Error('rejected save lost edit');
  await layout('error',320);
  await selectedPlan.getByRole('button',{name:'변경 저장',exact:true}).click();
  await layout('dialog',320);
  await page.getByRole('dialog',{name:'계획 변경'}).getByRole('button',{name:'변경 저장',exact:true}).click();
  await selectedPlan.getByRole('heading',{name:'수정한 계획 이름',exact:true}).waitFor();
  await selectedPlan.locator('summary').filter({hasText:'검토와 실행 설정'}).click();
  await selectedPlan.getByRole('button',{name:'검토 요청',exact:true}).click();
  await selectedPlan.getByText('검증을 포함한 계획입니다.',{exact:true}).waitFor();
  await selectedPlan.locator('summary').filter({hasText:'검토와 실행 설정'}).click();
  for(const width of [1440,768,390,320])await layout('plan',width);
  await selectedPlan.getByRole('button',{name:'이 계획으로 실행',exact:true}).click();
  const runPanel=root.getByRole('region',{name:'실행 작업'});await runPanel.waitFor();
  if(!requests.some(message=>message.type==='plan_approve')||!requests.some(message=>message.type==='plan_run'))throw Error('one action did not approve and start the plan');
  await runPanel.getByRole('button',{name:'작업 중단',exact:true}).click();
  await runPanel.getByRole('button',{name:'남은 작업 이어가기',exact:true}).click();
  run=clone(fixture.tasks.snapshot);
  for(const node of run.graph.nodes)socketRef.send(JSON.stringify({type:'task_updated',graphId:run.graph.graphId,task:node}));
  await page.waitForFunction(()=>window.__taskStore.getState().run?.status==='completed');
  if(await runPanel.getByRole('button',{name:'남은 작업 이어가기',exact:true}).count())throw Error('completed run can resume');
  await page.waitForFunction(()=>window.__taskStore.getState().output?.stepId==='verify');
  await runPanel.getByLabel('프로그램 출력',{exact:true}).waitFor();
  if(await runPanel.locator('.task-technical-record:visible').count())throw Error('technical logs exposed by default');
  if(await runPanel.locator('.task-run-steps:visible').count())throw Error('step controls exposed by default');
  for(const width of [1440,768,390,320])await layout('result',width);
  await runPanel.locator('summary').filter({hasText:/^진행 상세$/}).click();
  await runPanel.getByRole('button',{name:'결과 보기',exact:true}).first().click();
  const outputPanel=root.getByRole('region',{name:'선택한 단계 출력'});await outputPanel.waitFor();
  await outputPanel.locator('summary').filter({hasText:/^이전 실행 결과$/}).click();
  const time=Date.parse(fixture.tasks.oldOutput.payload.execution.startedAtUtc);
  await outputPanel.getByRole('combobox',{name:'실행 기록',exact:true}).selectOption(String(time));
  await page.waitForFunction(()=>window.__taskStore.getState().output?.status==='canceled');
  const readCount=requests.filter(message=>message.type==='task_output_get').length;
  socketRef.send(JSON.stringify({type:'task_updated',graphId:run.graph.graphId,task:run.graph.nodes[0]}));
  await runPanel.getByRole('heading',{name:'결과',exact:true}).waitFor();
  if(requests.filter(message=>message.type==='task_output_get').length!==readCount)throw Error('history output changed on background update');
  for(const width of [1440,768,390,320])await layout('history',width);
  holdOutput=true;
  await outputPanel.getByRole('combobox',{name:'실행 기록',exact:true}).selectOption('');
  await outputPanel.getByRole('combobox',{name:'실행 기록',exact:true}).selectOption(String(time));
  if(pendingOutputs.length!==2)throw Error('output requests missing');
  socketRef.send(JSON.stringify(output(pendingOutputs[0])));
  socketRef.send(JSON.stringify(output(pendingOutputs[1])));
  await page.waitForFunction(()=>window.__taskStore.getState().output?.status==='canceled'&&!window.__taskStore.getState().pending.output);
  holdOutput=false;
  await page.setViewportSize({width:1440,height:1000});
  await runPanel.locator('summary').filter({hasText:/^실행 설정$/}).click();
  await runPanel.getByRole('button',{name:'단계 편집',exact:true}).click();
  const first=root.getByRole('region',{name:'실행 단계 1',exact:true});
  await first.getByRole('checkbox',{name:'파일 검증',exact:true}).check();
  await root.getByRole('button',{name:'단계 저장',exact:true}).click();
  await root.getByRole('alert').filter({hasText:'선행 단계가 순환합니다.'}).waitFor();
  await first.getByRole('checkbox',{name:'파일 검증',exact:true}).uncheck();
  await first.locator('summary').filter({hasText:'필요한 스킬과 도구'}).click();
  await first.getByLabel('스킬',{exact:true}).fill('first-skill, second-skill');
  await first.getByLabel('도구',{exact:true}).fill('read_file, run');
  for(const width of [1440,768,390,320])await layout('editor',width);
  await root.getByRole('button',{name:'단계 저장',exact:true}).click();
  await page.getByRole('dialog',{name:'실행 단계 변경'}).getByRole('button',{name:'단계 저장',exact:true}).click();
  await page.waitForFunction(()=>!window.__taskStore.getState().pending.mutation&&!window.__taskStore.getState().editingSteps);
  const edited=requests.filter(message=>message.type==='task_graph_update').at(-1);
  if(edited.graph.nodes[0].requiredSkills.length!==2||edited.graph.nodes[0].requiredTools.length!==2)throw Error('step fields lost');
  await page.evaluate(async()=>(await window.__taskImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('dark'));await layout('dark',390);
  await page.evaluate(async()=>(await window.__taskImport('/src/features/shell/preference-store.ts')).useDesktopPreferenceStore.getState().setTheme('glass'));await layout('glass',390);
  return {layouts,creation:true,backgroundCreation:true,rejectedEditPreserved:true,nativeDisclosureKeyboard:true,planEdit:true,review:true,approveAndRun:true,stopWholeRun:true,resume:true,attemptSelection:true,lateOutputIgnored:true,dependencyCycleRejected:true,stepFieldsPreserved:true};
}
