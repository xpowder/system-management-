import json
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener

creds = json.loads(Path(__file__).with_name(".qa-credentials.json").read_text(encoding="utf-8"))
print("user", creds["reception"]["username"])
print("pw_len", len(creds["reception"]["password"]))
print("pw_has_bang", "!" in creds["reception"]["password"])

cj = CookieJar()
opener = build_opener(HTTPCookieProcessor(cj))
try:
    opener.open(Request("http://127.0.0.1:8001/api/auth/me", headers={"Origin": "http://127.0.0.1:5173"}))
except Exception as exc:
    print("me", type(exc).__name__)
csrf = next((cookie.value for cookie in cj if cookie.name == "csrftoken"), "")
payload = json.dumps({"username": creds["reception"]["username"], "password": creds["reception"]["password"]}).encode()
req = Request(
    "http://127.0.0.1:8001/api/auth/login",
    data=payload,
    headers={
        "Content-Type": "application/json",
        "X-CSRFToken": csrf,
        "Origin": "http://127.0.0.1:5173",
        "Referer": "http://127.0.0.1:5173/",
    },
    method="POST",
)
try:
    res = opener.open(req)
    print("login", res.status, res.read()[:120])
except Exception as exc:
    print("login_error", exc)
    if hasattr(exc, "read"):
        print("login_body", exc.read()[:200])
