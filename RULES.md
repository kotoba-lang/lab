# Rules

## Language Boundary

- Use `lab.kotoba` and `.cljc` for notebook schema, verification contracts, maturity coverage, and replay rules.
- Do not add `.mjs` files.
- Do not add `.sh` files or shell-script based workflows.
- Do not move product logic, verification policy, or maturity rules into JavaScript runners.
- Keep JavaScript limited to the static UI and the minimal Playwright browser runner.

## Verification

- Contract source of truth: `src/kotoba/lab/verification.cljc`.
- Contract self-check source of truth: `src/kotoba/lab/verification_check.cljc`.
- Browser runner: `scripts/verify-lab.js`.
- CI must verify the `.cljc` contract is present and referenced by `lab.kotoba`.

## Changes

- When adding coverage, add the requirement to `.cljc` first.
- Then expose it in `lab.kotoba`.
- Then render it in the UI.
- Then verify it through the browser runner.
