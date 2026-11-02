# EXPERIMENTAL single-source synthesis. No constraints, implementation or bitstreams.
source [file join [file dirname [info script]] common.tcl]
p4b_run synthesis {
    if {$::p4b_top eq "" || $::p4b_part eq ""} {
        error "An explicit top-level entity and FPGA part are required."
    }
    read_vhdl $::p4b_source
    synth_design -top $::p4b_top -part $::p4b_part
    report_utilization -file utilization.rpt
    write_checkpoint -force post_synth.dcp
}
