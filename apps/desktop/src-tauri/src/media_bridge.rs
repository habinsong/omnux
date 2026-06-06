use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::Duration,
};

use serde::Deserialize;
use serde_json::json;

const DEFAULT_MEDIA_BRIDGE_PORT: &str = "41881";
const MAX_REQUEST_BYTES: usize = 16 * 1024;

#[derive(Deserialize)]
struct ControlRequest {
    action: String,
}

#[derive(Deserialize)]
struct SeekRequest {
    position: f64,
}

pub fn start() {
    let port = std::env::var("OMNUX_MEDIA_BRIDGE_PORT")
        .unwrap_or_else(|_| DEFAULT_MEDIA_BRIDGE_PORT.to_string());
    let address = format!("127.0.0.1:{port}");
    let _ = thread::Builder::new()
        .name("omnux-media-bridge".to_string())
        .spawn(move || run(&address));
}

fn run(address: &str) {
    let listener = match TcpListener::bind(address) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("[media-bridge] listener start failed ({address}): {error}");
            return;
        }
    };
    println!("[media-bridge] http://{address}/media");
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let _ = thread::Builder::new()
                    .name("omnux-media-request".to_string())
                    .spawn(move || handle(stream));
            }
            Err(error) => eprintln!("[media-bridge] connection failed: {error}"),
        }
    }
}

fn handle(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let request = match read_request(&mut stream) {
        Ok(request) => request,
        Err(message) => {
            write_json(&mut stream, 400, None, &json!({ "error": message }));
            return;
        }
    };
    let origin = request
        .headers
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("origin"))
        .map(|(_, value)| value.as_str());
    if origin.is_some_and(|value| !allowed_origin(value)) {
        write_json(
            &mut stream,
            403,
            None,
            &json!({ "error": "forbidden origin" }),
        );
        return;
    }
    if request.method == "OPTIONS" {
        write_empty(&mut stream, 204, origin);
        return;
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/media") => {
            let result = tauri::async_runtime::block_on(crate::media::get_media_info());
            match result {
                Ok(data) => write_json(&mut stream, 200, origin, &data),
                Err(message) => write_json(&mut stream, 500, origin, &json!({ "error": message })),
            }
        }
        ("POST", "/media/control") => {
            let payload = serde_json::from_slice::<ControlRequest>(&request.body);
            match payload {
                Ok(payload) => {
                    let result =
                        tauri::async_runtime::block_on(crate::media::control_media(payload.action));
                    write_result(&mut stream, origin, result);
                }
                Err(error) => write_json(
                    &mut stream,
                    400,
                    origin,
                    &json!({ "error": error.to_string() }),
                ),
            }
        }
        ("POST", "/media/seek") => {
            let payload = serde_json::from_slice::<SeekRequest>(&request.body);
            match payload {
                Ok(payload) => {
                    let result =
                        tauri::async_runtime::block_on(crate::media::seek_media(payload.position));
                    write_result(&mut stream, origin, result);
                }
                Err(error) => write_json(
                    &mut stream,
                    400,
                    origin,
                    &json!({ "error": error.to_string() }),
                ),
            }
        }
        _ => write_json(&mut stream, 404, origin, &json!({ "error": "not found" })),
    }
}

struct HttpRequest {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut bytes = Vec::with_capacity(2048);
    let mut buffer = [0_u8; 2048];
    let header_end = loop {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("empty request".to_string());
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err("request too large".to_string());
        }
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break index + 4;
        }
    };

    let header_text =
        std::str::from_utf8(&bytes[..header_end]).map_err(|error| error.to_string())?;
    let mut lines = header_text.split("\r\n");
    let mut request_line = lines
        .next()
        .ok_or_else(|| "request line missing".to_string())?
        .split_whitespace();
    let method = request_line
        .next()
        .ok_or_else(|| "method missing".to_string())?
        .to_string();
    let path = request_line
        .next()
        .ok_or_else(|| "path missing".to_string())?
        .split('?')
        .next()
        .unwrap_or("/")
        .to_string();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect::<Vec<_>>();
    let content_length = headers
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.parse::<usize>().ok())
        .unwrap_or(0);
    while bytes.len().saturating_sub(header_end) < content_length {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err("request too large".to_string());
        }
    }
    let body_end = header_end.saturating_add(content_length).min(bytes.len());
    Ok(HttpRequest {
        method,
        path,
        headers,
        body: bytes[header_end..body_end].to_vec(),
    })
}

fn allowed_origin(origin: &str) -> bool {
    origin == "tauri://localhost"
        || origin == "http://tauri.localhost"
        || origin.starts_with("http://localhost:")
        || origin.starts_with("http://127.0.0.1:")
}

fn write_result(stream: &mut TcpStream, origin: Option<&str>, result: Result<(), String>) {
    match result {
        Ok(()) => write_json(stream, 200, origin, &json!({ "ok": true })),
        Err(message) => write_json(stream, 500, origin, &json!({ "error": message })),
    }
}

fn write_json<T: serde::Serialize>(
    stream: &mut TcpStream,
    status: u16,
    origin: Option<&str>,
    payload: &T,
) {
    let body = serde_json::to_vec(payload).unwrap_or_else(|_| b"{}".to_vec());
    write_response(
        stream,
        status,
        origin,
        "application/json; charset=utf-8",
        &body,
    );
}

fn write_empty(stream: &mut TcpStream, status: u16, origin: Option<&str>) {
    write_response(stream, status, origin, "text/plain; charset=utf-8", &[]);
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    origin: Option<&str>,
    content_type: &str,
    body: &[u8],
) {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Internal Server Error",
    };
    let cors = origin
        .map(|value| format!("Access-Control-Allow-Origin: {value}\r\nVary: Origin\r\n"))
        .unwrap_or_default();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\n{cors}Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nCache-Control: no-store\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
}
