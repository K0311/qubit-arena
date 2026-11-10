---
description: Do the next unchecked task in docs/roadmap.md
---

Work on the next task of the Qubit Arena roadmap.

1. Read docs/roadmap.md and find the **first unchecked** task (`- [ ]`) from the top.
2. If it is marked 👤 (a human task), do not do it. Tell me exactly what the team must do, then stop and wait.
3. Otherwise find its prompt ID (e.g. P-1.2) in docs/claude-code-prompts.md and follow that prompt exactly, together with CLAUDE.md, docs/rules.md, docs/architecture.md and docs/test-plan.md.
4. Before starting, check that the previous phase's "ผ่านเมื่อ" (pass) criteria are met. If they are not, tell me what is missing and stop.
5. Create a branch `feat/<prompt-id>-<short-name>` from an up-to-date main.
6. Plan first and show me the plan. Wait for my "go" before writing code, unless the task only changes documentation.
7. When done: run `pnpm lint`, `pnpm typecheck`, `pnpm test` (and `pnpm e2e` if the task touched the client or server). Fix failures; never weaken or delete tests.
8. Tick the task in docs/roadmap.md (`- [x]`), add a line to the progress log table with today's date, commit with a conventional message listing the test IDs covered, push, and open a PR.
9. Report: what was done, test results, assumptions, anything left as TODO, and the next task in the roadmap.

$ARGUMENTS
