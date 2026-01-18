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

// Re-export types for use by other modules
pub use types::{
    ColumnConfig, ColumnType, LabelSelector, ResourceColumnConfig, ResourceItem,
    ResourceListResponse, KUBECTL_TIMEOUT_SECS,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            terminal::open_terminal_with_command,
            port_forward::get_port_forward_targets,
            port_forward::start_port_forward,
            port_forward::stop_port_forward,
            port_forward::list_active_port_forwards,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
