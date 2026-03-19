// Module declarations
mod ai_workspace;
mod config;
mod docs;
mod editor;
mod kubectl;
mod log_stream;
mod metrics;
mod port_forward;
mod resource_columns;
mod resource_list;
mod resources;
mod shell_env;
mod terminal;
mod types;

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

// Re-export types for use by other modules
pub use types::{
    ColumnConfig, ColumnType, LabelSelector, ResourceColumnConfig, ResourceItem,
    ResourceListResponse,
};

#[tauri::command]
fn zoom_webview(
    direction: String,
    window: tauri::WebviewWindow,
    zoom_state: tauri::State<'_, Mutex<f64>>,
) -> Result<(), String> {
    let mut zoom = zoom_state.lock().map_err(|e| e.to_string())?;
    match direction.as_str() {
        "in" => *zoom = (*zoom + 0.1).min(3.0),
        "out" => *zoom = (*zoom - 0.1).max(0.5),
        "reset" => *zoom = 1.0,
        _ => return Err("invalid direction".to_string()),
    }
    window.set_zoom(*zoom).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(Mutex::new(1.0_f64))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_webdriver::init());

    builder.setup(|app| {
            // Initialize documentation module (sets up docs directory path)
            if let Err(e) = docs::init(&app.handle()) {
                eprintln!("Failed to initialize documentation: {}", e);
            }

            // Create the "Open Config" menu item
            let open_config = MenuItemBuilder::with_id("open_config", "Open Config File")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            // Create the "Documentation" menu item
            let open_docs = MenuItemBuilder::with_id("open_docs", "Documentation")
                .accelerator("F1")
                .build(app)?;

            // Create macOS app menu with standard items
            #[cfg(target_os = "macos")]
            let app_menu = SubmenuBuilder::new(app, "Kubby")
                .item(&PredefinedMenuItem::about(app, Some("About Kubby"), None)?)
                .separator()
                .item(&open_config)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some("Hide Kubby"))?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit Kubby"))?)
                .build()?;

            // Create Edit menu with standard items (needed for Cmd+A, Cmd+C, Cmd+V to work)
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            // Create View menu with zoom controls
            let zoom_in = MenuItemBuilder::with_id("zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+Shift+=")
                .build(app)?;
            let zoom_out = MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;
            let zoom_reset = MenuItemBuilder::with_id("zoom_reset", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&zoom_in)
                .item(&zoom_out)
                .item(&zoom_reset)
                .build()?;

            // Create Help menu with Documentation
            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&open_docs)
                .build()?;

            // Build the menu
            #[cfg(target_os = "macos")]
            let menu = Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &help_menu])?;

            #[cfg(not(target_os = "macos"))]
            let menu = {
                // On non-macOS, put Open Config in File menu
                let file_menu_with_config = SubmenuBuilder::new(app, "File")
                    .item(&open_config)
                    .separator()
                    .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
                    .build()?;
                Menu::with_items(app, &[&file_menu_with_config, &edit_menu, &view_menu, &help_menu])?
            };

            // Set menu at the app level
            app.set_menu(menu)?;

            // Bind Cmd+= as secondary zoom-in shortcut (menu shows Cmd++ via Shift+=)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(r#"
                    document.addEventListener('keydown', (e) => {
                        const isZoomIn = (e.metaKey || e.ctrlKey) &&
                            (e.code === 'NumpadAdd' || (e.key === '=' && !e.shiftKey));
                        if (isZoomIn) {
                            e.preventDefault();
                            window.__TAURI_INTERNALS__.invoke('zoom_webview', { direction: 'in' });
                        }
                    });
                "#);
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "open_config" {
                // Get config path and open it
                match config::get_config_path() {
                    Ok(path) => {
                        let path_str = path.to_string_lossy().to_string();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = editor::open_file_in_editor(path_str).await {
                                eprintln!("Failed to open config: {}", e);
                            }
                        });
                    }
                    Err(e) => eprintln!("Failed to get config path: {}", e),
                }
            } else if event.id() == "open_docs" {
                // Open documentation in a WebView window
                if let Err(e) = docs::open_documentation(app) {
                    eprintln!("Failed to open documentation: {}", e);
                }
            } else if event.id() == "zoom_in" || event.id() == "zoom_out" || event.id() == "zoom_reset" {
                if let Some(window) = app.get_webview_window("main") {
                    let zoom_state = app.state::<Mutex<f64>>();
                    let mut zoom = zoom_state.lock().unwrap();
                    if event.id() == "zoom_reset" {
                        *zoom = 1.0;
                    } else if event.id() == "zoom_in" {
                        *zoom = (*zoom + 0.1).min(3.0);
                    } else {
                        *zoom = (*zoom - 0.1).max(0.5);
                    }
                    let _ = window.set_zoom(*zoom);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            zoom_webview,
            kubectl::kubectl,
            config::get_dashboard_config,
            config::check_config_exists,
            config::get_kube_contexts,
            config::get_namespaces_for_context,
            config::get_kubby_config_path,
            config::create_kubby_config,
            editor::open_file_in_editor,
            editor::edit_resource,
            resource_columns::get_resource_columns,
            resources::get_resource_types,
            resources::get_resource_detail,
            resources::delete_resource,
            resources::rolling_restart_deployment,
            resources::get_hpa_for_target,
            resources::get_pdb_for_deployment,
            resources::scale_deployment,
            resources::patch_hpa,
            resources::patch_pdb,
            resource_list::get_resources,
            resource_list::get_pod_containers,
            metrics::refresh_metrics_cache,
            log_stream::start_log_stream,
            log_stream::stop_log_stream,
            log_stream::fetch_historical_logs,
            terminal::open_terminal_with_command,
            port_forward::get_port_forward_targets,
            port_forward::start_port_forward,
            port_forward::stop_port_forward,
            port_forward::list_active_port_forwards,
            port_forward::check_dead_port_forwards,
            ai_workspace::open_ai_tool,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
