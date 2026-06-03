/* omnux — build page state */
(function () {
  const { useState, useEffect, useCallback } = React;

  function firstProject(ctx) {
    const item = Array.isArray(ctx.runtime?.projects) && ctx.runtime.projects.length > 0
      ? ctx.runtime.projects[0]
      : null;
    return item
      ? {
        name: item.name || 'Project',
        path: item.path || '-',
        color: item.color || '#2563EB',
      }
      : { name: '등록된 프로젝트 없음', path: '-', color: '#2563EB' };
  }

  function useBuildPageState(ctx, payload) {
    const project = firstProject(ctx);
    const [req, setReq] = useState((payload && payload.input) || '');
    const [stage, setStage] = useState('compose'); // compose | planning | result
    const [showDetails, setShowDetails] = useState(false);
    const [showCheck, setShowCheck] = useState(!!(payload && payload.check));
    const [checkOutput, setCheckOutput] = useState('');
    const [progress, setProgress] = useState('');
    const [result, setResult] = useState(null);
    const [rollbackId, setRollbackId] = useState((payload && payload.rollbackId) || '');
    const [rollbackStatus, setRollbackStatus] = useState({
      pending: false,
      ok: null,
      message: '',
      result: null,
    });

    useEffect(() => {
      if (payload && payload.input) setReq(payload.input);
    }, [payload && payload.input]);

    useEffect(() => {
      if (payload && payload.rollbackId) {
        setRollbackId(payload.rollbackId);
      }
    }, [payload && payload.rollbackId]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === 'coding_progress') {
          setStage('planning');
          setProgress([msg.stageTitle || msg.phase, msg.message].filter(Boolean).join(' · ') || '실행 중…');
          return;
        }

        if (msg.type === 'coding_result') {
          setStage('result');
          setProgress('');
          setResult(msg);
          if (msg.summary) {
            ctx.toast('코딩 결과를 받았습니다.');
          }
          return;
        }

        if (msg.type === 'command_result') {
          setShowCheck(true);
          setCheckOutput(msg.text || '');
          return;
        }

        if (msg.type !== 'refactor_result' || msg.action !== 'restore') {
          return;
        }

        const payloadResult = msg.payload || {};
        const rollbackResult = payloadResult.rollbackResult || null;
        const ok = payloadResult.ok !== false;
        setRollbackStatus({
          pending: false,
          ok,
          message: payloadResult.message || (ok ? 'rollback 복원을 완료했습니다.' : 'rollback 복원을 실패했습니다.'),
          result: rollbackResult,
        });
        if (rollbackResult && rollbackResult.rollbackId) {
          setRollbackId(rollbackResult.rollbackId);
        }
        if (payloadResult.message) {
          ctx.toast(payloadResult.message);
        }
      };

      window.addEventListener('omnux:message', onMessage);
      return () => window.removeEventListener('omnux:message', onMessage);
    }, [ctx]);

    const genPlan = useCallback(() => {
      if (!req.trim()) return;
      if (!ctx.runtime || !ctx.runtime.connected) {
        ctx.toast('미들웨어 연결이 필요합니다.');
        return;
      }
      setStage('planning');
      setProgress('코딩 실행 요청 전송…');
      setResult(null);
      const sent = ctx.send({
        type: 'coding_run_single',
        text: req.trim(),
        scope: 'coding',
        mode: 'single',
        project: project.name,
      }, { queueIfClosed: true });
      if (!sent) {
        setStage('compose');
        setProgress('');
        ctx.toast('미들웨어 연결이 필요합니다.');
      }
    }, [ctx, project.name, req]);

    const runCheck = useCallback(() => {
      setShowCheck(true);
      setCheckOutput('npm test 실행 요청 전송…');
      if (!ctx.send({ type: 'command', text: 'npm test' }, { queueIfClosed: true })) {
        setCheckOutput('미들웨어 연결이 필요합니다.');
        ctx.toast('미들웨어 연결이 필요합니다.');
      }
    }, [ctx]);

    const restoreRollback = useCallback(() => {
      const normalizedRollbackId = rollbackId.trim();
      if (!normalizedRollbackId) {
        setRollbackStatus({
          pending: false,
          ok: false,
          message: 'rollbackId가 필요합니다.',
          result: null,
        });
        ctx.toast('rollbackId를 입력하세요.');
        return;
      }

      if (!ctx.runtime || !ctx.runtime.connected) {
        setRollbackStatus({
          pending: false,
          ok: false,
          message: '미들웨어 연결이 필요합니다.',
          result: null,
        });
        ctx.toast('미들웨어 연결이 필요합니다.');
        return;
      }

      setRollbackStatus({
        pending: true,
        ok: null,
        message: 'rollback 복원 요청 중…',
        result: null,
      });

      const sent = ctx.send({ type: 'refactor_restore', rollbackId: normalizedRollbackId }, { queueIfClosed: true });
      if (!sent) {
        setRollbackStatus({
          pending: false,
          ok: false,
          message: '미들웨어 연결이 필요합니다.',
          result: null,
        });
        ctx.toast('미들웨어 연결이 필요합니다.');
      }
    }, [ctx, rollbackId]);

    const examples = [
      'Rename Omni-node to omnux in README and package.json',
      'Add a dark mode toggle to the settings page',
      'Fix the type error in main.ts',
    ];

    const changedFiles = Array.isArray(result?.changedFiles) ? result.changedFiles : [];
    const plan = [
      result?.summary || progress || '요청을 입력하고 코딩 실행을 시작하세요.',
      ...changedFiles.map((path) => `변경 파일: ${path}`),
    ].filter(Boolean);

    return {
      project,
      req,
      setReq,
      stage,
      setStage,
      showDetails,
      setShowDetails,
      showCheck,
      setShowCheck,
      rollbackId,
      setRollbackId,
      rollbackStatus,
      restoreRollback,
      genPlan,
      runCheck,
      examples,
      progress,
      result,
      checkOutput,
      plan,
      diff: changedFiles.map((file) => ({ file, lines: [] })),
    };
  }

  Object.assign(window, {
    useBuildPageState,
  });
})();
