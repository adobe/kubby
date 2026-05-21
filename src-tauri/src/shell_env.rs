/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

use std::collections::HashMap;
use std::sync::OnceLock;

/// Cached shell environment - loaded once from user's login shell
static SHELL_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Load environment variables from the user's login shell.
/// This spawns an interactive login shell to properly source all config files.
fn load_shell_env() -> HashMap<String, String> {
    let mut env_map = HashMap::new();
    
    // Get the user's default shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    
    // Try interactive login shell first (-i -l)
    // This sources both login files (.zprofile) AND interactive files (.zshrc)
    // which is where most users set their environment variables
    let output = std::process::Command::new(&shell)
        .args(["-i", "-l", "-c", "env"])
        .stderr(std::process::Stdio::null()) // Suppress shell startup messages
        .output();
    
    if let Ok(output) = &output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some((key, value)) = line.split_once('=') {
                    env_map.insert(key.to_string(), value.to_string());
                }
            }
        }
    }
    
    // If interactive shell didn't work or returned empty, try login shell only
    if env_map.is_empty() {
        let output = std::process::Command::new(&shell)
            .args(["-l", "-c", "env"])
            .output();
        
        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some((key, value)) = line.split_once('=') {
                        env_map.insert(key.to_string(), value.to_string());
                    }
                }
            }
        }
    }
    
    // On macOS, also try launchctl for environment variables
    // This catches variables set via launchctl setenv
    #[cfg(target_os = "macos")]
    {
        for key in ["KUBECONFIG", "PATH", "HOME", "EDITOR", "KUBE_EDITOR", "TERMINAL"] {
            if !env_map.contains_key(key) || env_map.get(key).map(|v| v.is_empty()).unwrap_or(true) {
                if let Ok(output) = std::process::Command::new("launchctl")
                    .args(["getenv", key])
                    .output()
                {
                    if output.status.success() {
                        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if !value.is_empty() {
                            env_map.insert(key.to_string(), value);
                        }
                    }
                }
            }
        }
    }
    
    env_map
}

/// Get the cached shell environment
fn get_shell_env() -> &'static HashMap<String, String> {
    SHELL_ENV.get_or_init(load_shell_env)
}

/// Get an environment variable from the user's shell environment.
/// Prioritizes current process environment (user exports) over cached shell env.
pub fn get_env_var(key: &str) -> Option<String> {
    // First try the current process environment (respects user exports)
    if let Ok(value) = std::env::var(key) {
        if !value.is_empty() {
            return Some(value);
        }
    }
    
    // Fall back to cached shell environment (from login shell)
    if let Some(value) = get_shell_env().get(key) {
        if !value.is_empty() {
            return Some(value.clone());
        }
    }
    
    None
}

/// Well-known directories where tools are commonly installed.
/// Packaged macOS apps have a minimal PATH that doesn't include these.
const WELL_KNOWN_DIRS: &[&str] = &[
    "/usr/local/bin",
    "/opt/homebrew/bin",   // Apple Silicon Homebrew
    "/usr/bin",
    "/bin",
    "/opt/local/bin",      // MacPorts
    "/snap/bin",           // Snap on Linux
];

/// Home-relative directories where tools are commonly installed.
const HOME_RELATIVE_DIRS: &[&str] = &[
    "bin",
    ".local/bin",
    ".krew/bin",
    ".asdf/shims",
];

/// Build a robust PATH by merging the process PATH, shell PATH,
/// and well-known directories. This ensures tools are found even when
/// the app is launched from Dock/Spotlight with a minimal PATH.
pub fn build_full_path() -> String {
    let mut path_dirs: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let add_dir = |dir: &str, dirs: &mut Vec<String>, seen: &mut std::collections::HashSet<String>| {
        if !dir.is_empty() && seen.insert(dir.to_string()) {
            dirs.push(dir.to_string());
        }
    };

    // Start with the process PATH
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(':') {
            add_dir(dir, &mut path_dirs, &mut seen);
        }
    }

    // Merge the shell PATH (may have more dirs from .zshrc/.bashrc)
    if let Some(shell_path) = get_shell_env().get("PATH") {
        for dir in shell_path.split(':') {
            add_dir(dir, &mut path_dirs, &mut seen);
        }
    }

    // Add well-known directories that exist on disk
    for dir in WELL_KNOWN_DIRS {
        if seen.insert(dir.to_string()) && std::path::Path::new(dir).is_dir() {
            path_dirs.push(dir.to_string());
        }
    }

    // Add home-relative directories
    if let Ok(home) = std::env::var("HOME") {
        for rel in HOME_RELATIVE_DIRS {
            let dir = format!("{}/{}", home, rel);
            if seen.insert(dir.clone()) && std::path::Path::new(&dir).is_dir() {
                path_dirs.push(dir);
            }
        }
    }

    path_dirs.join(":")
}

/// Find an executable by name, searching the user's shell PATH
/// and well-known directories. Returns the full path if found, or None.
pub fn find_executable(name: &str) -> Option<String> {
    // If it's already an absolute path, check if it exists
    if name.starts_with('/') {
        if std::path::Path::new(name).exists() {
            return Some(name.to_string());
        }
        return None;
    }
    
    // Search the full merged PATH (process + shell + well-known dirs)
    for dir in build_full_path().split(':') {
        let full_path = format!("{}/{}", dir, name);
        if std::path::Path::new(&full_path).exists() {
            return Some(full_path);
        }
    }
    
    None
}
