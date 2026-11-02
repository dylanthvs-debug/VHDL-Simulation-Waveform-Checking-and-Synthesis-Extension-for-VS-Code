# P4B portable experimental testing guide

**DEVELOPMENT PROTOTYPE - NOT AN OFFICIAL COURSE WORKFLOW**

Real Vivado checking and synthesis have NOT been verified on the development laptop.
Automated tests use mock processes and validate orchestration, not AMD tool behavior.
The course manifest and prescribed procedures are unavailable. These settings and Tcl
scripts are replaceable experimental code, not Local EDA Tool Manifest v1.

## Transfer and installation

Transfer `p4b-experimental-0.0.3.zip` from `dist/experimental/`. Extract it completely
into a writable folder on the friend's Windows computer. It contains the VSIX,
source samples, Tcl scripts, this guide and a test-results template.

1. Confirm VS Code **1.144.0 or newer** is installed. This is the existing extension
   engine baseline, not a requirement on the Vivado version. If unavailable, report
   the VS Code version; do not blindly change the engine declaration.
2. Open Extensions, choose `...`, then **Install from VSIX...**. Select the included
   `p4b-experimental-0.0.3.vsix`. Reload the window if requested.
3. Disable other development copies of P4B in that window to avoid duplicate commands.
4. Open the extracted folder as a trusted local workspace. Do not use WSL, SSH,
   remote development, or browser VS Code for this Windows prototype.
5. The friend supplies an existing full Vivado installation, device support and any
   required licence. Nothing here installs or licenses Vivado. Lab Edition cannot
   perform synthesis. No physical FPGA board is needed for these software tests.

The unsigned local VSIX contains runtime JavaScript, Tcl, documentation, samples and
metadata. It contains no node_modules, mocks, caches or machine-specific settings.
No additional packaging software was installed. Installation and compatibility with
the friend's Vivado version still need verification; no supported version is assumed.

## Configure and run using the sidebar

1. Open **Vivado: Open Workflow Sidebar** from the Command Palette, or click the
   Vivado Workflow chip icon in the Activity Bar.
2. Click **Browse...** and select the extracted `samples/experimental/valid.vhd`.
   It need not be open in the editor. Alternatively choose **Use Active File**.
   The displayed source is authoritative for sidebar runs.
3. Browse to your installed Vivado launcher. For synthesis, enter `p4b_sample`
   for the supplied sample and the exact FPGA part supported by your installation.
4. Explicitly check **Enable experimental execution**, then **Save Configuration**.
   Editing fields alone does not enable execution. Save changes before running.
   Launcher and enable settings are saved for this computer's VS Code user profile;
   entity and part are saved to the selected workspace when available, otherwise
   to user settings. They are separate from the pending official course manifest.
5. Click **Run Checking** or **Run Synthesis**. The status changes from Running to
   Success or Failed, with a short summary. Success refers only to the experimental
   procedure, not official course acceptance.
6. Use **Show Output** and the report/log buttons for details. **Open Run Folder**
   reveals result.json; copy the entire run folder with the completed results template
   to return results. Review private paths before sharing. Checkpoints are revealed
   rather than opened as text.
7. Repeat with invalid.vhd and confirm failure. Switch to another editor and confirm
   sidebar runs still use the displayed selected file.
8. Uncheck **Enable experimental execution** and save when finished.

Command Palette commands still use the active editor, or prompt when none is open.
Their experimental runs share the sidebar status. Only one experimental run is
allowed at a time. Logs are collected after exit; there is no cancellation control.
Save unsaved VHDL edits before running. Selection is retained while the extension
session lives; select the source again after reloading VS Code.

## Configure the testing computer using Settings (alternative)

Open **Preferences: Open User Settings (JSON)**. Add these settings and replace the
explanatory placeholders. Forward slashes avoid JSON backslash escaping:

```json
{
  "p4b.experimental.enabled": false,
  "p4b.experimental.executablePath": "C:/REPLACE_WITH_YOUR_INSTALL/Vivado/YOUR_VERSION/bin/vivado.bat",
  "p4b.experimental.topLevel": "p4b_sample",
  "p4b.experimental.part": "REPLACE_WITH_AN_INSTALLED_PART"
}
```

The launcher path is a placeholder, not a recommended path/version. Use the actual
installed `bin/vivado.bat`, or an appropriate `.cmd`/`.exe` launcher. Do not include
quotes, flags, or settings64.bat in this value or select an unrelated internal binary.
Checking does not require top/part settings. Synthesis requires both; no device is
selected automatically. `p4b_sample` is the supplied sample entity, not a general default.

In the friend's existing Vivado Tcl console, `version -short` records its version and
`get_parts` lists installed part names. The friend must select an appropriate exact
part supported by their device installation/licence. If environment initialization is
needed, follow that installation's normal AMD setup procedure, then start VS Code
from the initialized environment.

Set `p4b.experimental.enabled` to **true only when ready to run these experimental
scripts**. The enable flag and launcher path are machine-scoped; workspace trust is
also required. Setting it false restores unconfigured behavior for later invocations
but does not cancel an already-running process.

Windows batch launching uses cmd.exe with `/d /s /v:off`. Arguments are quoted, and
quotes, controls and `% ! ^ & | < >` are rejected in batch-launch paths. Paths with
spaces are tested. Use a simpler path if rejected. Direct .exe launching uses no shell.
The general ProcessRunner remains shell-free. Settings do not accept arbitrary commands.

## Checking

1. Open and save `samples/experimental/valid.vhd`; keep it active.
2. Run **Vivado: Run Checking** from the Command Palette.
3. Inspect **Output -> Vivado Workflow** for the EXPERIMENTAL banner and run folder.
   If no editor is active, a file picker lets you select a VHDL source.
4. Repeat with `invalid.vhd`. It deliberately contains `y <= a and ;` and should fail.

This script creates an in-memory project, reads one VHDL file and calls
`check_syntax -fileset sources_1 -return_string`. It checks syntax, not elaboration,
simulation, design correctness or synthesizability. It uses Vivado's default VHDL read
mode; the sample needs no VHDL-2008 features. No part is supplied for checking. If the
installed version needs more configuration, return the logs rather than invent a device.

## Synthesis

1. Supply the exact top entity and installed FPGA part in settings.
2. Open and save `valid.vhd` (entity `p4b_sample`).
3. Run **Vivado: Run Synthesis**.
4. On completion inspect `utilization.rpt` and `post_synth.dcp` in the reported folder.
   Repeat with `invalid.vhd` and expect failure.

This script uses `read_vhdl`, `synth_design -top ... -part ...`, `report_utilization`
and `write_checkpoint`. No constraints are supplied. This is not timing, board, I/O,
implementation or course acceptance sign-off. There is no placement, routing,
bitstream generation, programming or GUI automation.

## Failures and artifacts

Each execution gets a fresh `.p4b-experimental/<kind>-<unique-id>/` folder beside the
source. It contains the input snapshot `input.vhd`, Tcl scripts, `driver.tcl`,
`result.json`, stdout/stderr text and any generated Vivado logs/journal and reports.
`version.txt` records the tool version if Tcl reaches that step. Checking writes
`syntax.rpt`; synthesis writes `utilization.rpt` and `post_synth.dcp`. Early validation
errors appear only in Output because no execution folder has been created.

The Tcl wrapper catches errors, emits failure information and exits nonzero. It does
not use `-quiet`, checks Vivado ERROR-message counts and inspects returned syntax
diagnostics. The extension requires zero exit status, the exact fresh success marker,
nonempty required artifacts and no recognized ERROR/failure output. Zero exit alone
is insufficient. Warnings remain visible and do not automatically fail a run.
A completion message means only this experimental procedure completed.

## Test checklist

- [ ] Record Windows, VS Code and Vivado versions and confirm full Vivado access.
- [ ] Install the VSIX and confirm both commands appear.
- [ ] Disabled mode keeps both commands unconfigured and launches nothing.
- [ ] Valid sample checking completes or yields useful failure evidence.
- [ ] Invalid sample checking fails without a success claim.
- [ ] Valid synthesis with explicit top/part creates utilization/checkpoint artifacts.
- [ ] Invalid sample synthesis fails.
- [ ] Blank top or part prevents synthesis before tool launch.
- [ ] A nonexistent launcher path gives a useful failure; restore the real path afterward.
- [ ] Source/workspace and launcher paths containing spaces work, if available.
- [ ] Unsaved changes and non-VHDL selections are rejected.
- [ ] Review stderr, stdout, warnings and the exact exit code in result.json.
- [ ] Disable experimental mode after testing.

## Return results

Fill in `docs/TEST-RESULTS-TEMPLATE.md`. For each case record the command, source,
expected result, actual status and folder name. If no run folder exists, copy the
Vivado Workflow Output text into the report.

Zip the relevant run folders and completed template and send them back using your
chosen method. The extension uploads nothing. Folders contain absolute local paths
and source snapshots: review them before sharing; omit sensitive sources and note
redactions. Preserve raw logs where possible. Checkpoints may be large; note if omitted.
Do not delete your original source files.

## Limits

Single-file Windows prototype only: no external libraries, IP, multifile ordering,
XDC inputs, project import, extended entity identifiers or board support. No Vivado
version/device compatibility claim is made. Data paths are escaped as Tcl strings.
Concurrent experimental invocations are blocked per host. No timeout or cancellation
UI exists; handle a hung tool manually on the test computer. Keep VS Code open while
running. Logs are buffered and displayed at completion; large outputs consume memory.
Never treat interrupted execution as success.

Return unsupported commands, licensing, device and environment issues with their logs.
Do not silently add assumptions to make a demo pass. The official manifest, workspace
conventions, approved procedures and reference results must replace this prototype.

## AMD documentation basis (not course approval)

- [UG892: batch launch](https://docs.amd.com/r/en-US/ug892-vivado-design-flows-overview/Launching-the-Vivado-Tools-Using-a-Batch-Tcl-Script)
- [UG835: check_syntax](https://docs.amd.com/r/2020.2-English/ug835-vivado-tcl-commands/check_syntax)
- [UG835: create_project](https://docs.amd.com/r/2020.2-English/ug835-vivado-tcl-commands/create_project)
- [UG835: read_vhdl](https://docs.amd.com/r/2024.2-English/ug835-vivado-tcl-commands/read_vhdl)
- [UG835: synth_design](https://docs.amd.com/r/2023.2-English/ug835-vivado-tcl-commands/synth_design)
- [UG835: report_utilization](https://docs.amd.com/r/2020.2-English/ug835-vivado-tcl-commands/report_utilization)
- [UG894: Tcl errors](https://docs.amd.com/r/2020.2-English/ug894-vivado-tcl-scripting/Handling-Tcl-Errors)
- [UG835: ERROR counts](https://docs.amd.com/r/2023.2-English/ug835-vivado-tcl-commands/get_msg_config)
- [UG893: launcher/environment](https://docs.amd.com/r/en-US/ug893-vivado-ide/Launching-the-Vivado-IDE-from-the-Command-Line-on-Windows-or-Linux)

The referenced revisions describe the commands used. They do not establish which
Vivado version is installed or compatible on the friend's computer.
