#[cfg(desktop)]
use tauri::Manager;
use tauri::webview::{PermissionKind, PermissionResponse};

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod relay;

// Direct sites that need to be a top-level page: games that need cross-origin isolation (it's
// never given to a page inside another), and sites that won't be shown inside other apps. They
// get a web view of their own, laid over the tab's page area (a "site view"), or, if the person
// pops it out, a window of their own.

fn site_label(prefix: &str, site: &str) -> String {
    let safe: String = site.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    format!("{prefix}-{safe}")
}

/// Where to load a site from. `relay`: WebKit (macOS, Linux) doesn't understand COEP
/// "credentialless", so those games go through the relay on this computer. Windows' engine
/// understands it, so there the site loads as it is.
fn site_target(url: &str, relay: bool) -> Result<tauri::Url, String> {
    let target: tauri::Url = url.parse().map_err(|_| "That isn't a web address.")?;
    if !matches!(target.scheme(), "https" | "http") {
        return Err("That isn't a web address.".into());
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if relay {
        let port = relay::start(&target.origin().ascii_serialization())?;
        let query = target.query().map(|q| format!("?{q}")).unwrap_or_default();
        return format!("http://127.0.0.1:{port}{}{query}", target.path()).parse().map_err(|_| "bad address".into());
    }
    let _ = relay;
    Ok(target)
}

fn site_bounds(x: f64, y: f64, width: f64, height: f64) -> tauri::Rect {
    tauri::Rect {
        position: tauri::LogicalPosition::new(x, y).into(),
        size: tauri::LogicalSize::new(width.max(1.0), height.max(1.0)).into(),
    }
}

/// Show a site in the tab: its own web view over the tab's page area, at these bounds (in the
/// page's CSS pixels). Made the first time, moved and shown after that.
#[cfg(desktop)]
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn site_view_show(app: tauri::AppHandle, site: String, url: String, relay: bool, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    use tauri::Emitter;

    let label = site_label("view", &site);
    if let Some(view) = app.get_webview(&label) {
        view.set_bounds(site_bounds(x, y, width, height)).map_err(|e| e.to_string())?;
        return view.show().map_err(|e| e.to_string());
    }
    let window = app.get_window("main").ok_or("The Biggle window isn't open.")?;
    let main = app.clone();
    let builder = tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(site_target(&url, relay)?))
        // The tab shows the page's title, like any other tab.
        .on_document_title_changed(move |_, title| {
            let _ = main.emit("site-view-title", (&site, title));
        });
    let bounds = site_bounds(x, y, width, height);
    window.add_child(builder, bounds.position, bounds.size).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn site_view_hide(app: tauri::AppHandle, site: String) {
    if let Some(view) = app.get_webview(&site_label("view", &site)) {
        let _ = view.hide();
    }
}

#[cfg(desktop)]
#[tauri::command]
fn site_view_close(app: tauri::AppHandle, site: String) {
    if let Some(view) = app.get_webview(&site_label("view", &site)) {
        let _ = view.close();
    }
}

/// Open a site in a window of its own (popped out of its tab). If it's already open, it comes to
/// the front.
#[cfg(desktop)]
#[tauri::command]
fn open_site_window(app: tauri::AppHandle, site: String, url: String, title: String, relay: bool) -> Result<(), String> {
    use tauri::Emitter;

    let label = site_label("site", &site);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    let window = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(site_target(&url, relay)?))
        .title(title)
        .inner_size(1280.0, 760.0)
        .min_inner_size(400.0, 300.0)
        .build()
        .map_err(|e| e.to_string())?;
    // Let the tab know, so it can offer to open it again.
    let main = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = main.emit("site-window-closed", &site);
        }
    });
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn close_site_window(app: tauri::AppHandle, site: String) {
    if let Some(window) = app.get_webview_window(&site_label("site", &site)) {
        let _ = window.close();
    }
}

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
                // A window, not a webview window: it can hold site views as well.
                if let Some(window) = app.get_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }))
            // Updates come from the latest GitHub release, signed with the Bigglenet key.
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .invoke_handler(tauri::generate_handler![
                site_view_show,
                site_view_hide,
                site_view_close,
                open_site_window,
                close_site_window
            ]);
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // Voice and video calls in chat.biggle need the microphone and camera. The system
        // still asks the person the first time (macOS, Windows privacy settings). Only the
        // browser itself gets them, not sites open in windows of their own.
        .on_permission_request(|webview, kind| match kind {
            PermissionKind::Microphone | PermissionKind::Camera if webview.label() == "main" => PermissionResponse::Allow,
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
