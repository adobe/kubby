use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::thread;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Global storage for docs server port
static DOCS_PORT: OnceLock<u16> = OnceLock::new();
/// Global storage for docs directory path
static DOCS_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Get the path to the documentation directory.
/// Checks both bundled resources (production) and source directory (development).
fn find_docs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // First try bundled resources (production mode)
    if let Ok(resource_path) = app.path().resource_dir() {
        let bundled_docs = resource_path.join("docs");
        if bundled_docs.join("index.html").exists() {
            return Ok(bundled_docs);
        }
    }
    
    // Fall back to source directory (development mode)
    let dev_docs = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("docs/.vitepress/dist"))
        .ok_or("Failed to get parent directory")?;
    
    if dev_docs.join("index.html").exists() {
        return Ok(dev_docs);
    }
    
    Err("Documentation not found in bundled resources or source directory".to_string())
}

/// Get MIME type for a file extension
fn get_mime_type(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".woff") {
        "font/woff"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".ttf") {
        "font/ttf"
    } else {
        "application/octet-stream"
    }
}

/// Handle an HTTP request
fn handle_request(mut stream: TcpStream, docs_dir: &PathBuf) {
    let buf_reader = BufReader::new(&stream);
    let request_line = match buf_reader.lines().next() {
        Some(Ok(line)) => line,
        _ => return,
    };
    
    // Parse the request path
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    
    let mut path = parts[1].to_string();
    
    // Remove query string if present
    if let Some(idx) = path.find('?') {
        path = path[..idx].to_string();
    }
    
    // URL decode the path
    let path = urlencoding_decode(&path);
    
    // Remove leading slash and default to index.html
    let path = path.strip_prefix('/').unwrap_or(&path);
    let path = if path.is_empty() { "index.html" } else { path };
    
    let file_path = docs_dir.join(path);
    
    // Security: ensure the path doesn't escape the docs directory
    let canonical_docs = docs_dir.canonicalize().unwrap_or_else(|_| docs_dir.clone());
    let canonical_file = file_path.canonicalize().unwrap_or_else(|_| file_path.clone());
    
    if !canonical_file.starts_with(&canonical_docs) {
        let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nForbidden";
        let _ = stream.write_all(response.as_bytes());
        return;
    }
    
    // Try to read the file
    match fs::read(&file_path) {
        Ok(content) => {
            let mime = get_mime_type(path);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\n\r\n",
                mime,
                content.len()
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.write_all(&content);
        }
        Err(_) => {
            // Try adding .html extension for clean URLs
            let html_path = docs_dir.join(format!("{}.html", path));
            if let Ok(content) = fs::read(&html_path) {
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-cache\r\n\r\n",
                    content.len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.write_all(&content);
            } else {
                let body = format!("File not found: {}", path);
                let response = format!(
                    "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
            }
        }
    }
}

/// Simple URL decoding (handles %XX sequences)
fn urlencoding_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    
    result
}

/// Start the documentation HTTP server
fn start_server(docs_dir: PathBuf) -> Result<u16, String> {
    // Bind to a random available port on localhost
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind server: {}", e))?;
    
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();
    
    // Spawn a thread to handle requests
    thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let docs_dir = docs_dir.clone();
                thread::spawn(move || {
                    handle_request(stream, &docs_dir);
                });
            }
        }
    });
    
    Ok(port)
}

/// Initialize the docs module - must be called during app setup
pub fn init(app: &AppHandle) -> Result<(), String> {
    let docs_dir = find_docs_dir(app)?;
    eprintln!("Documentation directory: {:?}", docs_dir);
    
    let port = start_server(docs_dir.clone())?;
    eprintln!("Documentation server started on port {}", port);
    
    let _ = DOCS_DIR.set(docs_dir);
    let _ = DOCS_PORT.set(port);
    
    Ok(())
}

/// Open documentation in a WebView window.
pub fn open_documentation(app: &AppHandle) -> Result<(), String> {
    let port = DOCS_PORT.get().ok_or("Documentation server not initialized")?;
    
    // Check if docs window already exists
    if let Some(window) = app.get_webview_window("docs") {
        window.set_focus().map_err(|e| format!("Failed to focus docs window: {}", e))?;
        return Ok(());
    }

    // Create a new WebView window for documentation
    let url = format!("http://127.0.0.1:{}/", port);
    
    WebviewWindowBuilder::new(app, "docs", WebviewUrl::External(url.parse().unwrap()))
        .title("Kubby Documentation")
        .inner_size(1280.0, 960.0)
        .center()
        .build()
        .map_err(|e| format!("Failed to create documentation window: {}", e))?;

    Ok(())
}
