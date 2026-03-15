use keyring::Entry;
use serde::Serialize;
use serde_json::{json, Value};

const DEEPSEEK_API_URL: &str = "https://api.deepseek.com/chat/completions";
const KEYRING_SERVICE: &str = "notesdesktop";
const KEYRING_USERNAME: &str = "deepseek_api_key";

#[derive(Debug, Serialize)]
pub struct AIKeyStatus {
    pub available: bool,
    pub source: String,
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USERNAME).map_err(|e| format!("Failed to access keychain: {e}"))
}

fn resolve_api_key() -> Result<String, String> {
    if let Ok(entry) = keyring_entry() {
        if let Ok(key) = entry.get_password() {
            if !key.trim().is_empty() {
                return Ok(key);
            }
        }
    }

    if let Ok(env_key) = std::env::var("DEEPSEEK_API_KEY") {
        if !env_key.trim().is_empty() {
            return Ok(env_key);
        }
    }

    Err("AI API key not configured. Add DEEPSEEK_API_KEY or save a key in desktop settings.".to_string())
}

fn create_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))
}

#[tauri::command]
pub fn ai_key_status() -> Result<AIKeyStatus, String> {
    if let Ok(entry) = keyring_entry() {
        if let Ok(key) = entry.get_password() {
            if !key.trim().is_empty() {
                return Ok(AIKeyStatus {
                    available: true,
                    source: "keychain".to_string(),
                });
            }
        }
    }

    if let Ok(env_key) = std::env::var("DEEPSEEK_API_KEY") {
        if !env_key.trim().is_empty() {
            return Ok(AIKeyStatus {
                available: true,
                source: "env".to_string(),
            });
        }
    }

    Ok(AIKeyStatus {
        available: false,
        source: "none".to_string(),
    })
}

#[tauri::command]
pub fn ai_set_api_key(api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let entry = keyring_entry()?;
    entry
        .set_password(trimmed)
        .map_err(|e| format!("Failed to store API key in keychain: {e}"))
}

#[tauri::command]
pub fn ai_clear_api_key() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(e) => {
            // Missing entry is not a hard error for clear operations.
            let message = e.to_string();
            if message.to_lowercase().contains("no entry") || message.to_lowercase().contains("not found") {
                Ok(())
            } else {
                Err(format!("Failed to clear keychain API key: {e}"))
            }
        }
    }
}

#[tauri::command]
pub async fn ai_chat_json(payload: Value) -> Result<Value, String> {
    let key = resolve_api_key()?;

    let mut request_body = match payload {
        Value::Object(map) => Value::Object(map),
        _ => return Err("Invalid AI payload. Expected JSON object.".to_string()),
    };

    if request_body.get("model").is_none() {
        request_body["model"] = json!("deepseek-chat");
    }

    let client = create_http_client()?;
    let response = client
        .post(DEEPSEEK_API_URL)
        .header("Content-Type", "application/json")
        .bearer_auth(key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("AI request failed: {e}"))?;

    let status = response.status();
    let raw_body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read AI response: {e}"))?;

    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&raw_body)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.get("message")).and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| raw_body.clone());
        return Err(format!("AI request failed: {} {}", status.as_u16(), detail));
    }

    serde_json::from_str::<Value>(&raw_body)
        .map_err(|e| format!("Failed to parse AI response JSON: {e}"))
}