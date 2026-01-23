use std::fs;
use std::path::PathBuf;

use include_dir::{include_dir, Dir};
use serde::Deserialize;

use crate::config::AiTool;
use crate::shell_env;
use crate::terminal;

// App version from Cargo.toml - used for workspace regeneration
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

// Template files embedded at compile time
const KUBECTL_READONLY_TEMPLATE: &str = include_str!("../ai_templates/bin/kubectl-readonly-template.sh");
const KUBECTL_FULL_TEMPLATE: &str = include_str!("../ai_templates/bin/kubectl-full.sh");
// AGENTS.md is the single source of truth for AI assistant instructions
// It gets written to .cursorrules, CLAUDE.md, and AGENTS.md in the workspace
const AI_INSTRUCTIONS: &str = include_str!("../ai_templates/AGENTS.md");
const AUGMENT_YAML: &str = include_str!("../ai_templates/augment.yaml");

// Embed the entire docs directory at compile time
static DOCS_DIR: Dir = include_dir!("$CARGO_MANIFEST_DIR/../docs");

// MCP config embedded directly (can't use include_str for .cursor directory)
const CURSOR_MCP_JSON: &str = r#"{
  "mcpServers": {
    "shell": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-shell"],
      "env": {
        "PATH": "${HOME}/.kubby/ai/bin:${PATH}"
      }
    }
  }
}"#;

/// Get the AI workspace directory path
fn get_ai_workspace_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "Could not determine HOME directory")?;
    Ok(PathBuf::from(home).join(".kubby").join("ai"))
}

/// Check if workspace needs regeneration based on version
fn needs_regeneration(workspace: &PathBuf) -> bool {
    let version_file = workspace.join(".version");
    match fs::read_to_string(&version_file) {
        Ok(version) => version.trim() != APP_VERSION,
        Err(_) => true, // File doesn't exist or can't be read
    }
}

/// Write the version file
fn write_version_file(workspace: &PathBuf) -> Result<(), String> {
    fs::write(workspace.join(".version"), APP_VERSION)
        .map_err(|e| format!("Failed to write version file: {}", e))
}

/// Write documentation files from embedded directory to workspace
fn write_docs_to_workspace(workspace: &PathBuf) -> Result<(), String> {
    fn write_dir_recursive(dir: &Dir, base_path: &PathBuf) -> Result<(), String> {
        for entry in dir.entries() {
            match entry {
                include_dir::DirEntry::Dir(d) => {
                    let name = d.path().file_name().and_then(|n| n.to_str()).unwrap_or("");
                    // Skip .vitepress and public directories
                    if name == ".vitepress" || name == "public" {
                        continue;
                    }
                    write_dir_recursive(d, base_path)?;
                }
                include_dir::DirEntry::File(f) => {
                    if f.path().extension().map_or(false, |ext| ext == "md") {
                        let file_path = base_path.join(f.path());
                        if let Some(parent) = file_path.parent() {
                            fs::create_dir_all(parent)
                                .map_err(|e| format!("Failed to create dir: {}", e))?;
                        }
                        fs::write(&file_path, f.contents())
                            .map_err(|e| format!("Failed to write {}: {}", f.path().display(), e))?;
                    }
                }
            }
        }
        Ok(())
    }
    
    write_dir_recursive(&DOCS_DIR, workspace)
}

/// Ensure the AI workspace directory exists with all necessary files
fn ensure_ai_workspace() -> Result<PathBuf, String> {
    let workspace = get_ai_workspace_dir()?;
    
    // Create base directories (always needed)
    fs::create_dir_all(workspace.join("bin"))
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    fs::create_dir_all(workspace.join(".cursor"))
        .map_err(|e| format!("Failed to create .cursor directory: {}", e))?;
    
    // Initialize git repo if it doesn't exist (required for Cursor to load .cursorrules)
    if !workspace.join(".git").exists() {
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(&workspace)
            .output()
            .map_err(|e| format!("Failed to initialize git repo: {}", e))?;
    }
    
    // Check if we need to regenerate static files (version changed or first run)
    if needs_regeneration(&workspace) {
        // Write all static template files (overwrite existing)
        // AI_INSTRUCTIONS (from AGENTS.md) is written to multiple files for different AI tools
        let static_files = [
            (".cursor/mcp.json", CURSOR_MCP_JSON),
            (".cursorrules", AI_INSTRUCTIONS),
            ("CLAUDE.md", AI_INSTRUCTIONS),
            ("AGENTS.md", AI_INSTRUCTIONS),
            ("augment.yaml", AUGMENT_YAML),
        ];
        
        for (path, content) in static_files {
            fs::write(workspace.join(path), content)
                .map_err(|e| format!("Failed to write {}: {}", path, e))?;
        }
        
        // Write documentation files
        write_docs_to_workspace(&workspace)?;
        
        // Update version file
        write_version_file(&workspace)?;
    }
    
    Ok(workspace)
}

/// Write the context file with current Kubernetes context information
fn write_context_file(
    workspace: &PathBuf,
    context: &str,
    namespace: &str,
    resource_type: Option<&str>,
    resource_name: Option<&str>,
    read_only: bool,
) -> Result<(), String> {
    let mode = if read_only { "READ-ONLY" } else { "READ-WRITE" };
    
    let mut content = format!(
        "# Kubby Kubernetes Context\n\n\
         - **Context**: {}\n\
         - **Namespace**: {}\n",
        context, namespace
    );
    
    if let Some(rt) = resource_type {
        content.push_str(&format!("- **Resource Type**: {}\n", rt));
    }
    
    if let Some(rn) = resource_name {
        content.push_str(&format!("- **Resource Name**: {}\n", rn));
    }
    
    content.push_str(&format!("- **Mode**: {}\n", mode));
    
    content.push_str(&format!(
        "\n## kubectl Usage\n\n\
         When using kubectl, always include these flags:\n\n\
         ```bash\n\
         kubectl --context {} --namespace {} <command>\n\
         ```\n",
        context, namespace
    ));
    
    if read_only {
        content.push_str(
            "\n## Read-Only Mode\n\n\
             You are in READ-ONLY mode. Only use these commands:\n\
             - `get`, `describe`, `logs`, `explain`, `top`\n\
             - `api-resources`, `api-versions`, `cluster-info`\n\
             - `config view`, `config get-contexts`, `config current-context`\n\
             - `version`, `auth can-i`, `diff`\n\n\
             Do NOT use: `apply`, `delete`, `edit`, `patch`, `scale`, `rollout`, `exec`, `run`\n"
        );
    }
    
    fs::write(workspace.join("context.md"), content)
        .map_err(|e| format!("Failed to write context.md: {}", e))?;
    
    Ok(())
}

/// Configure the kubectl wrapper script based on read-only setting
fn configure_kubectl_wrapper(
    workspace: &PathBuf,
    context: &str,
    namespace: &str,
    read_only: bool,
) -> Result<(), String> {
    let wrapper_content = if read_only {
        KUBECTL_READONLY_TEMPLATE
            .replace("{{CONTEXT}}", context)
            .replace("{{NAMESPACE}}", namespace)
    } else {
        KUBECTL_FULL_TEMPLATE.to_string()
    };
    
    let wrapper_path = workspace.join("bin").join("kubectl");
    fs::write(&wrapper_path, wrapper_content)
        .map_err(|e| format!("Failed to write kubectl wrapper: {}", e))?;
    
    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&wrapper_path, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set wrapper permissions: {}", e))?;
    }
    
    Ok(())
}

/// Input parameters for opening an AI tool
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiToolParams {
    pub tool: AiTool,
    pub context: String,
    pub namespace: String,
    pub resource_type: Option<String>,
    pub resource_name: Option<String>,
    pub read_only: bool,
}

/// ANSI color codes for terminal output
/// Using octal escape \033 instead of \x1b for better compatibility across shells and AppleScript
mod colors {
    pub const RESET: &str = "\\033[0m";
    pub const BLUE: &str = "\\033[34m";
    pub const WHITE: &str = "\\033[97m";
    pub const GRAY: &str = "\\033[90m";
    pub const GRAY_BG_WHITE: &str = "\\033[100;97m";   // Gray background, white text
    pub const YELLOW_BG_WHITE: &str = "\\033[43;1;90m"; // Yellow background, white text
}

/// A row in the info box with a label and value
struct InfoRow {
    label: String,
    value: String,
    /// Special formatting for the value (e.g., for READ-ONLY/READ-WRITE mode)
    value_style: Option<&'static str>,
}

/// Format a nice ASCII box with a title and content rows
/// Returns a shell command string that echoes the formatted box
/// Uses printf for more reliable escape handling and ASCII box characters
/// for better compatibility through AppleScript
fn format_info_box(title: &str, rows: &[InfoRow]) -> String {
    // Calculate the maximum content width
    let label_width = rows.iter().map(|r| r.label.len()).max().unwrap_or(0);
    let max_value_width = rows.iter().map(|r| r.value.len()).max().unwrap_or(0);
    let content_width = label_width + 2 + max_value_width; // "Label: Value"
    
    // Title needs some padding on each side
    let title_with_padding = format!(" {} ", title);
    let min_box_width = title_with_padding.len() + 4; // At least 2 chars of border on each side
    
    // Box inner width (content area, not including the | borders)
    let inner_width = content_width.max(min_box_width) + 2; // +2 for padding on each side
    
    // Build printf commands (more reliable than echo -e through AppleScript)
    let mut lines = Vec::new();
    
    // Empty line before
    lines.push("echo".to_string());
    
    // Top border with title: ----- Title -----
    let remaining = inner_width - title_with_padding.len();
    let left_dashes = remaining / 2;
    let right_dashes = remaining - left_dashes;
    let top_line = format!(
        "printf '{}-{}{}{}{}{}-{}\\n'",
        colors::BLUE,
        "-".repeat(left_dashes),
        colors::WHITE,
        title_with_padding,
        colors::BLUE,
        "-".repeat(right_dashes),
        colors::RESET
    );
    lines.push(top_line);
    
    // Content rows
    for row in rows {
        let label_padded = format!("{:>width$}", row.label, width = label_width);
        let value_display = if let Some(style) = row.value_style {
            format!("{}{}{}", style, row.value, colors::RESET)
        } else {
            row.value.clone()
        };
        
        // Calculate padding needed after value (accounting for visible width only)
        // Format is: | {label}: {value}{padding}|
        // Visible chars: 1 (space) + label + 2 (": ") + value + padding = inner_width
        let visible_content_len = label_width + 2 + row.value.len(); // "Label: Value" visible length
        let padding_needed = inner_width.saturating_sub(1 + visible_content_len); // saturating_sub to avoid underflow
        
        let content_line = format!(
            "printf '{} {} {}{}{}: {}{}{} {}\\n'",
            colors::BLUE,
            colors::RESET,
            colors::GRAY,
            label_padded,
            colors::RESET,
            value_display,
            " ".repeat(padding_needed),
            colors::BLUE,
            colors::RESET
        );
        lines.push(content_line);
    }
    
    // Bottom border: ------------------
    let bottom_line = format!(
        "printf '{}-{}-{}\\n'",
        colors::BLUE,
        "-".repeat(inner_width),
        colors::RESET
    );
    lines.push(bottom_line);
    
    // Empty line after
    lines.push("echo".to_string());
    
    lines.join("; ")
}

/// Open an AI tool with the current Kubernetes context
#[tauri::command]
pub async fn open_ai_tool(params: OpenAiToolParams) -> Result<(), String> {
    // Ensure workspace exists
    let workspace = ensure_ai_workspace()?;
    
    // Write context file
    write_context_file(
        &workspace,
        &params.context,
        &params.namespace,
        params.resource_type.as_deref(),
        params.resource_name.as_deref(),
        params.read_only,
    )?;
    
    // Configure kubectl wrapper
    configure_kubectl_wrapper(
        &workspace,
        &params.context,
        &params.namespace,
        params.read_only,
    )?;
    
    // Get tool command info
    let tool_info = get_tool_command(&params.tool);
    let workspace_path = workspace.to_string_lossy();
    
    // Check if the tool exists
    shell_env::find_executable(tool_info.exe_name)
        .ok_or_else(|| format!("{} CLI not found in PATH. Please install it first.", tool_info.exe_name))?;
    
    if tool_info.use_terminal {
        // CLI-based tools run in a terminal for interactive use
        // Prepend our bin directory to PATH so our kubectl wrapper takes precedence
        let path_setup = format!("export PATH=\"{}/bin:$PATH\" && cd \"{}\" && ", 
            workspace_path, workspace_path);
        
        // Build context info to display before launching the tool
        let mode_text = if params.read_only { "READ-ONLY" } else { "READ-WRITE" };
        let mode_style = if params.read_only {
            Some(colors::GRAY_BG_WHITE)
        } else {
            Some(colors::YELLOW_BG_WHITE)
        };
        
        let mut rows = vec![
            InfoRow { label: "Context".to_string(), value: params.context.clone(), value_style: None },
            InfoRow { label: "Namespace".to_string(), value: params.namespace.clone(), value_style: None },
        ];
        if let Some(ref rt) = params.resource_type {
            rows.push(InfoRow { label: "Resource".to_string(), value: rt.clone(), value_style: None });
        }
        if let Some(ref rn) = params.resource_name {
            rows.push(InfoRow { label: "Name".to_string(), value: rn.clone(), value_style: None });
        }
        rows.push(InfoRow { label: "Mode".to_string(), value: mode_text.to_string(), value_style: mode_style });
        
        let context_display = format!("{} && ", format_info_box("Kubby AI", &rows));
        
        let full_command = format!("{}{}{}", path_setup, context_display, tool_info.command);
        
        terminal::open_terminal_with_command(full_command).await?;
    } else {
        // GUI-based tools (like Cursor IDE) can be launched directly
        let exe_path = shell_env::find_executable(tool_info.exe_name)
            .ok_or_else(|| format!("{} not found", tool_info.exe_name))?;
        let mut cmd = tokio::process::Command::new(&exe_path);
        cmd.args(tool_info.args);
        cmd.current_dir(&workspace);
        
        // Apply shell environment
        if let Some(path) = shell_env::get_env_var("PATH") {
            let new_path = format!("{}:{}", workspace.join("bin").display(), path);
            cmd.env("PATH", new_path);
        }
        if let Some(home) = shell_env::get_env_var("HOME") {
            cmd.env("HOME", home);
        }
        
        cmd.spawn()
            .map_err(|e| format!("Failed to launch {}: {}", tool_info.exe_name, e))?;
    }
    
    Ok(())
}

/// Information about how to launch an AI tool
struct ToolCommand {
    /// Executable name to find in PATH
    exe_name: &'static str,
    /// Full command string (for terminal-based tools)
    command: &'static str,
    /// Arguments (for GUI-based tools launched directly)
    args: Vec<&'static str>,
    /// Whether to run in a terminal (true for CLI tools, false for GUI tools)
    use_terminal: bool,
}

/// Get the command and arguments for each AI tool
fn get_tool_command(tool: &AiTool) -> ToolCommand {
    match tool {
        AiTool::CursorAgent => ToolCommand {
            exe_name: "cursor",
            command: "cursor agent",
            args: vec!["agent"],
            use_terminal: true,
        },
        AiTool::Cursor => ToolCommand {
            exe_name: "cursor",
            command: "cursor . --new-window",
            args: vec![".", "--new-window"],
            use_terminal: false,
        },
        AiTool::Claude => ToolCommand {
            exe_name: "claude",
            command: "claude",
            args: vec![],
            use_terminal: true,
        },
        AiTool::Augment => ToolCommand {
            exe_name: "auggie",
            command: "auggie chat",
            args: vec!["chat"],
            use_terminal: true,
        },
        AiTool::Codex => ToolCommand {
            exe_name: "codex",
            command: "codex",
            args: vec![],
            use_terminal: true,
        },
    }
}

