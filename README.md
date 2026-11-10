# Qubit Arena

**An online multiplayer quantum gate strategy game** — play H, X, Y, Z, S, √X, I, Measure and CNOT cards to move a football between six qubit states and score in your own end zone. Based on Thomas G. Wong's *Qubit Touchdown*, extended with team play, a partner qubit, entanglement (fog) and live state visualization.

Senior project · Faculty of ICT, Mahidol University · Aug 2026 – Apr 2027

## Documentation

| File | Contents |
|---|---|
| [docs/project-overview.md](docs/project-overview.md) | Goals, scope (MVP), schedule, roles, risks |
| [docs/rules.md](docs/rules.md) | **Complete game rules — source of truth** |
| [docs/architecture.md](docs/architecture.md) | Monorepo, tech stack, protocol, server and client design |
| [docs/test-plan.md](docs/test-plan.md) | Test IDs, pass criteria, user evaluation |
| [docs/roadmap.md](docs/roadmap.md) | **Every task until the project ends** (checkboxes, dates) |
| [docs/claude-code-prompts.md](docs/claude-code-prompts.md) | Claude Code prompt for each task (P-0.1 … P-9.3) |
| [docs/user-study.md](docs/user-study.md) | Learning check, survey and procedure for the user study |
| [CLAUDE.md](CLAUDE.md) | Instructions Claude Code reads in every session |

## Status

SDLC phase: **Implementation** (Planning, Analysis and Design done).
With Claude Code open in this folder, type `/next` to do the next task in the roadmap, or `/status` to see progress.

## Quick start (after round 0)

```bash
pnpm install
pnpm test
pnpm dev
```

## Team

Bunyakorn Wongchadakul (6688148) · Ayumu Sakurai (6688159) · Kittiyakarn Kaewmungkun (6688191)
Advisor: Rawesak Tanawongsuwan
