//! A small relay on this computer for sites that need cross-origin isolation (games that use
//! threads, like many WebAssembly ports). It fetches the site straight from the internet and
//! passes it on as it is, except for one header: "Cross-Origin-Embedder-Policy: credentialless",
//! which WebKit (the macOS and Linux engine) doesn't understand, becomes "require-corp", which it
//! does. Without that, those games say they aren't cross-origin isolated and won't start.
//!
//! Each site gets its own port, the same one every time, so what the site saves stays put.

use std::collections::HashMap;
use std::io::Read;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

static RELAYS: Mutex<Option<HashMap<String, u16>>> = Mutex::new(None);

/// Most a page can send in one go (a form, a save file).
const MAX_UPLOAD: u64 = 50 * 1024 * 1024;

/// Start relaying `origin` (like "https://example.com"), or find the relay that's already
/// running. Returns its port on 127.0.0.1.
pub fn start(origin: &str) -> Result<u16, String> {
    let mut relays = RELAYS.lock().map_err(|_| "relay lock")?;
    let relays = relays.get_or_insert_with(HashMap::new);
    if let Some(port) = relays.get(origin) {
        return Ok(*port);
    }
    let first = 41000 + (hash(origin) % 8000) as u16;
    for port in first..first + 20 {
        if let Ok(server) = tiny_http::Server::http(("127.0.0.1", port)) {
            let upstream = origin.to_string();
            thread::spawn(move || serve(server, upstream, port));
            relays.insert(origin.to_string(), port);
            return Ok(port);
        }
    }
    Err("Couldn't find a free port for the site.".into())
}

/// FNV-1a: a stable number for each site, so it keeps its port between launches.
fn hash(text: &str) -> u32 {
    text.bytes().fold(0x811c9dc5, |h, b| (h ^ b as u32).wrapping_mul(0x01000193))
}

fn serve(server: tiny_http::Server, upstream: String, port: u16) {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout_connect(Duration::from_secs(15))
        .build();
    let local = format!("http://127.0.0.1:{port}");
    for request in server.incoming_requests() {
        let (agent, upstream, local) = (agent.clone(), upstream.clone(), local.clone());
        thread::spawn(move || relay(request, &agent, &upstream, &local));
    }
}

fn relay(mut request: tiny_http::Request, agent: &ureq::Agent, upstream: &str, local: &str) {
    // Only for this computer's browser, by this address (a page elsewhere can't point its own
    // name at 127.0.0.1 and read through the relay).
    let host = &local["http://".len()..];
    if !request.headers().iter().any(|h| h.field.equiv("Host") && h.value.as_str() == host) {
        let _ = request.respond(tiny_http::Response::empty(403));
        return;
    }

    let method = request.method().as_str().to_string();
    let mut out = agent.request(&method, &format!("{upstream}{}", request.url()));
    for h in request.headers() {
        let name = h.field.as_str().as_str().to_ascii_lowercase();
        if matches!(
            name.as_str(),
            "host" | "connection" | "keep-alive" | "upgrade" | "accept-encoding" | "content-length" | "transfer-encoding"
        ) {
            continue;
        }
        // Origin and Referer name the relay; the site expects its own address.
        out = out.set(&name, &h.value.as_str().replace(local, upstream));
    }
    // Bodies pass through untouched, so ask for them uncompressed.
    out = out.set("Accept-Encoding", "identity");

    let result = if matches!(method.as_str(), "POST" | "PUT" | "PATCH") {
        let mut body = Vec::new();
        if request.as_reader().take(MAX_UPLOAD).read_to_end(&mut body).is_err() {
            let _ = request.respond(tiny_http::Response::empty(400));
            return;
        }
        out.send_bytes(&body)
    } else {
        out.call()
    };
    let response = match result {
        Ok(r) | Err(ureq::Error::Status(_, r)) => r,
        Err(_) => {
            let _ = request.respond(tiny_http::Response::from_string("Couldn't reach the site.").with_status_code(502));
            return;
        }
    };

    let mut headers = Vec::new();
    for name in response.headers_names() {
        let lower = name.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "connection" | "keep-alive" | "transfer-encoding" | "content-length" | "strict-transport-security" | "alt-svc"
        ) {
            continue;
        }
        for value in response.all(&name) {
            let value = match lower.as_str() {
                "cross-origin-embedder-policy" => "require-corp".to_string(),
                "location" => value.replace(upstream, local),
                "set-cookie" => local_cookie(value),
                // The relay speaks plain http on this computer; upgrading would break every request.
                "content-security-policy" => value.replace("upgrade-insecure-requests", ""),
                _ => value.to_string(),
            };
            if let Ok(header) = tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()) {
                headers.push(header);
            }
        }
    }
    let status = response.status();
    let length = response.header("Content-Length").and_then(|l| l.parse::<usize>().ok());
    let body = response.into_reader();
    let _ = request.respond(tiny_http::Response::new(tiny_http::StatusCode(status), headers, body, length, None));
}

/// A cookie the site set, made to stick on the relay's address.
fn local_cookie(value: &str) -> String {
    value
        .split(';')
        .filter_map(|part| {
            let part = part.trim();
            let lower = part.to_ascii_lowercase();
            if lower.starts_with("domain=") || lower == "secure" {
                None
            } else if lower == "samesite=none" {
                Some("SameSite=Lax".to_string())
            } else {
                Some(part.to_string())
            }
        })
        .collect::<Vec<_>>()
        .join("; ")
}
