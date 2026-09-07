from bootstrap_local_qa import apply_local_env, abort_if_unsafe

apply_local_env()
import django
django.setup()
from django.conf import settings
abort_if_unsafe(settings.DATABASES["default"])
from django.test import Client
from django.contrib.auth.models import User
from users.models import ClientProfile

profiles = list(ClientProfile.objects.filter(user__last_name__icontains="QaSearch").select_related("user")[:5])
print("matches", [(p.id, p.user.first_name, p.user.last_name, p.user.username) for p in profiles])
client = Client()
assert client.login(username="qa_reception", password="QaReception99")
res = client.get("/api/fitness/members?search=QaSearch&limit=20&offset=0")
print("status", res.status_code)
print("count_header", res.headers.get("X-Total-Count"))
print("body", res.content[:400])
