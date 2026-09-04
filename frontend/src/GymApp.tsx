import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  Dumbbell,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  gymApi,
  EXPENSE_CATEGORIES,
  type Attendance,
  type ClassRevenueReport,
  type FitnessClass,
  type GymDashboard,
  type GymExpense,
  type GymPayment,
  type Member,
  type Membership,
  type MonthlyOverview,
  type GymNotification,
  type Plan,
  type Trainer,
  type TrainerPayrollReport,
  type WhatsAppReminder,
  type WhatsAppReminderList,
} from "./gymApi";
import { bookingApi, type AdminUser } from "./api";
import { clock, date, LanguageSwitch, money, monthLabel, statusLabel, todayLabel, translate, useLang, type Msg } from "./i18n";
import { ThemeSwitch } from "./theme";
import "./App.css";

type PaymentPayload = {
  amount: number;
  received_by: string;
  notes: string;
  remaining?: number;
};

type OnPayment = (
  membershipId: number,
  payload: PaymentPayload,
) => Promise<GymPayment | void> | void;

function staffDisplayName(user: {
  first_name?: string;
  last_name?: string;
  username: string;
}) {
  const full = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return full || user.username;
}

let loggedInStaffName = "Admin";

function selectablePlans(plans: Plan[], currentId?: number | string | null) {
  const keep =
    currentId === undefined || currentId === null || currentId === ""
      ? null
      : Number(currentId);
  return plans.filter((plan) => plan.is_active || plan.id === keep);
}

function planDurationLabel(months: number, t: (key: Msg, vars?: Record<string, string | number>) => string) {
  return months === 1 ? t("plans.oneMonth") : t("plans.nMonths", { n: months });
}

function dismissOverlay(overlay: HTMLElement) {
  if (overlay.classList.contains("is-leaving")) return;
  overlay.classList.add("is-leaving");
  window.setTimeout(() => overlay.parentNode?.removeChild(overlay), 200);
}

function openRecordPaymentForm({
  memberLabel,
  membership,
  onPayment,
}: {
  memberLabel: string;
  membership: Membership;
  onPayment: OnPayment;
}) {
  document.querySelector(".member-details-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "member-details-overlay";
  overlay.onclick = (event) => {
    if (event.target === overlay) dismissOverlay(overlay);
  };
  const panel = document.createElement("section");
  panel.className = "member-details-panel form-panel";
  const label = document.createElement("span");
  label.className = "eyebrow";
  label.textContent = translate("pay.record");
  const heading = document.createElement("h2");
  heading.textContent = translate("pay.for", { name: memberLabel });
  const hint = document.createElement("p");
  hint.className = "payment-remaining-hint";
  hint.textContent = translate("pay.hint", { amount: money(membership.remaining_balance) });
  const row = document.createElement("div");
  row.className = "date-fields";
  const amountField = document.createElement("label");
  amountField.textContent = translate("pay.received");
  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.min = "0.01";
  amountInput.step = "0.01";
  amountInput.placeholder = "100";
  amountField.append(amountInput);
  const remainingField = document.createElement("label");
  remainingField.textContent = translate("pay.owes");
  const remainingInput = document.createElement("input");
  remainingInput.type = "number";
  remainingInput.min = "0";
  remainingInput.step = "0.01";
  remainingInput.placeholder = "20";
  remainingField.append(remainingInput);
  row.append(amountField, remainingField);
  const actions = document.createElement("div");
  actions.className = "form-actions";
  const cancel = document.createElement("button");
  cancel.className = "secondary";
  cancel.type = "button";
  cancel.textContent = translate("common.cancel");
  cancel.onclick = () => dismissOverlay(overlay);
  const save = document.createElement("button");
  save.className = "primary";
  save.type = "button";
  save.textContent = translate("pay.save");
  save.onclick = async () => {
    const amount = Number(amountInput.value);
    const remainingValue = remainingInput.value.trim();
    const remaining = remainingValue === "" ? undefined : Number(remainingValue);
    if (!amount || amount <= 0) return;
    if (remaining === undefined && amount > Number(membership.remaining_balance)) {
      hint.textContent = translate("pay.over");
      return;
    }
    if (remaining !== undefined && (!Number.isFinite(remaining) || remaining < 0)) return;
    save.disabled = true;
    try {
      await onPayment(membership.id, {
        amount,
        received_by: loggedInStaffName,
        notes:
          remaining === undefined
            ? translate("pay.note")
            : translate("pay.noteRemain", { n: remaining }),
        remaining,
      });
      dismissOverlay(overlay);
    } catch (e) {
      save.disabled = false;
      hint.textContent =
        e instanceof Error ? e.message : translate("pay.fail");
    }
  };
  actions.append(cancel, save);
  panel.append(label, heading, hint, row, actions);
  overlay.append(panel);
  document.body.append(overlay);
  amountInput.focus();
}

const PAGE_SIZE = 40;

function LoadMoreBar({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  const { t } = useLang();
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="load-more">
      <span>{t("list.shown", { shown: Math.min(shown, total), total })}</span>
      {shown < total && (
        <button type="button" className="secondary" onClick={onMore}>
          {t("list.showMore")}
        </button>
      )}
    </div>
  );
}

function isSafeWhatsAppUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "wa.me" || host === "api.whatsapp.com" || host === "web.whatsapp.com" || host.endsWith(".whatsapp.com");
  } catch {
    return false;
  }
}

function clipText(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asPositiveId(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function indexLatestMembership(items: Membership[]) {
  const grouped = new Map<number, Membership[]>();
  for (const item of items) {
    const list = grouped.get(item.member_id);
    if (list) list.push(item);
    else grouped.set(item.member_id, [item]);
  }
  const chosen = new Map<number, Membership>();
  for (const [id, group] of grouped) {
    chosen.set(
      id,
      group.find((item) => item.status === "active" || item.status === "expiring_soon") ?? group[0],
    );
  }
  return chosen;
}

function Toast({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  const { t } = useLang()
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [message])
  return (
    <div className="app-toast" role="status" aria-live="polite">
      <span className="app-toast-icon">
        <Check size={14} strokeWidth={2.5} />
      </span>
      <p>{message}</p>
      <button type="button" className="app-toast-close" onClick={onDismiss} aria-label={t("common.dismiss")}>
        <X size={13} strokeWidth={2.2} />
      </button>
    </div>
  )
}

function Badge({
  value,
  payment = false,
}: {
  value: string;
  payment?: boolean;
}) {
  return (
    <span className={`status ${payment ? "payment" : ""} ${value}`}>
      {statusLabel(value)}
    </span>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  className = "",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  className?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="stat-icon">
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`stat is-link ${className}`} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <article className={`stat ${className}`}>{inner}</article>;
}

type Page =
  | "dashboard"
  | "members"
  | "classes"
  | "memberships"
  | "plans"
  | "payments"
  | "attendance"
  | "reminders"
  | "trainers"
  | "expenses"
  | "reports"
  | "admin"
  | "notifications"

function getViewport() {
  const view = window.visualViewport
  if (view) return { width: view.width, height: view.height, top: view.offsetTop, left: view.offsetLeft }
  return { width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 }
}

function isCompactViewport() {
  return getViewport().width <= 620
}

function notificationDestination(item: GymNotification): { page: Page; status?: string } {
  if (item.title === "Membership expiring soon") return { page: "memberships", status: "expiring_soon" }
  if (item.title === "Membership expired") return { page: "memberships", status: "expired" }
  if (item.category === "members" || item.title === "New member registered") return { page: "members" }
  if (item.category === "payments") return { page: "payments" }
  if (item.category === "memberships") return { page: "memberships" }
  return { page: "notifications" }
}

function notificationOpenKey(item: GymNotification): Msg {
  if (item.title === "Membership expiring soon") return "notif.openExpiring"
  if (item.title === "Membership expired") return "notif.openExpired"
  if (item.category === "payments") return "notif.openPayments"
  if (item.category === "members" || item.title === "New member registered") return "notif.openMembers"
  if (item.category === "memberships") return "notif.openMemberships"
  return "notif.tapToOpen"
}

export default function GymApp({
  currentUser,
  onLogout,
}: {
  currentUser: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    is_staff: boolean;
    role?: string | null;
    phone?: string;
    date_joined?: string;
    last_login?: string | null;
  };
  onLogout: () => void;
}) {
  const { t, lang } = useLang();
  loggedInStaffName = staffDisplayName(currentUser);
  const [today, setToday] = useState(todayLabel)
  const [notifications, setNotifications] = useState<GymNotification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationMenuStyle, setNotificationMenuStyle] = useState<CSSProperties>({})
  const [notificationCompact, setNotificationCompact] = useState(false)
  const notificationBellRef = useRef<HTMLDivElement>(null)
  const notificationMenuRef = useRef<HTMLDivElement>(null)
  const knownNotificationIds = useRef<Set<number>>(new Set())
  const skipNotificationToast = useRef(true)
  const role = (currentUser.role || "").toLowerCase();
  const canAdminister = role
    ? ["admin", "super admin"].includes(role)
    : currentUser.is_staff;
  const logout = async () => {
    try {
      await bookingApi.logout();
    } finally {
      onLogout();
    }
  };
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === "/admin" && canAdminister
      ? "admin"
      : "dashboard",
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!canAdminister && (page === "admin" || page === "trainers" || page === "expenses")) setPage("dashboard");
  }, [canAdminister, page]);
  useEffect(() => {
    setToday(todayLabel());
    const timer = window.setInterval(() => setToday(todayLabel()), 60_000)
    return () => window.clearInterval(timer)
  }, [lang]);
  const refreshNotifications = async () => {
    try {
      const items = await gymApi.notifications('', false)
      if (!skipNotificationToast.current) {
        const incoming = items.filter(item => !knownNotificationIds.current.has(item.id) && !item.is_read)
        if (incoming[0]) {
          setNotice(`${incoming[0].title}: ${incoming[0].message}`)
        }
      }
      skipNotificationToast.current = false
      knownNotificationIds.current = new Set(items.map(item => item.id))
      setNotifications(items)
    } catch {
      return
    }
  }
  useEffect(() => {
    void refreshNotifications()
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void refreshNotifications()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const placeNotificationMenu = () => {
    const anchor = notificationBellRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const vp = getViewport()
    const compact = isCompactViewport()
    const pad = compact ? 10 : 12
    setNotificationCompact(compact)
    document.documentElement.classList.toggle("is-compact", compact)
    if (compact) {
      const left = vp.left + pad
      const width = Math.max(240, vp.width - pad * 2)
      const bottom = Math.max(pad, window.innerHeight - (vp.top + vp.height) + pad)
      const maxHeight = Math.max(220, vp.height - pad * 2)
      setNotificationMenuStyle({ top: "auto", left, width, bottom, maxHeight })
      return
    }
    const width = Math.min(380, vp.width - pad * 2)
    const left = Math.min(Math.max(vp.left + pad, rect.right - width), vp.left + vp.width - width - pad)
    const top = rect.bottom + 8
    setNotificationMenuStyle({
      top,
      left,
      width,
      bottom: "auto",
      maxHeight: Math.max(160, Math.min(440, vp.top + vp.height - top - pad)),
    })
  }
  useEffect(() => {
    const sync = () => {
      document.documentElement.classList.toggle("is-compact", isCompactViewport())
      if (notificationsOpen) placeNotificationMenu()
    }
    sync()
    window.addEventListener("resize", sync)
    window.addEventListener("scroll", sync, true)
    window.visualViewport?.addEventListener("resize", sync)
    window.visualViewport?.addEventListener("scroll", sync)
    return () => {
      document.documentElement.classList.remove("is-compact")
      window.removeEventListener("resize", sync)
      window.removeEventListener("scroll", sync, true)
      window.visualViewport?.removeEventListener("resize", sync)
      window.visualViewport?.removeEventListener("scroll", sync)
    }
  }, [notificationsOpen])
  useLayoutEffect(() => {
    if (notificationsOpen) placeNotificationMenu()
  }, [notificationsOpen])
  useEffect(() => {
    if (!notificationsOpen) return
    const previousOverflow = document.body.style.overflow
    if (isCompactViewport()) document.body.style.overflow = "hidden"
    const close = (event: Event) => {
      const target = event.target as Node
      if (notificationBellRef.current?.contains(target) || notificationMenuRef.current?.contains(target)) return
      setNotificationsOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [notificationsOpen])
  const unreadCount = notifications.filter(item => !item.is_read).length
  const markNotificationRead = async (id: number) => {
    try {
      const updated = await gymApi.markNotificationRead(id)
      setNotifications(current => current.map(item => item.id === id ? updated : item))
    } catch {
      return
    }
  }
  const deleteNotification = async (id: number) => {
    try {
      await gymApi.deleteNotification(id)
      setNotifications(current => current.filter(item => item.id !== id))
      knownNotificationIds.current.delete(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete notification.")
    }
  }
  const deleteAllNotifications = async () => {
    if (!notifications.length) return
    if (!window.confirm("Delete all notifications?")) return
    try {
      await gymApi.deleteAllNotifications()
      setNotifications([])
      knownNotificationIds.current = new Set()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete notifications.")
    }
  }
  const markAllNotificationsRead = async () => {
    try {
      await gymApi.markAllNotificationsRead()
      setNotifications(current => current.map(item => ({ ...item, is_read: true })))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to mark notifications as read.")
    }
  }
  const [dashboard, setDashboard] = useState<GymDashboard | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [classes, setClasses] = useState<FitnessClass[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [payments, setPayments] = useState<GymPayment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    if (!quiet) {
      setBusy(true);
      setError("");
    }
    try {
      const [
        stats,
        people,
        classList,
        planList,
        membershipList,
        paymentList,
        attendanceList,
        trainerList,
      ] = await Promise.all([
        gymApi.dashboard(),
        gymApi.members(),
        gymApi.classes(),
        gymApi.plans(),
        gymApi.memberships(),
        gymApi.payments(),
        gymApi.attendance(),
        canAdminister ? gymApi.trainers() : Promise.resolve([]),
      ]);
      setDashboard(stats);
      setMembers(people);
      setClasses(classList);
      setPlans(planList);
      setMemberships(membershipList);
      setPayments(paymentList);
      setAttendance(attendanceList);
      setTrainers(trainerList);
      if (quiet) void refreshNotifications();
      else await refreshNotifications();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFail"));
    } finally {
      if (!quiet) setBusy(false);
    }
  };

  const afterSave = (message: string) => {
    setNotice(message);
    void load({ quiet: true });
  };

  useEffect(() => {
    void load();
  }, []);

  const go = (next: Page, options?: { status?: string }) => {
    setPage(next);
    setMobileMenuOpen(false);
    setQuery("");
    setStatus(options?.status ?? "");
  };

  const openNotification = (item: GymNotification) => {
    if (!item.is_read) void markNotificationRead(item.id)
    setNotificationsOpen(false)
    const target = notificationDestination(item)
    go(target.page, target.status ? { status: target.status } : undefined)
  }

  const memberById = useMemo(() => {
    const map = new Map<number, Member>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);
  const planById = useMemo(() => {
    const map = new Map<number, Plan>();
    for (const plan of plans) map.set(plan.id, plan);
    return map;
  }, [plans]);
  const memberName = (id: number) => memberById.get(id)?.name || `Member #${id}`;
  const planName = (id: number) => planById.get(id)?.name || `Plan #${id}`;
  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      `${member.name} ${member.phone} ${member.email} ${member.id_number || ""} ${member.address || ""} ${member.city || ""} ${member.id}`
        .toLowerCase()
        .includes(needle),
    );
  }, [members, query]);
  const filteredMemberships = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memberships.filter((item) => {
      if (status && item.status !== status) return false;
      if (!needle) return true;
      const name = memberById.get(item.member_id)?.name || `Member #${item.member_id}`;
      const plan = planById.get(item.plan_id)?.name || `Plan #${item.plan_id}`;
      return `${name} ${plan}`.toLowerCase().includes(needle);
    });
  }, [memberships, status, query, memberById, planById]);

  const checkIn = async (id: number) => {
    try {
      await gymApi.checkIn(id);
      afterSave(t("att.ok"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("att.fail"));
    }
  };

  const checkOut = async (id: number) => {
    try {
      await gymApi.checkOut(id);
      afterSave(t("att.outOk"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("att.outFail"));
    }
  };

  const createMember = async (payload: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    id_number: string;
    address?: string;
    city?: string;
    country?: string;
    postal_code?: string;
    class_id?: number;
    plan_id?: number;
    start_date?: string;
    amount_paid?: number | string;
    remaining?: number | string;
  }) => {
    try {
      const created = await gymApi.createMember({
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        email: payload.email,
        id_number: payload.id_number,
        address: payload.address,
        city: payload.city,
        country: payload.country,
        postal_code: payload.postal_code,
      });

      await Promise.all([
        payload.class_id
          ? gymApi.addClassMember(payload.class_id, created.id)
          : Promise.resolve(),
        (async () => {
          if (!payload.plan_id || !payload.start_date) return;
          const paid = Number(payload.amount_paid || 0);
          const remainingValue = payload.remaining;
          const remainingSpecified =
            remainingValue !== undefined &&
            remainingValue !== "" &&
            Number.isFinite(Number(remainingValue));
          const remaining = remainingSpecified ? Number(remainingValue) : undefined;
          const membership = await gymApi.createMembership({
            member_id: created.id,
            plan_id: payload.plan_id,
            start_date: payload.start_date,
            notes: "Created from admin registration",
            price:
              remainingSpecified && remaining !== undefined
                ? paid + remaining
                : undefined,
          });
          if (paid > 0) {
            await gymApi.payment(membership.id, {
              amount: paid,
              received_by: loggedInStaffName,
              notes: remainingSpecified
                ? `Cash payment, remaining ${remaining} DH`
                : "Cash payment",
              remaining,
            });
          }
        })(),
      ]);

      afterSave(t("member.created"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("member.createFail"));
    }
  };

  const updateMember = async (
    memberId: number,
    payload: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
      id_number: string;
      address?: string;
      city?: string;
      country?: string;
      postal_code?: string;
      class_id?: number | null;
      price?: number | string;
      remaining?: number | string;
      plan_id?: number;
      start_date?: string;
      membership?: {
        id: number;
        plan_id: number;
        start_date: string;
        notes?: string;
      };
    },
  ) => {
    try {
      await gymApi.updateMember(memberId, {
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        email: payload.email,
        id_number: payload.id_number,
        address: payload.address,
        city: payload.city,
        country: payload.country,
        postal_code: payload.postal_code,
      });
      const nextPrice = payload.price === undefined || payload.price === "" ? NaN : Number(payload.price);
      const nextRemaining =
        payload.remaining === undefined || payload.remaining === ""
          ? NaN
          : Number(payload.remaining);
      if (payload.membership && Number.isFinite(nextRemaining) && nextRemaining >= 0) {
        const updated = await gymApi.updateMembershipRemaining(payload.membership.id, nextRemaining);
        setMemberships((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else if (payload.membership && Number.isFinite(nextPrice) && nextPrice >= 0) {
        const updated = await gymApi.updateMembershipPrice(payload.membership.id, nextPrice);
        setMemberships((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else if (!payload.membership && payload.plan_id) {
        const createdPrice =
          Number.isFinite(nextRemaining) && nextRemaining >= 0 ? nextRemaining : nextPrice;
        if (Number.isFinite(createdPrice) && createdPrice >= 0) {
          const created = await gymApi.createMembership({
            member_id: memberId,
            plan_id: payload.plan_id,
            start_date: payload.start_date || new Date().toISOString().slice(0, 10),
            notes: "Created from member edit",
            price: createdPrice,
          });
          setMemberships((current) => [created, ...current]);
        }
      }
      if (payload.class_id !== undefined) {
        await gymApi.setMemberClass(memberId, payload.class_id);
      }
      afterSave(t("member.updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("member.updateFail"));
    }
  };

  const deleteMember = async (memberId: number) => {
    if (!window.confirm("Delete this member?")) return;
    try {
      await gymApi.deleteMember(memberId);
      afterSave(t("member.deleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("member.deleteFail"));
    }
  };

  const createClass = async (payload: {
    name: string;
    class_type: string;
    price_per_member: number | string;
    is_active?: boolean;
  }) => {
    try {
      await gymApi.createClass(payload);
      afterSave(t("class.ok"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("class.fail"));
    }
  };

  const updateClass = async (
    id: number,
    payload: {
      name: string;
      class_type: string;
      price_per_member: number | string;
      is_active?: boolean;
    },
  ) => {
    try {
      await gymApi.updateClass(id, payload);
      afterSave(t("class.updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("class.updateFail"));
    }
  };

  const deleteClass = async (id: number) => {
    try {
      await gymApi.deleteClass(id);
      afterSave(t("class.deleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("class.deleteFail"));
    }
  };

  const createPlan = async (payload: {
    name: string;
    duration_months: number;
    price: number | string;
    description?: string;
    is_active?: boolean;
  }) => {
    try {
      await gymApi.createPlan(payload);
      afterSave(t("plans.ok"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("plans.fail"));
    }
  };

  const updatePlan = async (
    id: number,
    payload: {
      name: string;
      duration_months: number;
      price: number | string;
      description?: string;
      is_active?: boolean;
    },
  ) => {
    try {
      await gymApi.updatePlan(id, payload);
      afterSave(t("plans.updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("plans.updateFail"));
    }
  };

  const deletePlan = async (id: number) => {
    try {
      await gymApi.deletePlan(id);
      afterSave(t("plans.deleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("plans.deleteFail"));
    }
  };

  const createTrainer = async (payload: {
    first_name: string;
    last_name: string;
    specialization?: string;
    phone?: string;
    monthly_pay?: number | string;
    pay_amount?: number | string;
    is_paid?: boolean;
  }) => {
    try {
      await gymApi.createTrainer(payload);
      afterSave(t("train.ok"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("train.fail"));
    }
  };

  const updateTrainerPayroll = async (
    id: number,
    payload: {
      year?: number;
      month?: number;
      pay_amount?: number | string;
      is_paid?: boolean;
    },
  ) => {
    try {
      await gymApi.updateTrainerPayroll(id, payload);
      afterSave(payload.is_paid ? t("train.paidOk") : t("train.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("train.updateFail"));
    }
  };

  const deleteTrainer = async (id: number) => {
    try {
      await gymApi.deleteTrainer(id);
      afterSave(t("train.deleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("train.deleteFail"));
    }
  };

  const renewMembership = async (
    membershipId: number,
    payload: {
      member_id: number;
      plan_id: number;
      start_date: string;
      notes: string;
    },
  ) => {
    try {
      await gymApi.renew(membershipId, payload);
      afterSave(t("membership.renewed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("membership.renewFail"));
    }
  };

  const updateMembership = async (
    membershipId: number,
    payload: {
      member_id: number;
      plan_id: number;
      start_date: string;
      notes: string;
    },
  ) => {
    try {
      await gymApi.updateMembership(membershipId, payload);
      afterSave(t("membership.updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("membership.updateFail"));
    }
  };

  const deleteMembership = async (membershipId: number) => {
    if (!window.confirm("Delete this membership?")) return;
    try {
      await gymApi.deleteMembership(membershipId);
      afterSave(t("membership.deleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("membership.deleteFail"));
    }
  };

  const setMembershipPaymentStatus = async (membership: Membership, status: "paid" | "unpaid") => {
    try {
      const updated = await gymApi.updatePaymentStatus(membership.id, status)
      setMemberships((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      afterSave(t("pay.marked", { status: statusLabel(status) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pay.fail"));
    }
  };

  const recordPayment = async (
    membershipId: number,
    payload: PaymentPayload,
  ) => {
    const payment = await gymApi.payment(membershipId, payload);
    afterSave(t("pay.ok"));
    return payment;
  };

  const navGroups: Array<{ label: Msg; items: Array<[Page, LucideIcon]> }> = [
    {
      label: "nav.group.front",
      items: [
        ["dashboard", LayoutDashboard],
        ["attendance", CalendarCheck],
        ["members", Users],
        ["memberships", ClipboardList],
      ],
    },
    {
      label: "nav.group.money",
      items: [
        ["payments", CircleDollarSign],
        ["reminders", MessageCircle],
        ["reports", BarChart3],
      ],
    },
    {
      label: "nav.group.gym",
      items: [
        ["classes", Dumbbell],
        ["plans", Activity],
        ...(canAdminister ? [["trainers", Users] as [Page, LucideIcon]] : []),
      ],
    },
    {
      label: "nav.group.admin",
      items: [
        ...(canAdminister
          ? [
              ["expenses", Receipt] as [Page, LucideIcon],
              ["admin", SettingsIcon] as [Page, LucideIcon],
            ]
          : []),
        ["notifications", Bell],
      ],
    },
  ];
  const roleLabel =
    role.includes("super") ? t("role.superAdmin")
    : role.includes("reception") ? t("role.reception")
    : role.includes("trainer") ? t("role.trainer")
    : t("role.admin");

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t("nav.close")}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">F</span>
          <div>
            <strong>FlexOper</strong>
            <small>{t("brand.tag")}</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{t(group.label)}</p>
              {group.items.map(([key, Icon]) => (
                <button
                  key={key}
                  className={page === key ? "active" : ""}
                  onClick={() => go(key)}
                >
                  <Icon size={17} strokeWidth={1.9} /> {t(`nav.${key}` as Msg)}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip">
            <span>{(currentUser.first_name || currentUser.username).slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{currentUser.first_name || currentUser.username}</strong>
              <small>{roleLabel}</small>
            </div>
          </div>
          <button type="button" className="auth-logout" onClick={() => void logout()}>
            <LogOut size={15} /> {t("auth.signOut")}
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="mobile-menu-button" aria-label={mobileMenuOpen ? t("nav.close") : t("nav.open")} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <span className="eyebrow">{today}</span>
            <h1>
              {page === "dashboard" ? t("hello", { name: currentUser.first_name || currentUser.username }) : t(`page.${page}` as Msg)}
            </h1>
          </div>
          <div className="top-actions">
            <ThemeSwitch />
            <LanguageSwitch />
            <div className="notification-bell-wrap" ref={notificationBellRef}>
              <button className="icon-button notification-bell" title={t("nav.notifications")} aria-expanded={notificationsOpen} onClick={() => { if (!notificationsOpen) { placeNotificationMenu(); void refreshNotifications() } setNotificationsOpen(!notificationsOpen) }}>
                <Bell size={17} />
                {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>
              {notificationsOpen && createPortal(
                <>
                  <button type="button" className="notification-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setNotificationsOpen(false)} />
                  <div className={`notification-dropdown ${notificationCompact ? "is-compact" : ""}`} ref={notificationMenuRef} style={notificationMenuStyle} role="dialog" aria-label={t("notif.title")}>
                    {notificationCompact && <div className="notification-sheet-handle" aria-hidden="true"></div>}
                    <div className="notification-dropdown-head">
                      <strong>{t("notif.title")}</strong>
                      {unreadCount > 0 && <span className="notification-unread-pill">{unreadCount}</span>}
                    </div>
                    <section className="notification-sheet-section">
                      <p className="notification-sheet-label">{t("notif.needToSee")}</p>
                      {notifications.slice(0, 8).map(item => (
                        <article className={`notification-dropdown-item ${item.is_read ? "read" : "unread"}`} key={item.id} onClick={() => openNotification(item)}>
                          <span className="notification-dot"></span>
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.message}</p>
                            <small>{date(item.created_at)} · {t(notificationOpenKey(item))}</small>
                          </div>
                          <ChevronRight size={16} className="notification-open-icon" />
                          <button className="icon-button notification-delete" title={t("notif.deleteTitle")} onClick={event => { event.stopPropagation(); void deleteNotification(item.id) }}>
                            <Trash2 size={14} />
                          </button>
                        </article>
                      ))}
                      {!notifications.length && <div className="empty">{t("notif.empty")}<br />{t("notif.emptyHint")}</div>}
                    </section>
                    <section className="notification-sheet-section notification-sheet-click">
                      <p className="notification-sheet-label">{t("notif.canClick")}</p>
                      <div className="notification-action-list">
                        {unreadCount > 0 && (
                          <button type="button" className="notification-action" onClick={() => void markAllNotificationsRead()}>
                            <Check size={16} /> {t("notif.markRead")}
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button type="button" className="notification-action" onClick={() => void deleteAllNotifications()}>
                            <Trash2 size={16} /> {t("notif.clear")}
                          </button>
                        )}
                        {notificationCompact && (
                          <>
                            <button type="button" className="notification-action" onClick={() => { setNotificationsOpen(false); go("members") }}>
                              <UserPlus size={16} /> {t("addMember")}
                            </button>
                            <button type="button" className="notification-action" onClick={() => void load()}>
                              <RefreshCw size={16} /> {t("common.refresh")}
                            </button>
                            <div className="notification-action-tools">
                              <LanguageSwitch />
                              <ThemeSwitch />
                            </div>
                          </>
                        )}
                        <button type="button" className="notification-action" onClick={() => { setNotificationsOpen(false); go("notifications") }}>
                          <Bell size={16} /> {t("notif.viewAll")}
                        </button>
                      </div>
                    </section>
                  </div>
                </>,
                document.body
              )}
            </div>
            <button
              className="icon-button"
              title={t("common.refresh")}
              onClick={() => void load()}
            >
              <RefreshCw size={17} />
            </button>
            <button className="primary" onClick={() => go("members")}>
              <UserPlus size={17} /> {t("addMember")}
            </button>
          </div>
        </header>
        {busy && (
          <div className="loading">
            <RefreshCw size={16} /> {t("common.loading")}
          </div>
        )}
        {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
        {error && (
          <div className="error app-banner">
            {error}
            <button onClick={() => setError("")} aria-label={t("common.dismiss")}>
              <X size={15} />
            </button>
          </div>
        )}
        <div className={`page-stage${page === "dashboard" ? " overview-enter" : ""}`} key={page}>
        {page === "dashboard" && (
          <Dashboard
            data={dashboard}
            members={members}
            classes={classes}
            go={go}
          />
        )}
        {page === "members" && (
          <Members
            people={filteredMembers}
            query={query}
            setQuery={setQuery}
            classes={classes}
            plans={plans}
            memberships={memberships}
            onCheckIn={checkIn}
            onCreate={createMember}
            onUpdate={updateMember}
            onDelete={deleteMember}
            onPayment={recordPayment}
          />
        )}
        {page === "classes" && (
          <ClassesPage
            classes={classes}
            canAdminister={canAdminister}
            onCreate={createClass}
            onUpdate={updateClass}
            onDelete={deleteClass}
          />
        )}
        {page === "memberships" && (
          <Memberships
            items={filteredMemberships}
            query={query}
            setQuery={setQuery}
            status={status}
            setStatus={setStatus}
            memberName={memberName}
            planName={planName}
            plans={plans}
            onRenew={renewMembership}
            onUpdate={updateMembership}
            onDelete={deleteMembership}
            onSetPaymentStatus={setMembershipPaymentStatus}
            onPayment={recordPayment}
          />
        )}
        {page === "plans" && (
          <Plans
            plans={plans}
            canAdminister={canAdminister}
            onCreate={createPlan}
            onUpdate={updatePlan}
            onDelete={deletePlan}
          />
        )}
        {page === "payments" && (
          <GymPayments
            payments={payments}
            memberships={memberships}
            members={members}
            onPayment={recordPayment}
          />
        )}
        {page === "attendance" && (
          <AttendancePage
            records={attendance}
            members={members}
            memberships={memberships}
            classes={classes}
            onCheckIn={checkIn}
            onCheckOut={checkOut}
          />
        )}
        {page === "reminders" && <RemindersPage />}
        {page === "trainers" && canAdminister && (
          <Trainers
            trainers={trainers}
            canAdminister={canAdminister}
            onCreate={createTrainer}
            onUpdatePayroll={updateTrainerPayroll}
            onDelete={deleteTrainer}
          />
        )}
        {page === "reports" && <Reports canAdminister={canAdminister} />}
        {page === "expenses" && canAdminister && <ExpensesPage />}
        {page === "admin" && <Administration />}
        {page === "notifications" && (
          <Notifications
            notifications={notifications}
            onOpen={openNotification}
            onDelete={id => void deleteNotification(id)}
            onMarkAllRead={() => void markAllNotificationsRead()}
            onDeleteAll={() => void deleteAllNotifications()}
          />
        )}
        </div>
      </main>
    </div>
  );
}

function Notifications({
  notifications,
  onOpen,
  onDelete,
  onMarkAllRead,
  onDeleteAll,
}: {
  notifications: GymNotification[]
  onOpen: (item: GymNotification) => void
  onDelete: (id: number) => void
  onMarkAllRead: () => void
  onDeleteAll: () => void
}) {
  const { t } = useLang()
  const [filter, setFilter] = useState('all')
  const visibleNotifications = notifications.filter(item => filter === 'all' || (filter === 'unread' && !item.is_read) || item.category === filter)

  return (
    <div className="content">
      <div className="section-heading notification-center-heading">
        <div>
          <span className="eyebrow">{t("notif.center")}</span>
          <h3>{t("notif.title")}</h3>
        </div>
        <div className="notification-heading-actions">
          <button className="text-button" onClick={onMarkAllRead}>{t("notif.markAll")}</button>
          <button className="text-button" onClick={onDeleteAll}>{t("notif.deleteAll")}</button>
        </div>
      </div>
      <div className="notification-filters">
        {['all', 'unread', 'memberships', 'payments', 'members', 'system'].map(value => (
          <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
            {value === 'all' || value === 'unread' ? t(`filter.${value}` as Msg) : t(`cat.${value}` as Msg)}
          </button>
        ))}
      </div>
      <section className="panel notification-feed">
        {visibleNotifications.map(item => (
          <article className={`notification-item ${item.is_read ? 'read' : 'unread'}`} key={item.id} onClick={() => onOpen(item)}>
            <span className="notification-dot"></span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              <small>{date(item.created_at)}</small>
            </div>
            <button className="icon-button notification-delete" title={t("notif.deleteTitle")} onClick={event => { event.stopPropagation(); onDelete(item.id) }}>
              <Trash2 size={15} />
            </button>
          </article>
        ))}
        {!visibleNotifications.length && <div className="empty">{t("notif.empty")}<br />{t("notif.emptyHint")}</div>}
      </section>
    </div>
  )
}

function Dashboard({
  data,
  members,
  classes,
  go,
}: {
  data: GymDashboard | null;
  members: Member[];
  classes: FitnessClass[];
  go: (page: Page, options?: { status?: string }) => void;
}) {
  const { t } = useLang();
  return (
    <div className="content">
      <section className="hero-strip">
        <div>
          <span className="eyebrow light">{t("dash.pulse")}</span>
          <h2>{t("dash.hero")}</h2>
          <p>{t("dash.heroP")}</p>
        </div>
        <div className="hero-actions">
          <button className="text-button light-link" onClick={() => go("reports")}>
            {t("dash.reports")}
          </button>
          <button className="primary" onClick={() => go("members")}>
            <UserPlus size={17} /> {t("addMember")}
          </button>
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          icon={Users}
          label={t("dash.members")}
          value={data?.members ?? "—"}
          detail={t("dash.active", { n: data?.active_members ?? 0 })}
          className="sage"
          onClick={() => go("members")}
        />
        <Stat
          icon={CalendarCheck}
          label={t("dash.expiring")}
          value={data?.expiring_soon ?? "—"}
          detail={t("dash.expiringDetail")}
          className="coral"
          onClick={() => go("memberships", { status: "expiring_soon" })}
        />
        <Stat
          icon={Activity}
          label={t("dash.activeMemberships")}
          value={data?.active_members ?? "—"}
          detail={t("dash.currentlyActive")}
          onClick={() => go("memberships", { status: "active" })}
        />
        <Stat
          icon={CircleDollarSign}
          label={t("dash.cash")}
          value={data ? money(data.cash_this_month) : "—"}
          detail={t("dash.thisMonth")}
          className="gold"
          onClick={() => go("payments")}
        />
        <Stat
          icon={CircleDollarSign}
          label={t("dash.outstanding")}
          value={data ? money(data.outstanding) : "—"}
          detail={t("dash.across")}
          className="ink"
          onClick={() => go("payments")}
        />
      </div>
      {(data?.whatsapp_due ?? 0) > 0 && (
        <section className="panel latest reminder-banner">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">WHATSAPP</span>
              <h2>
                {t((data?.whatsapp_due || 0) === 1 ? "dash.waTitle" : "dash.waTitlePlural", {
                  n: data?.whatsapp_due ?? 0,
                })}
              </h2>
              <p>{t("dash.waP")}</p>
            </div>
            <button className="primary" onClick={() => go("reminders")}>
              <MessageCircle size={16} /> {t("dash.waOpen")}
            </button>
          </div>
        </section>
      )}
      <div className="dashboard-split">
      {classes.length > 0 ? (
        <section className="panel latest">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("nav.classes")}</span>
              <h2>{t("dash.classes")}</h2>
            </div>
            <button className="text-button" onClick={() => go("classes")}>
              {t("common.viewAll")}
            </button>
          </div>
          {classes.slice(0, 4).map((item) => (
            <button type="button" className="booking-row" key={item.id} onClick={() => go("classes")}>
              <span className="booking-number">{item.name}</span>
              <span className="booking-main">
                <strong>{t("dash.classMembers", { n: item.member_count })}</strong>
                <small>{item.class_type}</small>
              </span>
              <span className={`status ${item.is_active ? "active" : "expired"}`}>
                {item.is_active ? t("common.active") : t("common.inactive")}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="panel latest">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("nav.classes")}</span>
              <h2>{t("dash.classes")}</h2>
            </div>
          </div>
          <div className="empty">{t("dash.noClasses")}</div>
        </section>
      )}
      <section className="panel latest">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{t("dash.recent")}</span>
            <h2>{t("dash.recent")}</h2>
          </div>
          <button className="text-button" onClick={() => go("members")}>
            {t("common.viewAll")}
          </button>
        </div>
        {(data?.recent_members?.length ? data.recent_members : members.slice(0, 5)).map((member) => (
          <button type="button" className="booking-row" key={member.id} onClick={() => go("members")}>
            <span className="booking-number">
              #{String(member.id).padStart(5, "0")}
            </span>
            <span className="booking-main">
              <strong>{member.name}</strong>
              <small>
                {member.phone || t("common.noPhone")} · {member.email || t("common.noEmail")}
              </small>
            </span>
            <span className="status active">{t("dash.member")}</span>
          </button>
        ))}
        {!members.length && !data?.recent_members?.length && <div className="empty">{t("dash.noMembers")}</div>}
      </section>
      </div>
    </div>
  );
}

function reasonLabel(reason: string, t: (key: Msg, vars?: Record<string, string | number>) => string) {
  if (reason === "expiring_soon") return t("remind.expiring");
  if (reason === "expired") return t("remind.expired");
  if (reason === "unpaid") return t("remind.unpaid");
  return reason;
}

function RemindersPage() {
  const { t } = useLang();
  const [data, setData] = useState<WhatsAppReminderList | null>(null);
  const [filter, setFilter] = useState<"all" | "expiring_soon" | "expired" | "unpaid" | "missing_phone">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await gymApi.reminders());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("remind.loadFail"));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openWhatsApp = async (item: WhatsAppReminder) => {
    if (!item.whatsapp_url || !isSafeWhatsAppUrl(item.whatsapp_url)) return;
    window.open(item.whatsapp_url, "_blank", "noopener,noreferrer");
    try {
      await gymApi.markReminderSent(item.membership_id, item.message);
      setNotice(t("remind.opened", { name: item.member_name }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("remind.markFail"));
    }
  };

  const copyMessage = async (item: WhatsAppReminder) => {
    try {
      await navigator.clipboard.writeText(item.message);
      setNotice(t("remind.copied"));
    } catch {
      setError(t("remind.copyFail"));
    }
  };

  const items = (data?.items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "missing_phone") return !item.whatsapp_url;
    return item.reasons.includes(filter);
  });
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [filter, data?.items.length]);
  const pagedItems = items.slice(0, shown);

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("remind.eyebrow")}</span>
        <h2>{t("remind.title")}</h2>
        <p>{t("remind.intro")}</p>
      </div>
      {error && <div className="error app-banner">{error}</div>}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      <div className="ledger-stats">
        <button type="button" className={`ledger-stat ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          <span>{t("remind.toRemind")}</span>
          <strong>{data?.items.length ?? 0}</strong>
          <small>{t("remind.expiryUnpaid")}</small>
        </button>
        <button type="button" className={`ledger-stat ${filter === "expiring_soon" ? "active" : ""}`} onClick={() => setFilter("expiring_soon")}>
          <span>{t("remind.expiring")}</span>
          <strong>{data?.expiring ?? 0}</strong>
          <small>{t("remind.next7")}</small>
        </button>
        <button type="button" className={`ledger-stat owing ${filter === "unpaid" ? "active" : ""}`} onClick={() => setFilter("unpaid")}>
          <span>{t("remind.unpaid")}</span>
          <strong>{data?.unpaid ?? 0}</strong>
          <small>{t("remind.stillOwe")}</small>
        </button>
        <button type="button" className={`ledger-stat ${filter === "expired" ? "active" : ""}`} onClick={() => setFilter("expired")}>
          <span>{t("remind.expired")}</span>
          <strong>{data?.expired ?? 0}</strong>
          <small>{t("remind.last60")}</small>
        </button>
      </div>
      <section className="panel table-wrap reports-panel">
        <div className="reports-panel-head">
          <div>
            <span className="eyebrow">{t("members.eyebrow")}</span>
            <h3>{t("remind.send")}</h3>
          </div>
        </div>
        {loading && <div className="empty">{t("remind.loading")}</div>}
        {!loading && !items.length && (
          <div className="empty">
            {filter === "all" ? t("remind.empty") : t("remind.emptyFilter")}
          </div>
        )}
        {!loading && items.length > 0 && (
          <>
          <table>
            <thead>
              <tr>
                <th>{t("dash.member")}</th>
                <th>{t("remind.why")}</th>
                <th>{t("remind.ends")}</th>
                <th>{t("remind.stillOwes")}</th>
                <th>{t("common.phone")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => (
                <tr key={item.membership_id}>
                  <td>
                    <strong>{item.member_name}</strong>
                    {item.reminded_today ? <small>{t("remind.today")}</small> : null}
                  </td>
                  <td>
                    <div className="reminder-reasons">
                      {item.reasons.map((reason) => (
                        <span className={`status ${reason === "unpaid" || reason === "expired" ? "unpaid" : "partial"}`} key={reason}>
                          {reasonLabel(reason, t)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {date(item.end_date)}
                    <small>
                      {item.days_left >= 0
                        ? t(item.days_left === 1 ? "remind.daysLeft" : "remind.daysLeftPlural", { n: item.days_left })
                        : t(Math.abs(item.days_left) === 1 ? "remind.daysAgo" : "remind.daysAgoPlural", { n: Math.abs(item.days_left) })}
                    </small>
                  </td>
                  <td className="table-money">
                    {Number(item.remaining) > 0 ? (
                      <strong className="amount-owing">{money(item.remaining)}</strong>
                    ) : (
                      <span className="amount-settled">{money(0)}</span>
                    )}
                  </td>
                  <td>{item.phone || t("common.noPhone")}</td>
                  <td className="table-actions">
                    {item.whatsapp_url ? (
                      <button type="button" className="whatsapp-button" onClick={() => void openWhatsApp(item)}>
                        <MessageCircle size={14} /> WhatsApp
                      </button>
                    ) : (
                      <span className="status">{t("remind.addPhone")}</span>
                    )}
                    <button className="text-button" onClick={() => void copyMessage(item)}>
                      {t("common.copy")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreBar shown={shown} total={items.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />
          </>
        )}
      </section>
    </div>
  );
}

function reportMonths() {
  return Array.from({ length: 18 }, (_, index) => {
    const now = new Date();
    const value = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    return {
      year,
      month,
      label: monthLabel(year, month),
    };
  });
}

function ExpensesPage() {
  const { t } = useLang();
  const now = new Date();
  const months = reportMonths();
  const [selected, setSelected] = useState(`${now.getFullYear()}-${now.getMonth() + 1}`);
  const [expenses, setExpenses] = useState<GymExpense[]>([]);
  const [form, setForm] = useState({ category: "electricity", title: "", amount: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [year, month] = selected.split("-").map(Number);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setExpenses(await gymApi.expenses(year, month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load expenses.");
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [year, month]);

  const add = async () => {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setError("");
    try {
      await gymApi.createExpense({
        category: form.category,
        title: form.title.trim(),
        amount,
        year,
        month,
        notes: form.notes.trim(),
      });
      setForm({ category: form.category, title: "", amount: "", notes: "" });
      setNotice("Expense recorded.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save expense.");
    }
  };

  const remove = async (expense: GymExpense) => {
    if (!window.confirm(`Delete ${expense.title || expense.category_label} (${money(expense.amount)})?`)) return;
    try {
      await gymApi.deleteExpense(expense.id);
      setNotice("Expense deleted.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete expense.");
    }
  };

  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byCategory = EXPENSE_CATEGORIES.map((category) => ({
    ...category,
    total: expenses
      .filter((item) => item.category === category.value)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    count: expenses.filter((item) => item.category === category.value).length,
  })).filter((item) => item.count > 0);

  return (
    <div className="content">
      <div className="page-intro reports-intro">
        <div>
          <span className="eyebrow">{t("exp.eyebrow")}</span>
          <h2>{t("exp.title")}</h2>
          <p>{t("exp.intro")}</p>
        </div>
        <label className="reports-month">
          {t("common.month")}
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {months.map((item) => (
              <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="error app-banner">{error}</div>}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      <div className="stats-grid reports-stats">
        <Stat
          icon={CircleDollarSign}
          label="Spent this month"
          value={money(total)}
          detail={`${expenses.length} expense${expenses.length === 1 ? "" : "s"}`}
          className="coral"
        />
        <Stat
          icon={ClipboardList}
          label="Categories used"
          value={byCategory.length}
          detail="Bills, cleaning, supplies..."
          className="gold"
        />
        <Stat
          icon={Activity}
          label="Biggest cost"
          value={byCategory.length ? money(Math.max(...byCategory.map((item) => item.total))) : "—"}
          detail={byCategory.length ? [...byCategory].sort((a, b) => b.total - a.total)[0].label : "No expenses yet"}
          className="ink"
        />
        <Stat
          icon={Activity}
          label="Average charge"
          value={expenses.length ? money(total / expenses.length) : "—"}
          detail="Per recorded expense"
          className="sage"
        />
      </div>
      <section className="panel table-wrap reports-panel">
        <div className="reports-panel-head">
          <div>
            <span className="eyebrow">ADD EXPENSE</span>
            <h3>New charge</h3>
          </div>
          <p>Pick a category, add a short description if you want, then enter the amount in MAD.</p>
        </div>
        <form
          className="expense-form"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <label>
            Category
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Cleaning lady, ONEE bill..."
            />
          </label>
          <label>
            Amount (MAD)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="0.00"
            />
          </label>
          <button className="primary" type="submit">
            <Plus size={16} /> Add
          </button>
        </form>
        <label className="expense-notes">
          Notes (optional)
          <input
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Invoice number, paid to..."
          />
        </label>
      </section>
      {byCategory.length > 0 && (
        <div className="ledger-stats" style={{ marginTop: 16 }}>
          {byCategory.map((item) => (
            <div className="ledger-stat" key={item.value}>
              <span>{item.label}</span>
              <strong>{money(item.total)}</strong>
              <small>
                {item.count} item{item.count === 1 ? "" : "s"}
              </small>
            </div>
          ))}
        </div>
      )}
      <section className="panel table-wrap reports-panel" style={{ marginTop: 16 }}>
        <div className="reports-panel-head">
          <div>
            <span className="eyebrow">THIS MONTH</span>
            <h3>Expense list</h3>
          </div>
          <p>Everything recorded for {months.find((item) => `${item.year}-${item.month}` === selected)?.label}.</p>
        </div>
        {loading && <div className="empty">Loading expenses...</div>}
        {!loading && !expenses.length && (
          <div className="empty">No expenses for this month yet. Use the form above to add electricity, water, cleaning, or any other charge.</div>
        )}
        {!loading && expenses.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.category_label}</td>
                  <td>{expense.title || "—"}</td>
                  <td className="table-money">
                    <strong className="amount-owing">{money(expense.amount)}</strong>
                  </td>
                  <td>{expense.notes || "—"}</td>
                  <td className="table-actions">
                    <button className="text-button" onClick={() => void remove(expense)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td>{money(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}

function Administration() {
  const { t } = useLang();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirm_password: "",
    first_name: "",
    last_name: "",
    email: "",
    role: "Admin",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = async () => {
    try {
      setUsers(await bookingApi.adminUsers(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load users.");
    }
  };
  useEffect(() => {
    void loadUsers();
  }, [query]);

  const save = async () => {
    setError("");
    if (editing && form.password && form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    try {
      if (editing)
        await bookingApi.updateAdminUser(editing.id, {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
      else {
        if (!form.username.trim() || form.password.length < 8) {
          setError("Username and a password of at least 8 characters are required.");
          return;
        }
        await bookingApi.createAdminUser({
          username: form.username.trim(),
          password: form.password,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          role: form.role,
        });
      }
      setNotice(
        editing ? "User updated successfully." : "User created successfully.",
      );
      setOpen(false);
      setEditing(null);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save user.");
    }
  };
  const toggle = async (user: AdminUser) => {
    try {
      await bookingApi.updateAdminUser(user.id, { is_active: !user.is_active });
      setNotice(
        `User ${user.is_active ? "deactivated" : "activated"} successfully.`,
      );
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user.");
    }
  };
  const remove = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.username}?`)) return;
    try {
      await bookingApi.deleteAdminUser(user.id);
      setNotice("User deleted successfully.");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete user.");
    }
  };
  const startEdit = (user: AdminUser) => {
    setSelectedUser(null);
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      confirm_password: "",
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
    });
    setOpen(true);
  };
  const active = users.filter((user) => user.is_active).length;
  const admins = users.filter((user) => user.is_staff).length;
  const openCreate = () => {
    setSelectedUser(null);
    setEditing(null);
    setForm({
      username: "",
      password: "",
      confirm_password: "",
      first_name: "",
      last_name: "",
      email: "",
      role: "Admin",
    });
    setOpen(true);
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("admin.eyebrow")}</span>
        <h2>{t("admin.title")}</h2>
        <p>{t("admin.intro")}</p>
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      <div className="stats-grid">
        <Stat
          icon={Users}
          label="Total users"
          value={users.length}
          detail="System accounts"
        />
        <Stat
          icon={Users}
          label="Active users"
          value={active}
          detail="Can access platform"
          className="sage"
        />
        <Stat
          icon={Activity}
          label="Admins"
          value={admins}
          detail="Staff accounts"
          className="gold"
        />
        <Stat
          icon={Activity}
          label="Active sessions"
          value="—"
          detail="Backend gap"
          className="ink"
        />
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users by name, email or username..."
          />
        </div>
        <button className="primary" onClick={openCreate}>
          <Plus size={16} /> Add user
        </button>
      </div>
      {selectedUser && (
        <div className="member-details-overlay">
        <section className="panel member-details-panel admin-user-details">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">USER DETAILS</span>
              <h3>{selectedUser.first_name} {selectedUser.last_name}</h3>
            </div>
            <Badge value={selectedUser.is_active ? "active" : "inactive"} />
          </div>
          <div className="info-list">
            <p><span>Username</span><strong>{selectedUser.username}</strong></p>
            <p><span>Email</span><strong>{selectedUser.email || "Not provided"}</strong></p>
            <p><span>Role</span><strong>{selectedUser.role}</strong></p>
            <p><span>Last login</span><strong>{selectedUser.last_login ? date(selectedUser.last_login) : "Never"}</strong></p>
          </div>
          <div className="form-actions">
            <button className="secondary" onClick={() => setSelectedUser(null)}>Close</button>
            <button className="secondary" onClick={() => startEdit(selectedUser)}>Edit user</button>
            <button className="primary" onClick={() => void remove(selectedUser)}>Delete user</button>
          </div>
        </section>
        </div>
      )}
      {open && (
        <div className="member-details-overlay">
        <section className="panel form-panel member-details-panel">
          <span className="eyebrow">{editing ? "EDIT USER" : "NEW USER"}</span>
          <div className="date-fields">
            <label>
              First name
              <input
                required
                value={form.first_name}
                onChange={(event) =>
                  setForm({ ...form, first_name: event.target.value })
                }
              />
            </label>
            <label>
              Last name
              <input
                required
                value={form.last_name}
                onChange={(event) =>
                  setForm({ ...form, last_name: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          {!editing && (
            <>
              <label>
                Username
                <input
                  required
                  value={form.username}
                  onChange={(event) =>
                    setForm({ ...form, username: event.target.value })
                  }
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
              </label>
            </>
          )}
          {editing && (
            <div className="date-fields">
              <label>
                New password
                <input
                  type="password"
                  minLength={8}
                  placeholder="Leave blank to keep current password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  minLength={8}
                  value={form.confirm_password}
                  onChange={(event) =>
                    setForm({ ...form, confirm_password: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          <label>
            Role
            <select
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value })
              }
            >
              <option>Admin</option>
              <option>Reception</option>
              <option>Trainer</option>
              <option>Super Admin</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={() => void save()}>
              {editing ? "Save changes" : "Create user"}
            </button>
          </div>
        </section>
        </div>
      )}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) setSelectedUser(user) }}>
                <td>
                  <strong>
                    {user.first_name} {user.last_name}
                  </strong>
                  <small>{user.username}</small>
                </td>
                <td>{user.email || "—"}</td>
                <td>{user.role}</td>
                <td>
                  <Badge value={user.is_active ? "active" : "inactive"} />
                </td>
                <td>{user.last_login ? date(user.last_login) : "Never"}</td>
                <td className="table-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      startEdit(user);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggle(user);
                    }}
                  >
                    {user.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(user);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <div className="empty">No users found.</div>}
      </section>
    </div>
  );
}

function Settings({
  classes,
  plans,
  onCreateClass,
  onCreatePlan,
}: {
  classes: FitnessClass[];
  plans: Plan[];
  onCreateClass: (payload: {
    name: string;
    class_type: string;
    price_per_member: number | string;
    is_active?: boolean;
  }) => void;
  onCreatePlan: (payload: {
    name: string;
    duration_months: number;
    price: number | string;
    description: string;
    is_active: boolean;
  }) => void;
}) {
  const [section, setSection] = useState("Classes");
  const [classForm, setClassForm] = useState({
    name: "",
    class_type: "boxing",
    price_per_member: "100",
    is_active: true,
  });
  const [planForm, setPlanForm] = useState({
    name: "",
    duration_months: "1",
    price: "120",
    description: "",
    is_active: true,
  });
  const sections = [
    "General",
    "Gym Information",
    "Classes",
    "Membership Plans",
    "Payments",
    "Opening Hours",
    "Members",
    "Notifications",
    "Receipts",
    "Security",
    "Danger Zone",
  ];
  const createClass = () => {
    if (!classForm.name.trim()) return;
    onCreateClass({
      ...classForm,
      name: classForm.name.trim(),
      price_per_member: Number(classForm.price_per_member || 0),
    });
    setClassForm({
      name: "",
      class_type: "boxing",
      price_per_member: "100",
      is_active: true,
    });
  };
  const createPlan = () => {
    if (!planForm.name.trim()) return;
    onCreatePlan({
      ...planForm,
      name: planForm.name.trim(),
      duration_months: Number(planForm.duration_months || 1),
      price: Number(planForm.price || 0),
    });
    setPlanForm({
      name: "",
      duration_months: "1",
      price: "120",
      description: "",
      is_active: true,
    });
  };

  return (
    <div className="content settings-page">
      <div className="page-intro">
        <span className="eyebrow">SETTINGS</span>
        <h2>Settings</h2>
        <p>Configure the gym using settings supported by the backend.</p>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              className={section === item ? "active" : ""}
              key={item}
              onClick={() => setSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <section className="settings-body">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{section.toUpperCase()}</span>
              <h2>{section}</h2>
            </div>
          </div>
          {section === "Classes" && (
            <>
              <div className="toolbar">
                <button
                  className="primary"
                  onClick={() =>
                    document
                      .querySelector(".settings-class-form")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  <Plus size={16} /> Add class
                </button>
              </div>
              <section className="panel settings-class-form form-panel">
                <span className="eyebrow">NEW CLASS</span>
                <div className="date-fields">
                  <label>
                    Class name
                    <input
                      value={classForm.name}
                      onChange={(event) =>
                        setClassForm({ ...classForm, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Class type
                    <select
                      value={classForm.class_type}
                      onChange={(event) =>
                        setClassForm({
                          ...classForm,
                          class_type: event.target.value,
                        })
                      }
                    >
                      <option value="boxing">Boxing</option>
                      <option value="kick_boxing">Kick Boxing</option>
                      <option value="musculation">Musculation</option>
                      <option value="aerobic">Aerobic</option>
                    </select>
                  </label>
                </div>
                <div className="date-fields">
                  <label>
                    Price per member
                    <input
                      type="number"
                      min="0"
                      value={classForm.price_per_member}
                      onChange={(event) =>
                        setClassForm({
                          ...classForm,
                          price_per_member: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={String(classForm.is_active)}
                      onChange={(event) =>
                        setClassForm({
                          ...classForm,
                          is_active: event.target.value === "true",
                        })
                      }
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </label>
                </div>
                <div className="form-actions">
                  <button className="primary" onClick={createClass}>
                    Create class
                  </button>
                </div>
              </section>
              <section className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Members</th>
                      <th>Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.member_count}</td>
                        <td>{money(item.price_per_member)}</td>
                        <td>
                          <Badge
                            value={item.is_active ? "active" : "inactive"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
          {section === "Membership Plans" && (
            <>
              <section className="panel settings-class-form form-panel">
                <span className="eyebrow">NEW MEMBERSHIP PLAN</span>
                <div className="date-fields">
                  <label>
                    Plan name
                    <input
                      value={planForm.name}
                      onChange={(event) =>
                        setPlanForm({ ...planForm, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Duration in months
                    <input
                      type="number"
                      min="1"
                      value={planForm.duration_months}
                      onChange={(event) =>
                        setPlanForm({
                          ...planForm,
                          duration_months: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="date-fields">
                  <label>
                    Price in MAD
                    <input
                      type="number"
                      min="0"
                      value={planForm.price}
                      onChange={(event) =>
                        setPlanForm({ ...planForm, price: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={String(planForm.is_active)}
                      onChange={(event) =>
                        setPlanForm({
                          ...planForm,
                          is_active: event.target.value === "true",
                        })
                      }
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    value={planForm.description}
                    onChange={(event) =>
                      setPlanForm({
                        ...planForm,
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="form-actions">
                  <button className="primary" onClick={createPlan}>
                    Create plan
                  </button>
                </div>
              </section>
              <section className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Duration</th>
                      <th>Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>
                          {item.duration_months} month
                          {item.duration_months > 1 ? "s" : ""}
                        </td>
                        <td>{money(item.price)}</td>
                        <td>
                          <Badge
                            value={item.is_active ? "active" : "inactive"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
          {section === "Payments" && (
            <section className="panel settings-note">
              <h3>Payment Settings</h3>
              <p>
                Cash payments are supported by the backend. Payment amounts are
                validated against each membership balance.
              </p>
              <p>
                Card, bank transfer, configurable payment rules, receipts,
                opening hours and notifications are backend gaps.
              </p>
            </section>
          )}
          {!["Classes", "Membership Plans", "Payments"].includes(section) && (
            <section className="panel settings-note">
              <h3>{section}</h3>
              <p>This setting is not currently exposed by the backend.</p>
              <p>
                BACKEND GAP: Add a persisted gym settings model and API
                endpoints before enabling this section.
              </p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

void Settings;

function Members({
  people,
  query,
  setQuery,
  classes,
  plans,
  memberships,
  onCheckIn,
  onCreate,
  onUpdate,
  onDelete,
  onPayment,
}: {
  people: Member[];
  query: string;
  setQuery: (value: string) => void;
  classes: FitnessClass[];
  plans: Plan[];
  memberships: Membership[];
  onCheckIn: (id: number) => void;
  onCreate: (payload: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    id_number: string;
    address?: string;
    city?: string;
    country?: string;
    postal_code?: string;
    class_id?: number;
    plan_id?: number;
    start_date?: string;
    amount_paid?: number | string;
    remaining?: number | string;
  }) => void;
  onUpdate: (
    id: number,
    payload: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
      id_number: string;
      address?: string;
      city?: string;
      country?: string;
      postal_code?: string;
      class_id?: number | null;
      price?: number | string;
      remaining?: number | string;
      plan_id?: number;
      start_date?: string;
      membership?: {
        id: number;
        plan_id: number;
        start_date: string;
        notes?: string;
      };
    },
  ) => void;
  onDelete: (id: number) => void;
  onPayment: OnPayment;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const memberStatuses = useMemo(() => {
    const statuses: Record<number, string> = {};
    memberships.forEach((membership) => {
      if (!statuses[membership.member_id] || membership.status === "active")
        statuses[membership.member_id] = membership.status;
    });
    return statuses;
  }, [memberships]);
  const membershipByMemberId = useMemo(() => indexLatestMembership(memberships), [memberships]);
  const membershipFor = (memberId: number) => membershipByMemberId.get(memberId);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    id_number: "",
    address: "",
    city: "",
    class_id: "",
    plan_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    amount_paid: "0",
    remaining: "",
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const moneySummary = useMemo(() => {
    const counts = { owing: 0, owingTotal: 0, paid: 0, unpaid: 0, partial: 0 };
    people.forEach((member) => {
      const membership = membershipFor(member.id);
      if (!membership) return;
      const remaining = Number(membership.remaining_balance || 0);
      if (remaining > 0) {
        counts.owing += 1;
        counts.owingTotal += remaining;
      }
      if (membership.payment_status === "paid") counts.paid += 1;
      else if (membership.payment_status === "partial") counts.partial += 1;
      else counts.unpaid += 1;
    });
    return counts;
  }, [people, membershipByMemberId]);
  const summary = useMemo(() => {
    const counts = { total: people.length, active: 0, expiring: 0, expired: 0, none: 0 };
    people.forEach((member) => {
      const status = memberStatuses[member.id];
      if (status === "active") counts.active += 1;
      else if (status === "expiring_soon") counts.expiring += 1;
      else if (status === "expired") counts.expired += 1;
      else counts.none += 1;
    });
    return counts;
  }, [people, memberStatuses]);
  const visiblePeople = useMemo(() => {
    return people.filter((member) => {
      const status = memberStatuses[member.id] || "none";
      if (statusFilter === "none" && status !== "none") return false;
      if (statusFilter && statusFilter !== "none" && status !== statusFilter) return false;
      if (classFilter === "none" && member.class_id) return false;
      if (classFilter && classFilter !== "none" && String(member.class_id || "") !== classFilter)
        return false;
      const membership = membershipFor(member.id);
      const remaining = Number(membership?.remaining_balance || 0);
      const payment = membership?.payment_status;
      if (paymentFilter === "owing" && remaining <= 0) return false;
      if (paymentFilter === "paid" && payment !== "paid") return false;
      if (paymentFilter === "partial" && payment !== "partial") return false;
      if (paymentFilter === "unpaid" && payment !== "unpaid") return false;
      return true;
    });
  }, [people, memberStatuses, statusFilter, classFilter, paymentFilter, membershipByMemberId]);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [query, statusFilter, classFilter, paymentFilter, people.length]);
  const pagedPeople = visiblePeople.slice(0, shown);

  const submit = () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    if (!form.id_number.trim() || !form.address.trim()) return;
    onCreate({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      id_number: form.id_number.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      country: "Morocco",
      class_id: form.class_id ? Number(form.class_id) : undefined,
      plan_id: form.plan_id ? Number(form.plan_id) : undefined,
      start_date: form.start_date || undefined,
      amount_paid: form.amount_paid || 0,
      remaining: form.remaining === "" ? undefined : form.remaining,
    });
    setForm({
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      id_number: "",
      address: "",
      city: "",
      class_id: "",
      plan_id: "",
      start_date: new Date().toISOString().slice(0, 10),
      amount_paid: "0",
      remaining: "",
    });
    setOpen(false);
  };

  const editMember = (member: Member) => {
    const names = member.name.trim().split(/\s+/);
    const currentMembership = membershipFor(member.id);
    document.querySelector(".member-details-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "member-details-overlay";
    overlay.onclick = (event) => {
      if (event.target === overlay) dismissOverlay(overlay);
    };
    const panel = document.createElement("section");
    panel.className = "member-details-panel form-panel";
    const label = document.createElement("span");
    label.className = "eyebrow";
    label.textContent = "EDIT MEMBER";
    const heading = document.createElement("h2");
    heading.textContent = "Update member information";
    panel.append(label, heading);
    const fields = [
      ["First name", names[0] || "", "text"],
      ["Last name", names.slice(1).join(" ") || "", "text"],
      ["Phone", member.phone || "", "tel"],
      ["Email", member.email || "", "email"],
      ["CIN", member.id_number || "", "text"],
      ["Address", member.address || "", "text"],
      ["City", member.city || "", "text"],
    ];
    const inputs = fields.map(([fieldLabel, value, type]) => {
      const field = document.createElement("label");
      field.textContent = fieldLabel;
      const input = document.createElement("input");
      input.type = type;
      input.value = value;
      field.append(input);
      panel.append(field);
      return input;
    });
    const extraRow = document.createElement("div");
    extraRow.className = "date-fields";
    const classField = document.createElement("label");
    classField.textContent = "Gym class";
    const classSelect = document.createElement("select");
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "No class";
    classSelect.append(noneOption);
    classes.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.id);
      option.textContent = item.name;
      classSelect.append(option);
    });
    classField.append(classSelect);
    if (member.class_id) classSelect.value = String(member.class_id);
    const priceField = document.createElement("label");
    priceField.textContent = "Price (DH)";
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.placeholder = "0.00";
    priceInput.value = currentMembership
      ? String(currentMembership.price)
      : selectablePlans(plans)[0]
        ? String(selectablePlans(plans)[0].price)
        : "";
    priceField.append(priceInput);
    extraRow.append(classField);
    const remainingRow = document.createElement("div");
    remainingRow.className = "date-fields";
    const remainingField = document.createElement("label");
    remainingField.textContent = "Still owes (DH)";
    const remainingInput = document.createElement("input");
    remainingInput.type = "number";
    remainingInput.min = "0";
    remainingInput.step = "0.01";
    remainingInput.placeholder = "20";
    remainingInput.value = currentMembership
      ? String(currentMembership.remaining_balance)
      : "";
    remainingField.append(remainingInput);
    remainingRow.append(priceField, remainingField);
    panel.append(extraRow, remainingRow);
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.onclick = () => dismissOverlay(overlay);
    const save = document.createElement("button");
    save.className = "primary";
    save.type = "button";
    save.textContent = "Save changes";
    save.onclick = () => {
      if (!inputs[0].value.trim() || !inputs[1].value.trim()) return;
      const priceValue = priceInput.value.trim();
      const remainingValue = remainingInput.value.trim();
      const originalRemaining = currentMembership
        ? Number(currentMembership.remaining_balance)
        : undefined;
      const remainingNumber = remainingValue === "" ? undefined : Number(remainingValue);
      const remainingChanged =
        remainingNumber !== undefined && remainingNumber !== originalRemaining;
      onUpdate(member.id, {
        first_name: inputs[0].value.trim(),
        last_name: inputs[1].value.trim(),
        phone: inputs[2].value.trim(),
        email: inputs[3].value.trim(),
        id_number: inputs[4].value.trim(),
        address: inputs[5].value.trim(),
        city: inputs[6].value.trim(),
        country: member.country || "Morocco",
        class_id: classSelect.value ? Number(classSelect.value) : null,
        price: priceValue === "" ? undefined : Number(priceValue),
        remaining: remainingChanged ? remainingNumber : undefined,
        plan_id: currentMembership?.plan_id || (plans[0] ? plans[0].id : undefined),
        start_date: currentMembership?.start_date.slice(0, 10) || new Date().toISOString().slice(0, 10),
        membership: currentMembership
          ? {
              id: currentMembership.id,
              plan_id: currentMembership.plan_id,
              start_date: currentMembership.start_date.slice(0, 10),
              notes: currentMembership.notes || "",
            }
          : undefined,
      });
      dismissOverlay(overlay);
    };
    actions.append(cancel, save);
    panel.append(actions);
    overlay.append(panel);
    document.body.append(overlay);
    void gymApi.memberClass(member.id).then((memberClass) => {
      if (memberClass.training_class_id) {
        classSelect.value = String(memberClass.training_class_id);
      }
    }).catch(() => undefined);
  };

  const showMemberDetails = (member: Member) => {
    const currentMembership = membershipFor(member.id);
    const membershipPlanName = currentMembership
      ? plans.find((plan) => plan.id === currentMembership.plan_id)?.name || `Plan #${currentMembership.plan_id}`
      : "No plan";
    document.querySelector(".member-details-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "member-details-overlay";
    overlay.onclick = (event) => {
      if (event.target === overlay) dismissOverlay(overlay);
    };
    const panel = document.createElement("section");
    panel.className = "member-details-panel membership-details-panel member-card";

    const close = document.createElement("button");
    close.className = "membership-details-x";
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.onclick = () => dismissOverlay(overlay);

    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "MEMBER";
    const heading = document.createElement("h2");
    heading.textContent = member.name;
    const badges = document.createElement("div");
    badges.className = "membership-details-badges";
    const membershipStatus = currentMembership?.status ?? "inactive";
    const statusBadge = document.createElement("span");
    statusBadge.className = `status ${membershipStatus === "inactive" ? "expired" : membershipStatus}`;
    statusBadge.textContent = membershipStatus.replace("_", " ");
    badges.append(statusBadge);
    if (currentMembership) {
      const paymentBadge = document.createElement("span");
      paymentBadge.className = `status payment ${currentMembership.payment_status}`;
      paymentBadge.textContent = currentMembership.payment_status;
      badges.append(paymentBadge);
    }

    const remaining = currentMembership ? Number(currentMembership.remaining_balance) : 0;
    const owing = document.createElement("div");
    owing.className = remaining > 0 ? "member-card-owing" : "member-card-owing settled";
    const owingLabel = document.createElement("span");
    owingLabel.textContent = remaining > 0 ? "Still owes" : "Settled";
    const owingValue = document.createElement("strong");
    owingValue.textContent = currentMembership ? (remaining > 0 ? money(remaining) : "Paid") : "No plan";
    owing.append(owingLabel, owingValue);

    const contact = document.createElement("p");
    contact.className = "membership-details-meta";
    contact.textContent = [
      member.id_number ? `CIN ${member.id_number}` : "",
      member.phone || "",
      member.class_name || "",
    ]
      .filter(Boolean)
      .join("  ·  ");
    contact.dataset.field = "gym-class-line";

    const facts = document.createElement("div");
    facts.className = "member-card-facts";
    const factRows: Array<[string, string]> = [
      ["Plan", membershipPlanName],
      ["Paid", currentMembership ? money(currentMembership.total_paid) : money(0)],
      ["Ends", currentMembership ? date(currentMembership.end_date) : "—"],
    ];
    factRows.forEach(([key, value]) => {
      const row = document.createElement("div");
      const caption = document.createElement("span");
      caption.textContent = key;
      const strong = document.createElement("strong");
      strong.textContent = value;
      row.append(caption, strong);
      facts.append(row);
    });

    const actions = document.createElement("div");
    actions.className = "form-actions membership-details-actions";
    const pay = document.createElement("button");
    pay.className = "primary";
    pay.type = "button";
    pay.textContent = "Pay";
    pay.onclick = () => {
      if (!currentMembership) return;
      dismissOverlay(overlay);
      window.setTimeout(() => {
        openRecordPaymentForm({
          memberLabel: member.name,
          membership: currentMembership,
          onPayment,
        });
      }, 160);
    };
    if (!currentMembership) pay.disabled = true;
    const edit = document.createElement("button");
    edit.className = "secondary";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.onclick = () => {
      dismissOverlay(overlay);
      window.setTimeout(() => editMember(member), 160);
    };
    const remove = document.createElement("button");
    remove.className = "text-button";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.onclick = () => {
      if (window.confirm(`Delete ${member.name}?`)) {
        dismissOverlay(overlay);
        onDelete(member.id);
      }
    };
    actions.append(pay, edit, remove);
    panel.append(close, eyebrow, heading, badges, contact, owing, facts, actions);
    overlay.append(panel);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    if (!member.class_name) {
      void gymApi.memberClass(member.id).then((memberClass) => {
        const className = memberClass.training_class_id
          ? classes.find((item) => item.id === memberClass.training_class_id)?.name || `Class #${memberClass.training_class_id}`
          : "";
        const line = overlay.querySelector("[data-field='gym-class-line']");
        if (line && className) {
          const parts = [member.id_number ? `CIN ${member.id_number}` : "", member.phone || "", className].filter(Boolean);
          line.textContent = parts.join("  ·  ");
        }
      }).catch(() => undefined);
    }
  };

  const exportBackup = async () => {
    const [memberships, payments, attendance, classes, plans, trainers] =
      await Promise.all([
        gymApi.memberships(),
        gymApi.payments(),
        gymApi.attendance(),
        gymApi.classes(),
        gymApi.plans(),
        gymApi.trainers().catch(() => []),
      ]);
    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      members: people,
      memberships,
      payments,
      attendance,
      classes,
      plans,
      trainers,
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    link.download = `homezup-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importing) return;
    const maxBytes = 4 * 1024 * 1024;
    const maxRows = 1500;
    if (file.size > maxBytes) {
      window.alert(t("backup.tooBig"));
      return;
    }
    if (!window.confirm(t("backup.confirm"))) return;
    void (async () => {
      setImporting(true);
      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          window.alert(t("backup.invalid"));
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          window.alert(t("backup.invalid"));
          return;
        }
        const backup = parsed as Record<string, unknown>;
        const membersIn = Array.isArray(backup.members) ? backup.members : [];
        const membershipsIn = Array.isArray(backup.memberships) ? backup.memberships : [];
        const paymentsIn = Array.isArray(backup.payments) ? backup.payments : [];
        if (!membersIn.length) {
          window.alert(t("backup.invalid"));
          return;
        }
        if (membersIn.length > maxRows || membershipsIn.length > maxRows || paymentsIn.length > maxRows) {
          window.alert(t("backup.tooBig"));
          return;
        }
        const idMap = new Map<number, number>();
        for (const raw of membersIn) {
          if (!raw || typeof raw !== "object") continue;
          const member = raw as Record<string, unknown>;
          const oldId = asPositiveId(member.id);
          const name = clipText(member.name, 120);
          const names = name.split(/\s+/).filter(Boolean);
          const created = await gymApi.createMember({
            first_name: names[0] || "Member",
            last_name: names.slice(1).join(" ") || "Restored",
            phone: clipText(member.phone, 40),
            email: clipText(member.email, 120),
            id_number: clipText(member.id_number, 40) || (oldId ? `RESTORED${oldId}` : `RESTORED${Date.now()}`),
            address: clipText(member.address, 200) || "Restored from backup",
            city: clipText(member.city, 80),
            country: clipText(member.country, 80) || "Morocco",
            postal_code: clipText(member.postal_code, 20),
          });
          if (oldId) idMap.set(oldId, created.id);
        }
        const membershipMap = new Map<number, number>();
        for (const raw of membershipsIn) {
          if (!raw || typeof raw !== "object") continue;
          const membership = raw as Record<string, unknown>;
          const oldMemberId = asPositiveId(membership.member_id);
          const memberId = oldMemberId ? idMap.get(oldMemberId) : undefined;
          const planId = asPositiveId(membership.plan_id);
          const startDate = clipText(membership.start_date, 32);
          if (!memberId || !planId || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) continue;
          const restored = await gymApi.createMembership({
            member_id: memberId,
            plan_id: planId,
            start_date: startDate.slice(0, 10),
            notes: clipText(membership.notes, 240) || "Restored from backup",
          });
          const oldId = asPositiveId(membership.id);
          if (oldId) membershipMap.set(oldId, restored.id);
        }
        for (const raw of paymentsIn) {
          if (!raw || typeof raw !== "object") continue;
          const payment = raw as Record<string, unknown>;
          const membershipId = asPositiveId(payment.membership_id)
            ? membershipMap.get(asPositiveId(payment.membership_id) as number)
            : undefined;
          const amount = Number(payment.amount);
          if (!membershipId || !Number.isFinite(amount) || amount <= 0) continue;
          await gymApi.payment(membershipId, {
            amount,
            received_by: clipText(payment.received_by, 80) || "Admin",
            notes: clipText(payment.notes, 240) || "Restored from backup",
          });
        }
        window.location.reload();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to restore backup.");
      } finally {
        setImporting(false);
      }
    })();
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("members.eyebrow")}</span>
        <h2>{t("members.title")}</h2>
        <p>{t("members.intro")}</p>
      </div>
      <div className="ledger-stats">
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "" ? "active" : ""}`}
          onClick={() => setPaymentFilter("")}
        >
          <span>{t("members.all")}</span>
          <strong>{summary.total}</strong>
          <small>{t("dash.active", { n: summary.active })}</small>
        </button>
        <button
          type="button"
          className={`ledger-stat owing ${paymentFilter === "owing" ? "active" : ""}`}
          onClick={() => setPaymentFilter("owing")}
        >
          <span>{t("members.stillOwe")}</span>
          <strong>{money(moneySummary.owingTotal)}</strong>
          <small>{t("dash.active", { n: moneySummary.owing })}</small>
        </button>
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "paid" ? "active" : ""}`}
          onClick={() => setPaymentFilter("paid")}
        >
          <span>{t("members.paid")}</span>
          <strong>{moneySummary.paid}</strong>
          <small>{t("members.nothingLeft")}</small>
        </button>
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "unpaid" ? "active" : ""}`}
          onClick={() => setPaymentFilter("unpaid")}
        >
          <span>{t("members.unpaid")}</span>
          <strong>{moneySummary.unpaid}</strong>
          <small>{moneySummary.partial} {t("status.partial").toLowerCase()}</small>
        </button>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("members.search")}
          />
        </div>
        <select
          className="ledger-select"
          value={classFilter}
          onChange={(event) => setClassFilter(event.target.value)}
        >
          <option value="">All classes</option>
          <option value="none">No class</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="ledger-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring_soon">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="none">No membership</option>
        </select>
        <div className="toolbar-actions">
          <button type="button" className="secondary" disabled={importing} onClick={() => void exportBackup()}>
            <Download size={15} /> Export
          </button>
          <button type="button" className="secondary" disabled={importing} onClick={() => backupInputRef.current?.click()}>
            <Upload size={15} /> {importing ? t("backup.busy") : "Import"}
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importBackup}
          />
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> {t("members.add")}
          </button>
        </div>
      </div>
      {open && (
        <section className="panel form-panel member-form">
          <span className="eyebrow">NEW MEMBER</span>
          <div className="date-fields">
            <label>
              First name
              <input
                value={form.first_name}
                onChange={(event) =>
                  setForm({ ...form, first_name: event.target.value })
                }
              />
            </label>
            <label>
              Last name
              <input
                value={form.last_name}
                onChange={(event) =>
                  setForm({ ...form, last_name: event.target.value })
                }
              />
            </label>
          </div>
          <div className="date-fields">
            <label>
              {t("members.cin")}
              <input
                value={form.id_number}
                placeholder={t("members.cinPh")}
                onChange={(event) =>
                  setForm({ ...form, id_number: event.target.value })
                }
              />
              <small className="field-hint">{t("members.cinHelp")}</small>
            </label>
            <label>
              {t("members.city")}
              <input
                value={form.city}
                placeholder={t("members.cityPh")}
                onChange={(event) =>
                  setForm({ ...form, city: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            {t("members.address")}
            <input
              value={form.address}
              placeholder={t("members.addressPh")}
              onChange={(event) =>
                setForm({ ...form, address: event.target.value })
              }
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          <div className="date-fields">
            <label>
              Class
              <select
                value={form.class_id}
                onChange={(event) =>
                  setForm({ ...form, class_id: event.target.value })
                }
              >
                <option value="">Select class</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plan
              <select
                value={form.plan_id}
                onChange={(event) =>
                  setForm({ ...form, plan_id: event.target.value })
                }
              >
                <option value="">Select plan</option>
                {selectablePlans(plans).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="date-fields">
            <label>
              Start date
              <input
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm({ ...form, start_date: event.target.value })
                }
              />
            </label>
          </div>
          <p className="form-caption">Payment: what they gave you now, and what they still owe.</p>
          <div className="date-fields">
            <label>
              Amount paid (DH)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="100"
                value={form.amount_paid}
                onChange={(event) =>
                  setForm({ ...form, amount_paid: event.target.value })
                }
              />
            </label>
            <label>
              Still owes (DH)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="20"
                value={form.remaining}
                onChange={(event) =>
                  setForm({ ...form, remaining: event.target.value })
                }
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={submit}
              disabled={!form.first_name.trim() || !form.last_name.trim() || !form.id_number.trim() || !form.address.trim()}
            >
              Create member
            </button>
          </div>
        </section>
      )}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("dash.member")}</th>
              <th>{t("members.class")}</th>
              <th>{t("members.price")}</th>
              <th>{t("members.paidCol")}</th>
              <th>{t("members.stillOwes")}</th>
              <th>{t("members.payment")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedPeople.map((member) => {
              const membership = membershipFor(member.id);
              const memberStatus = memberStatuses[member.id];
              const remaining = Number(membership?.remaining_balance || 0);
              const dotClass =
                memberStatus === "active"
                  ? "active"
                  : memberStatus === "expiring_soon"
                    ? "expiring"
                    : "inactive";
              return (
                <tr key={member.id} onClick={() => showMemberDetails(member)}>
                  <td data-label={t("dash.member")}>
                    <span
                      className={`member-status-dot ${dotClass}`}
                      title={memberStatus || "No membership"}
                    ></span>
                    {member.name}
                    <small>
                      {member.id_number ? `CIN ${member.id_number}` : t("members.noCin")}
                      {member.phone ? ` · ${member.phone}` : ""}
                    </small>
                  </td>
                  <td data-label={t("members.class")}>{member.class_name || "No class"}</td>
                  <td data-label={t("members.price")}>{membership ? money(membership.price) : "—"}</td>
                  <td data-label={t("members.paidCol")}>{membership ? money(membership.total_paid) : "—"}</td>
                  <td className="table-money" data-label={t("members.stillOwes")}>
                    <strong className={remaining > 0 ? "amount-owing" : "amount-settled"}>
                      {membership ? (remaining > 0 ? money(remaining) : "Settled") : "—"}
                    </strong>
                  </td>
                  <td data-label={t("members.payment")}>
                    {membership ? (
                      <Badge value={membership.payment_status} payment />
                    ) : (
                      <span className="status expired">No plan</span>
                    )}
                  </td>
                  <td data-label={t("common.actions")}>
                    <div className="table-actions">
                      {membership ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRecordPaymentForm({
                              memberLabel: member.name,
                              membership,
                              onPayment,
                            });
                          }}
                        >
                          Payment
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-button"
                        disabled={memberStatus !== "active" && memberStatus !== "expiring_soon"}
                        title={
                          memberStatus === "active" || memberStatus === "expiring_soon"
                            ? undefined
                            : t("att.required")
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          onCheckIn(member.id);
                        }}
                      >
                        Check in
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMoreBar shown={shown} total={visiblePeople.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />
        {!visiblePeople.length && (
          <div className="empty">
            {people.length ? "No members match these filters." : "No members found."}
          </div>
        )}
      </section>
    </div>
  );
}

function ClassesPage({
  classes,
  canAdminister,
  onCreate,
  onUpdate,
  onDelete,
}: {
  classes: FitnessClass[];
  canAdminister: boolean;
  onCreate: (payload: {
    name: string;
    class_type: string;
    price_per_member: number | string;
    is_active?: boolean;
  }) => void;
  onUpdate: (
    id: number,
    payload: {
      name: string;
      class_type: string;
      price_per_member: number | string;
      is_active?: boolean;
    },
  ) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useLang();
  const emptyForm = {
    name: "",
    class_type: "boxing",
    price_per_member: "100",
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = classes.find((item) => item.id === selectedId) || null;
  const editing = classes.find((item) => item.id === editingId) || null;

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
  };

  const openCreate = () => {
    setSelectedId(null);
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: FitnessClass) => {
    setSelectedId(item.id);
    setEditingId(item.id);
    setForm({
      name: item.name,
      class_type: item.class_type,
      price_per_member: String(item.price_per_member),
      is_active: item.is_active,
    });
    setOpen(true);
  };

  const saveClass = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      class_type: form.class_type,
      price_per_member: Number(form.price_per_member || 0),
      is_active: form.is_active,
    };
    if (editingId) onUpdate(editingId, payload);
    else onCreate(payload);
    closeForm();
  };

  const removeClass = (item: FitnessClass) => {
    if (!window.confirm(t("class.confirmDelete"))) return;
    if (selectedId === item.id) setSelectedId(null);
    if (editingId === item.id) closeForm();
    onDelete(item.id);
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("class.eyebrow")}</span>
        <h2>{t("class.title")}</h2>
        <p>{canAdminister ? t("class.intro") : t("class.staff")}</p>
      </div>
      {canAdminister && (
        <div className="toolbar">
          <button className="primary" onClick={openCreate}>
            <Plus size={16} /> {t("class.add")}
          </button>
        </div>
      )}
      {open && canAdminister && (
        <section className="panel form-panel">
          <span className="eyebrow">{editing ? t("class.editHead") : t("class.create")}</span>
          <div className="date-fields">
            <label>
              {t("class.name")}
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              {t("class.type")}
              <select
                value={form.class_type}
                onChange={(event) => setForm({ ...form, class_type: event.target.value })}
              >
                <option value="boxing">Boxing</option>
                <option value="kick_boxing">Kick Boxing</option>
                <option value="musculation">Musculation</option>
                <option value="aerobic">Aerobic</option>
              </select>
            </label>
          </div>
          <div className="date-fields">
            <label>
              {t("class.price")}
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price_per_member}
                onChange={(event) =>
                  setForm({ ...form, price_per_member: event.target.value })
                }
              />
            </label>
            <label>
              {t("class.active")}
              <select
                value={String(form.is_active)}
                onChange={(event) =>
                  setForm({ ...form, is_active: event.target.value === "true" })
                }
              >
                <option value="true">{t("common.active")}</option>
                <option value="false">{t("common.inactive")}</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary" onClick={closeForm}>
              {t("common.cancel")}
            </button>
            <button className="primary" onClick={saveClass}>
              {editing ? t("class.save") : t("class.add")}
            </button>
          </div>
        </section>
      )}
      {selected && (
        <section className="panel class-detail">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("class.details")}</span>
              <h3>{selected.name}</h3>
            </div>
            <Badge value={selected.is_active ? "active" : "inactive"} />
          </div>
          <div className="info-list">
            <p>
              <span>{t("class.members")}</span>
              <strong>{selected.member_count}</strong>
            </p>
            <p>
              <span>{t("class.type")}</span>
              <strong>{selected.class_type.replace("_", " ")}</strong>
            </p>
            <p>
              <span>{t("class.price")}</span>
              <strong>{money(selected.price_per_member)}</strong>
            </p>
            <p>
              <span>{t("common.status")}</span>
              <strong>{selected.is_active ? t("common.active") : t("common.inactive")}</strong>
            </p>
          </div>
          {canAdminister && (
            <div className="form-actions">
              <button className="secondary" onClick={() => openEdit(selected)}>
                {t("common.edit")}
              </button>
              <button className="secondary" onClick={() => removeClass(selected)}>
                {t("class.remove")}
              </button>
            </div>
          )}
        </section>
      )}
      {classes.length ? (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("class.name")}</th>
                <th>{t("class.members")}</th>
                <th>{t("class.type")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.member_count}</td>
                  <td>{item.class_type.replace("_", " ")}</td>
                  <td>
                    <Badge value={item.is_active ? "active" : "inactive"} />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="text-button" onClick={() => setSelectedId(item.id)}>
                        {t("class.view")}
                      </button>
                      {canAdminister && (
                        <>
                          <button className="text-button" onClick={() => openEdit(item)}>
                            {t("common.edit")}
                          </button>
                          <button className="text-button" onClick={() => removeClass(item)}>
                            {t("common.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <div className="panel empty">{t("class.empty")}</div>
      )}
    </div>
  );
}

function Memberships({
  items,
  query,
  setQuery,
  status,
  setStatus,
  memberName,
  planName,
  plans,
  onRenew,
  onUpdate,
  onDelete,
  onSetPaymentStatus,
  onPayment,
}: {
  items: Membership[];
  query: string;
  setQuery: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  memberName: (id: number) => string;
  planName: (id: number) => string;
  plans: Plan[];
  onRenew: (
    id: number,
    payload: {
      member_id: number;
      plan_id: number;
      start_date: string;
      notes: string;
    },
  ) => void;
  onUpdate: (
    id: number,
    payload: {
      member_id: number;
      plan_id: number;
      start_date: string;
      notes: string;
    },
  ) => void;
  onDelete: (id: number) => void;
  onSetPaymentStatus: (membership: Membership, status: "paid" | "unpaid") => void;
  onPayment: OnPayment;
}) {
  const { t } = useLang();
  void onUpdate;

  const addPayment = (membership: Membership) => {
    openRecordPaymentForm({
      memberLabel: memberName(membership.member_id),
      membership,
      onPayment,
    });
  };
  const [paymentFilter, setPaymentFilter] = useState("");
  const moneySummary = useMemo(() => {
    const counts = { owing: 0, owingTotal: 0, paid: 0, unpaid: 0, partial: 0 };
    items.forEach((item) => {
      const remaining = Number(item.remaining_balance || 0);
      if (remaining > 0) {
        counts.owing += 1;
        counts.owingTotal += remaining;
      }
      if (item.payment_status === "paid") counts.paid += 1;
      else if (item.payment_status === "partial") counts.partial += 1;
      else counts.unpaid += 1;
    });
    return counts;
  }, [items]);
  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const remaining = Number(item.remaining_balance || 0);
      if (paymentFilter === "owing" && remaining <= 0) return false;
      if (paymentFilter === "paid" && item.payment_status !== "paid") return false;
      if (paymentFilter === "partial" && item.payment_status !== "partial") return false;
      if (paymentFilter === "unpaid" && item.payment_status !== "unpaid") return false;
      return true;
    });
  }, [items, paymentFilter]);
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [query, status, paymentFilter, items.length]);
  const pagedItems = visibleItems.slice(0, shown);
  const [renewId, setRenewId] = useState<number | null>(null);
  const [renewForm, setRenewForm] = useState({
    plan_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    notes: "Renewed from admin workspace",
  });

  const openRenew = (item: Membership) => {
    setRenewId(item.id);
    setRenewForm({
      plan_id: String(item.plan_id),
      start_date: item.end_date,
      notes: `Renewal for ${memberName(item.member_id)}`,
    });
  };

  const showMembershipDetails = (item: Membership) => {
    document.querySelector(".member-details-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "member-details-overlay";
    overlay.onclick = (event) => {
      if (event.target === overlay) dismissOverlay(overlay);
    };
    const panel = document.createElement("section");
    panel.className = "member-details-panel membership-details-panel";

    const head = document.createElement("div");
    head.className = "membership-details-head";
    const label = document.createElement("span");
    label.className = "eyebrow";
    label.textContent = "MEMBERSHIP DETAILS";
    const close = document.createElement("button");
    close.className = "membership-details-x";
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.onclick = () => dismissOverlay(overlay);
    const heading = document.createElement("h2");
    heading.textContent = memberName(item.member_id);
    const badges = document.createElement("div");
    badges.className = "membership-details-badges";
    const statusBadge = document.createElement("span");
    statusBadge.className = `status ${item.status}`;
    statusBadge.textContent = item.status.replace("_", " ");
    const paymentBadge = document.createElement("span");
    paymentBadge.className = `status payment ${item.payment_status}`;
    paymentBadge.textContent = item.payment_status;
    badges.append(statusBadge, paymentBadge);
    head.append(label, close, heading, badges);

    const grid = document.createElement("div");
    grid.className = "membership-details-grid";
    const fields = [
      ["Plan", planName(item.plan_id)],
      ["Price", money(item.price)],
      ["Start date", date(item.start_date)],
      ["Month ends", date(item.end_date)],
      ["Paid", money(item.total_paid)],
      ["Still owes", money(item.remaining_balance)],
    ];
    fields.forEach(([key, value]) => {
      const cell = document.createElement("div");
      if (key === "Still owes" && Number(item.remaining_balance) > 0) cell.className = "remaining";
      const caption = document.createElement("span");
      caption.textContent = key;
      const strong = document.createElement("strong");
      strong.textContent = value;
      cell.append(caption, strong);
      grid.append(cell);
    });

    const actions = document.createElement("div");
    actions.className = "form-actions membership-details-actions";
    const renew = document.createElement("button");
    renew.className = "primary";
    renew.textContent = "Renew membership";
    renew.onclick = () => {
      dismissOverlay(overlay);
      openRenew(item);
    };
    const pay = document.createElement("button");
    pay.className = "secondary";
    pay.textContent = "Record payment";
    pay.onclick = () => {
      dismissOverlay(overlay);
      addPayment(item);
    };
    const remove = document.createElement("button");
    remove.className = "secondary";
    remove.textContent = "Delete";
    remove.onclick = () => {
      if (window.confirm(`Delete membership for ${memberName(item.member_id)}?`)) {
        dismissOverlay(overlay);
        onDelete(item.id);
      }
    };
    actions.append(renew, pay, remove);
    panel.append(head, grid, actions);
    overlay.append(panel);
    document.body.append(overlay);
  };

  const submitRenew = () => {
    if (renewId === null || !renewForm.plan_id) return;
    onRenew(renewId, {
      member_id: items.find((item) => item.id === renewId)?.member_id || 0,
      plan_id: Number(renewForm.plan_id),
      start_date: renewForm.start_date,
      notes: renewForm.notes,
    });
    setRenewId(null);
    setRenewForm({
      plan_id: "",
      start_date: new Date().toISOString().slice(0, 10),
      notes: "Renewed from admin workspace",
    });
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("memberships.eyebrow")}</span>
        <h2>{t("memberships.title")}</h2>
        <p>{t("memberships.intro")}</p>
      </div>
      <div className="ledger-stats">
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "" ? "active" : ""}`}
          onClick={() => setPaymentFilter("")}
        >
          <span>All plans</span>
          <strong>{items.length}</strong>
          <small>Every membership</small>
        </button>
        <button
          type="button"
          className={`ledger-stat owing ${paymentFilter === "owing" ? "active" : ""}`}
          onClick={() => setPaymentFilter("owing")}
        >
          <span>Still owe</span>
          <strong>{money(moneySummary.owingTotal)}</strong>
          <small>{moneySummary.owing} members</small>
        </button>
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "paid" ? "active" : ""}`}
          onClick={() => setPaymentFilter("paid")}
        >
          <span>Paid</span>
          <strong>{moneySummary.paid}</strong>
          <small>Fully settled</small>
        </button>
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "unpaid" ? "active" : ""}`}
          onClick={() => setPaymentFilter("unpaid")}
        >
          <span>{t("members.unpaid")}</span>
          <strong>{moneySummary.unpaid}</strong>
          <small>{moneySummary.partial} {t("status.partial").toLowerCase()}</small>
        </button>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("memberships.search")}
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring_soon">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {renewId !== null && (
        <section className="panel form-panel">
          <span className="eyebrow">RENEW MEMBERSHIP</span>
          <div className="date-fields">
            <label>
              Plan
              <select
                value={renewForm.plan_id}
                onChange={(event) =>
                  setRenewForm({ ...renewForm, plan_id: event.target.value })
                }
              >
                <option value="">Select plan</option>
                {selectablePlans(plans, renewForm.plan_id).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Renew from
              <input
                type="date"
                value={renewForm.start_date}
                onChange={(event) =>
                  setRenewForm({ ...renewForm, start_date: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            Notes
            <input
              value={renewForm.notes}
              onChange={(event) =>
                setRenewForm({ ...renewForm, notes: event.target.value })
              }
            />
          </label>
          <div className="form-actions">
            <button className="secondary" onClick={() => setRenewId(null)}>
              Cancel
            </button>
            <button className="primary" onClick={submitRenew}>
              Renew membership
            </button>
          </div>
        </section>
      )}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("dash.member")}</th>
              <th>{t("memberships.plan")}</th>
              <th>{t("memberships.period")}</th>
              <th>{t("members.price")}</th>
              <th>{t("members.paidCol")}</th>
              <th>{t("members.stillOwes")}</th>
              <th>{t("members.payment")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.map((item) => {
              const remaining = Number(item.remaining_balance || 0);
              return (
              <tr key={item.id} onClick={() => showMembershipDetails(item)}>
                <td data-label={t("dash.member")}>
                  {memberName(item.member_id)}
                  <small>{item.status.replace("_", " ")}</small>
                </td>
                <td data-label={t("memberships.plan")}>{planName(item.plan_id)}</td>
                <td data-label={t("memberships.period")}>
                  {date(item.start_date)}
                  <small>to {date(item.end_date)}</small>
                </td>
                <td data-label={t("members.price")}>{money(item.price)}</td>
                <td data-label={t("members.paidCol")}>{money(item.total_paid)}</td>
                <td className="table-money" data-label={t("members.stillOwes")}>
                  <strong className={remaining > 0 ? "amount-owing" : "amount-settled"}>
                    {remaining > 0 ? money(remaining) : "Settled"}
                  </strong>
                </td>
                <td data-label={t("members.payment")}>
                  <Badge value={item.payment_status} payment />
                </td>
                <td data-label={t("common.actions")}>
                  <div className="table-actions">
                    <button
                      className="text-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addPayment(item);
                      }}
                    >
                      Payment
                    </button>
                    <button
                      className={`payment-status-action ${item.payment_status === "paid" ? "paid" : "unpaid"}`}
                      title="Mark membership paid"
                      aria-label="Mark membership paid"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetPaymentStatus(item, "paid");
                      }}
                    >
                      <Check size={12} strokeWidth={2.25} />
                    </button>
                    <button
                      className={`payment-status-action ${item.payment_status === "unpaid" ? "unpaid" : "paid"}`}
                      title="Mark membership unpaid"
                      aria-label="Mark membership unpaid"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetPaymentStatus(item, "unpaid");
                      }}
                    >
                      <X size={12} strokeWidth={2.25} />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMoreBar shown={shown} total={visibleItems.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />
        {!visibleItems.length && (
          <div className="empty">
            {items.length ? "No memberships match these filters." : "No memberships found."}
          </div>
        )}
      </section>
    </div>
  );
}

function Plans({
  plans,
  canAdminister,
  onCreate,
  onUpdate,
  onDelete,
}: {
  plans: Plan[];
  canAdminister: boolean;
  onCreate: (payload: {
    name: string;
    duration_months: number;
    price: number | string;
    description: string;
    is_active: boolean;
  }) => void;
  onUpdate: (
    id: number,
    payload: {
      name: string;
      duration_months: number;
      price: number | string;
      description: string;
      is_active: boolean;
    },
  ) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useLang();
  const emptyForm = {
    name: "",
    duration_months: "1",
    price: "300",
    description: "",
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = plans.find((item) => item.id === selectedId) || null;
  const editing = plans.find((item) => item.id === editingId) || null;

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
  };

  const openCreate = () => {
    setSelectedId(null);
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: Plan) => {
    setSelectedId(item.id);
    setEditingId(item.id);
    setForm({
      name: item.name,
      duration_months: String(item.duration_months),
      price: String(item.price),
      description: item.description || "",
      is_active: item.is_active,
    });
    setOpen(true);
  };

  const payloadFromForm = () => ({
    name: form.name.trim(),
    duration_months: Number(form.duration_months || 1),
    price: Number(form.price || 0),
    description: form.description.trim(),
    is_active: form.is_active,
  });

  const savePlan = () => {
    if (!form.name.trim()) return;
    const payload = payloadFromForm();
    if (editingId) onUpdate(editingId, payload);
    else onCreate(payload);
    closeForm();
  };

  const deactivatePlan = (item: Plan) => {
    onUpdate(item.id, {
      name: item.name,
      duration_months: item.duration_months,
      price: item.price,
      description: item.description || "",
      is_active: false,
    });
  };

  const removePlan = (item: Plan) => {
    if (!window.confirm(t("plans.confirmDelete"))) return;
    if (selectedId === item.id) setSelectedId(null);
    if (editingId === item.id) closeForm();
    onDelete(item.id);
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("plans.eyebrow")}</span>
        <h2>{t("plans.title")}</h2>
        <p>{canAdminister ? t("plans.intro") : t("plans.staff")}</p>
      </div>
      {canAdminister && (
        <div className="toolbar">
          <button className="primary" onClick={openCreate}>
            <Plus size={16} /> {t("plans.add")}
          </button>
        </div>
      )}
      {open && canAdminister && (
        <section className="panel form-panel">
          <span className="eyebrow">{editing ? t("plans.editHead") : t("plans.create")}</span>
          <div className="date-fields">
            <label>
              {t("plans.name")}
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              {t("plans.duration")}
              <input
                type="number"
                min="1"
                value={form.duration_months}
                onChange={(event) =>
                  setForm({ ...form, duration_months: event.target.value })
                }
              />
            </label>
          </div>
          <div className="date-fields">
            <label>
              {t("plans.price")}
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </label>
            <label>
              {t("plans.active")}
              <select
                value={String(form.is_active)}
                onChange={(event) =>
                  setForm({ ...form, is_active: event.target.value === "true" })
                }
              >
                <option value="true">{t("common.active")}</option>
                <option value="false">{t("common.inactive")}</option>
              </select>
            </label>
          </div>
          <label>
            {t("plans.description")}
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="form-actions">
            <button className="secondary" onClick={closeForm}>
              {t("common.cancel")}
            </button>
            <button className="primary" onClick={savePlan}>
              {editing ? t("plans.save") : t("plans.add")}
            </button>
          </div>
        </section>
      )}
      {selected && (
        <section className="panel class-detail">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("plans.details")}</span>
              <h3>{selected.name}</h3>
            </div>
            <Badge value={selected.is_active ? "active" : "inactive"} />
          </div>
          <div className="info-list">
            <p>
              <span>{t("plans.members")}</span>
              <strong>{selected.member_count || 0}</strong>
            </p>
            <p>
              <span>{t("plans.duration")}</span>
              <strong>{planDurationLabel(selected.duration_months, t)}</strong>
            </p>
            <p>
              <span>{t("plans.price")}</span>
              <strong>{money(selected.price)}</strong>
            </p>
            <p>
              <span>{t("common.status")}</span>
              <strong>{selected.is_active ? t("common.active") : t("common.inactive")}</strong>
            </p>
            {selected.description ? (
              <p>
                <span>{t("plans.description")}</span>
                <strong>{selected.description}</strong>
              </p>
            ) : null}
          </div>
          {canAdminister && (
            <div className="form-actions">
              <button className="secondary" onClick={() => openEdit(selected)}>
                {t("common.edit")}
              </button>
              {selected.is_active && (
                <button className="secondary" onClick={() => deactivatePlan(selected)}>
                  {t("plans.deactivate")}
                </button>
              )}
              <button className="secondary" onClick={() => removePlan(selected)}>
                {t("plans.remove")}
              </button>
            </div>
          )}
        </section>
      )}
      {plans.length ? (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("plans.name")}</th>
                <th>{t("plans.duration")}</th>
                <th>{t("plans.price")}</th>
                <th>{t("plans.members")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{planDurationLabel(item.duration_months, t)}</td>
                  <td>{money(item.price)}</td>
                  <td>{item.member_count || 0}</td>
                  <td>
                    <Badge value={item.is_active ? "active" : "inactive"} />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="text-button" onClick={() => setSelectedId(item.id)}>
                        {t("plans.view")}
                      </button>
                      {canAdminister && (
                        <>
                          <button className="text-button" onClick={() => openEdit(item)}>
                            {t("common.edit")}
                          </button>
                          {item.is_active && (
                            <button className="text-button" onClick={() => deactivatePlan(item)}>
                              {t("plans.deactivate")}
                            </button>
                          )}
                          <button className="text-button" onClick={() => removePlan(item)}>
                            {t("common.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <div className="panel empty">{t("plans.empty")}</div>
      )}
    </div>
  );
}

function localDay(value: string) {
  const stamp = new Date(value);
  return `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}`;
}

function GymPayments({
  payments,
  memberships,
  members,
  onPayment,
}: {
  payments: GymPayment[];
  memberships: Membership[];
  members: Member[];
  onPayment: OnPayment;
}) {
  const { t } = useLang();
  const searchRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const months = reportMonths();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [period, setPeriod] = useState<"today" | "month" | "all">("month");
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${now.getMonth() + 1}`);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | "">("");
  const [deskError, setDeskError] = useState("");
  const [year, month] = selectedMonth.split("-").map(Number);
  const todayKey = localDay(now.toISOString());

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const membershipById = useMemo(() => {
    const map = new Map<number, Membership>();
    memberships.forEach((item) => map.set(item.id, item));
    return map;
  }, [memberships]);

  const memberById = useMemo(() => {
    const map = new Map<number, Member>();
    members.forEach((item) => map.set(item.id, item));
    return map;
  }, [members]);
  const membershipByMemberId = useMemo(() => indexLatestMembership(memberships), [memberships]);

  const labelFor = (payment: GymPayment) => {
    if (payment.member_name) return payment.member_name;
    const membership = membershipById.get(payment.membership_id);
    if (!membership) return `Membership #${payment.membership_id}`;
    return memberById.get(membership.member_id)?.name || `Member #${membership.member_id}`;
  };

  const selected = members.find((item) => item.id === selectedId) || null;
  const selectedMembership = selected ? membershipByMemberId.get(selected.id) : undefined;
  const selectedRemaining = Number(selectedMembership?.remaining_balance || 0);

  const owing = useMemo(() => {
    return memberships
      .filter((item) => Number(item.remaining_balance || 0) > 0)
      .sort((a, b) => Number(b.remaining_balance) - Number(a.remaining_balance));
  }, [memberships]);

  const cashToday = payments
    .filter((item) => localDay(item.received_at) === todayKey)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashMonth = payments
    .filter((item) => {
      const stamp = new Date(item.received_at);
      return stamp.getFullYear() === now.getFullYear() && stamp.getMonth() + 1 === now.getMonth() + 1;
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const owingTotal = owing.reduce((sum, item) => sum + Number(item.remaining_balance || 0), 0);

  const visiblePayments = useMemo(() => {
    return payments.filter((payment) => {
      const stamp = new Date(payment.received_at);
      if (period === "today" && localDay(payment.received_at) !== todayKey) return false;
      if (period === "month" && (stamp.getFullYear() !== year || stamp.getMonth() + 1 !== month)) return false;
      const needle = historyQuery.trim().toLowerCase();
      if (!needle) return true;
      const membership = membershipById.get(payment.membership_id);
      const member = membership ? memberById.get(membership.member_id) : undefined;
      const haystack = [
        labelFor(payment),
        payment.receipt_number || `FO-${String(payment.id).padStart(6, "0")}`,
        String(payment.id),
        payment.notes || "",
        payment.received_by || "",
        payment.id_number || member?.id_number || "",
        member?.phone || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [payments, period, year, month, historyQuery, membershipById, memberById, todayKey]);
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [period, selectedMonth, historyQuery, payments.length]);
  const pagedPayments = visiblePayments.slice(0, shown);

  const localMatches = (value: string) => {
    const needle = value.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    if (needle.length < 2 && digits.length < 4) return [];
    return members
      .filter((member) => {
        const phone = (member.phone || "").replace(/\D/g, "");
        const cin = (member.id_number || "").toLowerCase().replace(/[\s-]/g, "");
        return (
          member.name.toLowerCase().includes(needle) ||
          (member.phone || "").toLowerCase().includes(needle) ||
          cin.includes(needle.replace(/[\s-]/g, "")) ||
          (digits.length >= 4 && phone.includes(digits))
        );
      })
      .slice(0, 8);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setLookupError("");
    setMatches(localMatches(value));
  };

  const takePayment = (membership: Membership, memberLabel: string) => {
    openRecordPaymentForm({
      memberLabel,
      membership,
      onPayment: async (membershipId, payload) => {
        const payment = await onPayment(membershipId, payload);
        if (payment && typeof payment === "object" && "id" in payment) {
          try {
            await gymApi.openPaymentReceipt(payment.id);
          } catch {
            /* receipt is optional after a successful take */
          }
        }
      },
    });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const found = localMatches(query);
    setMatches(found);
    if (!found.length) {
      setLookupError(t("cash.noMatch"));
      setSelectedId(null);
      return;
    }
    setSelectedId(found[0].id);
    setLookupError("");
  };

  async function downloadLog(format: "xlsx" | "pdf") {
    setExporting(format);
    setDeskError("");
    try {
      await gymApi.downloadCashLog(year, month, format);
    } catch (e) {
      setDeskError(e instanceof Error ? e.message : t("cash.exportFail"));
    } finally {
      setExporting("");
    }
  }

  async function printReceipt(id: number) {
    setDeskError("");
    try {
      await gymApi.openPaymentReceipt(id);
    } catch (e) {
      setDeskError(e instanceof Error ? e.message : t("cash.receiptFail"));
    }
  }

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("cash.eyebrow")}</span>
        <h2>{t("cash.title")}</h2>
        <p>{t("cash.intro")}</p>
      </div>
      <form className="desk-search" onSubmit={submitSearch}>
        <div className="search desk-search-field">
          <Search size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("cash.searchPh")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <button className="primary" type="submit" disabled={!query.trim()}>
          <Search size={16} /> {t("cash.find")}
        </button>
      </form>
      {lookupError && <div className="error app-banner">{lookupError}</div>}
      {Boolean(matches.length) && (
        <section className="panel desk-matches">
          {matches.map((member) => {
            const membership = membershipByMemberId.get(member.id);
            const remaining = Number(membership?.remaining_balance || 0);
            return (
              <button
                type="button"
                className={`desk-match ${selectedId === member.id ? "active" : ""}`}
                key={member.id}
                onClick={() => setSelectedId(member.id)}
              >
                <strong>{member.name}</strong>
                <small>
                  {member.id_number ? `CIN ${member.id_number}` : ""}
                  {member.phone ? `${member.id_number ? " · " : ""}${member.phone}` : ""}
                </small>
                {membership ? (
                  remaining > 0 ? (
                    <Badge value="unpaid" payment />
                  ) : (
                    <Badge value="paid" payment />
                  )
                ) : (
                  <span className="status expired">{t("cash.noPlan")}</span>
                )}
              </button>
            );
          })}
        </section>
      )}
      {selected && (
        <section className="panel desk-card cash-selected">
          <div className="desk-card-main">
            <span className="eyebrow">{t("cash.pay")}</span>
            <h3>{selected.name}</h3>
            <p>
              {selected.id_number ? `CIN ${selected.id_number}` : t("members.noCin")}
              {selected.phone ? ` · ${selected.phone}` : ""}
            </p>
            {selectedMembership ? (
              <p>
                {t("members.stillOwes")}:{" "}
                <strong className={selectedRemaining > 0 ? "amount-owing" : "amount-settled"}>
                  {selectedRemaining > 0 ? money(selectedRemaining) : t("cash.settled")}
                </strong>
              </p>
            ) : (
              <p>{t("cash.noMembership")}</p>
            )}
          </div>
          {selectedMembership ? (
            <button
              type="button"
              className="primary"
              onClick={() => takePayment(selectedMembership, selected.name)}
            >
              <CircleDollarSign size={16} /> {t("cash.pay")}
            </button>
          ) : null}
        </section>
      )}
      <div className="ledger-stats cash-stats">
        <div className="ledger-stat">
          <span>{t("cash.today")}</span>
          <strong>{money(cashToday)}</strong>
          <small>{t("cash.todayFilter")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("cash.month")}</span>
          <strong>{money(cashMonth)}</strong>
          <small>{monthLabel(now.getFullYear(), now.getMonth() + 1)}</small>
        </div>
        <div className="ledger-stat owing">
          <span>{t("cash.owing")}</span>
          <strong>{owing.length}</strong>
          <small>{t("cash.owingList")}</small>
        </div>
        <div className="ledger-stat owing">
          <span>{t("cash.owingTotal")}</span>
          <strong>{money(owingTotal)}</strong>
          <small>{t("members.stillOwes")}</small>
        </div>
      </div>
      <section className="panel table-wrap">
        <div className="panel-heading desk-heading">
          <h3>{t("cash.owingList")}</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t("dash.member")}</th>
              <th>{t("members.stillOwes")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {owing.slice(0, 12).map((membership) => {
              const member = memberById.get(membership.member_id);
              const name = member?.name || `Member #${membership.member_id}`;
              return (
                <tr key={membership.id}>
                  <td>
                    {name}
                    <small>
                      {member?.id_number ? `CIN ${member.id_number}` : ""}
                      {member?.phone ? `${member.id_number ? " · " : ""}${member.phone}` : ""}
                    </small>
                  </td>
                  <td className="table-money">
                    <strong className="amount-owing">{money(membership.remaining_balance)}</strong>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => takePayment(membership, name)}
                    >
                      {t("cash.pay")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!owing.length && <div className="empty">{t("cash.settled")}</div>}
      </section>
      {deskError && <div className="error app-banner">{deskError}</div>}
      <section className="panel table-wrap">
        <div className="panel-heading desk-heading cash-log-head">
          <h3>{t("cash.history")}</h3>
          <div className="cash-log-tools">
            <div className="search">
              <Search size={16} />
              <input
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder={t("cash.searchPh")}
              />
            </div>
            <div className="cash-period">
              <button
                type="button"
                className={period === "today" ? "secondary active" : "secondary"}
                onClick={() => setPeriod("today")}
              >
                {t("cash.todayFilter")}
              </button>
              <select
                className={period === "month" ? "cash-month-select active" : "cash-month-select"}
                value={selectedMonth}
                aria-label={t("common.month")}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPeriod("month");
                }}
              >
                {months.map((item) => (
                  <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={period === "all" ? "secondary active" : "secondary"}
                onClick={() => setPeriod("all")}
              >
                {t("cash.allFilter")}
              </button>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(exporting)}
              onClick={() => void downloadLog("xlsx")}
            >
              <FileSpreadsheet size={15} />
              {exporting === "xlsx" ? t("rep.exporting") : t("cash.excel")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(exporting)}
              onClick={() => void downloadLog("pdf")}
            >
              <FileText size={15} />
              {exporting === "pdf" ? t("rep.exporting") : t("cash.pdf")}
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t("dash.member")}</th>
              <th>{t("cash.date")}</th>
              <th>{t("common.amount")}</th>
              <th>{t("cash.method")}</th>
              <th>{t("cash.receivedBy")}</th>
              <th>{t("common.notes")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedPayments.map((payment) => {
              const receipt = payment.receipt_number || `FO-${String(payment.id).padStart(6, "0")}`;
              return (
                <tr key={payment.id}>
                  <td>
                    {labelFor(payment)}
                    <small>{t("cash.receiptN", { n: receipt })}</small>
                  </td>
                  <td>
                    {date(payment.received_at)}
                    <small>{clock(payment.received_at)}</small>
                  </td>
                  <td>
                    <strong>{money(payment.amount)}</strong>
                  </td>
                  <td>
                    <Badge value="paid" payment /> {t("cash.cash")}
                  </td>
                  <td>{payment.received_by}</td>
                  <td>{payment.notes || "—"}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="text-button" onClick={() => void printReceipt(payment.id)}>
                        {t("cash.print")}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void gymApi.downloadPaymentReceipt(payment.id).catch((e) => {
                          setDeskError(e instanceof Error ? e.message : t("cash.receiptFail"));
                        })}
                      >
                        {t("cash.pdf")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMoreBar shown={shown} total={visiblePayments.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />
        {!visiblePayments.length && (
          <div className="empty">{payments.length ? t("cash.emptyFilter") : t("cash.empty")}</div>
        )}
      </section>
    </div>
  );
}

function AttendancePage({
  records,
  members,
  memberships,
  classes,
  onCheckIn,
  onCheckOut,
}: {
  records: Attendance[];
  members: Member[];
  memberships: Membership[];
  classes: FitnessClass[];
  onCheckIn: (id: number) => Promise<void> | void;
  onCheckOut: (id: number) => Promise<void> | void;
}) {
  const { t } = useLang();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [matches, setMatches] = useState<Member[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const memberById = useMemo(() => {
    const map = new Map<number, Member>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);
  const insideByMember = useMemo(() => {
    const map = new Map<number, Attendance>();
    for (const item of records) {
      if (item.is_inside ?? !item.checked_out_at) map.set(item.member_id, item);
    }
    return map;
  }, [records]);
  const enterableIds = useMemo(() => {
    const set = new Set<number>();
    for (const item of memberships) {
      if (item.status === "active" || item.status === "expiring_soon") set.add(item.member_id);
    }
    return set;
  }, [memberships]);

  const insideVisit = (memberId: number) => insideByMember.get(memberId);
  const canEnter = (memberId: number) => enterableIds.has(memberId);

  const cardFor = (member: { id: number; card_code?: string }) =>
    member.card_code || `FO-${String(member.id).padStart(6, "0")}`;

  const selected =
    members.find((item) => item.id === selectedId) ||
    matches.find((item) => item.id === selectedId) ||
    null;
  const selectedVisit = selected ? insideVisit(selected.id) : undefined;
  const selectedCanEnter = selected ? canEnter(selected.id) : false;

  const inside = records.filter((item) => item.is_inside ?? !item.checked_out_at);
  const [shownInside, setShownInside] = useState(PAGE_SIZE);
  const [shownVisits, setShownVisits] = useState(PAGE_SIZE);
  useEffect(() => {
    setShownInside(PAGE_SIZE);
    setShownVisits(PAGE_SIZE);
  }, [records.length]);
  const pagedInside = inside.slice(0, shownInside);
  const pagedVisits = records.slice(0, shownVisits);
  const visitName = (item: Attendance) =>
    item.member_name || memberById.get(item.member_id)?.name || `#${item.member_id}`;
  const checkouts = records.filter((item) => item.checked_out_at).length;
  const headcount = [
    ...classes.map((item) => ({
      class_id: item.id,
      class_name: item.name,
      checkins: records.filter((visit) => visit.class_id === item.id).length,
      inside: inside.filter((visit) => visit.class_id === item.id).length,
    })),
    {
      class_id: null as number | null,
      class_name: t("att.noClass"),
      checkins: records.filter((visit) => !visit.class_id).length,
      inside: inside.filter((visit) => !visit.class_id).length,
    },
  ]
    .filter((item) => item.class_id !== null || item.checkins > 0)
    .sort((a, b) => b.inside - a.inside || b.checkins - a.checkins || a.class_name.localeCompare(b.class_name));

  const localMatches = (value: string) => {
    const needle = value.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    if (needle.length < 2 && digits.length < 4) return [];
    return members
      .filter((member) => {
        const card = cardFor(member).toLowerCase();
        const phone = (member.phone || "").replace(/\D/g, "");
        return (
          member.name.toLowerCase().includes(needle) ||
          (member.phone || "").toLowerCase().includes(needle) ||
          card.includes(needle.replace(/\s/g, "")) ||
          (digits.length >= 4 && phone.includes(digits))
        );
      })
      .slice(0, 8);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setLookupError("");
    setMatches(localMatches(value));
  };

  const applyExact = async (member: {
    id: number;
    is_inside?: boolean;
    can_check_in?: boolean;
  }) => {
    setSelectedId(member.id);
    if (member.is_inside || insideVisit(member.id)) {
      await onCheckOut(member.id);
    } else if (member.can_check_in !== false && canEnter(member.id)) {
      await onCheckIn(member.id);
    } else {
      setLookupError(t("att.expired"));
      return;
    }
    setQuery("");
    setMatches([]);
    searchRef.current?.focus();
  };

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setLookupBusy(true);
    setLookupError("");
    try {
      const result = await gymApi.lookupAttendance(value);
      if (result.exact && result.matches.length === 1) {
        await applyExact(result.matches[0]);
        return;
      }
      if (!result.matches.length) {
        const local = localMatches(value);
        setMatches(local);
        if (!local.length) setLookupError(t("att.noMatch"));
        if (local.length === 1) setSelectedId(local[0].id);
        return;
      }
      setMatches(
        result.matches.map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          email: "",
          card_code: item.card_code,
          class_id: item.class_id,
          class_name: item.class_name,
        })),
      );
      if (result.matches.length === 1) setSelectedId(result.matches[0].id);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : t("att.noMatch"));
    } finally {
      setLookupBusy(false);
    }
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("att.eyebrow")}</span>
        <h2>{t("att.title")}</h2>
        <p>{t("att.intro")}</p>
      </div>
      <form className="desk-search" onSubmit={(event) => void submitSearch(event)}>
        <div className="search desk-search-field">
          <Search size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("att.searchPh")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <button className="primary" type="submit" disabled={lookupBusy || !query.trim()}>
          <QrCode size={16} /> {t("att.find")}
        </button>
      </form>
      {lookupError && <div className="error app-banner">{lookupError}</div>}
      {Boolean(matches.length) && (
        <section className="panel desk-matches">
          {matches.map((member) => {
            const visit = insideVisit(member.id);
            const ok = canEnter(member.id);
            return (
              <button
                type="button"
                className={`desk-match ${selectedId === member.id ? "active" : ""}`}
                key={member.id}
                onClick={() => setSelectedId(member.id)}
              >
                <strong>{member.name}</strong>
                <small>
                  {cardFor(member)}
                  {member.phone ? ` · ${member.phone}` : ""}
                  {member.class_name ? ` · ${member.class_name}` : ""}
                </small>
                <span className={`status ${visit ? "active" : ok ? "paid" : "unpaid"}`}>
                  {visit ? t("att.already") : ok ? t("att.active") : t("att.required")}
                </span>
              </button>
            );
          })}
        </section>
      )}
      {selected && (
        <section className="panel desk-card">
          <div className="desk-card-main">
            <span className="eyebrow">{t("att.card")}</span>
            <h3>{selected.name}</h3>
            <p className="desk-card-code">{cardFor(selected)}</p>
            <p>
              {selected.class_name || t("att.noClass")}
              {selected.phone ? ` · ${selected.phone}` : ""}
            </p>
            <div className="form-actions">
              {selectedVisit ? (
                <button className="primary" type="button" onClick={() => void onCheckOut(selected.id)}>
                  <LogOut size={16} /> {t("att.checkOut")}
                </button>
              ) : (
                <button
                  className="primary"
                  type="button"
                  disabled={!selectedCanEnter}
                  onClick={() => void onCheckIn(selected.id)}
                >
                  <CalendarCheck size={16} /> {selectedCanEnter ? t("att.checkIn") : t("att.required")}
                </button>
              )}
            </div>
          </div>
          <img
            className="desk-qr"
            src={gymApi.memberQrUrl(selected.id)}
            alt={t("att.qr")}
          />
        </section>
      )}
      <div className="ledger-stats desk-stats">
        <div className="ledger-stat featured">
          <span>{t("att.inside")}</span>
          <strong>{inside.length}</strong>
          <small>{t("att.now")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("att.checkins")}</span>
          <strong>{records.length}</strong>
          <small>{t("att.todayCount")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("att.outCount")}</span>
          <strong>{checkouts}</strong>
          <small>{t("att.visits")}</small>
        </div>
      </div>
      <section className="panel table-wrap">
        <div className="panel-heading desk-heading">
          <h3>{t("att.byClass")}</h3>
        </div>
        {headcount.length ? (
          <>
            <ul className="phone-list">
              {headcount.map((item) => (
                <li className="phone-row" key={item.class_id ?? "none"}>
                  <strong>{item.class_name}</strong>
                  <div className="phone-meta">
                    <span>{t("att.now")} <b>{item.inside}</b></span>
                    <span>{t("att.todayCount")} <b>{item.checkins}</b></span>
                  </div>
                </li>
              ))}
            </ul>
            <table>
              <thead>
                <tr>
                  <th>{t("nav.classes")}</th>
                  <th>{t("att.now")}</th>
                  <th>{t("att.todayCount")}</th>
                </tr>
              </thead>
              <tbody>
                {headcount.map((item) => (
                  <tr key={item.class_id ?? "none"}>
                    <td>{item.class_name}</td>
                    <td>{item.inside}</td>
                    <td>{item.checkins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="empty">{t("att.empty")}</div>
        )}
      </section>
      <section className="panel table-wrap">
        <div className="panel-heading desk-heading">
          <h3>{t("att.inList")}</h3>
        </div>
        {inside.length ? (
          <>
            <ul className="phone-list">
              {pagedInside.map((item) => (
                  <li className="phone-row phone-row-action" key={item.id}>
                    <div className="phone-row-main">
                      <strong>{visitName(item)}</strong>
                      <small>
                        {clock(item.checked_in_at)}
                        {item.phone ? ` · ${item.phone}` : ""}
                      </small>
                      <small>
                        {item.class_name || t("att.noClass")}
                        {" · "}
                        {item.card_code || cardFor({ id: item.member_id })}
                      </small>
                    </div>
                    <button
                      className="primary"
                      type="button"
                      onClick={() => void onCheckOut(item.member_id)}
                    >
                      {t("att.checkOut")}
                    </button>
                  </li>
              ))}
            </ul>
            <table>
              <thead>
                <tr>
                  <th>{t("att.inAt")}</th>
                  <th>{t("nav.members")}</th>
                  <th>{t("nav.classes")}</th>
                  <th>{t("att.card")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedInside.map((item) => (
                  <tr key={item.id}>
                    <td>{clock(item.checked_in_at)}</td>
                    <td>
                      {visitName(item)}
                      {item.phone ? <small>{item.phone}</small> : null}
                    </td>
                    <td>{item.class_name || t("att.noClass")}</td>
                    <td>{item.card_code || cardFor({ id: item.member_id })}</td>
                    <td>
                      <button className="text-button" type="button" onClick={() => void onCheckOut(item.member_id)}>
                        {t("att.checkOut")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LoadMoreBar shown={shownInside} total={inside.length} onMore={() => setShownInside((n) => n + PAGE_SIZE)} />
          </>
        ) : (
          <div className="empty">{t("att.emptyIn")}</div>
        )}
      </section>
      <section className="panel table-wrap">
        <div className="panel-heading desk-heading">
          <h3>{t("att.visits")}</h3>
        </div>
        {records.length ? (
          <>
            <ul className="phone-list">
              {pagedVisits.map((item) => (
                  <li className="phone-row" key={item.id}>
                    <strong>{visitName(item)}</strong>
                    <small>{item.class_name || t("att.noClass")}</small>
                    <div className="phone-meta">
                      <span>{t("att.inAt")} <b>{clock(item.checked_in_at)}</b></span>
                      <span>{t("att.outAt")} <b>{item.checked_out_at ? clock(item.checked_out_at) : "—"}</b></span>
                    </div>
                  </li>
              ))}
            </ul>
            <table>
              <thead>
                <tr>
                  <th>{t("att.inAt")}</th>
                  <th>{t("att.outAt")}</th>
                  <th>{t("nav.members")}</th>
                  <th>{t("nav.classes")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedVisits.map((item) => (
                  <tr key={item.id}>
                    <td>{clock(item.checked_in_at)}</td>
                    <td>{item.checked_out_at ? clock(item.checked_out_at) : "—"}</td>
                    <td>{visitName(item)}</td>
                    <td>{item.class_name || t("att.noClass")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LoadMoreBar shown={shownVisits} total={records.length} onMore={() => setShownVisits((n) => n + PAGE_SIZE)} />
          </>
        ) : (
          <div className="empty">{t("att.empty")}</div>
        )}
      </section>
    </div>
  );
}

function Trainers({
  trainers,
  canAdminister,
  onCreate,
  onUpdatePayroll,
  onDelete,
}: {
  trainers: Trainer[];
  canAdminister: boolean;
  onCreate: (payload: {
    first_name: string;
    last_name: string;
    specialization?: string;
    phone?: string;
    monthly_pay?: number | string;
    pay_amount?: number | string;
    is_paid?: boolean;
  }) => void;
  onUpdatePayroll: (
    id: number,
    payload: {
      year?: number;
      month?: number;
      pay_amount?: number | string;
      is_paid?: boolean;
    },
  ) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useLang();
  const now = new Date();
  const months = reportMonths();
  const [selected, setSelected] = useState(`${now.getFullYear()}-${now.getMonth() + 1}`);
  const [year, month] = selected.split("-").map(Number);
  const [rows, setRows] = useState<Trainer[]>(trainers);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    specialization: "",
    phone: "",
    monthly_pay: "",
  });

  useEffect(() => {
    void gymApi.trainers(year, month).then(setRows).catch(() => setRows([]));
  }, [year, month, trainers]);

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, trainer) => {
        const pay = Number(trainer.pay_amount || trainer.monthly_pay || 0);
        sum.due += pay;
        if (trainer.is_paid) sum.paid += pay;
        else if (pay > 0) sum.unpaid += pay;
        return sum;
      },
      { due: 0, paid: 0, unpaid: 0 },
    );
  }, [rows]);

  const submit = () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    onCreate({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      specialization: form.specialization.trim(),
      phone: form.phone.trim(),
      monthly_pay: form.monthly_pay === "" ? 0 : Number(form.monthly_pay),
    });
    setForm({
      first_name: "",
      last_name: "",
      specialization: "",
      phone: "",
      monthly_pay: "",
    });
    setOpen(false);
  };

  const recordWork = (trainer: Trainer) => {
    document.querySelector(".member-details-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "member-details-overlay";
    overlay.onclick = (event) => {
      if (event.target === overlay) dismissOverlay(overlay);
    };
    const panel = document.createElement("section");
    panel.className = "member-details-panel form-panel";
    const label = document.createElement("span");
    label.className = "eyebrow";
    label.textContent = "TRAINER PAY";
    const heading = document.createElement("h2");
    heading.textContent = `${trainer.first_name} ${trainer.last_name}`;
    const monthField = document.createElement("label");
    const monthSelect = document.createElement("select");
    months.forEach((item) => {
      const option = document.createElement("option");
      option.value = `${item.year}-${item.month}`;
      option.textContent = item.label;
      monthSelect.append(option);
    });
    monthSelect.value = `${year}-${month}`;
    monthField.append(monthSelect);
    const payField = document.createElement("label");
    payField.textContent = t("train.payAmount");
    const payInput = document.createElement("input");
    payInput.type = "number";
    payInput.min = "0";
    payInput.step = "0.01";
    payInput.value = String(trainer.pay_amount || trainer.monthly_pay || "");
    payField.append(payInput);
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.type = "button";
    cancel.textContent = t("common.cancel");
    cancel.onclick = () => dismissOverlay(overlay);
    const save = document.createElement("button");
    save.className = "primary";
    save.type = "button";
    save.textContent = t("train.savePay");
    save.onclick = () => {
      const [payYear, payMonth] = monthSelect.value.split("-").map(Number);
      const pay =
        payInput.value.trim() === ""
          ? Number(trainer.monthly_pay || 0)
          : Number(payInput.value);
      setSelected(`${payYear}-${payMonth}`);
      onUpdatePayroll(trainer.id, {
        year: payYear,
        month: payMonth,
        pay_amount: pay,
      });
      dismissOverlay(overlay);
    };
    actions.append(cancel, save);
    panel.append(label, heading, monthField, payField, actions);
    overlay.append(panel);
    document.body.append(overlay);
    payInput.focus();
  };

  return (
    <div className="content">
      <div className="page-intro">
        <span className="eyebrow">{t("train.eyebrow")}</span>
        <h2>{t("train.title")}</h2>
        <p>{t("train.intro")}</p>
      </div>
      <div className="ledger-stats">
        <div className="ledger-stat">
          <span>Trainers</span>
          <strong>{rows.length}</strong>
          <small>Active team</small>
        </div>
        <div className="ledger-stat">
          <span>Pay due</span>
          <strong>{money(totals.due)}</strong>
          <small>This month</small>
        </div>
        <div className="ledger-stat">
          <span>Paid</span>
          <strong>{money(totals.paid)}</strong>
          <small>Already given</small>
        </div>
        <div className="ledger-stat owing">
          <span>Still to pay</span>
          <strong>{money(totals.unpaid)}</strong>
          <small>Unpaid this month</small>
        </div>
      </div>
      <div className="toolbar">
        {canAdminister ? (
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Add trainer
          </button>
        ) : (
          <p className="form-caption" style={{ margin: 0 }}>
            Only an administrator can add trainers or change pay.
          </p>
        )}
      </div>
      {open && canAdminister && (
        <section className="panel form-panel">
          <span className="eyebrow">NEW TRAINER</span>
          <div className="date-fields">
            <label>
              First name
              <input
                value={form.first_name}
                onChange={(event) => setForm({ ...form, first_name: event.target.value })}
              />
            </label>
            <label>
              Last name
              <input
                value={form.last_name}
                onChange={(event) => setForm({ ...form, last_name: event.target.value })}
              />
            </label>
          </div>
          <div className="date-fields">
            <label>
              Specialization
              <input
                value={form.specialization}
                onChange={(event) => setForm({ ...form, specialization: event.target.value })}
                placeholder="Boxing, musculation..."
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
          </div>
          <p className="form-caption">Monthly pay</p>
          <label>
            Monthly pay (DH)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="400"
              value={form.monthly_pay}
              onChange={(event) => setForm({ ...form, monthly_pay: event.target.value })}
            />
          </label>
          <div className="form-actions">
            <button className="secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="primary" onClick={submit}>
              Add trainer
            </button>
          </div>
        </section>
      )}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trainer</th>
              <th>Specialization</th>
              <th>Monthly pay</th>
              <th>This month</th>
              <th>Paid</th>
              {canAdminister ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((trainer) => {
              const pay = Number(trainer.pay_amount || trainer.monthly_pay || 0);
              return (
                <tr key={trainer.id}>
                  <td>
                    {trainer.first_name} {trainer.last_name}
                    <small>{trainer.phone || "No phone"}</small>
                  </td>
                  <td>{trainer.specialization || "—"}</td>
                  <td>{Number(trainer.monthly_pay) ? money(trainer.monthly_pay) : "—"}</td>
                  <td className="table-money">
                    <strong className={pay > 0 && !trainer.is_paid ? "amount-owing" : "amount-settled"}>
                      {pay ? money(pay) : "—"}
                    </strong>
                  </td>
                  <td>
                    {trainer.is_paid ? (
                      <Badge value="paid" payment />
                    ) : pay > 0 ? (
                      <Badge value="unpaid" payment />
                    ) : (
                      <span className="status">No pay</span>
                    )}
                  </td>
                  {canAdminister ? (
                    <td>
                      <div className="table-actions">
                        <button
                          className="text-button"
                          onClick={() => recordWork(trainer)}
                        >
                          Set pay
                        </button>
                        <button
                          className={`payment-status-action ${trainer.is_paid ? "paid" : "unpaid"}`}
                          title={trainer.is_paid ? "Mark unpaid" : "Mark paid"}
                          aria-label={trainer.is_paid ? "Mark unpaid" : "Mark paid"}
                          onClick={() =>
                            onUpdatePayroll(trainer.id, {
                              year,
                              month,
                              pay_amount: trainer.pay_amount || trainer.monthly_pay,
                              is_paid: !trainer.is_paid,
                            })
                          }
                        >
                          {trainer.is_paid ? <Check size={12} strokeWidth={2.25} /> : <X size={12} strokeWidth={2.25} />}
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            if (window.confirm(t("train.confirmDelete", { name: `${trainer.first_name} ${trainer.last_name}` }))) {
                              onDelete(trainer.id);
                            }
                          }}
                        >
                          {t("train.delete")}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            {canAdminister
              ? "No trainers yet. Add a trainer to track hours and pay."
              : "No trainers found."}
          </div>
        )}
      </section>
    </div>
  );
}

function Reports({ canAdminister = false }: { canAdminister?: boolean }) {
  const { t } = useLang();
  const now = new Date();
  const months = reportMonths();
  const [selected, setSelected] = useState(`${now.getFullYear()}-${now.getMonth() + 1}`);
  const [report, setReport] = useState<ClassRevenueReport | null>(null);
  const [payroll, setPayroll] = useState<TrainerPayrollReport | null>(null);
  const [overview, setOverview] = useState<MonthlyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | "">("");
  const [year, month] = selected.split("-").map(Number);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      gymApi.classRevenue(year, month),
      canAdminister ? gymApi.trainerPayroll(year, month) : Promise.resolve(null),
      canAdminister ? gymApi.monthlyOverview(year, month) : Promise.resolve(null),
    ])
      .then(([classData, trainerData, overviewData]) => {
        if (!active) return;
        setReport(classData);
        setPayroll(trainerData);
        setOverview(overviewData);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : t("rep.loadFail"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year, month, canAdminister]);

  const rows = report?.classes ?? [];
  const maxAmount = Math.max(
    ...rows.flatMap((item) => [Number(item.expected_monthly), Number(item.collected)]),
    1,
  );
  const collectionRate = Number(report?.collection_rate || 0);
  const net = Number(overview?.net || 0);

  async function downloadReport(format: "xlsx" | "pdf") {
    setExporting(format);
    setError("");
    try {
      await gymApi.downloadMonthlyReport(year, month, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rep.exportFail"));
    } finally {
      setExporting("");
    }
  }

  return (
    <div className="content reports-page">
      <div className="reports-top">
        <div className="page-intro">
          <span className="eyebrow">{t("rep.eyebrow")}</span>
          <h2>{t("rep.title")}</h2>
          <p>{canAdminister ? t("rep.admin") : t("rep.staff")}</p>
        </div>
        <div className="reports-toolbar">
          <select
            className="ledger-select"
            value={selected}
            aria-label={t("common.month")}
            onChange={(event) => setSelected(event.target.value)}
          >
            {months.map((item) => (
              <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
                {item.label}
              </option>
            ))}
          </select>
          {canAdminister && (
            <>
              <button
                type="button"
                className="secondary"
                disabled={Boolean(exporting)}
                onClick={() => void downloadReport("xlsx")}
              >
                <FileSpreadsheet size={15} />
                {exporting === "xlsx" ? t("rep.exporting") : t("rep.excel")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={Boolean(exporting)}
                onClick={() => void downloadReport("pdf")}
              >
                <FileText size={15} />
                {exporting === "pdf" ? t("rep.exporting") : t("rep.pdf")}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="error app-banner">{error}</div>}
      {canAdminister && (
        <>
          <div className="stats-grid reports-stats">
            <Stat
              icon={CircleDollarSign}
              label={t("rep.moneyIn")}
              value={overview ? money(overview.collected) : "—"}
              detail={t("rep.cashMonth")}
              className="gold"
            />
            <Stat
              icon={ClipboardList}
              label={t("rep.operating")}
              value={overview ? money(overview.operating_total) : "—"}
              detail={t("rep.bills")}
              className="coral"
            />
            <Stat
              icon={Users}
              label={t("rep.trainerPay")}
              value={overview ? money(overview.trainer_due) : "—"}
              detail={overview ? t("rep.already", { amount: money(overview.trainer_paid) }) : t("train.thisMonth")}
              className="ink"
            />
            <Stat
              icon={Activity}
              label={net >= 0 ? t("rep.netLeft") : t("rep.netShort")}
              value={overview ? money(Math.abs(net)) : "—"}
              detail={net >= 0 ? t("rep.netOk") : t("rep.netBad")}
              className={net >= 0 ? "sage" : "coral"}
            />
          </div>
          <section className="panel reports-panel">
            <div className="reports-section-head">
              <span className="eyebrow">{t("rep.pl")}</span>
              <h3>{overview?.label || t("dash.thisMonth")}</h3>
            </div>
            {loading && <div className="empty">{t("rep.calc")}</div>}
            {!loading && overview && (
              <div className="reports-pl">
                <p className="reports-pl-label">{t("rep.in")}</p>
                <div className="reports-pl-row">
                  <span>{t("rep.collected")}</span>
                  <strong className="amount-settled">{money(overview.collected)}</strong>
                </div>
                <div className="reports-pl-row muted">
                  <span>{t("rep.expected")}</span>
                  <strong>{money(overview.expected)}</strong>
                </div>
                <div className="reports-pl-row muted">
                  <span>{t("rep.owed")}</span>
                  <strong className="amount-owing">{money(overview.outstanding)}</strong>
                </div>
                <p className="reports-pl-label">{t("rep.out")}</p>
                <div className="reports-pl-row">
                  <span>{t("rep.operatingExp")}</span>
                  <strong className="amount-owing">{money(overview.operating_total)}</strong>
                </div>
                <div className="reports-pl-row">
                  <span>{t("rep.trainerDue")}</span>
                  <strong className="amount-owing">{money(overview.trainer_due)}</strong>
                </div>
                <div className="reports-pl-row total">
                  <span>{net >= 0 ? t("rep.leftover") : t("rep.shortfall")}</span>
                  <strong className={net >= 0 ? "amount-settled" : "amount-owing"}>{money(overview.net)}</strong>
                </div>
              </div>
            )}
          </section>
          <section className="panel table-wrap reports-panel">
            <div className="reports-section-head">
              <span className="eyebrow">{t("rep.operating").toUpperCase()}</span>
              <h3>{t("rep.byCat")}</h3>
            </div>
            {overview && overview.categories.length > 0 ? (
              <>
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>{t("exp.category")}</th>
                      <th>{t("rep.items")}</th>
                      <th>{t("common.amount")}</th>
                      <th>{t("rep.share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.categories.map((item) => {
                      const share = Number(overview.operating_total)
                        ? (Number(item.total) / Number(overview.operating_total)) * 100
                        : 0;
                      return (
                        <tr key={item.category}>
                          <td>{item.category_label}</td>
                          <td>{item.count}</td>
                          <td className="table-money">{money(item.total)}</td>
                          <td>{share.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{overview.expenses.length}</td>
                      <td className="table-money">{money(overview.operating_total)}</td>
                      <td>100%</td>
                    </tr>
                  </tfoot>
                </table>
                {overview.expenses.length > 0 && (
                  <table className="reports-table reports-table-sub">
                    <thead>
                      <tr>
                        <th>{t("exp.category")}</th>
                        <th>{t("rep.desc")}</th>
                        <th>{t("common.amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{expense.category_label}</td>
                          <td>
                            {expense.title || "—"}
                            {expense.notes ? <small>{expense.notes}</small> : null}
                          </td>
                          <td className="table-money">{money(expense.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              !loading && <div className="empty">{t("rep.noExp")}</div>
            )}
          </section>
        </>
      )}
      {!canAdminister && (
        <div className="stats-grid reports-stats">
          <Stat
            icon={CircleDollarSign}
            label={t("rep.collectedBar")}
            value={report ? money(report.total_collected) : "—"}
            detail={report?.label || t("dash.thisMonth")}
            className="gold"
          />
          <Stat
            icon={Activity}
            label={t("rep.expectedBar")}
            value={report ? money(report.total_expected) : "—"}
            detail={t("rep.priceMembers")}
            className="sage"
          />
          <Stat
            icon={CircleDollarSign}
            label={t("rep.owed")}
            value={report ? money(report.total_outstanding) : "—"}
            detail={t("rep.unpaidBal")}
            className="coral"
          />
          <Stat
            icon={ClipboardList}
            label={t("rep.rate")}
            value={report ? `${collectionRate.toFixed(1)}%` : "—"}
            detail={t("rep.vsExpected")}
            className="ink"
          />
        </div>
      )}
      <section className="panel reports-panel">
        <div className="reports-section-head">
          <span className="eyebrow">{t("rep.byClass")}</span>
          <h3>{report?.label || t("rep.breakdown")}</h3>
        </div>
        {loading && <div className="empty">{t("rep.classCalc")}</div>}
        {!loading && !rows.length && <div className="empty">{t("rep.noClass")}</div>}
        {!loading && rows.length > 0 && (
          <>
            <div className="reports-bars">
              {rows.map((item) => (
                <div className="reports-bar-row" key={item.id ?? "unassigned"}>
                  <div className="reports-bar-meta">
                    <strong>{item.name}</strong>
                    <span>
                      {item.class_type_label} · {item.member_count} {t("nav.members").toLowerCase()}
                    </span>
                  </div>
                  <div className="reports-bar-track" aria-hidden="true">
                    <span
                      className="reports-bar expected"
                      style={{ width: `${(Number(item.expected_monthly) / maxAmount) * 100}%` }}
                    />
                    <span
                      className="reports-bar collected"
                      style={{ width: `${(Number(item.collected) / maxAmount) * 100}%` }}
                    />
                  </div>
                  <div className="reports-bar-value">{money(item.collected)}</div>
                </div>
              ))}
              <div className="reports-legend">
                <span>
                  <i className="expected" /> {t("rep.expectedBar")}
                </span>
                <span>
                  <i className="collected" /> {t("rep.collectedBar")}
                </span>
              </div>
            </div>
            <table className="reports-table">
              <thead>
                <tr>
                  <th>{t("rep.classes")}</th>
                  <th>{t("nav.members")}</th>
                  <th>{t("rep.expectedBar")}</th>
                  <th>{t("rep.collectedBar")}</th>
                  <th>{t("rep.owed")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id ?? "unassigned"}>
                    <td>
                      {item.name}
                      <small>{item.class_type_label}</small>
                    </td>
                    <td>{item.member_count}</td>
                    <td className="table-money">{money(item.expected_monthly)}</td>
                    <td className="table-money">{money(item.collected)}</td>
                    <td className="table-money">{money(item.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="table-money">{money(report?.total_expected || 0)}</td>
                  <td className="table-money">{money(report?.total_collected || 0)}</td>
                  <td className="table-money">{money(report?.total_outstanding || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </section>
      {canAdminister && (
        <section className="panel table-wrap reports-panel">
          <div className="reports-section-head">
            <span className="eyebrow">{t("rep.trainerHead")}</span>
            <h3>{payroll?.label || t("rep.payroll")}</h3>
          </div>
          {!loading && !payroll?.trainers.length && (
            <div className="empty">{t("train.none")}</div>
          )}
          {!loading && payroll && payroll.trainers.length > 0 && (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>{t("train.title")}</th>
                  <th>{t("train.spec")}</th>
                  <th>{t("train.monthly")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {payroll.trainers.map((trainer) => {
                  const pay = Number(trainer.pay_amount || trainer.monthly_pay || 0);
                  return (
                    <tr key={trainer.id}>
                      <td>{trainer.name}</td>
                      <td>{trainer.specialization || "—"}</td>
                      <td className="table-money">
                        <strong className={pay > 0 && !trainer.is_paid ? "amount-owing" : "amount-settled"}>
                          {pay ? money(pay) : "—"}
                        </strong>
                      </td>
                      <td>
                        {trainer.is_paid ? (
                          <Badge value="paid" payment />
                        ) : pay > 0 ? (
                          <Badge value="unpaid" payment />
                        ) : (
                          <span className="status">{t("rep.noPay")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="table-money">{money(payroll.total_due)}</td>
                  <td>
                    {t("rep.paidLeft", {
                      paid: money(payroll.total_paid),
                      left: money(payroll.total_unpaid),
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
