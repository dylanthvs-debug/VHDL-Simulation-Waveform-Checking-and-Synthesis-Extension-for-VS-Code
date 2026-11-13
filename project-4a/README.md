ECNG 2007 - Computer Systems and Software Design
Group 4
Project 4A - Open Tools Workflow - GHDL & Surfer

Project Description:
GHDL Component - Create an extension for Visual Studio Code that simulates VHDL Code.
Surfer - Create an extension for Visual Studio Code that displays waveforms from simulated VHDL Code.

This directory contains information and work specifically for ECNG 2007 - Group 4A

## What the extension does (M2 + M3)

The **Run GHDL Simulation** button in the status bar (also `P4A: Run GHDL Simulation` in the Command Palette) runs, in the open workspace folder:

1. `ghdl -a --std=08 inverter.vhd inverter_tb.vhd` (analysis)
2. `ghdl -e --std=08 inverter_tb` (elaboration)
3. `ghdl -r --std=08 inverter_tb --vcd=waveform.vcd` (simulation)
4. Checks that `waveform.vcd` was written by this run (an old one is deleted first)
5. Starts Surfer with the full waveform path as one argument

Each step runs only if the one before it succeeded. A failure names the stage, quotes GHDL's own message, adds GHDL file/line errors to the Problems panel, and never reports success. Output goes to the **P4A GHDL & Surfer** output channel and to `logs/p4a-simulation-log.txt` in the workspace.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `p4a.toolManifestPath` | empty | Local EDA Tool Manifest v1 file used to find GHDL and Surfer. **Provisional:** the staff manifest was not in the project pack, so the JSON layout read by `src/p4a/toolConfig.ts` is an assumption. |
| `p4a.ghdlPath`, `p4a.surferPath` | empty | Optional override of one tool's path. Used by the missing-tool tests. |
| `p4a.sourceFiles` | `inverter.vhd`, `inverter_tb.vhd` | Files for `ghdl -a`, in order. |
| `p4a.testbenchEntity` | `inverter_tb` | Entity for `ghdl -e` / `ghdl -r`. |
| `p4a.waveformFile` | `waveform.vcd` | VCD written by GHDL and opened in Surfer. |

Tool lookup order: override setting, then the manifest, then `ghdl` / `surfer` on PATH (as in the course setup guide).

## Build and test (Windows)

Needs Node.js 22 or newer and VS Code 1.144 or newer. Run in this folder:

```
npm install
npm run compile
npm run test:unit      # unit tests in plain Node, no GHDL/Surfer needed
npm test               # extension-host tests (downloads a test copy of VS Code the first time)
```

`npm install` (not `npm ci`) is needed once because new dev dependencies were added and `package-lock.json` will update.

## Run it

Open this folder in VS Code, choose **Run and Debug > Run Extension (M2 input)**, press F5. The new window opens `../../M2 input`. Trust the folder, then click **Run GHDL Simulation**.

## Package

```
npx vsce package
```

vsce asks about the missing LICENSE file. Answer `y`, or add a LICENSE first.

## Source layout

| File | Role |
| --- | --- |
| `src/extension.ts` | Entry point; calls `registerP4A(context)` |
| `src/p4a/register.ts` | VS Code side: button, command, progress, output channel, Problems panel, run log |
| `src/p4a/workflow.ts` | Stage sequence, waveform check, result and log formatting (no `vscode` import) |
| `src/p4a/processRunner.ts` | `ProcessRunner` interface and `NodeProcessRunner` (execFile, no shell) |
| `src/p4a/surferLauncher.ts` | Starts Surfer and reports missing-viewer or immediate-exit failures |
| `src/p4a/toolConfig.ts` | Setting / manifest / PATH tool lookup |
| `src/p4a/ghdlDiagnostics.ts` | Turns GHDL `file:line:col` messages into diagnostics |
| `src/test/unit/*.test.ts` | Unit tests UT-P4A-01 to UT-P4A-23 |
| `src/test/suite/extension.test.ts` | Extension-host tests EH-P4A-01 and EH-P4A-02 |

## Combining with 4B

In the shared extension's `activate()`, call `registerP4A(context)` next to the 4B registration, copy `src/p4a` across, and merge `contributes.commands`, `contributes.configuration` and `activationEvents` from this `package.json`.
