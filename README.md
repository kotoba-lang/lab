# kotoba-lab

Research notebook prototype rendered from `lab.kotoba`.

Published at:

https://kotoba-lang.github.io/lab/

## Implementation Rules

The lab contract is Kotoba/Clojure-first.

- Verification contracts must live in `.cljc` files under `src/kotoba/lab/`.
- Do not add `.mjs`, `.sh`, shell-script, or ad-hoc script contracts.
- Browser automation may use a minimal `.js` runner only to drive Playwright.
- Product behavior, maturity rules, coverage requirements, and environment locks must be represented in `lab.kotoba` and `.cljc`.
- CI must treat JavaScript runners as wrappers, not as the source of truth.

Current contract files:

- `src/kotoba/lab/verification.cljc`
- `src/kotoba/lab/verification_check.cljc`

Current browser runner:

- `scripts/verify-lab.js`
