/* omnux — Projects + Activity screens */
(function () {
  const I = window.Icons;
  const t = (s) => window.t(s);

  function projectFromRuntime(item) {
    return {
      id: item.projectKey || item.id || item.name,
      projectKey: item.projectKey || item.id || '',
      name: item.name || item.project || 'Project',
      description: item.description || '등록된 로컬 프로젝트',
      path: item.path || item.filePath || '',
      color: item.color || '#2563EB',
      isMain: !!item.isMain,
      runs: Number(item.runs || 0),
      automations: Number(item.automations || 0),
      lastOpened: item.lastOpenedUtc ? new Date(item.lastOpenedUtc).toLocaleString() : '등록됨',
    };
  }

  function getProjects(ctx) {
    const items = Array.isArray(ctx.runtime?.projects) ? ctx.runtime.projects : [];
    return items.map(projectFromRuntime);
  }

  function refreshProjects(ctx) {
    if (!ctx.send({ type: 'projects_list' }, { queueIfClosed: true })) {
      ctx.toast('미들웨어 연결이 필요합니다.');
    }
  }

  function addProject(ctx) {
    const path = window.prompt('등록할 로컬 프로젝트 폴더 경로');
    if (!path || !path.trim()) return;
    const title = window.prompt('프로젝트 이름', path.trim().split(/[\\/]/).filter(Boolean).pop() || 'Project');
    const sent = ctx.send({
      type: 'project_create',
      title: title && title.trim() ? title.trim() : undefined,
      filePath: path.trim(),
    }, { queueIfClosed: true });
    if (!sent) {
      ctx.toast('미들웨어 연결이 필요합니다.');
    }
  }

  function deleteProject(ctx, project) {
    if (!project || !project.projectKey) return;
    if (!window.confirm(`"${project.name}" 프로젝트 등록을 삭제할까요?`)) return;
    const sent = ctx.send({ type: 'project_delete', projectKey: project.projectKey }, { queueIfClosed: true });
    if (!sent) {
      ctx.toast('미들웨어 연결이 필요합니다.');
    }
  }

  function updateProject(ctx, project) {
    if (!project || !project.projectKey) return;
    const nextName = window.prompt('프로젝트 이름', project.name || '');
    if (nextName === null) return;
    const nextPath = window.prompt('프로젝트 폴더 경로', project.path || '');
    if (nextPath === null) return;
    const nextDescription = window.prompt('프로젝트 설명', project.description || '');
    if (nextDescription === null) return;
    const sent = ctx.send({
      type: 'project_update',
      projectKey: project.projectKey,
      title: nextName.trim(),
      filePath: nextPath.trim(),
      message: nextDescription.trim(),
    }, { queueIfClosed: true });
    if (!sent) {
      ctx.toast('미들웨어 연결이 필요합니다.');
    }
  }

  function setMainProject(ctx, project) {
    if (!project || !project.projectKey || project.isMain) return;
    const sent = ctx.send({
      type: 'project_update',
      projectKey: project.projectKey,
      enabled: true,
    }, { queueIfClosed: true });
    if (!sent) {
      ctx.toast('미들웨어 연결이 필요합니다.');
    }
  }

  function ProjectsPage({ ctx }) {
    const projects = getProjects(ctx);
    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { className: 'page-wide page-wide-projects' },
            React.createElement('div', { className: 'between' },
              React.createElement('div', null,
                React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' } }, t('Projects')),
                React.createElement('p', { className: 'muted', style: { fontSize: 14, marginTop: 2 } }, t('Local folders omnux can read, edit and automate.')),
              ),
              React.createElement('button', { className: 'btn primary', onClick: () => addProject(ctx) }, I.plus({ size: 16 }), t('Add project')),
            ),
            React.createElement('div', { className: 'mt20 projects-grid', style: { display: 'grid', gap: 16 } },
              projects.map(p =>
                React.createElement('div', { key: p.id, className: 'card card-pad', style: { cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14 }, onClick: () => ctx.openProject(p) },
                  React.createElement('div', { className: 'between' },
                    React.createElement('div', { className: 'proj-ico', style: { background: p.color + '1a', color: p.color, width: 46, height: 46 } }, I.folder({ size: 22 })),
                    p.isMain ? React.createElement('span', { className: 'badge soft', style: { color: 'var(--accent-text)', background: 'var(--accent-soft)' } }, t('Main')) : React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, title: '삭제', onClick: (e) => { e.stopPropagation(); deleteProject(ctx, p); } }, I.trash ? I.trash({ size: 16 }) : I.x({ size: 16 })),
                  ),
                  React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' } }, p.name),
                    React.createElement('div', { className: 'muted', style: { fontSize: 13, marginTop: 3 } }, t(p.description)),
                    React.createElement('div', { className: 'faint mono', style: { fontSize: 11.5, marginTop: 8 } }, p.path),
                  ),
                  React.createElement('div', { className: 'items-center', style: { gap: 18, paddingTop: 12, borderTop: '1px solid var(--border)' } },
                    React.createElement('div', null, React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, p.runs), React.createElement('div', { className: 'faint', style: { fontSize: 11.5 } }, t('runs'))),
                    React.createElement('div', null, React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, p.automations), React.createElement('div', { className: 'faint', style: { fontSize: 11.5 } }, t('automations'))),
                    React.createElement('div', { className: 'spacer' }),
                    React.createElement('div', { className: 'faint', style: { fontSize: 11.5 } }, t(p.lastOpened)),
                  ),
                  React.createElement('div', { className: 'items-center gap8' },
                    React.createElement('button', { className: 'btn sm', style: { flex: 1 }, onClick: (e) => { e.stopPropagation(); ctx.setRoute('ask'); } }, I.ask({ size: 14 }), t('Ask')),
                    React.createElement('button', { className: 'btn sm', style: { flex: 1 }, onClick: (e) => { e.stopPropagation(); ctx.setRoute('build'); } }, I.code({ size: 14 }), t('Build')),
                    React.createElement('button', { className: 'btn sm ghost', onClick: (e) => { e.stopPropagation(); updateProject(ctx, p); } }, '수정'),
                    !p.isMain ? React.createElement('button', { className: 'btn sm ghost', onClick: (e) => { e.stopPropagation(); setMainProject(ctx, p); } }, '대표') : null,
                  ),
                )
              ),
              projects.length === 0 ? React.createElement('div', { className: 'card card-pad', style: { minHeight: 180, display: 'grid', placeItems: 'center', color: 'var(--text-3)', textAlign: 'center' } },
                React.createElement('div', null,
                  React.createElement('div', { style: { marginBottom: 8 } }, I.folder({ size: 28 })),
                  React.createElement('b', { style: { color: 'var(--text-2)' } }, '등록된 프로젝트가 없습니다.'),
                  React.createElement('div', { className: 'muted', style: { fontSize: 13, marginTop: 6 } }, '로컬 폴더 경로를 등록하면 Ask, Build, Automate에서 같은 프로젝트를 사용할 수 있습니다.'),
                ),
              ) : null,
              React.createElement('button', { className: 'card card-pad', style: { borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 240, color: 'var(--text-3)' }, onClick: () => addProject(ctx) },
                React.createElement('div', { className: 'quick-ico', style: { background: 'var(--surface-2)', color: 'var(--text-3)' } }, I.plus({ size: 22 })),
                React.createElement('b', { style: { color: 'var(--text-2)' } }, t('Add a project')),
                React.createElement('span', { style: { fontSize: 12.5, textAlign: 'center', maxWidth: 180 } }, t('Point omnux at any local folder to get started.')),
              ),
            ),
          ),
        ),
      )
    );
  }

  function ActivityPage({ ctx, payload }) {
    const { filter, setFilter, filters, liveEvents, items, days } = window.useActivityPageState(ctx, payload);

    return (
      React.createElement('div', { className: 'page' },
        React.createElement('div', { className: 'col scroll page-scroll' },
          React.createElement('div', { className: 'page-wide' },
            React.createElement('div', { className: 'between' },
              React.createElement('div', null,
                React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' } }, t('Activity')),
                React.createElement('p', { className: 'muted', style: { fontSize: 14, marginTop: 2 } }, t('Everything omnux has done \u2014 runs, changes and automations.')),
              ),
              React.createElement('button', { className: 'btn', onClick: () => {
                ctx.send({ type: 'get_routines' }, { queueIfClosed: true });
                ctx.send({ type: 'get_metrics' }, { queueIfClosed: true });
              } }, I.refresh({ size: 15 }), t('Refresh')),
            ),
            React.createElement('div', { className: 'items-center gap8 mt20', style: { flexWrap: 'wrap' } },
              filters.map(f => React.createElement('button', { key: f.id, className: 'chip' + (filter === f.id ? '' : ''), style: filter === f.id ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : null, onClick: () => setFilter(f.id) }, t(f.label))),
            ),
            liveEvents.length ? React.createElement('div', { className: 'mt20' },
              React.createElement('div', { className: 'eyebrow', style: { marginBottom: 10 } }, t('Live middleware events')),
              React.createElement('div', { className: 'card' },
                liveEvents.slice(0, 6).map((event, i) =>
                  React.createElement('div', { key: event.id || i, className: 'row', style: { padding: '13px 16px', borderTop: i ? '1px solid var(--border)' : 'none', borderRadius: 0 } },
                    React.createElement('div', { style: { color: event.status === 'failed' ? 'var(--red)' : 'var(--accent)' } }, event.status === 'failed' ? I.warn({ size: 17 }) : I.route({ size: 17 })),
                    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
                      React.createElement('div', { className: 'row-title', style: { fontSize: 13.5 } }, event.title || event.type || 'event'),
                      React.createElement('div', { className: 'row-meta' }, event.detail || '-'),
                    ),
                    React.createElement('span', { className: 'row-meta' }, event.when || ''),
                  )),
              ),
            ) : null,
            days.length === 0 ? React.createElement('div', { className: 'card card-pad mt20', style: { textAlign: 'center', padding: '36px 20px' } },
              React.createElement('div', { style: { color: 'var(--text-3)', marginBottom: 10 } }, I.route({ size: 28 })),
              React.createElement('p', { className: 'muted' }, '아직 표시할 미들웨어 이벤트가 없습니다.'),
            ) : null,
            days.map(day => React.createElement('div', { key: day, className: 'mt28' },
              React.createElement('div', { className: 'eyebrow', style: { marginBottom: 10 } }, t(day)),
              React.createElement('div', { className: 'card' },
                items.filter(a => a.day === day).map((a, i) =>
                  React.createElement('div', { key: a.id, className: 'row', style: { padding: '15px 16px', borderTop: i ? '1px solid var(--border)' : 'none', borderRadius: 0, alignItems: 'flex-start' }, onClick: () => ctx.openActivity(a) },
                    React.createElement('div', { style: { paddingTop: 1 } }, React.createElement(window.ActivityStatusIcon, { status: a.status })),
                    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
                      React.createElement('div', { className: 'items-center gap8' },
                        React.createElement('span', { className: 'row-title', style: { fontSize: 14 } }, t(a.title)),
                        React.createElement(window.TypeBadge, { type: a.type }),
                      ),
                      React.createElement('div', { className: 'row-meta', style: { marginTop: 3 } }, t(a.summary), ' \u00B7 ', a.project),
                    ),
                    React.createElement('div', { className: 'items-center gap10' },
                      React.createElement(window.StatusBadge, { status: a.status }),
                      React.createElement('span', { className: 'row-meta', style: { width: 74, textAlign: 'right' } }, t(a.when)),
                    ),
                  )),
              ),
            )),
          ),
        ),
      )
    );
  }

  function ActivityDetail({ a, ctx, onClose }) {
    return (
      React.createElement('div', { className: 'overlay', onMouseDown: onClose },
        React.createElement('div', { className: 'modal', style: { width: 'min(560px,92vw)' }, onMouseDown: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'modal-head', style: { paddingBottom: 12 } },
            React.createElement('div', { className: 'modal-ico', style: { background: 'var(--surface-2)', color: 'var(--text-2)' } }, React.createElement(window.ActivityStatusIcon, { status: a.status })),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { className: 'items-center gap8' },
                React.createElement('div', { style: { fontSize: 17, fontWeight: 800 } }, t(a.title)),
                React.createElement(window.TypeBadge, { type: a.type })),
              React.createElement('div', { className: 'muted', style: { fontSize: 13, marginTop: 3 } }, a.project, ' \u00B7 ', t(a.when)),
            ),
            React.createElement('button', { className: 'icon-btn', style: { width: 32, height: 32 }, onClick: onClose }, I.x({ size: 16 })),
          ),
          React.createElement('div', { className: 'modal-body' },
            React.createElement('div', { className: 'card-pad', style: { background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 14 } },
              React.createElement('p', { style: { lineHeight: 1.6, fontSize: 13.5 } }, a.detail)),
            a.files && a.files.length ? React.createElement('div', { className: 'mt16' },
              React.createElement('div', { className: 'eyebrow', style: { marginBottom: 8 } }, t('Files')),
              a.files.map(f => React.createElement('div', { key: f, className: 'perm-file' }, React.createElement('span', { style: { color: 'var(--text-3)' } }, I.file({ size: 15 })), f))
            ) : null,
          ),
          React.createElement('div', { className: 'modal-foot' },
            React.createElement('button', { className: 'btn ghost', onClick: onClose }, t('Close')),
            React.createElement('div', { className: 'spacer' }),
            a.status === 'failed' ? React.createElement('button', { className: 'btn primary', onClick: () => { onClose(); ctx.setRoute('build', { input: 'Fix: ' + a.detail }); } }, I.fix({ size: 15 }), t('Fix with omnux'))
              : React.createElement('button', { className: 'btn', onClick: () => { onClose(); ctx.setRoute('build'); } }, I.code({ size: 15 }), t('Open in Build'))),
        )
      )
    );
  }

  Object.assign(window, { ProjectsPage, ActivityPage, ActivityDetail });
})();
