# EXPERIMENTAL syntax-only check. Not elaboration, simulation, or course acceptance.
source [file join [file dirname [info script]] common.tcl]
p4b_run checking {
    create_project -in_memory p4b_experimental
    read_vhdl $::p4b_source
    set diagnostics [check_syntax -fileset sources_1 -return_string]
    p4b_write syntax.rpt "EXPERIMENTAL syntax-only report\n$diagnostics"
    puts $diagnostics
    # check_syntax may return diagnostics instead of raising a Tcl error.
    if {[regexp -nocase {(^|\n)[ \t]*ERROR([ :\[]|$)} $diagnostics]} {
        error "Syntax errors were returned by check_syntax; see syntax.rpt."
    }
}
