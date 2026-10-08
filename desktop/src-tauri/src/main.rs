// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The Linux AppImage carries its own copy of WebKitGTK, and its DMA-BUF renderer can freeze
    // with some graphics drivers (the usual cause of Tauri apps hanging on Linux). Turn it off,
    // unless someone has set the variable themselves.
    if cfg!(target_os = "linux")
        && std::env::var_os("APPIMAGE").is_some()
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    bigglenet_lib::run()
}
