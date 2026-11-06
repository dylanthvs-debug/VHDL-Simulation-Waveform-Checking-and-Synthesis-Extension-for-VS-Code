# P4B - Vivado Workflow (v0.0.4 final testing candidate)

ECNG2007, UWI, Group 4. TypeScript VS Code extension for checking and synthesis.

**Experimental development build, not a course-approved Vivado flow.**
The official Local EDA Tool Manifest v1 and prescribed procedures remain pending.
Real Vivado execution has not been verified on the development computer.

**Vivado: Run Checking** and **Vivado: Run Synthesis** normally validate the active
saved VHDL file and display an unconfigured message in **Vivado Workflow**. No tool
executes by default. Existing command IDs remain unchanged.

Explicitly enabling `p4b.experimental.enabled` opts into the Windows development
prototype. It handles one saved source, with syntax-only checking or unconstrained
synthesis. Synthesis requires an explicit top-level entity and FPGA part. There is
no implementation, timing sign-off, bitstream generation or programming.

See [the portable testing guide](docs/EXPERIMENTAL-TESTING.md) for installation,
settings, samples, limits, test checklist, log collection and AMD documentation.

## Vivado Workflow sidebar

Open **Vivado: Open Workflow Sidebar** from the Command Palette, or click the chip
icon in the Activity Bar. Browse to a saved VHDL file (opening it in the editor is
not required), or choose **Use Active File**. Sidebar runs always use the displayed
source, even when another editor is active.

Browse to your Vivado launcher, supply the entity and exact FPGA part for synthesis,
explicitly check **Enable experimental execution**, then **Save Configuration**.
Choose **Run Checking** or **Run Synthesis**. Results show progress and completion
or failure. **Show Output**, report buttons and **Open Run Folder** provide details.
Execution remains disabled by default. Uncheck the enable box and save to disable it.
The existing Command Palette checking and synthesis commands remain available.

## Local development

- `npm test`: compile, lint, Node tests and both VS Code extension-host suites.
- `npm run test:unit`: compile and run Node tests.
- `npm run test:extension -- --label standard`: default and opt-in mock command tests.
- `npm run test:extension -- --label mock-workflows`: generic injected workflow tests.
- `npm run package:experimental`: build the VSIX and transfer ZIP under
  `dist/`, using already-installed JSZip. No download, installation,
  publication or upload is performed by the packaging script.
- `npm run verify:package`: extract the built VSIX and verify activation and both
  mock commands using the already-cached VS Code host, without installing the VSIX.

VS Code 1.144.0 or newer is required by the existing extension engine declaration.
Runtime needs VS Code, Windows and the tester's own Vivado installation. Node/npm
are needed for development, not for installing this VSIX.

## Final testing candidate

Install `dist/p4b-vivado-final-test-v0.0.4.vsix` with **Extensions > Install from
VSIX**, then reload. The matching ZIP includes the installer, VHDL samples and
testing instructions. See [Monday acceptance tests](docs/FINAL-TESTING.md),
[technical architecture and P4A integration](docs/TECHNICAL.md), and
[verification results](docs/VERIFICATION.md).

For Basys 3, explicitly configure `xc7a35tcpg236-1` and install that Vivado device
support. Other part identifiers remain supported. For the supplied sample use
top-level entity `p4b_sample`.

Version 0.0.4 corrects false checking success for the Vivado 2026.1 critical warning
`HDL 9-1206`. The Tcl wrapper checks this syntax-error ID; the host also checks
stdout/stderr and report/log diagnostics. Unrelated warnings remain visible without
automatically failing the run. The reported v0.0.3 valid checking/synthesis and
invalid synthesis observations are documented; corrected real-Vivado checking
still requires retesting. Experimental runs now have a 30-minute timeout.

Troubleshooting: select an existing launcher with no command-line arguments; save
source edits before running; supply top/part for synthesis. Open **Show Output** or
the run's report buttons for the original error code and line. Each run preserves
its source, scripts, result.json, stdout/stderr and generated reports beside the
source in `.p4b-experimental/`. Missing markers/reports or recognized syntax errors
override a zero process exit. Course manifest/procedure approval remains pending.
