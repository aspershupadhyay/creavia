// Creavia desktop. Keeps a console away on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    creavia_lib::run()
}
