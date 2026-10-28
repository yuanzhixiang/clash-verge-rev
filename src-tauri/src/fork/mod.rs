//! Fork-only features kept out of upstream files: the Surge profile bridge and the `vergectl` control API.
//! Wired in through a single `.plugin(fork::init())` so upstream merges stay conflict-free.

mod api;
mod bridge;
mod server;
mod settings;
mod surge;

use clash_verge_logging::{Type, logging};
use tauri::{Runtime, plugin::TauriPlugin};

use crate::process::AsyncHandler;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("verge-fork")
        .setup(|_app, _api| {
            start();
            Ok(())
        })
        .build()
}

fn start() {
    let settings = match settings::load() {
        Ok(settings) => settings,
        Err(err) => {
            logging!(error, Type::Setup, "[fork] cannot load fork settings: {err:#}");
            return;
        }
    };
    let bridge = bridge::init(settings);
    AsyncHandler::spawn(server::serve);
    AsyncHandler::spawn(move || bridge.watch());
}
