#[cfg(desktop)]
use tauri::Manager;
use tauri::webview::{PermissionKind, PermissionResponse};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Opening a biggle:// link while Bigglenet is running starts a second copy. This hands
    // the link to the window that's already open (the deep-link plugin delivers it) and
    // brings that window forward.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }))
            // Updates come from the latest GitHub release, signed with the Bigglenet key.
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // Voice and video calls in chat.biggle need the microphone and camera. The system
        // still asks the person the first time (macOS, Windows privacy settings).
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Microphone | PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            if let Some(window) = _app.get_webview_window("main") {
                window.with_webview(|webview| {
                    use webkit2gtk::{SettingsExt, WebViewExt};
                    if let Some(settings) = webview.inner().settings() {
                        settings.set_enable_media_stream(true);
                        settings.set_enable_webrtc(true);
                    }
                })?;
            }
            // macOS registers biggle:// from Info.plist. Linux, and Windows dev builds,
            // register it when the app starts.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Bigglenet");
}
