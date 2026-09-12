# Planning and Task Graphs

[한국어](../PLANNING_AND_TASKS.md) · [English](./planning-and-tasks.md)

Updated: 2026-09-12

On the **Tasks** screen, describe the result you want, review the plan, then run it. The tabs are List · New plan · Plan · Run · Result; the last three appear only when that state exists.

## Screen

| Button | What it does |
|---|---|
| 계획 만들기 (Create plan) | Describe the result you need. Conditions and planning style are in the expandable area |
| 이 계획으로 실행 (Run this plan) | Approves and runs the plan, in order. Extra review and step editing sit in the secondary area |
| 작업 중단 (Stop) | Stops the whole running job |
| 남은 작업 이어가기 (Resume remaining) | After a stop, continues from the unfinished steps |
| 저장된 작업 (Saved tasks) | Expand the list and pick an existing task |

The result area leads with files and program output. Earlier runs and detailed logs expand when you need them.

## Storage

| Location | Contents |
|---|---|
| `~/.omnux/plans/` | Plan, review, and execution state |
| `~/.omnux/tasks/` | Task graph source |
| `workspace/.runtime/tasks/<graph>/<task>/attempts/<id>/` | stdout, stderr, and result.json per attempt |
| `~/.omnux/routing-policy.json` | Routing override |

Plan generation and review use an LLM. The task graph is split from the approved plan by rules.

## Run recovery

- Retry puts the selected step and its dependents back into a waiting state. A dependent still running has to be stopped first.
- Resume keeps the finished steps and continues the rest. Both retry and resume re-check the original plan's approval.
- The coding conversation ID is recorded from the moment the run starts. A retry after a stop reuses the same work folder.
- Running from the beginning uses a new coding context. Earlier run records and logs are kept.
- `task_output_get` returns the latest output by default. Pass the run start time (Unix milliseconds) in `timestamp` or `ts` to read that attempt's output.
