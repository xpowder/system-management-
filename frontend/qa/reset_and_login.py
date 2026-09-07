from bootstrap_local_qa import apply_local_env, abort_if_unsafe
import json
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener

apply_local_env()
import django
django.setup()
from django.conf import settings
abort_if_unsafe(settings.DATABASES["default"])
from django.contrib.auth.models import User

simple = "QaReception99"
user = User.objects.get(username="qa_reception")
user.set_password(simple)
user.save()
print("password_reset", True)

path = Path(__file__).with_name(".qa-credentials.json")
creds = json.loads(path.read_text(encoding="utf-8"))
creds["reception"]["password"] = simple
admin = User.objects.get(username="qa_admin")
admin.set_password("QaAdmin99xx")
admin.save()
creds["admin"]["password"] = "QaAdmin99xx"
path.write_text(json.dumps(creds, indent=2), encoding="utf-8")

cj = CookieJar()
opener = build_opener(HTTPCookieProcessor(cj))
try:
    opener.open(Request("http://127.0.0.1:8001/api/auth/me", headers={"Origin": "http://127.0.0.1:5173"}))
except Exception:
    pass
csrf = next((cookie.value for cookie in cj if cookie.name == "csrftoken"), "")
req = Request(
    "http://127.0.0.1:8001/api/auth/login",
    data=json.dumps({"username": "qa_reception", "password": simple}).encode(),
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
    print("http_login", res.status)
except Exception as exc:
    print("http_login_error", exc)
    if hasattr(exc, "read"):
        print("body", exc.read()[:200])
