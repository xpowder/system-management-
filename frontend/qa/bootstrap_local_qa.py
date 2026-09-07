"""Create isolated local QA data. Never reads Railway hosts for writes."""
from __future__ import annotations

import json
import os
import secrets
import sys
from datetime import date, time, timedelta
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(r"c:\Users\PC\OneDrive\Bureau\Work_Projects\system Booking")
QA_DIR = Path(__file__).resolve().parent
CREDENTIALS_PATH = QA_DIR / ".qa-credentials.json"
FORBIDDEN = ("railway.internal", "rlwy.net", "proxy.rlwy", "railway.app")


def apply_local_env() -> None:
    os.environ["DJANGO_SETTINGS_MODULE"] = "homezup.settings"
    os.environ["DJANGO_DEBUG"] = "True"
    os.environ["DJANGO_HTTPS"] = "False"
    os.environ["RAILWAY_ENVIRONMENT"] = ""
    os.environ["DATABASE_URL"] = ""
    os.environ["DATABASE_PRIVATE_URL"] = ""
    os.environ["DATABASE_PUBLIC_URL"] = ""
    os.environ["PGHOST"] = "127.0.0.1"
    os.environ["PGPORT"] = "55432"
    os.environ["PGDATABASE"] = "homezup_frontend_qa"
    os.environ["PGUSER"] = "homezup_test"
    os.environ["PGPASSWORD"] = ""
    os.chdir(BACKEND_ROOT)
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))


def abort_if_unsafe(db: dict) -> None:
    blob = " ".join(str(db.get(key, "")) for key in ("HOST", "NAME", "ENGINE", "USER")).lower()
    if any(marker in blob for marker in FORBIDDEN):
        raise SystemExit("UNSAFE DATABASE TARGET — aborting")
    host = str(db.get("HOST") or "")
    if host and host not in {"127.0.0.1", "localhost", ""}:
        raise SystemExit(f"UNSAFE DATABASE HOST {host} — aborting")


def print_target(db: dict) -> None:
    engine = "PostgreSQL" if "postgresql" in str(db.get("ENGINE", "")).lower() else str(db.get("ENGINE"))
    print("Environment: LOCAL QA")
    print(f"Database: {engine}")
    print(f"Host: {db.get('HOST') or 'n/a'}")
    print(f"Port: {db.get('PORT') or 'n/a'}")
    print(f"Database: {db.get('NAME')}")


def make_password() -> str:
    return f"Qa{secrets.token_urlsafe(10)}9!"


def seed() -> None:
    from django.contrib.auth.models import Group, User
    from django.core.management import call_command
    from django.utils import timezone

    from fitness.models import (
        Attendance,
        ClassSchedule,
        GymExpense,
        GymNotification,
        GymPayment,
        Membership,
        MembershipPlan,
        Trainer,
        TrainingClass,
    )
    from users.models import ClientProfile, StaffProfile

    call_command("migrate", interactive=False, verbosity=1)

    reception_password = make_password()
    admin_password = make_password()

    reception, _ = User.objects.get_or_create(
        username="qa_reception",
        defaults={
            "first_name": "Reception",
            "last_name": "QA",
            "email": "qa.reception@example.test",
            "is_staff": True,
        },
    )
    reception.set_password(reception_password)
    reception.is_staff = True
    reception.is_active = True
    reception.save()
    Group.objects.get_or_create(name="Reception")[0].user_set.add(reception)
    StaffProfile.objects.get_or_create(user=reception)

    admin, _ = User.objects.get_or_create(
        username="qa_admin",
        defaults={
            "first_name": "Admin",
            "last_name": "QA",
            "email": "qa.admin@example.test",
            "is_staff": True,
            "is_superuser": False,
        },
    )
    admin.set_password(admin_password)
    admin.is_staff = True
    admin.is_active = True
    admin.save()
    Group.objects.get_or_create(name="Admin")[0].user_set.add(admin)
    StaffProfile.objects.get_or_create(user=admin)

    plan, _ = MembershipPlan.objects.get_or_create(
        name="QA Monthly 200",
        defaults={"duration_months": 1, "price": Decimal("200.00"), "description": "QA plan", "is_active": True},
    )
    boxing, _ = TrainingClass.objects.get_or_create(
        name="QA Boxing",
        class_type="boxing",
        defaults={"price_per_member": Decimal("150.00"), "is_active": True},
    )
    trainer, _ = Trainer.objects.get_or_create(
        first_name="Nabil",
        last_name="Coach",
        defaults={"specialization": "Boxing", "phone": "0600000001", "monthly_pay": Decimal("3000.00")},
    )
    ClassSchedule.objects.get_or_create(
        training_class=boxing,
        weekday=0,
        start_time=time(18, 0),
        end_time=time(19, 30),
        defaults={"trainer": trainer, "location": "Ring A", "is_active": True},
    )
    today = timezone.localdate()
    GymExpense.objects.get_or_create(
        category="electricity",
        title="QA electricity",
        year=today.year,
        month=today.month,
        defaults={"amount": Decimal("450.00"), "notes": "Local QA only"},
    )

    def ensure_member(first: str, last: str, phone: str, id_number: str, active: bool = True) -> ClientProfile:
        username = f"qa_{id_number.lower()}"
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"first_name": first, "last_name": last, "email": f"{username}@example.test"},
        )
        if created:
            user.set_unusable_password()
            user.save()
        else:
            user.first_name = first
            user.last_name = last
            user.save(update_fields=["first_name", "last_name"])
        profile, _ = ClientProfile.objects.get_or_create(
            user=user,
            defaults={"phone": phone, "id_number": id_number, "city": "Casablanca", "is_active": active},
        )
        if profile.is_active != active:
            profile.is_active = active
            profile.save(update_fields=["is_active"])
        return profile

    pay_member = ensure_member("Pay", "Balance", "0611000001", "QAPAY001")
    search_member = ensure_member("Zaynab", "QaSearch", "0611000002", "QASEARCH01")
    twin_a = ensure_member("Karim", "Twin", "0611000003", "QATWIN01")
    twin_b = ensure_member("Karim", "Twins", "0611000004", "QATWIN02")
    inactive = ensure_member("Inactive", "Member", "0611000005", "QAINACT01", active=False)

    start = today.replace(day=1)
    end = start + timedelta(days=30)

    def ensure_membership(member: ClientProfile, notes: str) -> Membership:
        membership, created = Membership.objects.get_or_create(
            member=member,
            plan=plan,
            start_date=start,
            defaults={"end_date": end, "price": Decimal("200.00"), "notes": notes},
        )
        if created is False:
            membership.end_date = end
            membership.price = Decimal("200.00")
            membership.notes = notes
            membership.save()
        return membership

    pay_membership = ensure_membership(pay_member, "QA payment remaining 100")
    if not pay_membership.payments.exists():
        GymPayment.objects.create(
            membership=pay_membership,
            amount=Decimal("100.00"),
            received_by="seed",
            notes="Initial QA balance",
            idempotency_key="seed-pay-balance-100",
        )
    ensure_membership(search_member, "Searchable membership")
    ensure_membership(twin_a, "Twin A")
    ensure_membership(twin_b, "Twin B")

    if not Attendance.objects.filter(member=pay_member).exists():
        Attendance.objects.create(member=pay_member, visit_date=today - timedelta(days=1), checked_out_at=timezone.now())

    GymNotification.objects.get_or_create(
        recipient=reception,
        title="QA desk notice",
        defaults={"category": "system", "message": "Local frontend QA notification", "is_read": False},
    )
    GymNotification.objects.get_or_create(
        recipient=admin,
        title="QA admin notice",
        defaults={"category": "system", "message": "Local admin QA notification", "is_read": False},
    )

    existing_bulk = ClientProfile.objects.filter(id_number__startswith="QABULK").count()
    needed = max(0, 620 - existing_bulk)
    first_names = ["Amine", "Sara", "Youssef", "Lina", "Omar", "Nora", "Hamza", "Imane"]
    last_names = ["Alaoui", "Benali", "Idrissi", "Tahiri", "Mansouri", "Chraibi"]
    users = []
    profiles = []
    start_index = existing_bulk + 1
    for index in range(start_index, start_index + needed):
        first = first_names[index % len(first_names)]
        last = last_names[index % len(last_names)]
        username = f"qa_bulk_{index:04d}"
        users.append(
            User(
                username=username,
                first_name=first,
                last_name=last,
                email=f"{username}@example.test",
                password="!",
            )
        )
    if users:
        User.objects.bulk_create(users, batch_size=200)
        created_users = list(User.objects.filter(username__startswith="qa_bulk_").order_by("id"))
        have = set(ClientProfile.objects.filter(user__username__startswith="qa_bulk_").values_list("user_id", flat=True))
        for user in created_users:
            if user.id in have:
                continue
            number = user.username.split("_")[-1]
            profiles.append(
                ClientProfile(
                    user=user,
                    phone=f"0699{number}00",
                    id_number=f"QABULK{number}",
                    city="Rabat",
                    is_active=True,
                )
            )
        ClientProfile.objects.bulk_create(profiles, batch_size=200)

    member_count = ClientProfile.objects.count()
    CREDENTIALS_PATH.write_text(
        json.dumps(
            {
                "reception": {"username": "qa_reception", "password": reception_password},
                "admin": {"username": "qa_admin", "password": admin_password},
                "pay_member_id": pay_member.id,
                "pay_membership_id": pay_membership.id,
                "search_member_id": search_member.id,
                "inactive_member_id": inactive.id,
                "search_name": "Zaynab QaSearch",
                "member_count": member_count,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Seed complete. members={member_count}")
    print("Credentials written to qa/.qa-credentials.json (not for reports).")


def main() -> None:
    apply_local_env()
    import django

    django.setup()
    from django.conf import settings

    db = settings.DATABASES["default"]
    abort_if_unsafe(db)
    print_target(db)
    if "--verify-only" in sys.argv:
        return
    seed()


if __name__ == "__main__":
    main()
