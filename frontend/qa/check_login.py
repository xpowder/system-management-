from bootstrap_local_qa import apply_local_env, abort_if_unsafe
import json
from pathlib import Path

apply_local_env()
import django
django.setup()
from django.conf import settings
abort_if_unsafe(settings.DATABASES["default"])
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

creds = json.loads(Path(__file__).with_name(".qa-credentials.json").read_text(encoding="utf-8"))
user = User.objects.filter(username=creds["reception"]["username"]).first()
print("user_exists", bool(user))
print("user_active", bool(user and user.is_active))
print("user_staff", bool(user and user.is_staff))
print("groups", list(user.groups.values_list("name", flat=True)) if user else [])
ok = authenticate(username=creds["reception"]["username"], password=creds["reception"]["password"])
print("authenticate_ok", bool(ok))
admin = authenticate(username=creds["admin"]["username"], password=creds["admin"]["password"])
print("admin_authenticate_ok", bool(admin))
from django.test import Client
client = Client(enforce_csrf_checks=True)
me = client.get("/api/auth/me")
print("test_me", me.status_code)
login = client.post(
    "/api/auth/login",
    data=json.dumps({"username": creds["reception"]["username"], "password": creds["reception"]["password"]}),
    content_type="application/json",
)
print("test_login", login.status_code, login.content[:120])
