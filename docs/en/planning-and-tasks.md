# Planning and Task Graphs

[한국어](../PLANNING_AND_TASKS.md) · [English](./planning-and-tasks.md)

Updated: 2026-09-12

On the **Tasks** screen (List · New plan), describe the result you want, review the plan, and run it.

- **계획 만들기** (Create plan): describe the result; conditions and planning style are in the expandable area.
- **이 계획으로 실행** (Run this plan): approves and runs the plan in order.
- **작업 중단 / 남은 작업 이어가기** (Stop / Resume remaining): stop the whole run, then resume from unfinished steps.
- **저장된 작업** (Saved tasks): pick an existing task from the list.

| Location | Contents |
|---|---|
| `~/.omnux/plans/` | Plan, review, and execution state |
| `~/.omnux/tasks/` | Task graph source |
| `workspace/.runtime/tasks/<graph>/<task>/attempts/<id>/` | stdout/stderr/result.json per attempt |

Plan generation and review use an LLM; the task graph is split from the approved plan by rules. Retry resets the selected step and its dependents; resume keeps finished steps. Both re-check the plan's approval.
