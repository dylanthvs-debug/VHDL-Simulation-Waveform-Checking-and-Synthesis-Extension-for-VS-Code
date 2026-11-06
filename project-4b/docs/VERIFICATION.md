# P4B 0.0.4 verification report

Executed 2026-11-05 on Windows. These are controlled automated tests, not real
Vivado execution. Evidence is the named reproducible test source and local run
output; previous 0.0.3 counts are not carried forward as new results.

| ID | Requirement / test | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| A01 | TypeScript build | Compile | Exit 0 | PASS | `node node_modules/typescript/bin/tsc -p ./` |
| A02 | Lint | No errors | Exit 0 | PASS | `node node_modules/eslint/bin/eslint.js src` |
| A03 | Unit suite | All pass | 66 passed, 0 failed | PASS | `src/test/unit/*.test.ts` |
| A04 | Valid/invalid checking and synthesis | Success/failure | Expected status and 0/1 exit in Windows mock | PASS | `experimental.test.ts` |
| A05 | Exact HDL 9-1206 regression | Reject zero-exit success in stdout, stderr, syntax.rpt, vivado.log | All four rejected; original diagnostic retained | PASS | `experimental.test.ts` |
| A06 | Unrelated critical warning | Remain successful | Successful | PASS | `experimental.test.ts` |
| A07 | Missing/invalid executable, source, configuration | Clear failure | Rejected | PASS | `experimental.test.ts`, `processRunner.test.ts`, `checkingInput.test.ts` |
| A08 | Paths with spaces and shell characters | Correct argument handling | Expected values/status | PASS | `processRunner.test.ts`, `experimental.test.ts` |
| A09 | Nonzero exit, missing artifact/marker | Never success | Failed | PASS | `workflow.test.ts`, `experimental.test.ts` |
| A10 | Hung process | Terminated, no success | ETIMEDOUT | PASS | `processRunner.test.ts` |
| A11 | Activation, sidebar, configuration persistence, duplicate requests | Correct state/commands | Standard extension-host suite exit 0 | PASS | `extension.test.ts`, `synthesis.test.ts`, `experimentalCommands.test.ts`, `sidebar.test.ts` |
| A12 | Injected P4A-compatible commands | Independent registration and execution | 16 passed | PASS | `workflowCommands.test.ts` |
| A13 | Actual nonexistent entity/part | Vivado synthesis failure | Not executed on Vivado | PENDING | `FINAL-TESTING.md`, manual step 6 |
| A14 | Corrected Tcl on Vivado 2026.1 | Invalid checking exit 1 | Not executed on Vivado | PENDING | `FINAL-TESTING.md`, manual step 4 |
| A15 | Official course procedure / manifest | Compliance | Specifications absent | BLOCKED | `TECHNICAL.md` |

The installed VS Code could not start because its updater mutex was held. Both
extension-host suites instead passed using a downloaded project-local VS Code
1.144.0 test host with isolated user/extension profiles. No personal settings were
changed. Test configuration now separates the Node suite, standard host and mock
integration host. Reproduce with `npm test`; optionally set P4B_TEST_VSCODE to a
compatible existing executable. Runtime validation uses Windows mock processes.

Reported real-Vivado v0.0.3 observations and the required Monday retest are in
FINAL-TESTING.md. No raw historical Vivado logs were found in this checkout.
The corrected real-Tcl semantics, installed device/license support and full course
acceptance remain unverified. The package verifier loads an extracted VSIX as a
development extension; this does not prove installation through the Extensions UI.

## Package validation

The 0.0.4 VSIX passed CRC and exact allowlist checks (28 files), and three
packaged-runtime checks passed: activation/resources/default-off, checking with a
mock process, and synthesis with a mock process. JavaScript, sidebar JS/CSS/SVG,
all three Tcl scripts, samples and guides are included. No node_modules, test
fixtures or temporary execution outputs are included. The host emitted unrelated
built-in language-service/log-path warnings; all three P4B checks exited 0.
