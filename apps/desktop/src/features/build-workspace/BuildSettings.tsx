import { useBuildWorkspace, busyBuild } from "./build-state";
import { modelOptions, modeNames, providers, type BuildMode, type BuildProvider, type ModelProvider } from "./build-model";

export function BuildSettings({ connected }: { connected: boolean }) {
  const state = useBuildWorkspace(), settings = state.settings;
  const busy = busyBuild(state);
  const options = settings.provider === "auto" ? [] : Array.from(new Set([settings.models[settings.provider], ...modelOptions(settings.provider, state.catalogs)])).filter(Boolean);
  // 화면이 탭으로 갈려 있으므로 여기서 다시 접지 않는다.
  return <fieldset disabled={busy} className="build-form-fields">
      <div className="build-field-columns">
        <label>작업 방식<select disabled={Boolean(state.activeId)} value={settings.mode} onChange={event => state.patchSettings({ mode: event.target.value as BuildMode })}>{Object.entries(modeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>담당 모델 제공자<select value={settings.provider} onChange={event => state.patchSettings({ provider: event.target.value as BuildProvider })}>{providers.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
        {settings.provider !== "auto" && <label>담당 모델<select value={settings.models[settings.provider]} onChange={event => state.patchSettings({ models: { ...settings.models, [settings.provider]: event.target.value } })}>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      </div>
      {settings.mode !== "single" && <fieldset className="build-worker-options"><legend>함께 작업할 모델</legend><p className="build-muted">사용할 모델만 선택해 주세요.</p><div className="build-field-columns">{providers.filter(provider => provider.value !== "auto").map(provider => {
        const key = provider.value as ModelProvider;
        const items = Array.from(new Set([settings.workers[key], ...modelOptions(key, state.catalogs)])).filter(value => value && value !== "none");
        return <label key={key}>{provider.label} 보조 모델<select value={settings.workers[key]} onChange={event => state.patchSettings({ workers: { ...settings.workers, [key]: event.target.value } })}><option value="none">사용 안 함</option>{items.map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
      })}</div></fieldset>}
      <div className="build-field-columns"><label>언어<select value={settings.language} onChange={event => state.patchSettings({ language: event.target.value })}>{["auto", "python", "typescript", "javascript", "html", "css", "bash", "c", "cpp", "csharp", "java", "kotlin"].map(value => <option key={value} value={value}>{value === "auto" ? "요청에 맞게 선택" : value}</option>)}</select></label><label>빌드 이름<input value={settings.title} onChange={event => state.patchSettings({ title: event.target.value })} placeholder="비워 두면 요청에서 정합니다." /></label><label>작업 폴더<select value={settings.projectKey} disabled={Boolean(state.activeId) || !connected || Boolean(state.pending.projects)} onChange={event => { const project = state.projects.find(item => item.key === event.target.value); state.patchSettings({ projectKey: project?.key || "", project: project?.name || "", projectPath: project?.path || "", skill: "" }); }}><option value="">새 작업 폴더</option>{settings.projectKey && !state.projects.some(project => project.key === settings.projectKey) && <option value={settings.projectKey}>{settings.project || settings.projectKey}</option>}{state.projects.map(project => <option key={project.key} value={project.key}>{project.name}</option>)}</select></label></div>
      {settings.projectKey && <p className="build-muted">{settings.projectPath}<br />{settings.mode === "multi" ? "모델별 복사본에서 비교한 뒤 선택한 결과를 이 폴더에 반영합니다." : "이 프로젝트 폴더의 파일을 수정하고 실행합니다."}</p>}
      <div className="build-checks"><label><input type="checkbox" checked={settings.webSearch} onChange={event => state.patchSettings({ webSearch: event.target.checked })} />웹 자료도 참고하기</label><label><input type="checkbox" checked={settings.think} onChange={event => state.patchSettings({ think: event.target.checked })} />추가 검토하기</label></div>
      <div className="build-actions"><button type="button" className="build-button build-quiet" disabled={!connected} onClick={state.loadModels}>모델 목록 새로고침</button>{state.activeId && <button type="button" className="build-button" disabled={!connected} onClick={state.saveMeta}>이름·프로젝트 저장</button>}</div>
  </fieldset>;
}
