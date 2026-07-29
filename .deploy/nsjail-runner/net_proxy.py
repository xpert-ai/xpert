#!/usr/bin/env python3
import base64
import http.client
import json
import sys
from urllib.parse import urlsplit

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def fail(message: str) -> None:
    print(json.dumps({"error": message}), flush=True)
    raise SystemExit(1)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        port = int(payload["port"])
        method = str(payload["method"]).upper()
        path = str(payload["path"])
        headers_value = payload.get("headers", {})
        body = base64.b64decode(str(payload.get("bodyBase64", "")), validate=True)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        fail(f"Invalid proxy request: {error}")

    if port < 1 or port > 65535:
        fail("Invalid proxy port.")
    parsed_path = urlsplit(path)
    if not path.startswith("/") or parsed_path.scheme or parsed_path.netloc:
        fail("Invalid proxy path.")
    if not isinstance(headers_value, dict):
        fail("Invalid proxy headers.")

    headers: dict[str, str] = {}
    for name, value in headers_value.items():
        normalized_name = str(name).lower()
        if normalized_name in HOP_BY_HOP_HEADERS or normalized_name == "host":
            continue
        headers[normalized_name] = str(value)
    headers["host"] = f"127.0.0.1:{port}"

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    try:
        connection.request(method, path, body=body or None, headers=headers)
        response = connection.getresponse()
        if connection.sock:
            connection.sock.settimeout(None)
        response_headers = [
            [name, value]
            for name, value in response.getheaders()
            if name.lower() not in HOP_BY_HOP_HEADERS
        ]
        sys.stdout.buffer.write(
            (json.dumps({"headers": response_headers, "status": response.status}) + "\n").encode("utf-8")
        )
        sys.stdout.buffer.flush()
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
    except (OSError, http.client.HTTPException) as error:
        fail(f"Service proxy failed: {error}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
