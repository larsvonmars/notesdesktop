use keyring::Entry;
use serde::Serialize;
use serde_json::{json, Value};

const DEEPSEEK_API_URL: &str = "https://api.deepseek.com/chat/completions";
// The app always talks to the newest DeepSeek Flash (V4.1) with thinking enabled.
// Keep in sync with lib/ai-model.ts.
const DEEPSEEK_MODEL: &str = "deepseek-flash";
const KEYRING_SERVICE: &str = "notesdesktop";
const KEYRING_USERNAME: &str = "deepseek_api_key";

#[derive(Debug, Serialize)]
pub struct AIKeyStatus {
    pub available: bool,
    pub source: String,
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USERNAME)
        .map_err(|e| format!("Failed to access keychain: {e}"))
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

    Err(
        "AI API key not configured. Add DEEPSEEK_API_KEY or save a key in desktop settings."
            .to_string(),
    )
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
            if message.to_lowercase().contains("no entry")
                || message.to_lowercase().contains("not found")
            {
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

    // Model and thinking behaviour are pinned: clients cannot switch them.
    request_body["model"] = json!(DEEPSEEK_MODEL);
    request_body["thinking"] = json!({ "type": "enabled" });
    request_body["reasoning_effort"] = json!("high");

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
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| raw_body.clone());
        return Err(format!("AI request failed: {} {}", status.as_u16(), detail));
    }

    serde_json::from_str::<Value>(&raw_body)
        .map_err(|e| format!("Failed to parse AI response JSON: {e}"))
}

async fn ai_utility_request(endpoint: &str, payload: Value) -> Result<Value, String> {
    let key = resolve_api_key()?;
    let client = create_http_client()?;
    let response = client
        .post(format!("https://api.deepseek.com/v1/tools/{endpoint}"))
        .header("Content-Type", "application/json")
        .bearer_auth(key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("DeepSeek {endpoint} request failed: {e}"))?;

    let status = response.status();
    let raw_body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read DeepSeek {endpoint} response: {e}"))?;

    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&raw_body)
            .ok()
            .and_then(|value| {
                value
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or(raw_body);
        return Err(format!(
            "DeepSeek {endpoint} request failed: {} {}",
            status.as_u16(),
            detail
        ));
    }

    serde_json::from_str::<Value>(&raw_body)
        .map_err(|e| format!("Failed to parse DeepSeek {endpoint} response JSON: {e}"))
}

#[tauri::command]
pub async fn ai_search(payload: Value) -> Result<Value, String> {
    let query = payload
        .get("query")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|query| !query.is_empty() && query.chars().count() <= 128)
        .ok_or_else(|| "Search query must contain 1–128 characters.".to_string())?;
    let count = match payload.get("count") {
        None => 5,
        Some(value) => value.as_u64().ok_or_else(|| {
            "Search result count must be an integer between 1 and 50.".to_string()
        })?,
    };
    if !(1..=50).contains(&count) {
        return Err("Search result count must be between 1 and 50.".to_string());
    }
    let need_content = match payload.get("need_content") {
        None => false,
        Some(value) => value
            .as_bool()
            .ok_or_else(|| "need_content must be a boolean.".to_string())?,
    };

    let mut request = json!({
        "query": query,
        "count": count,
        "need_content": need_content,
    });
    let original_question = match payload.get("ori_question") {
        None | Some(Value::Null) => None,
        Some(Value::String(question)) => {
            let question = question.trim();
            if question.is_empty() {
                None
            } else {
                Some(question)
            }
        }
        Some(_) => return Err("ori_question must be a string.".to_string()),
    };
    if let Some(question) = original_question {
        if question.chars().count() > 128 {
            return Err("Original search question must not exceed 128 characters.".to_string());
        }
        request["ori_question"] = json!(question);
    }
    ai_utility_request("search", request).await
}

#[tauri::command]
pub async fn ai_fetch(payload: Value) -> Result<Value, String> {
    let raw_url = payload
        .get("url")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|url| !url.is_empty() && url.chars().count() <= 8192)
        .ok_or_else(|| {
            "Fetch URL must be a valid HTTP or HTTPS URL (maximum 8192 characters).".to_string()
        })?;
    let url = reqwest::Url::parse(raw_url).map_err(|_| {
        "Fetch URL must be a valid HTTP or HTTPS URL without credentials.".to_string()
    })?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err("Fetch URL must be a valid HTTP or HTTPS URL without credentials.".to_string());
    }
    ai_utility_request("fetch", json!({ "url": raw_url })).await
}
