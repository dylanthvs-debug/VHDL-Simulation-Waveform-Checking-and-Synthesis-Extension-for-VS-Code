# P4B 0.0.4 technical notes

`extension.ts` activates the standalone extension through `registerP4B()` in
`p4b.ts`. The registration function and command identifiers remain compatible with
P4A integration. P4A can register P4B and dispose its returned disposable; it must
provide the media/Tcl resources and retain the contributed commands, view and settings.
No P4A files are changed. `P4BOptions` supports injected process runners, output and
in-memory checking/synthesis requests for integration testing.

`ui/vivadoWorkflowView.ts` owns source selection, validated messages, settings,
status and host-owned artifact paths. `experimental/session.ts` serializes sidebar
and palette requests. Running controls are disabled, and duplicate calls are refused.
Settings use VS Code persistence: launcher/opt-in are global machine settings;
top/part are workspace settings when a source belongs to a workspace, otherwise global.
Source selection is session-only and must be repeated after reloading.

`experimental/commands.ts` requires a trusted local Windows workspace, saved VHDL,
and explicit opt-in. `experimental/execution.ts` validates settings, snapshots the
source and Tcl scripts into a fresh directory, builds a Tcl driver with escaped data,
and verifies completion markers, diagnostics and nonempty artifacts. It does not
discover an arbitrary Vivado installation automatically: the user selects its launcher.
The FPGA part is configurable; `xc7a35tcpg236-1` is the Basys 3 Artix-7 choice when
that device is installed. No board is selected automatically.

`shared/processRunner.ts` captures stdout/stderr and exit information. EXE launching
uses direct argument arrays. The constrained Windows batch adapter quotes fixed
arguments and rejects expansion/control characters. Experimental runs have a
30-minute timeout; Windows termination targets the process tree. Timeout is reported
as ETIMEDOUT, never success. Output is buffered until completion; no cancel UI exists.

Checking creates an in-memory project, reads the source and calls check_syntax.
Synthesis calls read_vhdl and synth_design with explicit top/part, then writes
utilization and a checkpoint. common.tcl catches failures and exits 1. The 0.0.4 fix
checks the specific HDL 9-1206 message count as well as ERROR counts and returned
syntax diagnostics. This catches syntax errors emitted while reading the source.
Other critical warnings do not automatically fail the workflow. The host separately
scans stdout, stderr, vivado.log and syntax.rpt and preserves the first failure
diagnostic in the displayed message. It retains the real process exit code even if
zero-exit output is rejected; it never invents a process exit code.

The message-count interface is documented in
[AMD UG835](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/get_msg_config).
Actual execution of the corrected Tcl on Vivado 2026.1 remains an acceptance test.

Each run stores result.json (status, timestamps, source, settings, arguments, exit
code), stdout/stderr, input snapshot, driver/scripts and available tool artifacts.
Directories are preserved for examination, not automatically deleted. Failures before
directory creation appear in the sidebar/Output. Missing launchers and artifacts
cannot produce success.

The checkout contains no SRS, P4B course brief, Local EDA Tool Manifest v1 schema,
official workspace/result convention or approved Tcl/batch procedure. The
ecng3023-docs directory contains only a README. These are unresolved acceptance
inputs; experimental settings and result.json are not claimed to implement them.
