# P4B development prototype. NOT the official course Vivado procedure.
# See docs/EXPERIMENTAL-TESTING.md for AMD documentation and limitations.
proc p4b_write {name text} {
    set channel [open $name w]
    puts $channel $text
    close $channel
}

proc p4b_run {kind body} {
    set failed [catch {
        p4b_write version.txt [version -short]
        puts "P4B EXPERIMENTAL ${kind}: single-file development procedure"
        uplevel 1 $body
        # Do not use -quiet: it can turn command errors into TCL_OK.
        if {[get_msg_config -severity ERROR -count] > 0} {
            error "Vivado emitted ERROR messages; refusing to mark the run successful."
        }
        p4b_write status.txt "P4B_EXPERIMENTAL_SUCCESS $kind"
        puts "P4B_EXPERIMENTAL_SUCCESS $kind"
    } message options]
    if {$failed} {
        puts stderr "P4B_EXPERIMENTAL_FAILURE ${kind}: $message"
        if {[dict exists $options -errorinfo]} {
            puts stderr [dict get $options -errorinfo]
        }
        catch {p4b_write failure.txt $message}
        catch {p4b_write status.txt "P4B_EXPERIMENTAL_FAILURE $kind"}
        exit 1
    }
    exit 0
}
