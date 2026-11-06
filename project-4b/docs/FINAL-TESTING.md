# Final testing candidate v0.0.4

This is a testing pre-release, not full academic acceptance. Preserve v0.0.3.
Install `p4b-vivado-final-test-v0.0.4.vsix` using Extensions > Install from VSIX,
then reload. Requires Windows, VS Code >=1.144.0 and full Vivado with the selected
device installed. The accompanying ZIP contains this guide and sample VHDL.

## Reported Vivado 2026.1 observations from v0.0.3

The task supplied these observations; original raw Vivado logs were not found in
the checkout. These are reported observations, not tests rerun by this build.

| ID | Test | Expected | Reported actual | Status |
| --- | --- | --- | --- | --- |
| R01 | Valid checking | Success | Success | PASS (reported) |
| R02 | Valid synthesis | Success | Success | PASS (reported) |
| R03 | Invalid synthesis | Failure, exit 1 | Failure, exit 1 | PASS (reported) |
| R04 | Invalid checking | Failure, nonzero exit | Success, exit 0 | FAIL in 0.0.3 |

R04 diagnostic: `CRITICAL WARNING: [HDL 9-1206] Syntax error near ';' [input.vhd:11]`.
Corrected real-Vivado invalid checking remains NOT RUN until retested.

## Monday manual acceptance tests

1. Record Windows, VS Code, Vivado (`version -short`) and installed device versions.
   Install the candidate and confirm version 0.0.4. Use a trusted writable folder
   containing spaces. Select the actual Vivado launcher through the sidebar.
2. Select `samples/experimental/valid.vhd`, set top `p4b_sample`, and for Basys 3
   set part `xc7a35tcpg236-1`. Save configuration and explicitly enable execution.
3. Run checking: require success, exit 0, nonempty syntax.rpt and version.txt.
4. Select invalid.vhd and run checking: require failed UI, exit 1, failure status.txt,
   and the original HDL 9-1206 file/line diagnostic in logs. There must be no success
   marker. Save all logs even if this test fails; do not mark accepted without it.
5. Run valid synthesis: require exit 0, utilization.rpt and post_synth.dcp. Run
   invalid synthesis: require failure and nonzero exit.
6. With valid input, use a nonexistent entity, then a nonexistent part (restore each
   afterward): require synthesis failure and useful Vivado diagnostics.
7. Test blank top/part, missing launcher, missing source and unsaved input: require
   clear validation/launch errors. Confirm no misleading success remains.
8. Repeat a run using source and launcher paths with spaces. Click Run twice and
   confirm only one active run. Confirm controls recover after success and failure.
9. Save configuration, reload VS Code, and confirm the launcher/top/part/opt-in are
   restored. Reselect the source. Open logs/reports from the sidebar.
10. Complete TEST-RESULTS-TEMPLATE.md with expected/actual status and evidence path
    for every case. Preserve whole run directories. Obtain the official course
    procedures/schema and compare before claiming course compliance.

Each run is under `.p4b-experimental/<kind>-<unique>/` beside the source. Inspect
result.json, stdout.txt, stderr.txt, vivado.log, status.txt and generated reports.
The candidate rejects known syntax-error diagnostics even when a tool returns zero;
result.json still records that real exit code so tool behavior is visible.
