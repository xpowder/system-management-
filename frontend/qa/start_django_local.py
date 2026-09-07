"""Start Django against the isolated local QA database only."""
from bootstrap_local_qa import abort_if_unsafe, apply_local_env, print_target

apply_local_env()

import django

django.setup()
from django.conf import settings
from django.core.management import call_command

db = settings.DATABASES["default"]
abort_if_unsafe(db)
print_target(db)
bind = "127.0.0.1:8000"
print(f"Starting Django on {bind}")
call_command("runserver", bind, use_reloader=False)
