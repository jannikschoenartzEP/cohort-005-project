## Verification checks

Do these checks in this order before you report a change to `app/` as complete:

1. `npm run format:check` (fix with `npm run format`)
2. `npm run check:tokens`
3. `npm run typecheck`
4. `npm run lint:boundaries`
5. `npm run test`

Or run all five with `npm run check`. CI runs it on every PR. The pre-commit hook only formats staged files, checks their token count and runs the tests related to them, so a passing commit does not mean `npm run check` passes.

Modules are deep modules: see [app/modules/README.md](./app/modules/README.md) before adding or importing one.

## When something breaks

| Symptom                                         | Cause                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |
| `check:tokens` reports a file over 5000 tokens  | Split the file. The error output explains how. Do not add it to the allowlist.                         |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on your own copy of this repo (the `origin` remote), never on `ai-hero-dev/cohort-005-project`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
