/* omnux — build page state */
(function () {
  const { useState, useEffect, useCallback } = React;
  const D = window.OMNUX_DATA;

  const PLAN = [
    'Find files that mention "Omni-node"',
    'Rename Omni-node → omnux',
    'Update the product description',
    'Run build & doc checks',
    'Generate a change summary',
  ];

  const DIFF = [
    { file: 'README.md', lines: [
      { n: 1, t: '# Omni-node', k: 'del' },
      { n: 1, t: '# omnux', k: 'add' },
      { n: 3, t: 'A local-first command center for AI agents.', k: 'del' },
      { n: 3, t: 'A local-first command center for AI agents, code,', k: 'add' },
      { n: 4, t: 'routines, and LLM orchestration.', k: 'add' },
    ] },
    { file: 'package.json', lines: [
      { n: 2, t: '  "name": "omninode",', k: 'del' },
      { n: 2, t: '  "name": "omnux",', k: 'add' },
      { n: 4, t: '  "description": "Omni-node desktop app",', k: 'del' },
      { n: 4, t: '  "description": "omnux — local-first AI command center",', k: 'add' },
    ] },
  ];

  function useBuildPageState(ctx, payload) {
    const [project] = useState(D.projects[0]);
    const [req, setReq] = useState((payload && payload.input) || '');
    const [stage, setStage] = useState('compose'); // compose | planning | plan | applying | applied
    const [showDetails, setShowDetails] = useState(false);
    const [showCheck, setShowCheck] = useState(!!(payload && payload.check));
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
      setStage('planning');
      setTimeout(() => setStage('plan'), 1100);
    }, [req]);

    const apply = useCallback(() => {
      ctx.requestPermission({
        title: 'omnux wants to change files',
        project: project.name,
        actions: ['Replace legacy Omni-node branding with omnux', 'Update the product description'],
        files: DIFF.map((d) => d.file),
        onAllow: () => {
          setStage('applying');
          setTimeout(() => {
            setStage('applied');
            ctx.toast('Applied · 2 files changed');
          }, 1200);
        },
      });
    }, [ctx, project.name]);

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
      apply,
      examples,
      plan: PLAN,
      diff: DIFF,
    };
  }

  Object.assign(window, {
    useBuildPageState,
    BUILD_PLAN: PLAN,
    BUILD_DIFF: DIFF,
  });
})();
