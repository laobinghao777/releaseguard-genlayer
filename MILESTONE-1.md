# Evidence workbench — first milestone

Accepted baseline: `b570754d1f46b0e13a701fc30874407dc26506e1` (including the already-reviewed public app and RPC fee-query repair). This milestone claims only the new work below, developed after acceptance on 2026-11-18.

## What changed

The accepted app could display one stored assessment. It did not recompute evidence, authenticate imported receipts, export reports or compare records. The new wallet-free `/releaseguard/audit?record=1` workflow:

1. Reads `get_check` from **latest-final** state of the existing, pinned Bradbury contract. Reconstructs Python `json.dumps(sort_keys=True, ensure_ascii=False)` snapshot bytes and recomputes SHA-256 in the browser.
2. Checks release identity, source URL, snapshot schema, final assessment, assessment-to-snapshot binding, sorted passage IDs and each exact original 400-code-point passage. Unicode slicing follows Python code points, not UTF-16 offsets. Failure disables evidence export.
3. Exports a portable JSON evidence bundle and a Markdown report with original quotations. A bundle's verification label is explicitly not a blockchain proof. Import recomputes checks, fetches the same ID from the pinned deployed contract, and compares the complete record. A locally consistent file with an altered claim, owner, reason or verdict cannot authenticate against a different final record.
4. Reads and verifies two distinct same-repository records for side-by-side claims/verdicts and a deterministic multiset line difference. Different claims carry an explicit warning; changed note lines do not imply code changes or implementation quality. Invalid evidence, same IDs and unrelated repositories stop comparison.
5. Shares a record permalink that independently reads and verifies on load. The audit surface collects no keys, requests no wallet access and performs no writes.

The contract and its recorded judgments are unchanged. No redeployment, model re-evaluation, synthetic users, usage claims or new token spending are part of this milestone.

## Reproduce

From `public-app`, install the pinned package-lock dependencies, run `node --test release-audit.test.mjs`, then `npm run build` and `node preview.mjs`. Open `http://127.0.0.1:4320/releaseguard/audit?record=1`. Export JSON, import it, then change its committed claim and import again: authentication must reject the changed file. Public RPC availability is required for chain authentication; local consistency alone never substitutes for it.

Public production: https://genlayer-proofwork.sillynightingale1.chatgpt.site/releaseguard/audit?record=1

## Validation and limits

- 29 targeted verification/import/comparison tests cover tampering, invalid citations, exact Unicode passage boundaries, failed RPCs, wrong network/contract, duplicate lines and misleading different-claim comparisons. Comparison fixtures are clearly synthetic.
- `milestone-evidence/live-record-1.json` is a real public final contract read, not a fixture invented for the tests. Its snapshot hash is `0d17d9027d9cfb4fb359dfd20b14292507066149c0a9541b4dda665fa3315472`.
- `milestone-evidence/live-verification.json` records successful live import authentication and rejection of an altered claim against a fresh final read.
- No live two-record comparison is claimed. The existing verified demonstration has one final record. Pair-comparison logic is tested with synthetic fixtures; reviewers can create their own independent checks in the existing app.
- Snapshot integrity and chain-state equality do not prove GitHub publisher honesty, implementation behavior or absence of model error. These remain release-note assessments, not code audits. JSON exports are not cryptographic chain inclusion proofs.
- This milestone uses only public reads: new signed transactions **0**, new test GEN cost **0**.
