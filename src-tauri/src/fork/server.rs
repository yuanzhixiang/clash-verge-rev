use std::convert::Infallible;

use clash_verge_logging::{Type, logging};
use serde_json::{Value, json};
use warp::{
    Filter as _,
    http::{HeaderMap, Method, Response, StatusCode},
    hyper::body::Bytes,
};

use super::{
    api,
    bridge::{self, Bridge},
    settings::PORT,
};

const TOKEN_HEADER: &str = "x-verge-token";
/// Origins of the Clash Verge webview; browsers cannot forge these.
const APP_ORIGINS: &[&str] = &["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

fn reply(status: StatusCode, content_type: &str, body: String) -> Response<String> {
    Response::builder()
        .status(status)
        .header("content-type", content_type)
        .body(body)
        .unwrap_or_default()
}

fn json_reply(status: StatusCode, value: &Value) -> Response<String> {
    reply(status, "application/json", value.to_string())
}

fn is_app_origin(origin: &str) -> bool {
    APP_ORIGINS.contains(&origin)
        || (cfg!(debug_assertions)
            && (origin.starts_with("http://localhost:") || origin.starts_with("http://127.0.0.1:")))
}

/// Rejects DNS-rebinding requests that reach the loopback port under a foreign host name.
fn is_loopback_host(headers: &HeaderMap) -> bool {
    headers
        .get("host")
        .and_then(|host| host.to_str().ok())
        .is_some_and(|host| host == format!("127.0.0.1:{PORT}") || host == format!("localhost:{PORT}"))
}

async fn serve_surge(bridge: &'static Bridge, segments: &[&str]) -> Response<String> {
    let result = match segments {
        ["config.yaml"] => bridge.convert().await,
        ["remote", id] => bridge.remote(id).await,
        _ => return reply(StatusCode::NOT_FOUND, "text/plain", "not found".to_owned()),
    };
    match result {
        Ok(body) => Response::builder()
            .header("content-type", "text/yaml; charset=utf-8")
            .header("content-disposition", "attachment; filename*=UTF-8''Surge")
            .body(body)
            .unwrap_or_default(),
        Err(err) => reply(StatusCode::BAD_GATEWAY, "text/plain", format!("{err:#}")),
    }
}

async fn serve_api(
    bridge: &'static Bridge,
    method: &Method,
    path: &str,
    headers: &HeaderMap,
    body: &Bytes,
) -> Response<String> {
    let origin = headers
        .get("origin")
        .and_then(|origin| origin.to_str().ok())
        .filter(|origin| is_app_origin(origin))
        .map(str::to_owned);

    let mut response = if *method == Method::OPTIONS {
        reply(StatusCode::NO_CONTENT, "text/plain", String::new())
    } else {
        let token_ok = headers
            .get(TOKEN_HEADER)
            .and_then(|token| token.to_str().ok())
            .is_some_and(|token| bridge.token_matches(token));
        if !token_ok && origin.is_none() {
            return json_reply(StatusCode::UNAUTHORIZED, &json!({ "error": "unauthorized" }));
        }
        let payload = if body.is_empty() {
            Ok(Value::Null)
        } else {
            serde_json::from_slice(body).map_err(|err| err.to_string())
        };
        match payload {
            Ok(payload) => match api::handle(bridge, method.as_str(), path, payload).await {
                Ok(value) => json_reply(StatusCode::OK, &value),
                Err(error) => json_reply(StatusCode::BAD_REQUEST, &json!({ "error": error })),
            },
            Err(error) => json_reply(StatusCode::BAD_REQUEST, &json!({ "error": error })),
        }
    };

    if let Some(origin) = origin
        && let Ok(origin) = origin.parse()
    {
        let headers = response.headers_mut();
        headers.insert("access-control-allow-origin", origin);
        headers.insert(
            "access-control-allow-methods",
            warp::http::HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        headers.insert(
            "access-control-allow-headers",
            warp::http::HeaderValue::from_static("content-type, x-verge-token"),
        );
    }
    response
}

async fn route(
    method: Method,
    path: warp::path::FullPath,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response<String>, Infallible> {
    let Some(bridge) = bridge::get() else {
        return Ok(reply(
            StatusCode::SERVICE_UNAVAILABLE,
            "text/plain",
            "starting".to_owned(),
        ));
    };
    if !is_loopback_host(&headers) {
        return Ok(reply(StatusCode::FORBIDDEN, "text/plain", "forbidden".to_owned()));
    }
    let segments: Vec<&str> = path.as_str().trim_matches('/').split('/').collect();
    Ok(match segments.as_slice() {
        ["surge", token, rest @ ..] if bridge.token_matches(token) => serve_surge(bridge, rest).await,
        ["api", rest @ ..] => serve_api(bridge, &method, &rest.join("/"), &headers, &body).await,
        _ => reply(StatusCode::NOT_FOUND, "text/plain", "not found".to_owned()),
    })
}

pub async fn serve() {
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
        Ok(listener) => listener,
        Err(err) => {
            logging!(error, Type::Network, "[fork] cannot bind 127.0.0.1:{PORT}: {err}");
            return;
        }
    };
    let routes = warp::method()
        .and(warp::path::full())
        .and(warp::header::headers_cloned())
        .and(warp::body::bytes())
        .and_then(route);
    warp::serve(routes).incoming(listener).run().await;
}
