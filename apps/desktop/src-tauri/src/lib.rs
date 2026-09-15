use serde::Deserialize;
use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;
use url::Url;

const LINUX_RUNTIME_SCRIPT: &str = include_str!("../resources/linux-local-runtime.sh");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlRequest {
    base_url: String,
    token: String,
    method: String,
    path: String,
    body: Option<Value>,
}

fn validate_base_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "invalid_base_url".to_string())?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let local = host == "127.0.0.1" || host == "localhost" || host == "::1";
    if url.scheme() != "https" && !(local && url.scheme() == "http") {
        return Err("https_required_for_remote_control".into());
    }
    if url.username() != "" || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("invalid_base_url".into());
    }
    Ok(url)
}

fn validate_path(path: &str) -> Result<(), String> {
    if path == "/health" || path.starts_with("/v2/") {
        if path.contains("..") || path.contains('\n') || path.contains('\r') {
            return Err("invalid_control_path".into());
        }
        return Ok(());
    }
    Err("unsupported_control_path".into())
}

#[tauri::command]
async fn control_request(request: ControlRequest) -> Result<String, String> {
    if request.token.trim().len() < 12 {
        return Err("invalid_token".into());
    }
    validate_path(&request.path)?;
    let mut base = validate_base_url(&request.base_url)?;
    let path = request.path.split('?').next().unwrap_or("/");
    base.set_path(path);
    base.set_query(request.path.split_once('?').map(|(_, query)| query));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent("GhostNexoraManager/2.0")
        .build()
        .map_err(|_| "http_client_failed".to_string())?;

    let method = match request.method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PATCH" => reqwest::Method::PATCH,
        _ => return Err("unsupported_method".into()),
    };

    let mut builder = client.request(method, base).bearer_auth(request.token.trim());
    if let Some(body) = request.body {
        builder = builder.json(&body);
    }
    let response = builder.send().await.map_err(|_| "control_api_unreachable".to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|_| "invalid_control_response".to_string())?;
    if !status.is_success() && !status.is_client_error() {
        return Err(format!("control_http_{}", status.as_u16()));
    }
    Ok(text)
}

#[tauri::command]
fn local_runtime_action(action: String) -> Result<String, String> {
    let action = action.as_str();
    if !matches!(action, "start" | "stop" | "restart" | "status") {
        return Err("unsupported_runtime_action".into());
    }

    #[cfg(target_os = "windows")]
    let output = {
        let verb = match action {
            "start" => "start",
            "stop" => "stop",
            "restart" => return Err("restart_requires_stop_start".into()),
            _ => "query",
        };
        Command::new("sc.exe")
            .args([verb, "ghost-nexora-bot"])
            .output()
            .map_err(|_| "windows_service_manager_unavailable".to_string())?
    };

    #[cfg(target_os = "linux")]
    let output = Command::new("systemctl")
        .args(if action == "status" {
            vec!["is-active", "ghost-nexora-bot.service"]
        } else {
            vec![action, "ghost-nexora-bot.service"]
        })
        .output()
        .map_err(|_| "systemd_unavailable".to_string())?;

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    return Err("unsupported_desktop_platform".into());

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(if stdout.is_empty() { "ok".into() } else { stdout })
    } else {
        Err(if stderr.is_empty() { "runtime_action_failed".into() } else { stderr })
    }
}

fn source_ref() -> &'static str {
    option_env!("GHOST_NEXORA_SOURCE_REF").unwrap_or("main")
}

#[cfg(target_os = "linux")]
fn run_linux_runtime_script(action: &str, extra: Option<&str>) -> Result<String, String> {
    if !matches!(action, "probe" | "install" | "start" | "stop" | "restart" | "update" | "repair" | "web-on" | "web-off" | "connection" | "owner-set") {
        return Err("unsupported_linux_runtime_action".into());
    }
    let mut child = Command::new("bash")
        .args(["-s", "--", action, source_ref(), extra.unwrap_or("")])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "linux_runtime_shell_unavailable".to_string())?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(LINUX_RUNTIME_SCRIPT.as_bytes()).map_err(|_| "linux_runtime_script_write_failed".to_string())?;
    }
    let output = child.wait_with_output().map_err(|_| "linux_runtime_script_failed".to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err(if stderr.is_empty() { "linux_runtime_action_failed".into() } else { stderr.chars().take(4000).collect() })
    }
}

#[tauri::command]
fn desktop_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
async fn linux_runtime_probe() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    { return tauri::async_runtime::spawn_blocking(|| run_linux_runtime_script("probe", None)).await.map_err(|_| "linux_runtime_probe_join_failed".to_string())?; }
    #[cfg(not(target_os = "linux"))]
    { Err("linux_runtime_unsupported".into()) }
}

#[tauri::command]
async fn linux_runtime_action(action: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    { return tauri::async_runtime::spawn_blocking(move || run_linux_runtime_script(&action, None)).await.map_err(|_| "linux_runtime_action_join_failed".to_string())?; }
    #[cfg(not(target_os = "linux"))]
    { let _ = action; Err("linux_runtime_unsupported".into()) }
}

#[tauri::command]
async fn linux_runtime_connection() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    { return tauri::async_runtime::spawn_blocking(|| run_linux_runtime_script("connection", None)).await.map_err(|_| "linux_runtime_connection_join_failed".to_string())?; }
    #[cfg(not(target_os = "linux"))]
    { Err("linux_runtime_unsupported".into()) }
}

#[tauri::command]
async fn linux_runtime_set_owner(phone: String) -> Result<String, String> {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 || digits.len() > 20 { return Err("invalid_owner_number".into()); }
    #[cfg(target_os = "linux")]
    { return tauri::async_runtime::spawn_blocking(move || run_linux_runtime_script("owner-set", Some(digits.as_str()))).await.map_err(|_| "linux_runtime_owner_join_failed".to_string())?; }
    #[cfg(not(target_os = "linux"))]
    { let _ = digits; Err("linux_runtime_unsupported".into()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            control_request,
            local_runtime_action,
            desktop_platform,
            linux_runtime_probe,
            linux_runtime_action,
            linux_runtime_connection,
            linux_runtime_set_owner,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ghost Nexora Manager");
}
