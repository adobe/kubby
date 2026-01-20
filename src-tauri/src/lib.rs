// Module declarations
mod config;
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

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

// Re-export types for use by other modules
pub use types::{
    ColumnConfig, ColumnType, LabelSelector, ResourceColumnConfig, ResourceItem,
    ResourceListResponse,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Create the "Open Config" menu item
            let open_config = MenuItemBuilder::with_id("open_config", "Open Config File")
                .accelerator("CmdOrCtrl+,")
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

            // Build the menu
            #[cfg(target_os = "macos")]
            let menu = Menu::with_items(app, &[&app_menu, &edit_menu])?;

            #[cfg(not(target_os = "macos"))]
            let menu = {
                // On non-macOS, put Open Config in File menu
                let file_menu_with_config = SubmenuBuilder::new(app, "File")
                    .item(&open_config)
                    .separator()
                    .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
                    .build()?;
                Menu::with_items(app, &[&file_menu_with_config, &edit_menu])?
            };

            // Set menu at the app level
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|_app, event| {
            if event.id() == "open_config" {
                // Get config path and open it
                match config::get_config_path() {
                    Ok(path) => {
                        let path_str = path.to_string_lossy().to_string();
                        if let Err(e) = editor::open_file_in_editor(path_str) {
                            eprintln!("Failed to open config: {}", e);
                        }
                    }
                    Err(e) => eprintln!("Failed to get config path: {}", e),
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
