# Development verification record

Build: P4B 0.0.3 experimental prototype. Verified on Windows using the project's
existing Node/TypeScript tooling and cached VS Code 1.144.0 test host.

- TypeScript compilation: PASS.
- ESLint: PASS.
- Node tests: 59 PASS (including experimental configuration, Windows mock batch launch,
  spaced paths, successful/failed runs, missing executable, missing marker/reports,
  zero-exit error output, isolated run directories, Tcl data escaping, and sidebar client controls).
- Standard extension host: 24 PASS (including default-off and opt-in mock commands).
- Generic injected workflow extension host: 16 PASS.
- Total regular automated tests: 99 PASS.
- Packaged-runtime verification: 3 additional checks PASS. The VSIX was extracted
  and loaded as a development extension; activation, sidebar resources/focus and both mock commands worked.
- VSIX ZIP CRC verification and exact runtime-file allowlist: PASS.

The Windows sandbox prevented GUI test-host startup. The extension-host checks were
rerun with the approved sandbox exception, using project-local isolated profiles.
No ACL changes, additional software installation, commits, uploads or publication
were performed. The VSIX uses an offline allowlist builder with already-installed JSZip.

NOT VERIFIED: actual Vivado execution, real Tcl evaluation inside Vivado, VHDL
analysis/synthesis semantics, installed device support/licensing, the friend's tool
version, and VSIX installation through the friend's Extensions UI. Mocks do not prove
these. The supplied valid sample is intended as a reference test, not recorded Vivado evidence.

Reproduce with `npm test`, `npm run package:experimental`, and `npm run verify:package`.
The package verifier needs the existing cached Windows VS Code 1.144.0 test host;
it does not download or install it. `npm test` may download that host when not cached.
The transfer bundle needs no development dependencies on the testing computer.
