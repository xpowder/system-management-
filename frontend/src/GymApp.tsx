import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
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
  User,
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
  type DashboardSummary,
  type GymDashboard,
  type GymExpense,
  type GymPayment,
  type Member,
  type Membership,
  type Member360,
  type Member360Membership,
  type MonthlyOverview,
  type GymNotification,
  type Plan,
  type Trainer,
  type TrainerPayrollReport,
  type WhatsAppReminder,
  type WhatsAppReminderList,
} from "./gymApi";
import { bookingApi, type AdminUser, type AuthUser } from "./api";
import { MemberQrScanner } from "./MemberQrScanner";
import { can, isAdminOnlyNotification, isGymAdmin, isGymDesk } from "./permissions";
import { clock, date, LanguageSwitch, localeFor, money, monthLabel, statusLabel, todayLabel, useLang, type Msg } from "./i18n";
import { Alert, EmptyState, Field, FieldGrid, FormSection, LoadingState, PageHeader, PhoneField } from "./ui";
import { ClassCalendar } from "./ClassCalendar";
import { MemberQrCard } from "./MemberQrCard";
import { ThemeSwitch } from "./theme";
import { playNotificationSound, unlockNotificationSound } from "./notificationSound";
import "./App.css";
import "./design-system.css";

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

type MemberUpdatePayload = {
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
};

type OnMemberUpdate = (id: number, payload: MemberUpdatePayload) => Promise<boolean> | void;

function isValidEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!value.trim()) return true;
  return digits.length >= 8 && digits.length <= 15;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

type MemberFormErrors = Partial<Record<keyof MemberFormState, string>>;

function validateMemberForm(
  form: MemberFormState,
  mode: "create" | "edit",
  t: (key: Msg, vars?: Record<string, string | number>) => string,
  alreadyPaid = 0,
) {
  const errors: MemberFormErrors = {};
  if (!form.first_name.trim()) errors.first_name = t("form.firstNameReq");
  if (!form.last_name.trim()) errors.last_name = t("form.lastNameReq");
  if (mode === "create" && !form.id_number.trim()) errors.id_number = t("form.cinReq");
  if (mode === "create" && !form.address.trim()) errors.address = t("form.addressReq");
  if (form.email.trim() && !isValidEmail(form.email)) errors.email = t("form.validEmail");
  if (form.phone.trim() && !isValidPhone(form.phone)) errors.phone = t("form.validPhone");
  if (form.start_date && !isValidIsoDate(form.start_date)) errors.start_date = t("form.validDate");
  if (mode === "create") {
    if (form.amount_paid.trim() !== "") {
      const paid = Number(form.amount_paid);
      if (!Number.isFinite(paid) || paid < 0) errors.amount_paid = t("form.validAmount");
    }
  } else if (form.price.trim() !== "") {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) errors.price = t("form.validAmount");
    else if (price < alreadyPaid) errors.price = t("pay.priceBelowPaid");
  }
  if (form.remaining.trim() !== "") {
    const remaining = Number(form.remaining);
    if (!Number.isFinite(remaining) || remaining < 0) errors.remaining = t("form.validAmount");
  }
  const messages = Object.values(errors).filter(Boolean);
  return {
    errors,
    summary: messages.length === 0 ? "" : messages.length === 1 ? messages[0] : t("form.fixFields"),
  };
}

function membershipRemainLabel(
  endDate: string | undefined,
  status: string | undefined,
  t: (key: Msg, vars?: Record<string, string | number>) => string,
) {
  if (!endDate) return "";
  const end = new Date(endDate);
  const today = new Date();
  end.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (status === "expired" || days < 0) return t("members.expiredLabel");
  if (days === 0) return t("members.endsToday");
  if (days === 1) return t("members.endsTomorrow");
  if (days <= 7) return t("members.endsIn", { n: days });
  return t(days === 1 ? "remind.daysLeft" : "remind.daysLeftPlural", { n: days });
}

function classTypeLabel(value: string, t: (key: Msg) => string) {
  const keys: Record<string, Msg> = {
    boxing: "class.typeBoxing",
    kick_boxing: "class.typeKickboxing",
    musculation: "class.typeMusculation",
    aerobic: "class.typeAerobic",
  };
  return keys[value] ? t(keys[value]) : value.replaceAll("_", " ");
}

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

function paymentAmountText(value: number) {
  return Number(value || 0).toFixed(2);
}

function RecordPaymentOverlay({
  memberLabel,
  membership,
  planName,
  onPayment,
  onClose,
  onRefresh,
}: {
  memberLabel: string;
  membership: Membership;
  planName?: string;
  onPayment: OnPayment;
  onClose: () => void;
  onRefresh?: () => Promise<void> | void;
}) {
  const { t } = useLang();
  const remaining = Number(membership.remaining_balance || 0);
  const settled = remaining <= 0;
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settled) amountRef.current?.focus();
  }, [settled]);

  const setAmountSafe = (value: string) => {
    if (value === "" || /^\d*[.,]?\d{0,2}$/.test(value)) {
      setAmount(value.replace(",", "."));
      setError("");
    }
  };

  const parsedAmount = Number(amount.replace(",", "."));

  const submit = async () => {
    if (saving || settled) return;
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t("pay.amountPositive"));
      return;
    }
    if (parsedAmount > remaining) {
      setError(t("pay.exceeds", { amount: money(remaining) }));
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onPayment(membership.id, {
        amount: parsedAmount,
        received_by: loggedInStaffName,
        notes: notes.trim() || t("pay.note"),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message && e.message !== "[object Object]" ? e.message : t("pay.fail"));
      await onRefresh?.();
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="member-details-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="member-details-panel form-panel pay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-form-title"
      >
        <span className="eyebrow">{t("pay.record")}</span>
        <h3 id="pay-form-title">{t("pay.for", { name: memberLabel })}</h3>
        <div className="pay-summary">
          <span className="eyebrow">{t("pay.membership")}</span>
          <strong className="pay-summary-plan">{planName || t("members.noPlan")}</strong>
          <p>
            <span>{t("pay.price")}</span>
            <strong>{money(membership.price)}</strong>
          </p>
          <p>
            <span>{t("pay.paid")}</span>
            <strong>{money(membership.total_paid)}</strong>
          </p>
          <p className={settled ? "is-settled" : "is-remaining"}>
            <span>{t("pay.remaining")}</span>
            <strong>{settled ? t("members.settled") : money(remaining)}</strong>
          </p>
        </div>
        {error ? (
          <Alert onDismiss={() => setError("")} dismissLabel={t("common.dismiss")}>
            {error}
          </Alert>
        ) : null}
        {settled ? (
          <Alert tone="success">{t("pay.settled")}</Alert>
        ) : (
          <>
            <Field
              label={t("pay.received")}
              hint={t("pay.max", { amount: money(remaining) })}
              htmlFor="pay-amount"
              error={error || undefined}
            >
              <input
                ref={amountRef}
                id="pay-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={paymentAmountText(remaining)}
                value={amount}
                aria-invalid={Boolean(error)}
                disabled={saving}
                onChange={(event) => setAmountSafe(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "-" || event.key === "e" || event.key === "E" || event.key === "+") {
                    event.preventDefault();
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
            </Field>
            {remaining > 0 ? (
              <button
                type="button"
                className="text-button pay-remaining-btn"
                disabled={saving}
                onClick={() => {
                  setAmount(paymentAmountText(remaining));
                  setError("");
                }}
              >
                {t("pay.payRemaining")}
              </button>
            ) : null}
            <Field label={t("pay.notes")} htmlFor="pay-notes">
              <input
                id="pay-notes"
                value={notes}
                disabled={saving}
                maxLength={200}
                placeholder={t("pay.note")}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" disabled={saving} onClick={onClose}>
            {t("common.cancel")}
          </button>
          {settled ? null : (
            <button type="button" className="primary" disabled={saving} onClick={() => void submit()}>
              {saving ? t("common.saving") : t("pay.save")}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

type MemberFormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  id_number: string;
  address: string;
  city: string;
  class_id: string;
  plan_id: string;
  start_date: string;
  amount_paid: string;
  remaining: string;
  price: string;
};

function blankMemberForm(): MemberFormState {
  return {
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
    price: "",
  };
}

function memberFormValues(member: Member, membership?: Membership, plans: Plan[] = []): MemberFormState {
  const names = member.name.trim().split(/\s+/);
  return {
    first_name: names[0] || "",
    last_name: names.slice(1).join(" ") || "",
    phone: member.phone || "",
    email: member.email || "",
    id_number: member.id_number || "",
    address: member.address || "",
    city: member.city || "",
    class_id: member.class_id ? String(member.class_id) : "",
    plan_id: membership?.plan_id ? String(membership.plan_id) : "",
    start_date: membership?.start_date.slice(0, 10) || new Date().toISOString().slice(0, 10),
    amount_paid: membership ? String(membership.total_paid) : "0",
    remaining: membership ? String(membership.remaining_balance) : "",
    price: membership
      ? String(membership.price)
      : selectablePlans(plans)[0]
        ? String(selectablePlans(plans)[0].price)
        : "",
  };
}

function MemberRecordFields({
  mode,
  form,
  setForm,
  classes,
  plans,
  errors = {},
  onFieldEdit,
}: {
  mode: "create" | "edit";
  form: MemberFormState;
  setForm: (next: MemberFormState) => void;
  classes: FitnessClass[];
  plans: Plan[];
  errors?: MemberFormErrors;
  onFieldEdit?: (field: keyof MemberFormState) => void;
}) {
  const { t } = useLang();
  const patch = (partial: Partial<MemberFormState>) => {
    const field = Object.keys(partial)[0] as keyof MemberFormState | undefined;
    if (field) onFieldEdit?.(field);
    setForm({ ...form, ...partial });
  };
  return (
    <>
      <FormSection title={t("form.personal")}>
        <FieldGrid>
          <Field label={t("common.firstName")} error={errors.first_name}>
            <input value={form.first_name} aria-invalid={Boolean(errors.first_name)} onChange={(event) => patch({ first_name: event.target.value })} />
          </Field>
          <Field label={t("common.lastName")} error={errors.last_name}>
            <input value={form.last_name} aria-invalid={Boolean(errors.last_name)} onChange={(event) => patch({ last_name: event.target.value })} />
          </Field>
          <Field label={t("members.cin")} hint={mode === "create" ? t("members.cinHelp") : undefined} error={errors.id_number}>
            <input
              value={form.id_number}
              placeholder={t("members.cinPh")}
              aria-invalid={Boolean(errors.id_number)}
              onChange={(event) => patch({ id_number: event.target.value })}
            />
          </Field>
          <Field label={t("members.city")}>
            <input
              value={form.city}
              placeholder={t("members.cityPh")}
              onChange={(event) => patch({ city: event.target.value })}
            />
          </Field>
          <Field label={t("members.address")} wide error={errors.address}>
            <input
              value={form.address}
              placeholder={t("members.addressPh")}
              aria-invalid={Boolean(errors.address)}
              onChange={(event) => patch({ address: event.target.value })}
            />
          </Field>
          <Field label={t("common.phone")} error={errors.phone}>
            <PhoneField value={form.phone} aria-invalid={Boolean(errors.phone)} onChange={(event) => patch({ phone: event.target.value })} />
          </Field>
          <Field label={t("common.email")} error={errors.email}>
            <input
              type="email"
              value={form.email}
              aria-invalid={Boolean(errors.email)}
              onChange={(event) => patch({ email: event.target.value })}
            />
          </Field>
        </FieldGrid>
      </FormSection>
      <FormSection title={t("form.membership")}>
        <FieldGrid>
          <Field label={t("members.class")}>
            <select value={form.class_id} onChange={(event) => patch({ class_id: event.target.value })}>
              <option value="">{mode === "create" ? t("members.selectClass") : t("members.noClass")}</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("memberships.plan")} error={errors.plan_id}>
            <select value={form.plan_id} aria-invalid={Boolean(errors.plan_id)} onChange={(event) => patch({ plan_id: event.target.value })}>
              <option value="">{t("members.selectPlan")}</option>
              {selectablePlans(plans, form.plan_id).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("members.startDate")} error={errors.start_date}>
            <input
              type="date"
              value={form.start_date}
              aria-invalid={Boolean(errors.start_date)}
              onChange={(event) => patch({ start_date: event.target.value })}
            />
          </Field>
        </FieldGrid>
      </FormSection>
      <FormSection title={t("form.payment")}>
        {mode === "create" ? <p className="form-caption">{t("members.paymentHelp")}</p> : null}
        <FieldGrid>
          {mode === "create" ? (
            <Field label={t("members.amountPaid")} error={errors.amount_paid}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="100"
                value={form.amount_paid}
                aria-invalid={Boolean(errors.amount_paid)}
                onChange={(event) => patch({ amount_paid: event.target.value })}
              />
            </Field>
          ) : (
            <Field label={t("members.priceMad")} error={errors.price}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.price}
                aria-invalid={Boolean(errors.price)}
                onChange={(event) => patch({ price: event.target.value })}
              />
            </Field>
          )}
          <Field label={t("pay.owes")} error={errors.remaining}>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="20"
              value={form.remaining}
              aria-invalid={Boolean(errors.remaining)}
              onChange={(event) => patch({ remaining: event.target.value })}
            />
          </Field>
        </FieldGrid>
      </FormSection>
    </>
  );
}

function EditMemberOverlay({
  member,
  classes,
  plans,
  currentMembership,
  onUpdate,
  onClose,
}: {
  member: Member;
  classes: FitnessClass[];
  plans: Plan[];
  currentMembership?: Membership;
  onUpdate: OnMemberUpdate;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [form, setForm] = useState(() => memberFormValues(member, currentMembership, plans));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<MemberFormErrors>({});

  useEffect(() => {
    void gymApi.memberClass(member.id).then((memberClass) => {
      if (memberClass.training_class_id) {
        setForm((current) => ({ ...current, class_id: String(memberClass.training_class_id) }));
      }
    }).catch(() => undefined);
  }, [member.id]);

  const save = async () => {
    if (saving) return;
    const checked = validateMemberForm(form, "edit", t, Number(currentMembership?.total_paid || 0));
    if (checked.summary) {
      setFieldErrors(checked.errors);
      setFormError(checked.summary);
      return;
    }
    const priceValue = form.price.trim();
    const remainingValue = form.remaining.trim();
    const originalRemaining = currentMembership ? Number(currentMembership.remaining_balance) : undefined;
    const remainingNumber = remainingValue === "" ? undefined : Number(remainingValue);
    const remainingChanged = remainingNumber !== undefined && remainingNumber !== originalRemaining;
    const planId = form.plan_id ? Number(form.plan_id) : currentMembership?.plan_id || (plans[0] ? plans[0].id : undefined);
    const startDate = form.start_date || currentMembership?.start_date.slice(0, 10) || new Date().toISOString().slice(0, 10);
    setFormError("");
    setFieldErrors({});
    setSaving(true);
    try {
      const ok = await onUpdate(member.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        id_number: form.id_number.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        country: member.country || "Morocco",
        class_id: form.class_id ? Number(form.class_id) : null,
        price: priceValue === "" ? undefined : Number(priceValue),
        remaining: remainingChanged ? remainingNumber : undefined,
        plan_id: planId,
        start_date: startDate,
        membership: currentMembership
          ? {
              id: currentMembership.id,
              plan_id: planId || currentMembership.plan_id,
              start_date: startDate,
              notes: currentMembership.notes || "",
            }
          : undefined,
      });
      if (ok === false) return;
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="member-details-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="member-details-panel form-panel member-form is-wide">
        <span className="eyebrow">{t("members.editHead")}</span>
        <MemberRecordFields
          mode="edit"
          form={form}
          setForm={setForm}
          classes={classes}
          plans={plans}
          errors={fieldErrors}
          onFieldEdit={(field) => {
            setFieldErrors((current) => {
              if (!current[field]) return current;
              const next = { ...current };
              delete next[field];
              return next;
            });
          }}
        />
        {formError ? <Alert onDismiss={() => setFormError("")}>{formError}</Alert> : null}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function membershipFrom360(item: Member360Membership): Membership {
  return {
    id: item.id,
    member_id: item.member_id,
    plan_id: item.plan_id,
    start_date: item.start_date,
    end_date: item.end_date,
    price: item.price,
    status: item.status as Membership["status"],
    payment_status: item.payment_status as Membership["payment_status"],
    total_paid: item.total_paid,
    remaining_balance: item.remaining_balance,
    notes: item.notes,
  };
}

function isCurrentMembershipStatus(status: string) {
  return status === "active" || status === "expiring_soon";
}

function isNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /not found/i.test(message);
}

function memberLocation(member: { address?: string; city?: string; postal_code?: string; country?: string }) {
  const parts: string[] = [];
  for (const value of [member.address, member.city, member.postal_code, member.country]) {
    const part = value?.trim();
    if (!part) continue;
    const key = part.toLowerCase();
    if (parts.some((existing) => existing.toLowerCase() === key || existing.toLowerCase().includes(key))) continue;
    parts.push(part);
  }
  return parts.join(", ");
}

function visitDurationLabel(
  checkedInAt: string,
  checkedOutAt: string | null | undefined,
  t: (key: Msg, vars?: Record<string, string | number>) => string,
) {
  if (!checkedOutAt) return "";
  const minutes = Math.round((new Date(checkedOutAt).getTime() - new Date(checkedInAt).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 60) return t("m360.durationMins", { n: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t("m360.durationHoursMins", { h: hours, n: rest }) : t("m360.durationHours", { n: hours });
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
        <Icon size={16} />
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
  | "member360"
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

function notificationText(item: GymNotification) {
  return `${item.title} ${item.message || ""}`.toLowerCase()
}

function notificationMembershipStatus(item: GymNotification) {
  const hay = notificationText(item)
  if (
    item.title === "Membership expiring soon" ||
    hay.includes("expiring soon") ||
    hay.includes("expire bientôt") ||
    hay.includes("expire bientot")
  ) {
    return "expiring_soon"
  }
  if (
    item.title === "Membership expired" ||
    hay.includes("membership expired") ||
    hay.includes("abonnement expiré") ||
    hay.includes("abonnement expire")
  ) {
    return "expired"
  }
  return undefined
}

function notificationDestination(item: GymNotification): { page: Page; status?: string } {
  const membershipStatus = notificationMembershipStatus(item)
  if (membershipStatus) return { page: "memberships", status: membershipStatus }
  if (
    item.category === "members" ||
    item.title === "New member registered" ||
    /new member|nouvel adh[eé]rent|nouveau membre/.test(notificationText(item))
  ) return { page: "members" }
  if (item.category === "payments") return { page: "payments" }
  if (item.category === "memberships") return { page: "memberships" }
  return { page: "notifications" }
}

function notificationOpenKey(item: GymNotification): Msg {
  const membershipStatus = notificationMembershipStatus(item)
  if (membershipStatus === "expiring_soon") return "notif.openExpiring"
  if (membershipStatus === "expired") return "notif.openExpired"
  if (item.category === "payments") return "notif.openPayments"
  if (
    item.category === "members" ||
    item.title === "New member registered" ||
    /new member|nouvel adh[eé]rent|nouveau membre/.test(notificationText(item))
  ) return "notif.openMembers"
  if (item.category === "memberships") return "notif.openMemberships"
  return "notif.tapToOpen"
}

export default function GymApp({
  currentUser,
  onLogout,
  onUserUpdated,
}: {
  currentUser: AuthUser;
  onLogout: () => void;
  onUserUpdated?: (user: AuthUser) => void;
}) {
  const { t, lang } = useLang();
  loggedInStaffName = staffDisplayName(currentUser);
  const [today, setToday] = useState(todayLabel)
  const [todayShort, setTodayShort] = useState(() => todayLabel(true))
  const [notifications, setNotifications] = useState<GymNotification[]>([])
  const [notificationsError, setNotificationsError] = useState("")
  const [notificationsBusy, setNotificationsBusy] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationMenuStyle, setNotificationMenuStyle] = useState<CSSProperties>({})
  const [notificationCompact, setNotificationCompact] = useState(false)
  const notificationBellRef = useRef<HTMLDivElement>(null)
  const notificationMenuRef = useRef<HTMLDivElement>(null)
  const knownNotificationIds = useRef<Set<number>>(new Set())
  const skipNotificationToast = useRef(true)
  const role = (currentUser.role || "").toLowerCase();
  const canAdminister = isGymAdmin(currentUser);
  const canUseDesk = isGymDesk(currentUser);
  const [member360Id, setMember360Id] = useState<number | null>(null);
  const logout = async () => {
    try {
      await bookingApi.logout();
    } finally {
      onLogout();
    }
  };
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === "/admin" && can(currentUser, "admin.users")
      ? "admin"
      : "dashboard",
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    setNavHidden(false);
  }, [page, mobileMenuOpen, notificationsOpen]);
  useEffect(() => {
    lastScrollY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        if (!isCompactViewport() || mobileMenuOpen || notificationsOpen) {
          setNavHidden(false);
          lastScrollY.current = window.scrollY;
          return;
        }
        const y = window.scrollY;
        const delta = y - lastScrollY.current;
        if (y < 24) setNavHidden(false);
        else if (delta > 10) setNavHidden(true);
        else if (delta < -10) setNavHidden(false);
        lastScrollY.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobileMenuOpen, notificationsOpen]);
  useEffect(() => {
    if (!canAdminister && (page === "admin" || page === "trainers" || page === "expenses")) setPage("dashboard");
    if (page === "member360" && !member360Id) setPage("members");
  }, [canAdminister, page, member360Id]);
  useEffect(() => {
    setToday(todayLabel());
    setTodayShort(todayLabel(true));
    const timer = window.setInterval(() => {
      setToday(todayLabel());
      setTodayShort(todayLabel(true));
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [lang]);
  const notificationLoadSeq = useRef(0)
  const refreshNotifications = async (options?: { silent?: boolean }) => {
    if (!canUseDesk) return
    const requestId = ++notificationLoadSeq.current
    try {
      const items = await gymApi.notifications('', false)
      if (requestId !== notificationLoadSeq.current) return
      if (!skipNotificationToast.current && !options?.silent) {
        const incoming = items.filter(item =>
          !knownNotificationIds.current.has(item.id) &&
          !item.is_read &&
          (canAdminister || !isAdminOnlyNotification(item))
        )
        if (incoming[0]) {
          if (canAdminister && incoming.some((item) => !isAdminOnlyNotification(item))) {
            playNotificationSound()
          }
          setNotice(`${incoming[0].title}: ${incoming[0].message}`)
        }
      }
      skipNotificationToast.current = false
      knownNotificationIds.current = new Set(items.map(item => item.id))
      setNotifications(items)
      setNotificationsError("")
    } catch (e) {
      if (requestId !== notificationLoadSeq.current) return
      setNotificationsError(e instanceof Error ? e.message : t("notif.loadFail"))
    }
  }
  useEffect(() => {
    const unlock = () => unlockNotificationSound()
    document.addEventListener("pointerdown", unlock, { once: true })
    if (canUseDesk) void refreshNotifications()
    const timer = window.setInterval(() => {
      if (document.hidden || !canUseDesk) return
      void refreshNotifications()
    }, 30_000)
    return () => {
      document.removeEventListener("pointerdown", unlock)
      window.clearInterval(timer)
    }
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
      const keyboardGap = Math.max(0, window.innerHeight - (vp.top + vp.height))
      setNotificationMenuStyle({
        top: "auto",
        left: 0,
        width: "100%",
        bottom: keyboardGap,
        maxHeight: Math.round(Math.min(vp.height * 0.7, vp.height - 56)),
      })
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
  const visibleNotifications = useMemo(
    () => (canAdminister ? notifications : notifications.filter((item) => !isAdminOnlyNotification(item))),
    [canAdminister, notifications],
  );
  const unreadCount = visibleNotifications.filter(item => !item.is_read).length
  const markNotificationRead = async (id: number) => {
    try {
      const updated = await gymApi.markNotificationRead(id)
      setNotifications(current => current.map(item => item.id === id ? updated : item))
    } catch (e) {
      setNotificationsError(e instanceof Error ? e.message : t("notif.readFail"))
    }
  }
  const deleteNotification = async (id: number) => {
    if (notificationsBusy) return false
    setNotificationsBusy(true)
    try {
      await gymApi.deleteNotification(id)
      setNotifications(current => current.filter(item => item.id !== id))
      knownNotificationIds.current.delete(id)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notif.deleteFail"))
      return false
    } finally {
      setNotificationsBusy(false)
    }
  }
  const deleteAllNotifications = async () => {
    const targets = visibleNotifications
    if (!targets.length || notificationsBusy) return false
    if (!window.confirm(t("notif.deleteAllConfirm"))) return false
    setNotificationsBusy(true)
    try {
      if (canAdminister) {
        await gymApi.deleteAllNotifications()
        setNotifications([])
        knownNotificationIds.current = new Set()
      } else {
        await Promise.all(targets.map((item) => gymApi.deleteNotification(item.id)))
        const gone = new Set(targets.map((item) => item.id))
        setNotifications((current) => current.filter((item) => !gone.has(item.id)))
        gone.forEach((id) => knownNotificationIds.current.delete(id))
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notif.deleteAllFail"))
      return false
    } finally {
      setNotificationsBusy(false)
    }
  }
  const markAllNotificationsRead = async () => {
    const targets = visibleNotifications.filter((item) => !item.is_read)
    if (!targets.length || notificationsBusy) return false
    setNotificationsBusy(true)
    try {
      if (canAdminister) {
        await gymApi.markAllNotificationsRead()
        setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
      } else {
        const updated = await Promise.all(targets.map((item) => gymApi.markNotificationRead(item.id)))
        const byId = new Map(updated.map((item) => [item.id, item]))
        setNotifications((current) => current.map((item) => byId.get(item.id) || item))
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notif.readFail"))
      return false
    } finally {
      setNotificationsBusy(false)
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

  const loadSeq = useRef(0);
  const load = async (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    if (!canUseDesk) {
      if (!quiet) setBusy(false);
      return;
    }
    const requestId = ++loadSeq.current;
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
      if (requestId !== loadSeq.current) return;
      setDashboard(stats);
      setMembers(people);
      setClasses(classList);
      setPlans(planList);
      setMemberships(membershipList);
      setPayments(paymentList);
      setAttendance(attendanceList);
      setTrainers(trainerList);
      if (quiet) void refreshNotifications({ silent: true });
      else await refreshNotifications();
    } catch (e) {
      if (requestId !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : t("loadFail"));
    } finally {
      if (!quiet) setBusy(false);
    }
  };

  const afterSave = (message: string) => {
    setNotice(message);
    void load({ quiet: true });
  };
  const savingRef = useRef(false);
  const mutate = async (action: () => Promise<void>, failMessage: string): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : failMessage);
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const go = (next: Page, options?: { status?: string }) => {
    if (!canUseDesk) return;
    if (!canAdminister && (next === "admin" || next === "trainers" || next === "expenses")) return;
    if (next !== "member360") setMember360Id(null);
    setPage(next);
    setMobileMenuOpen(false);
    setQuery("");
    setStatus(options?.status ?? "");
  };
  const openMember360 = (id: number) => {
    if (!canUseDesk) return;
    setMember360Id(id);
    setPage("member360");
    setMobileMenuOpen(false);
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
  const memberName = (id: number) => memberById.get(id)?.name || t("members.unknown");
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
      const name = memberName(item.member_id);
      const plan = planById.get(item.plan_id)?.name || `Plan #${item.plan_id}`;
      return `${name} ${plan}`.toLowerCase().includes(needle);
    });
  }, [memberships, status, query, memberById, planById, memberName]);

  const checkIn = async (id: number) => {
    return mutate(async () => {
      await gymApi.checkIn(id);
      afterSave(t("att.ok"));
    }, t("att.fail"));
  };

  const checkOut = async (id: number) => {
    return mutate(async () => {
      await gymApi.checkOut(id);
      afterSave(t("att.outOk"));
    }, t("att.outFail"));
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
    const ok = await mutate(async () => {
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
      const createdMember: Member = {
        ...created,
        name: (created.name || "").trim() || `${payload.first_name} ${payload.last_name}`.trim(),
      };
      setMembers((current) =>
        current.some((item) => item.id === createdMember.id) ? current : [createdMember, ...current],
      );

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
                ? t("pay.cashNoteRemain", { n: remaining ?? 0 })
                : t("pay.cashNote"),
              remaining,
            });
          }
        })(),
      ]);

      afterSave(t("member.created"));
    }, t("member.createFail"));
    if (!ok) void load({ quiet: true });
    return ok;
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
    return mutate(async () => {
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
      }
      if (payload.membership && Number.isFinite(nextPrice) && nextPrice >= 0) {
        const paidSoFar = Number(
          memberships.find((item) => item.id === payload.membership?.id)?.total_paid || 0,
        );
        if (nextPrice < paidSoFar) {
          throw new Error(t("pay.priceBelowPaid"));
        }
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
    }, t("member.updateFail"));
  };

  const deleteMember = async (memberId: number, options?: { confirmed?: boolean }) => {
    if (!options?.confirmed && !window.confirm(t("member.deleteConfirm"))) return false;
    return mutate(async () => {
      await gymApi.deleteMember(memberId);
      afterSave(t("member.deleted"));
    }, t("member.deleteFail"));
  };

  const createClass = async (payload: {
    name: string;
    class_type: string;
    price_per_member: number | string;
    is_active?: boolean;
  }) => {
    return mutate(async () => {
      await gymApi.createClass(payload);
      afterSave(t("class.ok"));
    }, t("class.fail"));
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
    return mutate(async () => {
      await gymApi.updateClass(id, payload);
      afterSave(t("class.updated"));
    }, t("class.updateFail"));
  };

  const deleteClass = async (id: number) => {
    return mutate(async () => {
      await gymApi.deleteClass(id);
      afterSave(t("class.deleted"));
    }, t("class.deleteFail"));
  };

  const createPlan = async (payload: {
    name: string;
    duration_months: number;
    price: number | string;
    description?: string;
    is_active?: boolean;
  }) => {
    return mutate(async () => {
      await gymApi.createPlan(payload);
      afterSave(t("plans.ok"));
    }, t("plans.fail"));
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
    return mutate(async () => {
      await gymApi.updatePlan(id, payload);
      afterSave(t("plans.updated"));
    }, t("plans.updateFail"));
  };

  const deletePlan = async (id: number) => {
    return mutate(async () => {
      await gymApi.deletePlan(id);
      afterSave(t("plans.deleted"));
    }, t("plans.deleteFail"));
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
    return mutate(async () => {
      await gymApi.createTrainer(payload);
      afterSave(t("train.ok"));
    }, t("train.fail"));
  };

  const updateTrainer = async (
    id: number,
    payload: {
      first_name: string;
      last_name: string;
      specialization?: string;
      phone?: string;
      monthly_pay?: number | string;
    },
  ) => {
    return mutate(async () => {
      await gymApi.updateTrainer(id, payload);
      afterSave(t("train.updated"));
    }, t("train.updateProfileFail"));
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
    return mutate(async () => {
      await gymApi.updateTrainerPayroll(id, payload);
      afterSave(payload.is_paid ? t("train.paidOk") : t("train.saved"));
    }, t("train.updateFail"));
  };

  const deleteTrainer = async (id: number) => {
    return mutate(async () => {
      await gymApi.deleteTrainer(id);
      afterSave(t("train.deleted"));
    }, t("train.deleteFail"));
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
    return mutate(async () => {
      await gymApi.renew(membershipId, payload);
      afterSave(t("membership.renewed"));
    }, t("membership.renewFail"));
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
    return mutate(async () => {
      await gymApi.updateMembership(membershipId, payload);
      afterSave(t("membership.updated"));
    }, t("membership.updateFail"));
  };

  const deleteMembership = async (membershipId: number, options?: { confirmed?: boolean }) => {
    if (!options?.confirmed && !window.confirm(t("membership.deleteConfirm"))) return false;
    return mutate(async () => {
      await gymApi.deleteMembership(membershipId);
      afterSave(t("membership.deleted"));
    }, t("membership.deleteFail"));
  };

  const setMembershipPaymentStatus = async (membership: Membership, status: "paid" | "unpaid") => {
    return mutate(async () => {
      const updated = await gymApi.updatePaymentStatus(membership.id, status)
      setMemberships((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      afterSave(t("pay.marked", { status: statusLabel(status) }))
    }, t("pay.fail"));
  };

  const recordPayment = async (
    membershipId: number,
    payload: PaymentPayload,
  ) => {
    if (savingRef.current) throw new Error(t("pay.fail"));
    savingRef.current = true;
    try {
      const payment = await gymApi.payment(membershipId, payload);
      afterSave(t("pay.ok"));
      return payment;
    } catch (e) {
      setError(e instanceof Error && e.message && e.message !== "[object Object]" ? e.message : t("pay.fail"));
      void load({ quiet: true });
      throw e;
    } finally {
      savingRef.current = false;
    }
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
          <span className="brand-mark">A</span>
          <div>
            <strong>AUMB</strong>
            <small>{t("brand.tag")}</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {canUseDesk
            ? navGroups.map((group) => (
                <div className="nav-group" key={group.label}>
                  <p className="nav-group-label">{t(group.label)}</p>
                  {group.items.map(([key, Icon]) => (
                    <button
                      key={key}
                      className={page === key || (key === "members" && page === "member360") ? "active" : ""}
                      onClick={() => go(key)}
                    >
                      <Icon size={17} strokeWidth={1.9} /> {t(`nav.${key}` as Msg)}
                    </button>
                  ))}
                </div>
              ))
            : null}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip">
            <span className="user-chip-avatar" aria-hidden="true">{staffDisplayName(currentUser).slice(0, 1).toUpperCase()}</span>
            <div className="user-chip-meta">
              <strong>{staffDisplayName(currentUser)}</strong>
              <small>{roleLabel}</small>
            </div>
          </div>
          <button type="button" className="auth-logout" onClick={() => void logout()}>
            <LogOut size={15} /> {t("auth.signOut")}
          </button>
        </div>
      </aside>
      <main className="main">
        <header className={`topbar${navHidden ? " is-away" : ""}`}>
          <button className="mobile-menu-button" aria-label={mobileMenuOpen ? t("nav.close") : t("nav.open")} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="topbar-title">
            <span className="eyebrow topbar-date-long">{today}</span>
            <span className="eyebrow topbar-date-short">{todayShort}</span>
            <h1>
              {page === "dashboard" ? t("hello", { name: currentUser.first_name || currentUser.username }) : t(`page.${page}` as Msg)}
            </h1>
          </div>
          <div className="top-actions">
            <ThemeSwitch />
            <LanguageSwitch />
            {canUseDesk && (
            <>
            <div className="notification-bell-wrap" ref={notificationBellRef}>
              <button className="icon-button notification-bell" title={t("nav.notifications")} aria-label={t("nav.notifications")} aria-expanded={notificationsOpen} onClick={() => { if (!notificationsOpen) { placeNotificationMenu(); void refreshNotifications({ silent: true }) } setNotificationsOpen(!notificationsOpen) }}>
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
                    <section className="notification-sheet-section notification-sheet-list">
                      <p className="notification-sheet-label">{t("notif.needToSee")}</p>
                      {visibleNotifications.slice(0, 8).map(item => (
                        <article className={`notification-dropdown-item ${item.is_read ? "read" : "unread"}`} key={item.id} onClick={() => openNotification(item)}>
                          <span className="notification-dot"></span>
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.message}</p>
                            <small>{date(item.created_at)} · {t(notificationOpenKey(item))}</small>
                          </div>
                          <ChevronRight size={16} className="notification-open-icon" />
                          <button className="icon-button notification-delete" title={t("notif.deleteTitle")} aria-label={t("notif.deleteTitle")} onClick={event => { event.stopPropagation(); void deleteNotification(item.id) }}>
                            <Trash2 size={14} />
                          </button>
                        </article>
                      ))}
                      {!visibleNotifications.length && <EmptyState title={t("notif.empty")} hint={t("notif.emptyHint")} />}
                    </section>
                    <section className="notification-sheet-section notification-sheet-click">
                      <p className="notification-sheet-label">{t("notif.canClick")}</p>
                      <div className="notification-action-list">
                        {notificationCompact ? (
                          <>
                            <div className="notification-action-bar">
                              {unreadCount > 0 && (
                                <button type="button" className="icon-button" aria-label={t("notif.markRead")} onClick={() => void markAllNotificationsRead()}>
                                  <Check size={16} />
                                </button>
                              )}
                              {visibleNotifications.length > 0 && (
                                <button type="button" className="icon-button" aria-label={t("notif.clear")} onClick={() => void deleteAllNotifications()}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                              <button type="button" className="icon-button" aria-label={t("addMember")} onClick={() => { setNotificationsOpen(false); go("members") }}>
                                <UserPlus size={16} />
                              </button>
                              <button type="button" className="icon-button" aria-label={t("common.refresh")} onClick={() => void load()}>
                                <RefreshCw size={16} />
                              </button>
                            </div>
                            <button type="button" className="notification-action notification-action-wide" onClick={() => { setNotificationsOpen(false); go("notifications") }}>
                              <Bell size={16} /> {t("notif.viewAll")}
                            </button>
                          </>
                        ) : (
                          <>
                            {unreadCount > 0 && (
                              <button type="button" className="notification-action" onClick={() => void markAllNotificationsRead()}>
                                <Check size={16} /> {t("notif.markRead")}
                              </button>
                            )}
                            {visibleNotifications.length > 0 && (
                              <button type="button" className="notification-action" onClick={() => void deleteAllNotifications()}>
                                <Trash2 size={16} /> {t("notif.clear")}
                              </button>
                            )}
                            <button type="button" className="notification-action" onClick={() => { setNotificationsOpen(false); go("notifications") }}>
                              <Bell size={16} /> {t("notif.viewAll")}
                            </button>
                          </>
                        )}
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
            </>
            )}
          </div>
        </header>
        {busy && <LoadingState label={t("common.loading")} />}
        {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
        {error && (
          <Alert onDismiss={() => setError("")} dismissLabel={t("common.dismiss")}>
            {error}
          </Alert>
        )}
        <div className={`page-stage${page === "dashboard" ? " overview-enter" : ""}`} key={canUseDesk ? page : "denied"}>
        {!canUseDesk ? (
          <div className="content">
            <EmptyState title={t("perm.denied")} hint={t("perm.deniedHint")} />
          </div>
        ) : (
        <>
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
            onCreate={createMember}
            onUpdate={updateMember}
            onOpenProfile={openMember360}
          />
        )}
        {page === "member360" && member360Id && (
          <Member360Page
            memberId={member360Id}
            classes={classes}
            plans={plans}
            onBack={() => {
              setMember360Id(null);
              setPage("members");
              setMobileMenuOpen(false);
            }}
            onUpdate={updateMember}
            onDelete={deleteMember}
            onPayment={recordPayment}
            onCheckIn={checkIn}
            onCheckOut={checkOut}
          />
        )}
        {page === "classes" && (
          <ClassesPage
            classes={classes}
            trainers={trainers}
            canAdminister={canAdminister}
            canManageSchedules={can(currentUser, "classes.mutate")}
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
            onOpenProfile={openMember360}
          />
        )}
        {page === "reminders" && <RemindersPage />}
        {page === "trainers" && canAdminister && (
          <Trainers
            trainers={trainers}
            canAdminister={canAdminister}
            onCreate={createTrainer}
            onUpdate={updateTrainer}
            onUpdatePayroll={updateTrainerPayroll}
            onDelete={deleteTrainer}
          />
        )}
        {page === "reports" && <Reports canAdminister={canAdminister} />}
        {page === "expenses" && canAdminister && <ExpensesPage />}
        {page === "admin" && canAdminister && (
          <Administration
            currentUser={currentUser}
            dashboard={dashboard}
            members={members}
            memberships={memberships}
            trainers={trainers}
            classes={classes}
            payments={payments}
            attendance={attendance}
            notifications={notifications}
            go={go}
            onUserUpdated={onUserUpdated}
          />
        )}
        {page === "notifications" && (
          <Notifications
            notifications={visibleNotifications}
            error={notificationsError}
            busy={notificationsBusy}
            onDismissError={() => setNotificationsError("")}
            onOpen={openNotification}
            onDelete={id => void deleteNotification(id)}
            onMarkAllRead={() => void markAllNotificationsRead()}
            onDeleteAll={() => void deleteAllNotifications()}
          />
        )}
        </>
        )}
        </div>
      </main>
    </div>
  );
}

function Notifications({
  notifications,
  error,
  busy,
  onOpen,
  onDelete,
  onMarkAllRead,
  onDeleteAll,
  onDismissError,
}: {
  notifications: GymNotification[]
  error?: string
  busy?: boolean
  onOpen: (item: GymNotification) => void
  onDelete: (id: number) => void
  onMarkAllRead: () => void
  onDeleteAll: () => void
  onDismissError?: () => void
}) {
  const { t } = useLang()
  const [filter, setFilter] = useState('all')
  const unreadCount = notifications.filter(item => !item.is_read).length
  const visibleNotifications = notifications.filter(item => filter === 'all' || (filter === 'unread' && !item.is_read) || item.category === filter)

  return (
    <div className="content notifications-page">
      <PageHeader
        eyebrow={t("notif.eyebrow")}
        title={t("notif.title")}
        description={t("notif.intro")}
        actions={
          <>
            <button
              type="button"
              className="secondary"
              onClick={onMarkAllRead}
              disabled={busy || unreadCount === 0}
              aria-label={t("notif.markAll")}
            >
              <Check size={16} />
              <span>{busy ? t("notif.working") : t("notif.markAll")}</span>
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onDeleteAll}
              disabled={busy || notifications.length === 0}
              aria-label={t("notif.deleteAll")}
            >
              <Trash2 size={16} />
              <span>{t("notif.deleteAll")}</span>
            </button>
          </>
        }
      />
      {error && <Alert onDismiss={onDismissError}>{error}</Alert>}
      <div className="notification-filters">
        {['all', 'unread', 'memberships', 'payments', 'members', 'system'].map(value => (
          <button
            type="button"
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
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
            <button type="button" className="icon-button notification-delete" title={t("notif.deleteTitle")} aria-label={t("notif.deleteTitle")} disabled={busy} onClick={event => { event.stopPropagation(); onDelete(item.id) }}>
              <Trash2 size={15} />
            </button>
          </article>
        ))}
        {!visibleNotifications.length && <EmptyState title={t("notif.empty")} hint={t("notif.emptyHint")} />}
      </section>
    </div>
  )
}

const GYM_TZ = "Africa/Casablanca";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function casablancaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GYM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isIsoDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function formatSummaryDate(iso: string, locale: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
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
  const today = casablancaToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const summarySeq = useRef(0);

  useEffect(() => {
    if (!isIsoDate(selectedDate)) return;
    const requestId = ++summarySeq.current;
    setSummaryLoading(true);
    setSummaryError("");
    void gymApi
      .dashboardSummary(selectedDate)
      .then((payload) => {
        if (requestId !== summarySeq.current) return;
        setSummary(payload);
        setSummaryDate(selectedDate);
      })
      .catch((e) => {
        if (requestId !== summarySeq.current) return;
        setSummaryError(e instanceof Error ? e.message : t("dash.summaryFail"));
      })
      .finally(() => {
        if (requestId === summarySeq.current) setSummaryLoading(false);
      });
  }, [selectedDate, t]);

  const visibleSummary = summaryDate === selectedDate ? summary : null;
  const isToday = selectedDate === today;
  const dateTitle = isToday
    ? t("dash.todayLabel", { date: formatSummaryDate(selectedDate, localeFor()) })
    : t("dash.selectedDate", { date: formatSummaryDate(selectedDate, localeFor()) });
  const quietDay =
    visibleSummary &&
    visibleSummary.attendance.checked_in === 0 &&
    visibleSummary.attendance.inside === 0 &&
    Number(visibleSummary.payments.today_total || 0) === 0 &&
    visibleSummary.classes.today_count === 0;

  const changeDate = (next: string) => {
    if (!isIsoDate(next) || next === selectedDate) return;
    setSelectedDate(next);
  };

  return (
    <div className="content dashboard-page">
      <section className="hero-strip">
        <div className="hero-copy">
          <span className="eyebrow light">{t("dash.pulse")}</span>
          <div className="hero-title-row">
            <h2>{t("dash.hero")}</h2>
            <div className="hero-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => go("reports")}
                aria-label={t("dash.reports")}
              >
                <BarChart3 size={16} />
                <span>{t("dash.reports")}</span>
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => go("members")}
                aria-label={t("addMember")}
              >
                <UserPlus size={17} />
                <span>{t("addMember")}</span>
              </button>
            </div>
          </div>
          <p>{t("dash.heroP")}</p>
        </div>
      </section>
      <section className="panel dashboard-date-bar">
        <div>
          <span className="eyebrow">{t("dash.selectedDateLabel")}</span>
          <h3>{dateTitle}</h3>
        </div>
        <div className="dashboard-date-nav">
          <button
            type="button"
            className="secondary"
            onClick={() => changeDate(shiftIsoDate(selectedDate, -1))}
            aria-label={t("dash.prevDay")}
          >
            <ChevronLeft size={16} />
            <span>{t("dash.prevDay")}</span>
          </button>
          <button
            type="button"
            className="secondary"
            disabled={isToday}
            onClick={() => changeDate(today)}
          >
            {t("dash.today")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => changeDate(shiftIsoDate(selectedDate, 1))}
            aria-label={t("dash.nextDay")}
          >
            <span>{t("dash.nextDay")}</span>
            <ChevronRight size={16} />
          </button>
          <label className="dashboard-date-picker">
            <span className="sr-only">{t("dash.selectedDateLabel")}</span>
            <input
              type="date"
              value={selectedDate}
              min="2000-01-01"
              onChange={(event) => changeDate(event.target.value)}
            />
          </label>
        </div>
      </section>
      {summaryError && <Alert onDismiss={() => setSummaryError("")}>{summaryError}</Alert>}
      {summaryLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : visibleSummary ? (
        <>
          {quietDay ? <p className="dashboard-quiet">{t("dash.noActivity")}</p> : null}
          <div className="stats-grid dashboard-summary-grid">
            <Stat
              icon={CalendarCheck}
              label={t("dash.checkedIn")}
              value={visibleSummary.attendance.checked_in}
              detail={t("dash.insideNow", { n: visibleSummary.attendance.inside })}
              className="sage"
              onClick={() => go("attendance")}
            />
            <Stat
              icon={Activity}
              label={t("dash.activeMemberships")}
              value={visibleSummary.memberships.active}
              detail={t("dash.expiringTodayCount", { n: visibleSummary.memberships.expiring_today })}
              onClick={() => go("memberships", { status: "active" })}
            />
            <Stat
              icon={ClipboardList}
              label={t("dash.expiredMemberships")}
              value={visibleSummary.memberships.expired}
              detail={t("status.expired")}
              className="coral"
              onClick={() => go("memberships", { status: "expired" })}
            />
            <Stat
              icon={CircleDollarSign}
              label={t("dash.todayPayments")}
              value={money(visibleSummary.payments.today_total)}
              detail={t("dash.outstandingBalance")}
              className="gold"
              onClick={() => go("payments")}
            />
            <Stat
              icon={CircleDollarSign}
              label={t("dash.outstandingBalance")}
              value={money(visibleSummary.payments.outstanding_total)}
              detail={t("dash.across")}
              className="ink"
              onClick={() => go("memberships")}
            />
            <Stat
              icon={Dumbbell}
              label={t("dash.classesToday")}
              value={visibleSummary.classes.today_count}
              detail={t("dash.classesTodayHint")}
              onClick={() => go("classes")}
            />
            <Stat
              icon={Users}
              label={t("dash.trainersToday")}
              value={visibleSummary.trainers.today_count}
              detail={t("dash.trainersTodayHint")}
            />
          </div>
          <div className="stats-grid dashboard-summary-grid">
            <Stat
              icon={CalendarCheck}
              label={t("dash.expiringToday")}
              value={visibleSummary.attention.expiring_today}
              detail={t("dash.attentionExpiringHint")}
              className="coral"
              onClick={() => go("reminders")}
            />
            <Stat
              icon={ClipboardList}
              label={t("dash.expiredMemberships")}
              value={visibleSummary.attention.expired}
              detail={t("status.expired")}
              onClick={() => go("memberships", { status: "expired" })}
            />
            <Stat
              icon={CircleDollarSign}
              label={t("dash.membersWithBalance")}
              value={visibleSummary.attention.members_with_balance}
              detail={t("dash.outstandingBalance")}
              className="gold"
              onClick={() => go("memberships")}
            />
          </div>
        </>
      ) : null}
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
          <div className="dash-list">
            {classes.slice(0, 4).map((item) => (
              <button type="button" className="dash-row" key={item.id} onClick={() => go("classes")}>
                <span className="dash-row-main">
                  <strong>{item.name}</strong>
                  <small>
                    {t("dash.classMembers", { n: item.member_count })}
                    {item.class_type ? ` · ${classTypeLabel(item.class_type, t)}` : ""}
                  </small>
                </span>
                <span className={`status ${item.is_active ? "active" : "expired"}`}>
                  {item.is_active ? t("common.active") : t("common.inactive")}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel latest">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("nav.classes")}</span>
              <h2>{t("dash.classes")}</h2>
            </div>
          </div>
          <EmptyState title={t("dash.noClasses")} />
        </section>
      )}
      <section className="panel latest">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{t("members.eyebrow")}</span>
            <h2>{t("dash.recent")}</h2>
          </div>
          <button className="text-button" onClick={() => go("members")}>
            {t("common.viewAll")}
          </button>
        </div>
        <div className="dash-list">
          {(data?.recent_members?.length ? data.recent_members : members.slice(0, 5)).map((member) => (
            <button type="button" className="dash-row" key={member.id} onClick={() => go("members")}>
              <span className="dash-row-id">#{String(member.id).padStart(5, "0")}</span>
              <span className="dash-row-main">
                <strong>{member.name}</strong>
                <small>
                  {member.phone || t("common.noPhone")}
                  {member.email ? ` · ${member.email}` : ""}
                </small>
              </span>
              <ChevronRight size={16} className="dash-row-go" aria-hidden="true" />
            </button>
          ))}
        </div>
        {!members.length && !data?.recent_members?.length && <EmptyState title={t("dash.noMembers")} />}
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

  const openWhatsApp = async (item: WhatsAppReminder, reload = true) => {
    if (!item.whatsapp_url || !isSafeWhatsAppUrl(item.whatsapp_url)) return false;
    window.open(item.whatsapp_url, "_blank", "noopener,noreferrer");
    try {
      await gymApi.markReminderSent(item.membership_id, item.message);
      if (reload) {
        setNotice(t("remind.opened", { name: item.member_name }));
        await load();
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("remind.markFail"));
      return false;
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [queue, setQueue] = useState<WhatsAppReminder[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const queueSent = useRef(0);
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [filter, data?.items.length]);
  useEffect(() => {
    setSelected(new Set());
    setQueue([]);
    setQueueIndex(0);
    queueSent.current = 0;
  }, [filter]);
  const pagedItems = items.slice(0, shown);
  const canSend = (item: WhatsAppReminder) =>
    Boolean(item.whatsapp_url && isSafeWhatsAppUrl(item.whatsapp_url));
  const sendableItems = items.filter(canSend);
  const selectedItems = sendableItems.filter((item) => selected.has(item.membership_id));
  const allSendableSelected = sendableItems.length > 0 && sendableItems.every((item) => selected.has(item.membership_id));

  const toggleSelected = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      if (allSendableSelected) return new Set();
      const next = new Set(current);
      for (const item of sendableItems) next.add(item.membership_id);
      return next;
    });
  };

  const startQueue = (list: WhatsAppReminder[]) => {
    if (!list.length) {
      setError(selected.size ? t("remind.noPhoneSelected") : t("remind.noneSelected"));
      return;
    }
    setError("");
    if (list.length === 1) {
      void openWhatsApp(list[0]);
      return;
    }
    queueSent.current = 0;
    setQueue(list);
    setQueueIndex(0);
  };

  const finishQueue = async () => {
    const sent = queueSent.current;
    setQueue([]);
    setQueueIndex(0);
    setSelected(new Set());
    if (sent > 0) setNotice(t("remind.sentN", { n: sent }));
    await load();
  };

  const advanceQueue = async () => {
    if (queueIndex + 1 >= queue.length) {
      await finishQueue();
      return;
    }
    setQueueIndex((index) => index + 1);
  };

  const sendQueueItem = async () => {
    const item = queue[queueIndex];
    if (!item) return;
    setSending(true);
    const ok = await openWhatsApp(item, false);
    setSending(false);
    if (ok) queueSent.current += 1;
    if (ok) await advanceQueue();
  };

  return (
    <div className="content reminders-page">
      <PageHeader
        eyebrow={t("remind.eyebrow")}
        title={t("remind.title")}
        description={t("remind.intro")}
      />
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
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
        <button type="button" className={`ledger-stat ${filter === "missing_phone" ? "active" : ""}`} onClick={() => setFilter("missing_phone")}>
          <span>{t("common.noPhone")}</span>
          <strong>{data?.missing_phone ?? 0}</strong>
          <small>{t("remind.missing", { n: data?.missing_phone ?? 0 })}</small>
        </button>
      </div>
      <section className="panel table-wrap reports-panel reminder-panel">
        {queue.length > 0 ? (
          <div className="reminder-send-bar is-queue">
            <div className="reminder-send-copy">
              <span className="eyebrow">{t("remind.sending", { current: queueIndex + 1, total: queue.length })}</span>
              <strong>{queue[queueIndex]?.member_name}</strong>
              <small>{queue[queueIndex]?.phone}</small>
            </div>
            <div className="reminder-send-actions">
              <button type="button" className="secondary" disabled={sending} onClick={() => void advanceQueue()}>
                {t("remind.skip")}
              </button>
              <button type="button" className="whatsapp-button" disabled={sending} onClick={() => void sendQueueItem()}>
                <MessageCircle size={16} />
                <span>WhatsApp</span>
              </button>
              <button type="button" className="text-button" disabled={sending} onClick={() => { setQueue([]); setQueueIndex(0); }}>
                {t("remind.cancelSend")}
              </button>
            </div>
          </div>
        ) : items.length > 0 ? (
          <div className="reminder-send-bar">
            <small className="reminder-send-count">{t("remind.selected", { n: selectedItems.length })}</small>
            <div className="reminder-send-actions">
              <button
                type="button"
                className="whatsapp-button"
                disabled={!selectedItems.length}
                onClick={() => startQueue(selectedItems)}
              >
                <MessageCircle size={16} />
                <span className="send-label-full">{t("remind.sendSelected")}</span>
                <span className="send-label-short">{t("remind.sendShort")}</span>
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!sendableItems.length}
                onClick={() => startQueue(sendableItems)}
              >
                <span className="send-label-full">{t("remind.sendAll")}</span>
                <span className="send-label-short">{t("remind.allShort")}</span>
              </button>
            </div>
          </div>
        ) : null}
        {loading && <LoadingState label={t("remind.loading")} />}
        {!loading && !items.length && (
          <EmptyState title={filter === "all" ? t("remind.empty") : t("remind.emptyFilter")} />
        )}
        {!loading && items.length > 0 && (
          <>
          <div className="reminder-phone-list">
            {pagedItems.map((item) => (
              <article
                className={`reminder-phone-card${selected.has(item.membership_id) ? " is-selected" : ""}${canSend(item) ? "" : " is-locked"}`}
                key={`phone-${item.membership_id}`}
                role="button"
                tabIndex={canSend(item) ? 0 : -1}
                aria-pressed={selected.has(item.membership_id)}
                aria-label={t("remind.selectMember", { name: item.member_name })}
                onClick={() => {
                  if (canSend(item) && !selected.has(item.membership_id)) toggleSelected(item.membership_id);
                }}
                onKeyDown={(event) => {
                  if (!canSend(item) || selected.has(item.membership_id)) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelected(item.membership_id);
                  }
                }}
              >
                {selected.has(item.membership_id) ? (
                  <button
                    type="button"
                    className="icon-button reminder-phone-clear"
                    aria-label={t("common.close")}
                    title={t("common.close")}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelected(item.membership_id);
                    }}
                  >
                    <X size={12} />
                  </button>
                ) : null}
                <header className="reminder-phone-head">
                  <strong className="reminder-phone-name">{item.member_name}</strong>
                  <div className="reminder-phone-tags">
                    {item.reasons.map((reason) => (
                      <span className={`status ${reason === "unpaid" || reason === "expired" ? "unpaid" : "partial"}`} key={reason}>
                        {reasonLabel(reason, t)}
                      </span>
                    ))}
                  </div>
                </header>
                <div className="reminder-phone-body">
                  <p className="reminder-phone-number">
                    {item.phone || t("common.noPhone")}
                    {item.reminded_today ? <span className="reminder-today"> · {t("remind.today")}</span> : null}
                  </p>
                  <div className="reminder-phone-row">
                    <p className="reminder-phone-when">
                      {date(item.end_date)}
                      {" · "}
                      {item.days_left >= 0
                        ? t(item.days_left === 1 ? "remind.daysLeft" : "remind.daysLeftPlural", { n: item.days_left })
                        : t(Math.abs(item.days_left) === 1 ? "remind.daysAgo" : "remind.daysAgoPlural", { n: Math.abs(item.days_left) })}
                    </p>
                    <p className="reminder-phone-amount">
                      {Number(item.remaining) > 0 ? (
                        <strong className="amount-owing">{money(item.remaining)}</strong>
                      ) : (
                        <span className="amount-settled">{money(0)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="reminder-phone-actions" onClick={(event) => event.stopPropagation()}>
                  {canSend(item) ? (
                    <button
                      type="button"
                      className="whatsapp-button"
                      onClick={() => void openWhatsApp(item)}
                    >
                      <MessageCircle size={16} />
                      WhatsApp
                    </button>
                  ) : (
                    <span className="status">{t("remind.addPhone")}</span>
                  )}
                  <button
                    type="button"
                    className="icon-button reminder-copy"
                    onClick={() => void copyMessage(item)}
                    aria-label={t("common.copy")}
                    title={t("common.copy")}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <table className="reminder-desktop-table">
            <thead>
              <tr>
                <th className="record-check">
                  <input
                    type="checkbox"
                    checked={allSendableSelected}
                    disabled={!sendableItems.length}
                    onChange={toggleAll}
                    aria-label={t("remind.selectAll")}
                  />
                </th>
                <th>{t("dash.member")}</th>
                <th className="record-plan">{t("remind.why")}</th>
                <th>{t("remind.ends")}</th>
                <th className="record-owing">{t("remind.stillOwes")}</th>
                <th className="record-pay">{t("common.phone")}</th>
                <th className="record-actions">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => (
                <tr className={`record-card record-card-reminder${selected.has(item.membership_id) ? " is-selected" : ""}`} key={item.membership_id}>
                  <td className="record-check">
                    <input
                      type="checkbox"
                      checked={selected.has(item.membership_id)}
                      disabled={!canSend(item)}
                      onChange={() => toggleSelected(item.membership_id)}
                      aria-label={t("remind.selectMember", { name: item.member_name })}
                    />
                  </td>
                  <td className="record-name" data-label={t("dash.member")}>
                    <strong>{item.member_name}</strong>
                    {item.reasons.map((reason) => (
                      <span className={`status ${reason === "unpaid" || reason === "expired" ? "unpaid" : "partial"}`} key={reason}>
                        {reasonLabel(reason, t)}
                      </span>
                    ))}
                    <small>
                      <span className="reminder-phone">{item.phone || t("common.noPhone")}</span>
                      {item.reminded_today ? <span className="reminder-today"> · {t("remind.today")}</span> : null}
                    </small>
                  </td>
                  <td className="record-plan" data-label={t("remind.why")}>
                    <div className="reminder-reasons">
                      {item.reasons.map((reason) => (
                        <span className={`status ${reason === "unpaid" || reason === "expired" ? "unpaid" : "partial"}`} key={reason}>
                          {reasonLabel(reason, t)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="record-period" data-label={t("remind.ends")}>
                    <span className="reminder-end">{date(item.end_date)}</span>
                    <small>
                      {item.days_left >= 0
                        ? t(item.days_left === 1 ? "remind.daysLeft" : "remind.daysLeftPlural", { n: item.days_left })
                        : t(Math.abs(item.days_left) === 1 ? "remind.daysAgo" : "remind.daysAgoPlural", { n: Math.abs(item.days_left) })}
                    </small>
                  </td>
                  <td className="record-owing table-money" data-label={t("remind.stillOwes")}>
                    {Number(item.remaining) > 0 ? (
                      <strong className="amount-owing">{money(item.remaining)}</strong>
                    ) : (
                      <span className="amount-settled">{money(0)}</span>
                    )}
                  </td>
                  <td className="record-pay" data-label={t("common.phone")}>{item.phone || t("common.noPhone")}</td>
                  <td className="record-actions" data-label={t("common.actions")}>
                    <div className="table-actions reminder-actions">
                      {canSend(item) ? (
                        <button
                          type="button"
                          className="icon-button whatsapp-button"
                          onClick={() => void openWhatsApp(item)}
                          aria-label={t("remind.send")}
                          title={t("remind.send")}
                        >
                          <MessageCircle size={16} />
                          <span className="send-label-phone">WhatsApp</span>
                        </button>
                      ) : (
                        <span className="status">{t("remind.addPhone")}</span>
                      )}
                      <button
                        type="button"
                        className="icon-button reminder-copy"
                        onClick={() => void copyMessage(item)}
                        aria-label={t("common.copy")}
                        title={t("common.copy")}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [year, month] = selected.split("-").map(Number);

  const loadSeq = useRef(0);
  const load = async () => {
    const requestId = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      const rows = await gymApi.expenses(year, month);
      if (requestId !== loadSeq.current) return;
      setExpenses(rows);
    } catch (e) {
      if (requestId !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : t("exp.loadFail"));
      setExpenses([]);
    } finally {
      if (requestId === loadSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [year, month]);

  const add = async () => {
    if (saving) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError(t("exp.amountErr"));
      return;
    }
    setError("");
    setSaving(true);
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
      setNotice(t("exp.saved"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exp.saveFail"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (expense: GymExpense) => {
    if (saving) return;
    if (!window.confirm(t("exp.deleteConfirm", { name: expense.title || expense.category_label, amount: money(expense.amount) }))) return;
    setSaving(true);
    try {
      await gymApi.deleteExpense(expense.id);
      setNotice(t("exp.deleted"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exp.deleteFail"));
    } finally {
      setSaving(false);
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
        <PageHeader
          eyebrow={t("exp.eyebrow")}
          title={t("exp.title")}
          description={t("exp.intro")}
        />
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
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      <div className="stats-grid reports-stats">
        <Stat
          icon={CircleDollarSign}
          label={t("exp.spent")}
          value={money(total)}
          detail={t(expenses.length === 1 ? "exp.count" : "exp.countPlural", { n: expenses.length })}
          className="coral"
        />
        <Stat
          icon={ClipboardList}
          label={t("exp.categories")}
          value={byCategory.length}
          detail={t("exp.catDetail")}
          className="gold"
        />
        <Stat
          icon={Activity}
          label={t("exp.biggest")}
          value={byCategory.length ? money(Math.max(...byCategory.map((item) => item.total))) : "—"}
          detail={byCategory.length ? t(`cat.${[...byCategory].sort((a, b) => b.total - a.total)[0].value}` as Msg) : t("exp.noneYet")}
          className="ink"
        />
        <Stat
          icon={Activity}
          label={t("exp.average")}
          value={expenses.length ? money(total / expenses.length) : "—"}
          detail={t("exp.per")}
          className="sage"
        />
      </div>
      <section className="panel table-wrap reports-panel">
        <div className="reports-panel-head">
          <div>
            <span className="eyebrow">{t("exp.add")}</span>
            <h3>{t("exp.new")}</h3>
          </div>
          <p>{t("exp.addHelp")}</p>
        </div>
        <form
          className="expense-form"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="expense-fields">
            <label className="expense-field">
              {t("exp.category")}
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(`cat.${item.value}` as Msg)}
                  </option>
                ))}
              </select>
            </label>
            <label className="expense-field expense-field-amount">
              {t("exp.amount")}
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
            <label className="expense-field expense-field-wide">
              {t("exp.description")}
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder={t("exp.descPh")}
              />
            </label>
            <label className="expense-field expense-field-wide">
              {t("common.notesOptional")}
              <input
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder={t("exp.notesPh")}
              />
            </label>
          </div>
          <div className="expense-form-actions">
            <button className="primary" type="submit" disabled={saving}>
              <Plus size={16} /> {saving ? t("common.saving") : t("exp.add")}
            </button>
          </div>
        </form>
      </section>
      {byCategory.length > 0 && (
        <div className="ledger-stats category-cards">
          {byCategory.map((item) => (
            <div className="ledger-stat" key={item.value}>
              <span>{t(`cat.${item.value}` as Msg)}</span>
              <strong>{money(item.total)}</strong>
              <small>
                {t(item.count === 1 ? "exp.item" : "exp.items", { n: item.count })}
              </small>
            </div>
          ))}
        </div>
      )}
      <section className="panel table-wrap reports-panel">
        <div className="reports-panel-head">
          <div>
            <span className="eyebrow">{t("exp.thisMonth")}</span>
            <h3>{t("exp.list")}</h3>
          </div>
          <p>{t("exp.recorded", { month: months.find((item) => `${item.year}-${item.month}` === selected)?.label || "" })}</p>
        </div>
        {loading && <LoadingState label={t("exp.loading")} />}
        {!loading && !expenses.length && (
          <EmptyState title={t("exp.empty")} />
        )}
        {!loading && expenses.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>{t("exp.category")}</th>
                <th>{t("exp.description")}</th>
                <th>{t("common.amount")}</th>
                <th>{t("common.notes")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td data-label={t("exp.category")}>{EXPENSE_CATEGORIES.some((item) => item.value === expense.category) ? t(`cat.${expense.category}` as Msg) : expense.category_label}</td>
                  <td data-label={t("exp.description")}>{expense.title || "—"}</td>
                  <td className="table-money" data-label={t("common.amount")}>
                    <strong className="amount-owing">{money(expense.amount)}</strong>
                  </td>
                  <td data-label={t("common.notes")}>{expense.notes || "—"}</td>
                  <td data-label={t("common.actions")}>
                    <div className="table-actions">
                      <button type="button" className="text-button" disabled={saving} onClick={() => void remove(expense)}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t("common.total")}</td>
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

function Administration({
  currentUser,
  dashboard,
  members,
  memberships,
  trainers,
  classes,
  payments,
  attendance,
  notifications,
  go,
  onUserUpdated,
}: {
  currentUser: AuthUser;
  dashboard: GymDashboard | null;
  members: Member[];
  memberships: Membership[];
  trainers: Trainer[];
  classes: FitnessClass[];
  payments: GymPayment[];
  attendance: Attendance[];
  notifications: GymNotification[];
  go: (page: Page, options?: { status?: string }) => void;
  onUserUpdated?: (user: AuthUser) => void;
}) {
  const { t } = useLang();
  const canAssignSuper = can(currentUser, "admin.assignSuper");
  const canManageStaffAccount = (user: AdminUser) =>
    canAssignSuper || (user.role || "").trim().toLowerCase().replace(/\s+/g, " ") !== "super admin";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
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
  const [saving, setSaving] = useState(false);
  const [expenseCount, setExpenseCount] = useState<number | null>(null);
  const [profile, setProfile] = useState({
    first_name: currentUser.first_name,
    last_name: currentUser.last_name,
    email: currentUser.email,
    phone: currentUser.phone || "",
  });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);

  useEffect(() => {
    setProfile({
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
      email: currentUser.email,
      phone: currentUser.phone || "",
    });
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    gymApi
      .expenses(now.getFullYear(), now.getMonth() + 1)
      .then((rows) => {
        if (!cancelled) setExpenseCount(rows.length);
      })
      .catch(() => {
        if (!cancelled) setExpenseCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setUsersLoading(true);
      try {
        const rows = await bookingApi.adminUsers(query);
        if (!cancelled) setUsers(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("admin.loadFail"));
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [query, t]);

  const save = async () => {
    if (saving) return;
    setError("");
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError(t("admin.nameReq"));
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      setError(t("form.validEmail"));
      return;
    }
    if (form.password && form.password !== form.confirm_password) {
      setError(t("admin.mismatch"));
      return;
    }
    if (form.password && form.password.length < 8) {
      setError(t("admin.passwordShort"));
      return;
    }
    if (!editing && (!form.username.trim() || form.password.length < 8)) {
      setError(t("admin.usernameReq"));
      return;
    }
    setSaving(true);
    try {
      if (editing)
        await bookingApi.updateAdminUser(editing.id, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
      else {
        await bookingApi.createAdminUser({
          username: form.username.trim(),
          password: form.password,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          role: form.role,
        });
      }
      setNotice(editing ? t("admin.updated") : t("admin.created"));
      setOpen(false);
      setEditing(null);
      setUsers(await bookingApi.adminUsers(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.saveFail"));
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (user: AdminUser) => {
    if (saving || !canManageStaffAccount(user)) return;
    if (
      !window.confirm(
        t(user.is_active ? "admin.deactivateConfirm" : "admin.activateConfirm", {
          name: user.username,
        }),
      )
    )
      return;
    setSaving(true);
    try {
      await bookingApi.updateAdminUser(user.id, { is_active: !user.is_active });
      setNotice(user.is_active ? t("admin.deactivated") : t("admin.activated"));
      const rows = await bookingApi.adminUsers(query);
      setUsers(rows);
      setSelectedUser((current) =>
        current?.id === user.id ? rows.find((row) => row.id === user.id) ?? { ...user, is_active: !user.is_active } : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.updateFail"));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (user: AdminUser, options?: { confirmed?: boolean }) => {
    if (saving || !canManageStaffAccount(user)) return false;
    if (!options?.confirmed) return false;
    setSaving(true);
    try {
      await bookingApi.deleteAdminUser(user.id);
      setNotice(t("admin.deleted"));
      setConfirmDeleteUser(false);
      setSelectedUser((current) => (current?.id === user.id ? null : current));
      setUsers(await bookingApi.adminUsers(query));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.deleteFail"));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveProfile = async () => {
    if (profileSaving) return;
    setAccountError("");
    if (!profile.first_name.trim() || !profile.last_name.trim()) {
      setAccountError(t("admin.nameReq"));
      return;
    }
    if (profile.email.trim() && !isValidEmail(profile.email)) {
      setAccountError(t("form.validEmail"));
      return;
    }
    setProfileSaving(true);
    try {
      const updated = await bookingApi.updateMyProfile({
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
      });
      onUserUpdated?.(updated);
      setNotice(t("admin.profileSaved"));
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : t("admin.profileFail"));
    } finally {
      setProfileSaving(false);
    }
  };
  const savePassword = async () => {
    if (passwordSaving) return;
    setAccountError("");
    if (!passwords.current) {
      setAccountError(t("admin.passwordFail"));
      return;
    }
    if (passwords.next.length < 8) {
      setAccountError(t("admin.passwordShort"));
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setAccountError(t("admin.mismatch"));
      return;
    }
    setPasswordSaving(true);
    try {
      const updated = await bookingApi.changeMyPassword({
        current_password: passwords.current,
        new_password: passwords.next,
      });
      onUserUpdated?.(updated);
      setPasswords({ current: "", next: "", confirm: "" });
      setNotice(t("admin.passwordChanged"));
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : t("admin.passwordFail"));
    } finally {
      setPasswordSaving(false);
    }
  };
  const startEdit = (user: AdminUser) => {
    if (!canManageStaffAccount(user)) return;
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
  const todayKey = localDay(new Date().toISOString());
  const activeMemberships = memberships.filter(
    (item) => item.status === "active" || item.status === "expiring_soon",
  ).length;
  const expiredMemberships = memberships.filter((item) => item.status === "expired").length;
  const attendanceToday = attendance.filter(
    (item) => item.checked_in_at && localDay(item.checked_in_at) === todayKey,
  ).length;
  const unreadNotifications = notifications.filter((item) => !item.is_read).length;
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
  const closeAccount = () => {
    setAccountOpen(false);
    setAccountError("");
    setPasswords({ current: "", next: "", confirm: "" });
  };

  return (
    <div className="content admin-page">
      <PageHeader
        eyebrow={t("admin.eyebrow")}
        title={t("admin.title")}
        description={t("admin.intro")}
        actions={
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => setAccountOpen(true)}
              aria-label={t("admin.account")}
            >
              <User size={16} />
              <span>{t("admin.account")}</span>
            </button>
            <button
              type="button"
              className="primary"
              onClick={openCreate}
              aria-label={t("admin.add")}
            >
              <Plus size={16} />
              <span>{t("admin.add")}</span>
            </button>
          </>
        }
      />
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      <section className="admin-overview">
        <div className="admin-overview-head">
          <span className="eyebrow">{t("admin.gymOverview")}</span>
          <h3>{t("admin.gymSnapshot")}</h3>
        </div>
        <div className="stats-grid admin-overview-stats">
          <Stat
            icon={Users}
            label={t("dash.members")}
            value={dashboard?.members ?? members.length}
            detail={t("dash.active", { n: dashboard?.active_members ?? activeMemberships })}
            className="sage"
            onClick={() => go("members")}
          />
          <Stat
            icon={ClipboardList}
            label={t("dash.activeMemberships")}
            value={dashboard?.active_members ?? activeMemberships}
            detail={t("dash.currentlyActive")}
            onClick={() => go("memberships", { status: "active" })}
          />
          <Stat
            icon={CalendarCheck}
            label={t("admin.expiredMemberships")}
            value={expiredMemberships}
            detail={t("status.expired")}
            className="coral"
            onClick={() => go("memberships", { status: "expired" })}
          />
          <Stat
            icon={Users}
            label={t("nav.trainers")}
            value={trainers.length}
            detail={t("train.team")}
            onClick={() => go("trainers")}
          />
          <Stat
            icon={Dumbbell}
            label={t("nav.classes")}
            value={classes.length}
            detail={t("dash.classes")}
            onClick={() => go("classes")}
          />
          <Stat
            icon={CircleDollarSign}
            label={t("nav.payments")}
            value={payments.length}
            detail={dashboard ? money(dashboard.cash_this_month) : t("admin.paymentsRecorded")}
            className="gold"
            onClick={() => go("payments")}
          />
          <Stat
            icon={CalendarCheck}
            label={t("nav.attendance")}
            value={attendanceToday}
            detail={t("admin.attendanceToday")}
            onClick={() => go("attendance")}
          />
          <Stat
            icon={Bell}
            label={t("nav.notifications")}
            value={unreadNotifications}
            detail={t("admin.unreadNotifs")}
            onClick={() => go("notifications")}
          />
          <Stat
            icon={Receipt}
            label={t("nav.expenses")}
            value={expenseCount === null ? "—" : expenseCount}
            detail={t("admin.expensesMonth")}
            className="ink"
            onClick={() => go("expenses")}
          />
        </div>
      </section>
      {(dashboard?.whatsapp_due ?? 0) > 0 && (
        <section className="panel latest reminder-banner">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">WHATSAPP</span>
              <h2>
                {t((dashboard?.whatsapp_due || 0) === 1 ? "dash.waTitle" : "dash.waTitlePlural", {
                  n: dashboard?.whatsapp_due ?? 0,
                })}
              </h2>
            </div>
            <button className="primary" onClick={() => go("reminders")}>
              <MessageCircle size={16} /> {t("dash.waOpen")}
            </button>
          </div>
        </section>
      )}
      {accountOpen && (
      <div className="member-details-overlay">
      <section className="panel form-panel member-details-panel admin-account-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{t("form.account")}</span>
            <h3>{t("admin.account")}</h3>
            <p>{t("admin.accountIntro")}</p>
          </div>
        </div>
        {accountError && <Alert onDismiss={() => setAccountError("")}>{accountError}</Alert>}
        <FormSection title={t("form.personal")}>
          <FieldGrid>
            <Field label={t("admin.first")}>
              <input
                required
                value={profile.first_name}
                onChange={(event) => setProfile({ ...profile, first_name: event.target.value })}
              />
            </Field>
            <Field label={t("admin.last")}>
              <input
                required
                value={profile.last_name}
                onChange={(event) => setProfile({ ...profile, last_name: event.target.value })}
              />
            </Field>
            <Field label={t("common.email")}>
              <input
                type="email"
                value={profile.email}
                onChange={(event) => setProfile({ ...profile, email: event.target.value })}
              />
            </Field>
            <Field label={t("common.phone")}>
              <PhoneField
                value={profile.phone}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              />
            </Field>
          </FieldGrid>
          <div className="form-actions">
            <button type="button" className="primary" disabled={profileSaving} onClick={() => void saveProfile()}>
              {profileSaving ? t("common.saving") : t("admin.saveProfile")}
            </button>
          </div>
        </FormSection>
        <FormSection title={t("admin.changePassword")}>
          <FieldGrid>
            <Field label={t("admin.currentPassword")}>
              <input
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              />
            </Field>
            <Field label={t("admin.newPassword")}>
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              />
            </Field>
            <Field label={t("admin.confirm")} wide>
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={passwords.confirm}
                onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
              />
            </Field>
          </FieldGrid>
          <div className="form-actions">
            <button type="button" className="primary" disabled={passwordSaving} onClick={() => void savePassword()}>
              {passwordSaving ? t("common.saving") : t("admin.changePassword")}
            </button>
            <button type="button" className="secondary" onClick={closeAccount} disabled={profileSaving || passwordSaving}>
              {t("common.close")}
            </button>
          </div>
        </FormSection>
      </section>
      </div>
      )}
      <div className="ledger-stats desk-stats">
        <div className="ledger-stat">
          <span>{t("admin.total")}</span>
          <strong>{users.length}</strong>
          <small>{t("admin.accounts")}</small>
        </div>
        <div className="ledger-stat featured">
          <span>{t("admin.active")}</span>
          <strong>{active}</strong>
          <small>{t("admin.canAccess")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("admin.admins")}</span>
          <strong>{admins}</strong>
          <small>{t("admin.staff")}</small>
        </div>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("admin.search")}
          />
        </div>
      </div>
      {selectedUser && (
        <div className="member-details-overlay" onClick={(event) => { if (event.target === event.currentTarget && !saving) { setSelectedUser(null); setConfirmDeleteUser(false); } }}>
        <section className="panel member-details-panel admin-user-details admin-account-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("admin.details")}</span>
              <h3>{selectedUser.first_name} {selectedUser.last_name}</h3>
            </div>
            <div className="admin-user-heading-actions">
              <Badge value={selectedUser.is_active ? "active" : "inactive"} />
              {canManageStaffAccount(selectedUser) && (
                <button
                  type="button"
                  className="membership-details-delete"
                  disabled={saving}
                  aria-label={t("admin.deleteUser")}
                  onClick={() => setConfirmDeleteUser(true)}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                type="button"
                className="membership-details-x"
                aria-label={t("common.close")}
                onClick={() => { setSelectedUser(null); setConfirmDeleteUser(false); }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="info-list">
            <p><span>{t("admin.username")}</span><strong>{selectedUser.username}</strong></p>
            <p><span>{t("common.email")}</span><strong>{selectedUser.email || t("admin.notProvided")}</strong></p>
            <p><span>{t("admin.role")}</span><strong>{selectedUser.role}</strong></p>
            <p><span>{t("admin.lastLogin")}</span><strong>{selectedUser.last_login ? date(selectedUser.last_login) : t("common.never")}</strong></p>
          </div>
          <div className="form-actions">
            {canManageStaffAccount(selectedUser) && (
              <>
                <button className="secondary" onClick={() => startEdit(selectedUser)}>{t("admin.editUser")}</button>
                <button
                  className={selectedUser.is_active ? "danger" : "secondary"}
                  disabled={saving}
                  onClick={() => void toggle(selectedUser)}
                >
                  {selectedUser.is_active ? t("admin.deactivate") : t("admin.activate")}
                </button>
              </>
            )}
          </div>
        </section>
        </div>
      )}
      {confirmDeleteUser && selectedUser && createPortal(
        <div
          className="member-details-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setConfirmDeleteUser(false);
          }}
        >
          <section className="member-details-panel form-panel is-confirm" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title">
            <span className="eyebrow">{t("common.delete")}</span>
            <h3 id="admin-delete-title">{t("admin.deleteSure")}</h3>
            <p className="member-delete-copy">{t("admin.deleteConfirm", { name: selectedUser.username })}</p>
            <p className="member-delete-name">{selectedUser.first_name} {selectedUser.last_name}</p>
            <div className="form-actions">
              <button type="button" className="secondary" disabled={saving} onClick={() => setConfirmDeleteUser(false)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="danger" disabled={saving} onClick={() => void remove(selectedUser, { confirmed: true })}>
                {saving ? t("common.saving") : t("common.delete")}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {open && (
        <div className="member-details-overlay">
        <section className="panel form-panel member-details-panel admin-account-panel">
          <span className="eyebrow">{editing ? t("admin.edit") : t("admin.new")}</span>
          <FormSection title={t("form.personal")}>
            <FieldGrid>
              <Field label={t("admin.first")}>
                <input
                  required
                  value={form.first_name}
                  onChange={(event) =>
                    setForm({ ...form, first_name: event.target.value })
                  }
                />
              </Field>
              <Field label={t("admin.last")}>
                <input
                  required
                  value={form.last_name}
                  onChange={(event) =>
                    setForm({ ...form, last_name: event.target.value })
                  }
                />
              </Field>
              <Field label={t("common.email")} wide>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </Field>
            </FieldGrid>
          </FormSection>
          <FormSection title={t("form.account")}>
            <FieldGrid>
              {!editing && (
                <>
                  <Field label={t("admin.username")}>
                    <input
                      required
                      value={form.username}
                      onChange={(event) =>
                        setForm({ ...form, username: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("admin.password")}>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={form.password}
                      onChange={(event) =>
                        setForm({ ...form, password: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("admin.confirm")}>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={form.confirm_password}
                      onChange={(event) =>
                        setForm({ ...form, confirm_password: event.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              {editing && (
                <>
                  <Field label={t("admin.newPassword")} hint={t("admin.keep")}>
                    <input
                      type="password"
                      minLength={8}
                      placeholder={t("admin.keep")}
                      value={form.password}
                      onChange={(event) =>
                        setForm({ ...form, password: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("admin.confirm")}>
                    <input
                      type="password"
                      minLength={8}
                      value={form.confirm_password}
                      onChange={(event) =>
                        setForm({ ...form, confirm_password: event.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label={t("admin.role")} wide>
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm({ ...form, role: event.target.value })
                  }
                >
                  <option value="Admin">{t("role.admin")}</option>
                  <option value="Reception">{t("role.reception")}</option>
                  <option value="Trainer">{t("role.trainer")}</option>
                  {(canAssignSuper || form.role === "Super Admin") && (
                    <option value="Super Admin">{t("role.superAdmin")}</option>
                  )}
                </select>
              </Field>
            </FieldGrid>
          </FormSection>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? t("common.saving") : editing ? t("common.save") : t("admin.create")}
            </button>
          </div>
        </section>
        </div>
      )}
      <section className="panel table-wrap">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{t("admin.staffUsers")}</span>
            <h3>{t("admin.staff")}</h3>
          </div>
        </div>
        {usersLoading && <LoadingState label={t("admin.loadingUsers")} />}
        <table>
          <thead>
            <tr>
              <th>{t("admin.user")}</th>
              <th>{t("common.email")}</th>
              <th>{t("admin.role")}</th>
              <th>{t("common.status")}</th>
              <th>{t("admin.lastLogin")}</th>
            </tr>
          </thead>
          <tbody>
            {!usersLoading && users.map((user) => (
              <tr
                className="record-card record-card-user"
                key={user.id}
                onClick={() => { setConfirmDeleteUser(false); setSelectedUser(user); }}
              >
                <td className="record-name" data-label={t("admin.user")}>
                  <strong>
                    {user.first_name} {user.last_name}
                  </strong>
                  <Badge value={user.is_active ? "active" : "inactive"} />
                  <small>{user.username}</small>
                </td>
                <td className="record-plan" data-label={t("common.email")}>{user.email || "—"}</td>
                <td className="record-owing" data-label={t("admin.role")}>{user.role}</td>
                <td className="record-pay" data-label={t("common.status")}>
                  <Badge value={user.is_active ? "active" : "inactive"} />
                </td>
                <td className="record-period" data-label={t("admin.lastLogin")}>
                  {user.last_login ? date(user.last_login) : t("common.never")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!usersLoading && !users.length && <EmptyState title={t("admin.empty")} />}
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
  const { t } = useLang();
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
  const sections: Array<{ id: string; label: Msg }> = [
    { id: "General", label: "settings.general" },
    { id: "Gym Information", label: "settings.gymInfo" },
    { id: "Classes", label: "nav.classes" },
    { id: "Membership Plans", label: "nav.plans" },
    { id: "Payments", label: "nav.payments" },
    { id: "Opening Hours", label: "settings.hours" },
    { id: "Members", label: "nav.members" },
    { id: "Notifications", label: "nav.notifications" },
    { id: "Receipts", label: "settings.receipts" },
    { id: "Security", label: "settings.security" },
    { id: "Danger Zone", label: "settings.danger" },
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
      <PageHeader
        eyebrow={t("settings.title")}
        title={t("settings.title")}
        description={t("settings.intro")}
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>
        <section className="settings-body">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t(sections.find((item) => item.id === section)?.label || "settings.title")}</span>
              <h2>{t(sections.find((item) => item.id === section)?.label || "settings.title")}</h2>
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
                  <Plus size={16} /> {t("class.add")}
                </button>
              </div>
              <section className="panel settings-class-form form-panel">
                <span className="eyebrow">{t("class.create")}</span>
                <div className="date-fields">
                  <label>
                    {t("class.name")}
                    <input
                      value={classForm.name}
                      onChange={(event) =>
                        setClassForm({ ...classForm, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("class.type")}
                    <select
                      value={classForm.class_type}
                      onChange={(event) =>
                        setClassForm({
                          ...classForm,
                          class_type: event.target.value,
                        })
                      }
                    >
                      <option value="boxing">{t("class.typeBoxing")}</option>
                      <option value="kick_boxing">{t("class.typeKickboxing")}</option>
                      <option value="musculation">{t("class.typeMusculation")}</option>
                      <option value="aerobic">{t("class.typeAerobic")}</option>
                    </select>
                  </label>
                </div>
                <div className="date-fields">
                  <label>
                    {t("class.price")}
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
                    {t("common.status")}
                    <select
                      value={String(classForm.is_active)}
                      onChange={(event) =>
                        setClassForm({
                          ...classForm,
                          is_active: event.target.value === "true",
                        })
                      }
                    >
                      <option value="true">{t("common.active")}</option>
                      <option value="false">{t("common.inactive")}</option>
                    </select>
                  </label>
                </div>
                <div className="form-actions">
                  <button className="primary" onClick={createClass}>
                    {t("class.create")}
                  </button>
                </div>
              </section>
              <section className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("class.name")}</th>
                      <th>{t("class.members")}</th>
                      <th>{t("members.price")}</th>
                      <th>{t("common.status")}</th>
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
                <span className="eyebrow">{t("plans.create")}</span>
                <div className="date-fields">
                  <label>
                    {t("plans.name")}
                    <input
                      value={planForm.name}
                      onChange={(event) =>
                        setPlanForm({ ...planForm, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("plans.duration")}
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
                    {t("members.priceMad")}
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
                    {t("common.status")}
                    <select
                      value={String(planForm.is_active)}
                      onChange={(event) =>
                        setPlanForm({
                          ...planForm,
                          is_active: event.target.value === "true",
                        })
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
                    {t("plans.create")}
                  </button>
                </div>
              </section>
              <section className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("memberships.plan")}</th>
                      <th>{t("plans.duration")}</th>
                      <th>{t("members.price")}</th>
                      <th>{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>
                          {item.duration_months === 1 ? t("plans.oneMonth") : t("plans.nMonths", { n: item.duration_months })}
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
              <h3>{t("settings.paymentsTitle")}</h3>
              <p>{t("settings.paymentsP1")}</p>
              <p>{t("settings.paymentsP2")}</p>
            </section>
          )}
          {!["Classes", "Membership Plans", "Payments"].includes(section) && (
            <section className="panel settings-note">
              <h3>{t(sections.find((item) => item.id === section)?.label || "settings.title")}</h3>
              <p>{t("settings.unavailable")}</p>
              <p>{t("settings.unavailableHint")}</p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

void Settings;

function Member360Page({
  memberId,
  classes,
  plans,
  onBack,
  onUpdate,
  onDelete,
  onPayment,
  onCheckIn,
  onCheckOut,
}: {
  memberId: number;
  classes: FitnessClass[];
  plans: Plan[];
  onBack: () => void;
  onUpdate: OnMemberUpdate;
  onDelete: (id: number, options?: { confirmed?: boolean }) => Promise<boolean> | void;
  onPayment: OnPayment;
  onCheckIn: (id: number) => Promise<boolean> | void;
  onCheckOut: (id: number) => Promise<boolean> | void;
}) {
  const { t } = useLang();
  const [data, setData] = useState<Member360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const loadSeq = useRef(0);

  const load = async () => {
    const requestId = ++loadSeq.current;
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const profile = await gymApi.member360(memberId);
      if (requestId !== loadSeq.current) return;
      setData(profile);
    } catch (e) {
      if (requestId !== loadSeq.current) return;
      setData(null);
      if (isNotFoundError(e)) setNotFound(true);
      else setError(e instanceof Error ? e.message : t("m360.loadFail"));
    } finally {
      if (requestId === loadSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [memberId]);

  const afterAction = async (ok: boolean | void) => {
    if (ok !== false) await load();
    return ok !== false;
  };

  const currentMembership = data?.memberships.find((item) => isCurrentMembershipStatus(item.status));
  const currentVisit = data?.attendance.find((item) => item.is_inside);
  const location = data ? memberLocation(data.member) : "";
  const trainingClass = data?.training_class?.name || data?.member.class_name || "";

  const openEdit = () => {
    if (!data) return;
    setEditing(true);
  };

  const openPay = () => {
    if (!data || !currentMembership) return;
    setPaying(true);
  };

  const sendReminder = async () => {
    const reminder = data?.reminder;
    if (!reminder?.whatsapp_url || !isSafeWhatsAppUrl(reminder.whatsapp_url)) return;
    window.open(reminder.whatsapp_url, "_blank", "noopener,noreferrer");
    try {
      await gymApi.markReminderSent(reminder.membership_id, reminder.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("remind.markFail"));
    }
  };

  if (loading && !data) {
    return (
      <div className="content members-page member-360">
        <LoadingState label={t("common.loading")} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="content members-page member-360">
        <PageHeader
          eyebrow={t("m360.eyebrow")}
          title={t("m360.notFound")}
          description={t("m360.notFoundHint")}
          actions={
            <button type="button" className="secondary" onClick={onBack}>
              {t("m360.back")}
            </button>
          }
        />
        <EmptyState title={t("m360.notFound")} hint={t("m360.notFoundHint")} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="content members-page member-360">
        <PageHeader
          eyebrow={t("m360.eyebrow")}
          title={t("page.member360")}
          actions={
            <button type="button" className="secondary" onClick={onBack}>
              {t("m360.back")}
            </button>
          }
        />
        {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      </div>
    );
  }

  const member = data.member;
  const paymentByMembership = new Map(data.memberships.map((item) => [item.id, item.plan.name]));
  const remainingDue = Number(currentMembership?.remaining_balance || 0);
  const lastVisit = data.attendance[0];
  const memberRef = `#${String(member.id).padStart(5, "0")}${member.card_code ? ` · ${member.card_code}` : ""}`;
  const memberActions = (
    <>
      <button type="button" className="secondary" onClick={openEdit}>
        <span>{t("common.edit")}</span>
      </button>
      {currentMembership ? (
        <button type="button" className="primary" onClick={openPay}>
          <span>{t("pay.record")}</span>
        </button>
      ) : null}
      {currentVisit ? (
        <button
          type="button"
          className="secondary"
          onClick={() => void Promise.resolve(onCheckOut(member.id)).then(afterAction)}
        >
          <span>{t("att.checkOut")}</span>
        </button>
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={!currentMembership}
          title={currentMembership ? undefined : t("att.required")}
          onClick={() => void Promise.resolve(onCheckIn(member.id)).then(afterAction)}
        >
          <span>{t("att.checkIn")}</span>
        </button>
      )}
    </>
  );

  return (
    <div className="content members-page member-360">
      {editing && (
        <EditMemberOverlay
          member={member}
          classes={classes}
          plans={plans}
          currentMembership={currentMembership ? membershipFrom360(currentMembership) : undefined}
          onClose={() => setEditing(false)}
          onUpdate={async (id, payload) => {
            const ok = await afterAction(await onUpdate(id, payload));
            if (ok) setEditing(false);
            return ok;
          }}
        />
      )}
      {paying && currentMembership ? (
        <RecordPaymentOverlay
          memberLabel={member.name}
          membership={membershipFrom360(currentMembership)}
          planName={currentMembership.plan.name}
          onClose={() => setPaying(false)}
          onRefresh={load}
          onPayment={async (membershipId, payload) => {
            const payment = await onPayment(membershipId, payload);
            await load();
            return payment;
          }}
        />
      ) : null}
      {confirmDelete &&
        createPortal(
          <div
            className="member-details-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget && !deleting) setConfirmDelete(false);
            }}
          >
            <section className="member-details-panel form-panel is-confirm" role="dialog" aria-modal="true" aria-labelledby="member-delete-title">
              <span className="eyebrow">{t("common.delete")}</span>
              <h3 id="member-delete-title">{t("m360.deleteTitle")}</h3>
              <p className="member-delete-copy">{t("member.deleteConfirm")}</p>
              <p className="member-delete-name">{member.name}</p>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={deleting}
                  onClick={() =>
                    void (async () => {
                      setDeleting(true);
                      const ok = await onDelete(member.id, { confirmed: true });
                      setDeleting(false);
                      if (ok !== false) onBack();
                      else setConfirmDelete(false);
                    })()
                  }
                >
                  {deleting ? t("common.saving") : t("common.delete")}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
      <button type="button" className="text-button member-360-back" onClick={onBack}>
        {t("m360.back")}
      </button>
      <PageHeader
        eyebrow={`${t("m360.eyebrow")} · ${memberRef}`}
        title={
          <span className="record-name-line">
            {currentMembership?.status === "active" || (!currentMembership && member.is_active) ? (
              <span className="status-dot" title={t("status.active")} aria-label={t("status.active")} />
            ) : null}
            {member.name}
          </span>
        }
        description={t("m360.intro")}
        actions={memberActions}
      />
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      {notice && <Toast message={notice} onDismiss={() => setNotice("")} />}
      {loading && <LoadingState label={t("common.loading")} />}

      <div className="ledger-stats member-360-kpis">
        <div className={`ledger-stat${remainingDue > 0 ? " owing" : ""}`}>
          <span>{t("members.stillOwe")}</span>
          <strong>{currentMembership ? (remainingDue > 0 ? money(remainingDue) : t("members.settled")) : "—"}</strong>
          <small>{currentMembership?.plan.name || t("members.noPlan")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("m360.class")}</span>
          <strong>{trainingClass || "—"}</strong>
          <small>{t("m360.cardCode")}: {member.card_code || t("m360.noCard")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("m360.memberships")}</span>
          <strong>{data.memberships.length}</strong>
          <small>{currentMembership ? t("m360.current") : t("members.noMembership")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("m360.attendance")}</span>
          <strong>{data.attendance.length}</strong>
          <small>
            {currentVisit
              ? t("att.inside")
              : lastVisit
                ? `${t("m360.lastVisit")} · ${date(lastVisit.checked_in_at)}`
                : t("m360.noAttendance")}
          </small>
        </div>
      </div>

      <section className="panel form-panel member-360-profile">
        <div className="member-360-identity">
          <span className="member-360-avatar" aria-hidden="true">
            {(member.name.trim().slice(0, 1) || "M").toUpperCase()}
          </span>
          <div className="member-360-identity-copy">
            <span className="eyebrow">{memberRef}</span>
            <div className="member-360-name-row">
              <h3>{member.name}</h3>
              <div className="membership-details-badges">
                {currentMembership ? (
                  <>
                    {!member.is_active ? <Badge value="inactive" /> : null}
                    {currentMembership.status === "active" ? null : <Badge value={currentMembership.status} />}
                    <Badge value={currentMembership.payment_status} payment />
                  </>
                ) : member.is_active ? null : (
                  <Badge value="inactive" />
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="member-360-delete"
            aria-label={t("common.delete")}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={15} />
            <span>{t("common.delete")}</span>
          </button>
        </div>
        <div className="info-list">
          <p>
            <span>{t("common.phone")}</span>
            <strong>{member.phone || t("m360.noPhone")}</strong>
          </p>
          <p>
            <span>{t("common.email")}</span>
            <strong>{member.email || t("m360.noEmail")}</strong>
          </p>
          <p>
            <span>{t("members.cin")}</span>
            <strong>{member.id_number || t("members.noCin")}</strong>
          </p>
          <p>
            <span>{t("m360.class")}</span>
            <strong>{trainingClass || t("members.noClass")}</strong>
          </p>
          <p className="is-wide">
            <span>{t("m360.location")}</span>
            <strong>{location || t("m360.noAddress")}</strong>
          </p>
        </div>
      </section>

      {member.is_active ? (
        <section className="panel form-panel member-qr-card-panel">
          <MemberQrCard
            memberId={member.id}
            memberName={member.name}
            phone={member.phone}
            onError={setError}
            onNotice={setNotice}
          />
        </section>
      ) : null}

      <section className="panel table-wrap">
        <div className="panel-heading">
          <h3>{t("m360.memberships")}</h3>
          <span className="member-360-count">{data.memberships.length}</span>
        </div>
        {data.memberships.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("memberships.plan")}</th>
                <th>{t("members.startDate")}</th>
                <th>{t("remind.ends")}</th>
                <th>{t("members.price")}</th>
                <th>{t("members.paidCol")}</th>
                <th>{t("members.stillOwes")}</th>
                <th>{t("members.payment")}</th>
              </tr>
            </thead>
            <tbody>
              {data.memberships.map((item) => {
                const remaining = Number(item.remaining_balance || 0);
                const current = isCurrentMembershipStatus(item.status);
                return (
                  <tr className="record-card" key={item.id}>
                    <td className="record-name" data-label={t("memberships.plan")}>
                      <strong>{item.plan.name}</strong>
                      {current ? <span className="eyebrow">{t("m360.current")}</span> : null}
                      {item.status === "active" ? null : <Badge value={item.status} />}
                    </td>
                    <td data-label={t("members.startDate")}>{date(item.start_date)}</td>
                    <td data-label={t("remind.ends")}>{date(item.end_date)}</td>
                    <td className="record-price" data-label={t("members.price")}>{money(item.price)}</td>
                    <td className="record-paid" data-label={t("members.paidCol")}>{money(item.total_paid)}</td>
                    <td className="record-owing table-money" data-label={t("members.stillOwes")}>
                      <strong className={remaining > 0 ? "amount-owing" : "amount-settled"}>
                        {remaining > 0 ? money(remaining) : t("members.settled")}
                      </strong>
                    </td>
                    <td className="record-pay" data-label={t("members.payment")}>
                      <Badge value={item.payment_status} payment />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title={t("m360.noMemberships")} hint={t("m360.noMembershipsHint")} />
        )}
      </section>

      <section className="panel table-wrap">
        <div className="panel-heading">
          <h3>{t("m360.payments")}</h3>
          <span className="member-360-count">{data.payments.length}</span>
        </div>
        {data.payments.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("cash.receipt")}</th>
                <th>{t("memberships.plan")}</th>
                <th>{t("cash.date")}</th>
                <th>{t("cash.receivedBy")}</th>
                <th>{t("cash.method")}</th>
                <th>{t("members.paidCol")}</th>
                <th>{t("members.stillOwes")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((payment) => {
                const remaining = payment.remaining_balance == null ? null : Number(payment.remaining_balance);
                return (
                  <tr className="record-card" key={payment.id}>
                    <td className="record-name" data-label={t("cash.receipt")}>
                      <strong>{payment.receipt_number || t("cash.receipt")}</strong>
                      {payment.notes ? <span className="record-remain">{payment.notes}</span> : null}
                    </td>
                    <td className="record-plan" data-label={t("memberships.plan")}>
                      {paymentByMembership.get(payment.membership_id) || t("m360.membershipRef", { id: payment.membership_id })}
                    </td>
                    <td data-label={t("cash.date")}>{`${date(payment.received_at)} · ${clock(payment.received_at)}`}</td>
                    <td data-label={t("cash.receivedBy")}>{payment.received_by || "—"}</td>
                    <td data-label={t("cash.method")}>
                      {payment.payment_method === "cash" ? t("cash.cash") : payment.payment_method || "—"}
                    </td>
                    <td className="record-paid" data-label={t("members.paidCol")}>{money(payment.amount)}</td>
                    <td className="record-owing table-money" data-label={t("members.stillOwes")}>
                      {remaining == null ? "—" : (
                        <strong className={remaining > 0 ? "amount-owing" : "amount-settled"}>
                          {remaining > 0 ? money(remaining) : t("members.settled")}
                        </strong>
                      )}
                    </td>
                    <td className="record-actions" data-label={t("common.actions")}>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => void gymApi.openPaymentReceipt(payment.id).catch((e) => {
                            setError(e instanceof Error ? e.message : t("cash.receiptFail"));
                          })}
                        >
                          {t("cash.print")}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => void gymApi.downloadPaymentReceipt(payment.id).catch((e) => {
                            setError(e instanceof Error ? e.message : t("cash.receiptFail"));
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
        ) : (
          <EmptyState title={t("m360.noPayments")} hint={t("m360.noPaymentsHint")} />
        )}
      </section>

      <section className="panel table-wrap">
        <div className="panel-heading">
          <div>
            <h3>{t("m360.attendance")}</h3>
            {data.attendance.length >= 50 ? <p>{t("m360.attendanceHint")}</p> : null}
          </div>
          <span className="member-360-count">{data.attendance.length}</span>
        </div>
        {data.attendance.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("cal.date")}</th>
                <th>{t("members.class")}</th>
                <th>{t("att.inAt")}</th>
                <th>{t("att.outAt")}</th>
                <th>{t("m360.duration")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.attendance.map((visit) => (
                <tr className="record-card" key={visit.id}>
                  <td className="record-name" data-label={t("cal.date")}>
                    <strong>{date(visit.checked_in_at)}</strong>
                  </td>
                  <td className="record-plan" data-label={t("members.class")}>
                    {visit.class_name || t("att.noClass")}
                  </td>
                  <td data-label={t("att.inAt")}>{clock(visit.checked_in_at)}</td>
                  <td data-label={t("att.outAt")}>
                    {visit.checked_out_at ? clock(visit.checked_out_at) : visit.is_inside ? t("m360.stillInside") : "—"}
                  </td>
                  <td data-label={t("m360.duration")}>
                    {visitDurationLabel(visit.checked_in_at, visit.checked_out_at, t) || "—"}
                  </td>
                  <td data-label={t("common.status")}>
                    {visit.is_inside ? <Badge value="active" /> : t("m360.left")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title={t("m360.noAttendance")} hint={t("m360.noAttendanceHint")} />
        )}
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h3>{t("m360.reminder")}</h3>
          {data.reminder ? (
            <div className="membership-details-badges">
              <Badge value={data.reminder.status} />
              <Badge value={data.reminder.payment_status} payment />
            </div>
          ) : null}
        </div>
        {data.reminder ? (
          <>
            <div className="info-list">
              <p>
                <span>{t("remind.ends")}</span>
                <strong>{date(data.reminder.end_date)}</strong>
              </p>
              <p>
                <span>{t("remind.stillOwes")}</span>
                <strong>{money(data.reminder.remaining)}</strong>
              </p>
              <p>
                <span>{t("common.status")}</span>
                <strong>
                  {reasonLabel(data.reminder.reasons[0] || data.reminder.status, t)}
                </strong>
              </p>
              {data.reminder.last_sent_at ? (
                <p>
                  <span>{t("remind.today")}</span>
                  <strong>{`${date(data.reminder.last_sent_at)} · ${clock(data.reminder.last_sent_at)}`}</strong>
                </p>
              ) : null}
              {data.reminder.message ? (
                <p className="is-wide">
                  <span>{t("common.notes")}</span>
                  <strong>{data.reminder.message}</strong>
                </p>
              ) : null}
            </div>
            <div className="form-actions">
              {data.reminder.whatsapp_url && isSafeWhatsAppUrl(data.reminder.whatsapp_url) ? (
                <button type="button" className="primary" onClick={() => void sendReminder()}>
                  {t("remind.send")}
                </button>
              ) : (
                <span className="field-hint">{t("remind.addPhone")}</span>
              )}
            </div>
          </>
        ) : (
          <EmptyState title={t("m360.noReminder")} hint={t("m360.noReminderHint")} />
        )}
      </section>
    </div>
  );
}

function Members({
  people,
  query,
  setQuery,
  classes,
  plans,
  memberships,
  onCreate,
  onUpdate,
  onOpenProfile,
}: {
  people: Member[];
  query: string;
  setQuery: (value: string) => void;
  classes: FitnessClass[];
  plans: Plan[];
  memberships: Membership[];
  onOpenProfile: (id: number) => void;
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
  }) => Promise<boolean> | void;
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
  ) => Promise<boolean> | void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editingMembership, setEditingMembership] = useState<Membership | undefined>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<MemberFormErrors>({});
  const memberStatuses = useMemo(() => {
    const statuses: Record<number, string> = {};
    indexLatestMembership(memberships).forEach((membership, id) => {
      statuses[id] = membership.status;
    });
    return statuses;
  }, [memberships]);
  const membershipByMemberId = useMemo(() => indexLatestMembership(memberships), [memberships]);
  const membershipFor = (memberId: number) => membershipByMemberId.get(memberId);
  const [form, setForm] = useState<MemberFormState>(blankMemberForm);
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

  const closeForm = () => {
    setOpen(false);
    setEditingMember(null);
    setEditingMembership(undefined);
    setFormError("");
    setFieldErrors({});
  };

  const openCreateForm = () => {
    setEditingMember(null);
    setEditingMembership(undefined);
    setForm(blankMemberForm());
    setFormError("");
    setFieldErrors({});
    setOpen(true);
  };

  const submit = async () => {
    if (saving) return;
    const checked = validateMemberForm(
      form,
      editingMember ? "edit" : "create",
      t,
      Number(editingMembership?.total_paid || 0),
    );
    if (checked.summary) {
      setFieldErrors(checked.errors);
      setFormError(checked.summary);
      return;
    }
    const remainingValue = form.remaining === "" ? undefined : Number(form.remaining);
    setFormError("");
    setFieldErrors({});
    setSaving(true);
    try {
      if (editingMember) {
        const priceValue = form.price.trim();
        const originalRemaining = editingMembership ? Number(editingMembership.remaining_balance) : undefined;
        const remainingChanged = remainingValue !== undefined && remainingValue !== originalRemaining;
        const planId = form.plan_id ? Number(form.plan_id) : editingMembership?.plan_id || (plans[0] ? plans[0].id : undefined);
        const startDate = form.start_date || editingMembership?.start_date.slice(0, 10) || new Date().toISOString().slice(0, 10);
        const ok = await onUpdate(editingMember.id, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          id_number: form.id_number.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          country: editingMember.country || "Morocco",
          class_id: form.class_id ? Number(form.class_id) : null,
          price: priceValue === "" ? undefined : Number(priceValue),
          remaining: remainingChanged ? remainingValue : undefined,
          plan_id: planId,
          start_date: startDate,
          membership: editingMembership
            ? {
                id: editingMembership.id,
                plan_id: planId || editingMembership.plan_id,
                start_date: startDate,
                notes: editingMembership.notes || "",
              }
            : undefined,
        });
        if (ok === false) return;
        setForm(blankMemberForm());
        closeForm();
        return;
      }
      const paid = Number(form.amount_paid || 0);
      const ok = await onCreate({
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
        amount_paid: paid,
        remaining: remainingValue,
      });
      if (ok === false) return;
      setForm(blankMemberForm());
      closeForm();
    } finally {
      setSaving(false);
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
    link.download = `AUMB-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        window.alert(error instanceof Error ? error.message : t("backup.restoreFail"));
      } finally {
        setImporting(false);
      }
    })();
  };

  return (
    <div className="content members-page">
      <PageHeader
        eyebrow={t("members.eyebrow")}
        title={t("members.title")}
        description={t("members.intro")}
        actions={
          <>
            <button
              type="button"
              className="secondary"
              disabled={importing}
              aria-label={t("common.export")}
              onClick={() => void exportBackup()}
            >
              <Download size={15} />
              <span>{t("common.export")}</span>
            </button>
            <button
              type="button"
              className="secondary"
              disabled={importing}
              aria-label={t("common.import")}
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload size={15} />
              <span>{importing ? t("backup.busy") : t("common.import")}</span>
            </button>
            <button
              type="button"
              className="primary"
              onClick={openCreateForm}
              aria-label={t("members.add")}
            >
              <Plus size={16} />
              <span>{t("members.add")}</span>
            </button>
          </>
        }
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={importBackup}
      />
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
          <option value="">{t("members.allClasses")}</option>
          <option value="none">{t("members.noClass")}</option>
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
          <option value="">{t("members.allStatuses")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="expiring_soon">{t("status.expiring_soon")}</option>
          <option value="expired">{t("status.expired")}</option>
          <option value="none">{t("members.noMembership")}</option>
        </select>
      </div>
      {open &&
        createPortal(
          <div
            className="member-details-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget && !saving) closeForm();
            }}
          >
            <section className="member-details-panel form-panel member-form is-wide">
              <span className="eyebrow">{editingMember ? t("members.editHead") : t("members.new")}</span>
              <MemberRecordFields
                mode={editingMember ? "edit" : "create"}
                form={form}
                setForm={setForm}
                classes={classes}
                plans={plans}
                errors={fieldErrors}
                onFieldEdit={(field) => {
                  setFieldErrors((current) => {
                    if (!current[field]) return current;
                    const next = { ...current };
                    delete next[field];
                    return next;
                  });
                }}
              />
              {formError && <Alert onDismiss={() => setFormError("")}>{formError}</Alert>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={closeForm} disabled={saving}>
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void submit()}
                  disabled={saving}
                >
                  {saving ? t("common.saving") : editingMember ? t("common.save") : t("members.create")}
                </button>
              </div>
            </section>
          </div>,
          document.body,
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
            </tr>
          </thead>
          <tbody>
            {pagedPeople.map((member) => {
              const membership = membershipFor(member.id);
              const memberStatus = memberStatuses[member.id];
              const remaining = Number(membership?.remaining_balance || 0);
              const status = memberStatus || membership?.status;
              const isActive = status === "active";
              return (
                <tr className="record-card record-card-member" key={member.id} onClick={() => onOpenProfile(member.id)}>
                  <td className="record-name" data-label={t("dash.member")}>
                    <span className="record-name-line">
                      {isActive ? (
                        <span className="status-dot" title={t("status.active")} aria-label={t("status.active")} />
                      ) : null}
                      <strong>{member.name}</strong>
                    </span>
                    {membership ? (
                      isActive || !status ? null : <Badge value={status} />
                    ) : (
                      <span className="status expired">{t("members.noPlan")}</span>
                    )}
                    {membership ? (
                      <span
                        className={`record-remain${
                          memberStatus === "expired" || (memberStatus === "expiring_soon")
                            ? memberStatus === "expired"
                              ? " is-expired"
                              : " is-soon"
                            : ""
                        }`}
                      >
                        {membershipRemainLabel(membership.end_date, memberStatus || membership.status, t)}
                      </span>
                    ) : null}
                  </td>
                  <td className="record-plan" data-label={t("members.class")}>{member.class_name || t("members.noClass")}</td>
                  <td className="record-price" data-label={t("members.price")}>{membership ? money(membership.price) : "—"}</td>
                  <td className="record-paid" data-label={t("members.paidCol")}>{membership ? money(membership.total_paid) : "—"}</td>
                  <td className="record-owing table-money" data-label={t("members.stillOwes")}>
                    <strong className={remaining > 0 ? "amount-owing" : "amount-settled"}>
                      {membership ? (remaining > 0 ? money(remaining) : t("members.settled")) : "—"}
                    </strong>
                  </td>
                  <td className="record-pay" data-label={t("members.payment")}>
                    {membership ? (
                      <Badge value={membership.payment_status} payment />
                    ) : (
                      <span className="status expired">{t("members.noPlan")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMoreBar shown={shown} total={visiblePeople.length} onMore={() => setShown((n) => n + PAGE_SIZE)} />
        {!visiblePeople.length && (
          <EmptyState title={people.length ? t("members.emptyFilter") : t("members.empty")} />
        )}
      </section>
    </div>
  );
}

function ClassesPage({
  classes,
  trainers,
  canAdminister,
  canManageSchedules,
  onCreate,
  onUpdate,
  onDelete,
}: {
  classes: FitnessClass[];
  trainers: Trainer[];
  canAdminister: boolean;
  canManageSchedules: boolean;
  onCreate: (payload: {
    name: string;
    class_type: string;
    price_per_member: number | string;
    is_active?: boolean;
  }) => Promise<boolean> | void;
  onUpdate: (
    id: number,
    payload: {
      name: string;
      class_type: string;
      price_per_member: number | string;
      is_active?: boolean;
    },
  ) => Promise<boolean> | void;
  onDelete: (id: number) => Promise<boolean> | void;
}) {
  const { t } = useLang();
  const [section, setSection] = useState<"classes" | "calendar">("classes");
  const emptyForm = {
    name: "",
    class_type: "boxing",
    price_per_member: "100",
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const saveClass = async () => {
    if (saving || !form.name.trim()) return;
    const price = Number(form.price_per_member || 0);
    if (!Number.isFinite(price) || price < 0) return;
    const payload = {
      name: form.name.trim(),
      class_type: form.class_type,
      price_per_member: price,
      is_active: form.is_active,
    };
    setSaving(true);
    try {
      const ok = editingId ? await onUpdate(editingId, payload) : await onCreate(payload);
      if (ok === false) return;
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const removeClass = async (item: FitnessClass) => {
    if (saving || !window.confirm(t("class.confirmDelete"))) return;
    setSaving(true);
    try {
      const ok = await onDelete(item.id);
      if (ok === false) return;
      if (selectedId === item.id) setSelectedId(null);
      if (editingId === item.id) closeForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content classes-page">
      <PageHeader
        eyebrow={t("class.eyebrow")}
        title={t("class.title")}
        description={
          section === "calendar"
            ? canAdminister
              ? t("cal.intro")
              : t("cal.staff")
            : canAdminister
              ? t("class.intro")
              : t("class.staff")
        }
        actions={
          canAdminister && section === "classes" ? (
            <button
              type="button"
              className="primary"
              onClick={openCreate}
              aria-label={t("class.add")}
            >
              <Plus size={16} />
              <span>{t("class.add")}</span>
            </button>
          ) : undefined
        }
      />
      <div className="toolbar class-page-toolbar">
        <div className="class-view-switch" role="tablist" aria-label={t("nav.classes")}>
          <button
            type="button"
            className={`class-view-switch-btn${section === "classes" ? " active" : ""}`}
            onClick={() => setSection("classes")}
          >
            {t("cal.classes")}
          </button>
          <button
            type="button"
            className={`class-view-switch-btn${section === "calendar" ? " active" : ""}`}
            onClick={() => setSection("calendar")}
          >
            {t("cal.calendar")}
          </button>
        </div>
      </div>
      {section === "calendar" ? (
        <ClassCalendar
          classes={classes}
          trainers={trainers}
          canManageSchedules={canManageSchedules}
        />
      ) : (
      <>
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
                <option value="boxing">{t("class.typeBoxing")}</option>
                <option value="kick_boxing">{t("class.typeKickboxing")}</option>
                <option value="musculation">{t("class.typeMusculation")}</option>
                <option value="aerobic">{t("class.typeAerobic")}</option>
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
            <button className="secondary" onClick={closeForm} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button className="primary" onClick={() => void saveClass()} disabled={saving}>
              {saving ? t("common.saving") : editing ? t("class.save") : t("class.add")}
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
              <strong>{classTypeLabel(selected.class_type, t)}</strong>
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
              <button className="secondary" disabled={saving} onClick={() => void removeClass(selected)}>
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
                <tr className="record-card record-card-class" key={item.id}>
                  <td className="record-name" data-label={t("class.name")}>
                    <strong>{item.name}</strong>
                    <Badge value={item.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="record-owing" data-label={t("class.members")}>{item.member_count}</td>
                  <td className="record-plan" data-label={t("class.type")}>{classTypeLabel(item.class_type, t)}</td>
                  <td className="record-pay" data-label={t("common.status")}>
                    <Badge value={item.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="record-actions" data-label={t("common.actions")}>
                    <div className="table-actions">
                      <button type="button" className="text-button" onClick={() => setSelectedId(item.id)}>
                        {t("class.view")}
                      </button>
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
      </>
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
  ) => Promise<boolean> | void;
  onUpdate: (
    id: number,
    payload: {
      member_id: number;
      plan_id: number;
      start_date: string;
      notes: string;
    },
  ) => Promise<boolean> | void;
  onDelete: (id: number, options?: { confirmed?: boolean }) => Promise<boolean> | void;
  onSetPaymentStatus: (membership: Membership, status: "paid" | "unpaid") => Promise<boolean> | void;
  onPayment: OnPayment;
}) {
  const { t } = useLang();
  void onUpdate;

  const [paymentTarget, setPaymentTarget] = useState<Membership | null>(null);
  const addPayment = (membership: Membership) => {
    setPaymentTarget(membership);
  };
  useEffect(() => {
    if (!paymentTarget) return;
    const latest = items.find((item) => item.id === paymentTarget.id);
    if (latest && latest !== paymentTarget) setPaymentTarget(latest);
  }, [items, paymentTarget]);
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
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewForm, setRenewForm] = useState({
    plan_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    notes: t("memberships.renewNote"),
  });

  const openRenew = (item: Membership) => {
    setRenewId(item.id);
    setRenewForm({
      plan_id: String(item.plan_id),
      start_date: item.end_date,
      notes: t("memberships.renewNoteFor", { name: memberName(item.member_id) }),
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
    label.textContent = t("membership.details");
    const tools = document.createElement("div");
    tools.className = "membership-details-tools";
    const remove = document.createElement("button");
    remove.className = "membership-details-delete";
    remove.type = "button";
    remove.setAttribute("aria-label", t("common.delete"));
    remove.title = t("common.delete");
    remove.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
    remove.onclick = () => {
      panel.className = "member-details-panel form-panel is-confirm";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-labelledby", "membership-delete-title");
      panel.replaceChildren();
      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = t("common.delete");
      const title = document.createElement("h3");
      title.id = "membership-delete-title";
      title.textContent = t("membership.deleteTitle");
      const copy = document.createElement("p");
      copy.className = "member-delete-copy";
      copy.textContent = t("membership.deleteHint");
      const name = document.createElement("p");
      name.className = "member-delete-name";
      name.textContent = memberName(item.member_id);
      const confirmActions = document.createElement("div");
      confirmActions.className = "form-actions";
      const cancel = document.createElement("button");
      cancel.className = "secondary";
      cancel.type = "button";
      cancel.textContent = t("common.cancel");
      cancel.onclick = () => showMembershipDetails(item);
      const confirm = document.createElement("button");
      confirm.className = "danger";
      confirm.type = "button";
      confirm.textContent = t("common.delete");
      confirm.onclick = () => {
        confirm.disabled = true;
        cancel.disabled = true;
        void Promise.resolve(onDelete(item.id, { confirmed: true })).then((ok) => {
          if (ok !== false) dismissOverlay(overlay);
          else showMembershipDetails(item);
        });
      };
      confirmActions.append(cancel, confirm);
      panel.append(eyebrow, title, copy, name, confirmActions);
    };
    const close = document.createElement("button");
    close.className = "membership-details-x";
    close.type = "button";
    close.setAttribute("aria-label", t("common.close"));
    close.textContent = "×";
    close.onclick = () => dismissOverlay(overlay);
    tools.append(remove, close);
    const heading = document.createElement("h2");
    heading.textContent = memberName(item.member_id);
    const badges = document.createElement("div");
    badges.className = "membership-details-badges";
    const statusBadge = document.createElement("span");
    statusBadge.className = `status ${item.status}`;
    statusBadge.textContent = statusLabel(item.status);
    const paymentBadge = document.createElement("span");
    paymentBadge.className = `status payment ${item.payment_status}`;
    paymentBadge.textContent = statusLabel(item.payment_status);
    badges.append(statusBadge, paymentBadge);
    head.append(label, tools, heading, badges);

    const grid = document.createElement("div");
    grid.className = "membership-details-grid";
    const fields = [
      [t("memberships.plan"), planName(item.plan_id)],
      [t("members.price"), money(item.price)],
      [t("members.startDate"), date(item.start_date)],
      [t("remind.ends"), date(item.end_date)],
      [t("members.paidCol"), money(item.total_paid)],
      [t("members.stillOwes"), money(item.remaining_balance)],
    ];
    fields.forEach(([key, value]) => {
      const cell = document.createElement("div");
      if (key === t("members.stillOwes") && Number(item.remaining_balance) > 0) cell.className = "remaining";
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
    renew.textContent = t("memberships.renew");
    renew.onclick = () => {
      dismissOverlay(overlay);
      openRenew(item);
    };
    const pay = document.createElement("button");
    pay.className = "secondary";
    pay.textContent = t("pay.record");
    pay.onclick = () => {
      dismissOverlay(overlay);
      addPayment(item);
    };
    actions.append(renew, pay);
    panel.append(head, grid, actions);
    overlay.append(panel);
    document.body.append(overlay);
  };

  const submitRenew = async () => {
    if (renewSaving || renewId === null || !renewForm.plan_id) return;
    setRenewSaving(true);
    try {
      const ok = await onRenew(renewId, {
        member_id: items.find((item) => item.id === renewId)?.member_id || 0,
        plan_id: Number(renewForm.plan_id),
        start_date: renewForm.start_date,
        notes: renewForm.notes,
      });
      if (ok === false) return;
      setRenewId(null);
      setRenewForm({
        plan_id: "",
        start_date: new Date().toISOString().slice(0, 10),
        notes: t("memberships.renewNote"),
      });
    } finally {
      setRenewSaving(false);
    }
  };

  return (
    <div className="content memberships-page">
      {paymentTarget ? (
        <RecordPaymentOverlay
          memberLabel={memberName(paymentTarget.member_id)}
          membership={paymentTarget}
          planName={planName(paymentTarget.plan_id)}
          onClose={() => setPaymentTarget(null)}
          onPayment={onPayment}
        />
      ) : null}
      <PageHeader
        eyebrow={t("memberships.eyebrow")}
        title={t("memberships.title")}
        description={t("memberships.intro")}
      />
      <div className="ledger-stats">
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "" ? "active" : ""}`}
          onClick={() => setPaymentFilter("")}
        >
          <span>{t("memberships.all")}</span>
          <strong>{items.length}</strong>
          <small>{t("memberships.every")}</small>
        </button>
        <button
          type="button"
          className={`ledger-stat owing ${paymentFilter === "owing" ? "active" : ""}`}
          onClick={() => setPaymentFilter("owing")}
        >
          <span>{t("members.stillOwe")}</span>
          <strong>{money(moneySummary.owingTotal)}</strong>
          <small>{t("memberships.owingCount", { n: moneySummary.owing })}</small>
        </button>
        <button
          type="button"
          className={`ledger-stat ${paymentFilter === "paid" ? "active" : ""}`}
          onClick={() => setPaymentFilter("paid")}
        >
          <span>{t("members.paid")}</span>
          <strong>{moneySummary.paid}</strong>
          <small>{t("memberships.settled")}</small>
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
          <option value="">{t("members.allStatuses")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="expiring_soon">{t("status.expiring_soon")}</option>
          <option value="expired">{t("status.expired")}</option>
          <option value="cancelled">{t("status.cancelled")}</option>
        </select>
      </div>
      {renewId !== null && (
        <section className="panel form-panel">
          <span className="eyebrow">{t("memberships.renew")}</span>
          <div className="date-fields">
            <label>
              {t("memberships.plan")}
              <select
                value={renewForm.plan_id}
                onChange={(event) =>
                  setRenewForm({ ...renewForm, plan_id: event.target.value })
                }
              >
                <option value="">{t("members.selectPlan")}</option>
                {selectablePlans(plans, renewForm.plan_id).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("memberships.renewFrom")}
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
            {t("common.notes")}
            <input
              value={renewForm.notes}
              onChange={(event) =>
                setRenewForm({ ...renewForm, notes: event.target.value })
              }
            />
          </label>
          <div className="form-actions">
            <button className="secondary" onClick={() => setRenewId(null)} disabled={renewSaving}>
              {t("common.cancel")}
            </button>
            <button className="primary" onClick={() => void submitRenew()} disabled={renewSaving}>
              {renewSaving ? t("common.saving") : t("memberships.renew")}
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
              <tr className="record-card record-card-membership" key={item.id} onClick={() => showMembershipDetails(item)}>
                <td className="record-name" data-label={t("dash.member")}>
                  <span className="record-name-line">
                    {item.status === "active" ? (
                      <span className="status-dot" title={t("status.active")} aria-label={t("status.active")} />
                    ) : null}
                    <strong>{memberName(item.member_id)}</strong>
                  </span>
                  {item.status === "active" ? null : <Badge value={item.status} />}
                </td>
                <td className="record-plan" data-label={t("memberships.plan")}>{planName(item.plan_id)}</td>
                <td className="record-period" data-label={t("memberships.period")}>
                  {date(item.start_date)}
                  <small>{t("memberships.to", { date: date(item.end_date) })}</small>
                </td>
                <td className="record-price" data-label={t("members.price")}>{money(item.price)}</td>
                <td className="record-paid" data-label={t("members.paidCol")}>{money(item.total_paid)}</td>
                <td className="record-owing table-money" data-label={t("members.stillOwes")}>
                  <strong className={remaining > 0 ? "amount-owing" : "amount-settled"}>
                    {remaining > 0 ? money(remaining) : t("members.settled")}
                  </strong>
                </td>
                <td className="record-pay" data-label={t("members.payment")}>
                  <Badge value={item.payment_status} payment />
                </td>
                <td className="record-actions" data-label={t("common.actions")}>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addPayment(item);
                      }}
                    >
                      {t("pay.record")}
                    </button>
                    <button
                      type="button"
                      className={`payment-status-action ${item.payment_status === "paid" ? "paid" : "unpaid"}`}
                      title={t("pay.markPaid")}
                      aria-label={t("pay.markPaid")}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetPaymentStatus(item, "paid");
                      }}
                    >
                      <Check size={12} strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      className={`payment-status-action ${item.payment_status === "unpaid" ? "unpaid" : "paid"}`}
                      title={t("pay.markUnpaid")}
                      aria-label={t("pay.markUnpaid")}
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
          <EmptyState title={items.length ? t("memberships.emptyFilter") : t("memberships.empty")} />
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
  }) => Promise<boolean> | void;
  onUpdate: (
    id: number,
    payload: {
      name: string;
      duration_months: number;
      price: number | string;
      description: string;
      is_active: boolean;
    },
  ) => Promise<boolean> | void;
  onDelete: (id: number) => Promise<boolean> | void;
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
  const [saving, setSaving] = useState(false);
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

  const savePlan = async () => {
    if (saving || !form.name.trim()) return;
    const payload = payloadFromForm();
    if (!Number.isFinite(Number(payload.price)) || Number(payload.price) < 0) return;
    if (!Number.isFinite(payload.duration_months) || payload.duration_months < 1) return;
    setSaving(true);
    try {
      const ok = editingId ? await onUpdate(editingId, payload) : await onCreate(payload);
      if (ok === false) return;
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const deactivatePlan = (item: Plan) => {
    void onUpdate(item.id, {
      name: item.name,
      duration_months: item.duration_months,
      price: item.price,
      description: item.description || "",
      is_active: false,
    });
  };

  const removePlan = async (item: Plan) => {
    if (saving || !window.confirm(t("plans.confirmDelete"))) return;
    setSaving(true);
    try {
      const ok = await onDelete(item.id);
      if (ok === false) return;
      if (selectedId === item.id) setSelectedId(null);
      if (editingId === item.id) closeForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content plans-page">
      <PageHeader
        eyebrow={t("plans.eyebrow")}
        title={t("plans.title")}
        description={canAdminister ? t("plans.intro") : t("plans.staff")}
        actions={
          canAdminister ? (
            <button
              type="button"
              className="primary"
              onClick={openCreate}
              aria-label={t("plans.add")}
            >
              <Plus size={16} />
              <span>{t("plans.add")}</span>
            </button>
          ) : undefined
        }
      />
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
            <button className="secondary" onClick={closeForm} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button className="primary" onClick={() => void savePlan()} disabled={saving}>
              {saving ? t("common.saving") : editing ? t("plans.save") : t("plans.add")}
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
                <tr
                  className="record-card record-card-plan"
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <td className="record-name" data-label={t("plans.name")}>
                    <strong>{item.name}</strong>
                    <Badge value={item.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="record-plan" data-label={t("plans.duration")}>
                    {planDurationLabel(item.duration_months, t)}
                  </td>
                  <td className="record-owing" data-label={t("plans.price")}>
                    <strong>{money(item.price)}</strong>
                  </td>
                  <td className="record-period" data-label={t("plans.members")}>
                    {item.member_count || 0}
                  </td>
                  <td className="record-pay" data-label={t("common.status")}>
                    <Badge value={item.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="record-actions" data-label={t("common.actions")}>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="text-button plan-view-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(item.id);
                        }}
                      >
                        {t("plans.view")}
                      </button>
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
  const [paymentTarget, setPaymentTarget] = useState<{ membership: Membership; memberLabel: string } | null>(null);
  useEffect(() => {
    if (!paymentTarget) return;
    const latest = memberships.find((item) => item.id === paymentTarget.membership.id);
    if (
      latest &&
      (latest.remaining_balance !== paymentTarget.membership.remaining_balance ||
        latest.total_paid !== paymentTarget.membership.total_paid ||
        latest.price !== paymentTarget.membership.price)
    ) {
      setPaymentTarget({ ...paymentTarget, membership: latest });
    }
  }, [memberships, paymentTarget]);
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
    return memberById.get(membership.member_id)?.name || t("members.unknown");
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
    setPaymentTarget({ membership, memberLabel });
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
    <div className="content cash-page">
      {paymentTarget ? (
        <RecordPaymentOverlay
          memberLabel={paymentTarget.memberLabel}
          membership={paymentTarget.membership}
          onClose={() => setPaymentTarget(null)}
          onPayment={async (membershipId, payload) => {
            const payment = await onPayment(membershipId, payload);
            if (payment && typeof payment === "object" && "id" in payment) {
              try {
                await gymApi.openPaymentReceipt(payment.id);
              } catch {
                /* receipt is optional after a successful take */
              }
            }
            return payment;
          }}
        />
      ) : null}
      <PageHeader
        eyebrow={t("cash.eyebrow")}
        title={t("cash.title")}
        description={t("cash.intro")}
      />
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
        <button className="primary" type="submit" disabled={!query.trim()} aria-label={t("cash.find")}>
          <Search size={16} />
          <span>{t("cash.find")}</span>
        </button>
      </form>
      {lookupError && (
        <Alert onDismiss={() => setLookupError("")} dismissLabel={t("common.dismiss")}>
          {lookupError}
        </Alert>
      )}
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
              const name = member?.name || t("members.unknown");
              return (
                <tr className="record-card record-card-owing" key={membership.id}>
                  <td className="record-name" data-label={t("dash.member")}>
                    <strong>{name}</strong>
                    <small>
                      {member?.id_number ? `CIN ${member.id_number}` : ""}
                      {member?.phone ? `${member.id_number ? " · " : ""}${member.phone}` : ""}
                    </small>
                  </td>
                  <td className="record-owing table-money" data-label={t("members.stillOwes")}>
                    <strong className="amount-owing">{money(membership.remaining_balance)}</strong>
                  </td>
                  <td className="record-actions" data-label={t("common.actions")}>
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
        {!owing.length && <EmptyState title={t("cash.settled")} />}
      </section>
      {deskError && (
        <Alert onDismiss={() => setDeskError("")} dismissLabel={t("common.dismiss")}>
          {deskError}
        </Alert>
      )}
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
                size={1}
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
          </div>
          <div className="cash-log-export">
            <button
              type="button"
              className="secondary"
              disabled={Boolean(exporting)}
              aria-label={exporting === "xlsx" ? t("rep.exporting") : t("cash.excel")}
              onClick={() => void downloadLog("xlsx")}
            >
              <FileSpreadsheet size={15} />
              <span>{exporting === "xlsx" ? t("rep.exporting") : t("cash.excel")}</span>
            </button>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(exporting)}
              aria-label={exporting === "pdf" ? t("rep.exporting") : t("cash.pdf")}
              onClick={() => void downloadLog("pdf")}
            >
              <FileText size={15} />
              <span>{exporting === "pdf" ? t("rep.exporting") : t("cash.pdf")}</span>
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
                <tr className="record-card record-card-payment" key={payment.id}>
                  <td className="record-name" data-label={t("dash.member")}>
                    <strong>{labelFor(payment)}</strong>
                    <small>{t("cash.receiptN", { n: receipt })}</small>
                  </td>
                  <td className="record-period" data-label={t("cash.date")}>
                    {date(payment.received_at)}
                    <small>{clock(payment.received_at)}</small>
                  </td>
                  <td className="record-owing" data-label={t("common.amount")}>
                    <strong>{money(payment.amount)}</strong>
                  </td>
                  <td className="record-pay" data-label={t("cash.method")}>
                    <Badge value="paid" payment /> {t("cash.cash")}
                  </td>
                  <td className="record-plan" data-label={t("cash.receivedBy")}>{payment.received_by}</td>
                  <td className={`record-paid${payment.notes ? "" : " is-empty"}`} data-label={t("common.notes")}>{payment.notes || "—"}</td>
                  <td className="record-actions" data-label={t("common.actions")}>
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
          <EmptyState title={payments.length ? t("cash.emptyFilter") : t("cash.empty")} />
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
  onOpenProfile,
}: {
  records: Attendance[];
  members: Member[];
  memberships: Membership[];
  classes: FitnessClass[];
  onCheckIn: (id: number) => Promise<boolean> | void;
  onCheckOut: (id: number) => Promise<boolean> | void;
  onOpenProfile: (id: number) => void;
}) {
  const { t } = useLang();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [matches, setMatches] = useState<Member[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

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
    item.member_name || memberById.get(item.member_id)?.name || t("members.unknown");
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
    let ok = false;
    if (member.is_inside || insideVisit(member.id)) {
      ok = (await onCheckOut(member.id)) !== false;
    } else if (member.can_check_in !== false && canEnter(member.id)) {
      ok = (await onCheckIn(member.id)) !== false;
    } else {
      setLookupError(t("att.expired"));
      return;
    }
    if (!ok) return;
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
      <PageHeader
        eyebrow={t("att.eyebrow")}
        title={t("att.title")}
        description={t("att.intro")}
      />
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
        <button className="secondary" type="submit" disabled={lookupBusy || !query.trim()}>
          <Search size={16} /> {t("att.find")}
        </button>
        <button className="primary att-scan-qr" type="button" onClick={() => setScannerOpen(true)}>
          <QrCode size={18} />
          <span>{t("qr.scan")}</span>
        </button>
      </form>
      {scannerOpen ? (
        <MemberQrScanner
          memberships={memberships}
          isInside={(id) => Boolean(insideVisit(id))}
          canCheckIn={(id) => canEnter(id)}
          onCheckIn={onCheckIn}
          onCheckOut={onCheckOut}
          onOpenProfile={(id) => {
            setScannerOpen(false);
            onOpenProfile(id);
          }}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
      {lookupError && (
        <Alert onDismiss={() => setLookupError("")} dismissLabel={t("common.dismiss")}>
          {lookupError}
        </Alert>
      )}
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
          <MemberQrCard
            memberId={selected.id}
            memberName={selected.name}
            phone={selected.phone}
            compact
            onError={setLookupError}
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
          <EmptyState title={t("att.empty")} />
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
          <EmptyState title={t("att.emptyIn")} />
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
          <EmptyState title={t("att.empty")} />
        )}
      </section>
    </div>
  );
}

function Trainers({
  trainers,
  canAdminister,
  onCreate,
  onUpdate,
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
  }) => Promise<boolean> | void;
  onUpdate: (
    id: number,
    payload: {
      first_name: string;
      last_name: string;
      specialization?: string;
      phone?: string;
      monthly_pay?: number | string;
    },
  ) => Promise<boolean> | void;
  onUpdatePayroll: (
    id: number,
    payload: {
      year?: number;
      month?: number;
      pay_amount?: number | string;
      is_paid?: boolean;
    },
  ) => Promise<boolean> | void;
  onDelete: (id: number) => Promise<boolean> | void;
}) {
  const { t } = useLang();
  const now = new Date();
  const months = reportMonths();
  const [selected, setSelected] = useState(`${now.getFullYear()}-${now.getMonth() + 1}`);
  const [year, month] = selected.split("-").map(Number);
  const [rows, setRows] = useState<Trainer[]>(trainers);
  const [open, setOpen] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    specialization: "",
    phone: "",
    monthly_pay: "",
  });

  useEffect(() => {
    let cancelled = false;
    void gymApi
      .trainers(year, month)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setSelectedTrainer((current) => (current ? next.find((row) => row.id === current.id) ?? null : current));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
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

  const resetForm = () => {
    setForm({
      first_name: "",
      last_name: "",
      specialization: "",
      phone: "",
      monthly_pay: "",
    });
    setEditing(null);
    setOpen(false);
  };
  const openCreate = () => {
    setSelectedTrainer(null);
    setConfirmDelete(false);
    setEditing(null);
    setForm({
      first_name: "",
      last_name: "",
      specialization: "",
      phone: "",
      monthly_pay: "",
    });
    setOpen(true);
  };
  const startEdit = (trainer: Trainer) => {
    setSelectedTrainer(null);
    setConfirmDelete(false);
    setEditing(trainer);
    setForm({
      first_name: trainer.first_name,
      last_name: trainer.last_name,
      specialization: trainer.specialization || "",
      phone: trainer.phone || "",
      monthly_pay: trainer.monthly_pay === "" || trainer.monthly_pay == null ? "" : String(trainer.monthly_pay),
    });
    setOpen(true);
  };
  const submit = async () => {
    if (saving || !form.first_name.trim() || !form.last_name.trim()) return;
    const monthly = form.monthly_pay === "" ? 0 : Number(form.monthly_pay);
    if (!Number.isFinite(monthly) || monthly < 0) return;
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        specialization: form.specialization.trim(),
        phone: form.phone.trim(),
        monthly_pay: monthly,
      };
      const ok = editing ? await onUpdate(editing.id, payload) : await onCreate(payload);
      if (ok === false) return;
      resetForm();
    } finally {
      setSaving(false);
    }
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
    label.textContent = t("train.payHead");
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
    save.onclick = async () => {
      const [payYear, payMonth] = monthSelect.value.split("-").map(Number);
      const pay =
        payInput.value.trim() === ""
          ? Number(trainer.monthly_pay || 0)
          : Number(payInput.value);
      if (!Number.isFinite(pay) || pay < 0) return;
      save.disabled = true;
      setSelected(`${payYear}-${payMonth}`);
      try {
        const ok = await onUpdatePayroll(trainer.id, {
          year: payYear,
          month: payMonth,
          pay_amount: pay,
        });
        if (ok === false) {
          save.disabled = false;
          return;
        }
        dismissOverlay(overlay);
      } catch {
        save.disabled = false;
      }
    };
    actions.append(cancel, save);
    panel.append(label, heading, monthField, payField, actions);
    overlay.append(panel);
    document.body.append(overlay);
    payInput.focus();
  };

  return (
    <div className="content trainers-page">
      <PageHeader
        eyebrow={t("train.eyebrow")}
        title={t("train.title")}
        description={t("train.intro")}
        actions={
          canAdminister ? (
            <button
              type="button"
              className="primary"
              onClick={openCreate}
              aria-label={t("train.add")}
            >
              <Plus size={16} />
              <span>{t("train.add")}</span>
            </button>
          ) : undefined
        }
      />
      <div className="ledger-stats">
        <div className="ledger-stat">
          <span>{t("train.count")}</span>
          <strong>{rows.length}</strong>
          <small>{t("train.team")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("train.due")}</span>
          <strong>{money(totals.due)}</strong>
          <small>{t("train.thisMonth")}</small>
        </div>
        <div className="ledger-stat">
          <span>{t("train.paid")}</span>
          <strong>{money(totals.paid)}</strong>
          <small>{t("train.given")}</small>
        </div>
        <div className="ledger-stat owing">
          <span>{t("train.still")}</span>
          <strong>{money(totals.unpaid)}</strong>
          <small>{t("train.unpaidMonth")}</small>
        </div>
      </div>
      {selectedTrainer && (
        <div
          className="member-details-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setSelectedTrainer(null);
              setConfirmDelete(false);
            }
          }}
        >
          <section className="panel member-details-panel admin-user-details admin-account-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{t("train.details")}</span>
                <h3>{selectedTrainer.first_name} {selectedTrainer.last_name}</h3>
              </div>
              <div className="admin-user-heading-actions">
                {selectedTrainer.is_paid ? (
                  <Badge value="paid" payment />
                ) : Number(selectedTrainer.pay_amount || selectedTrainer.monthly_pay || 0) > 0 ? (
                  <Badge value="unpaid" payment />
                ) : (
                  <span className="status">{t("train.noPay")}</span>
                )}
                {canAdminister && (
                  <button
                    type="button"
                    className="membership-details-delete"
                    disabled={saving}
                    aria-label={t("train.delete")}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="membership-details-x"
                  aria-label={t("common.close")}
                  onClick={() => { setSelectedTrainer(null); setConfirmDelete(false); }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="info-list">
              <p><span>{t("common.phone")}</span><strong>{selectedTrainer.phone || t("common.noPhone")}</strong></p>
              <p><span>{t("train.spec")}</span><strong>{selectedTrainer.specialization || "—"}</strong></p>
              <p><span>{t("train.monthly")}</span><strong>{Number(selectedTrainer.monthly_pay) ? money(selectedTrainer.monthly_pay) : "—"}</strong></p>
              <p>
                <span>{t("train.thisMonth")}</span>
                <strong>{Number(selectedTrainer.pay_amount || selectedTrainer.monthly_pay || 0) ? money(selectedTrainer.pay_amount || selectedTrainer.monthly_pay) : "—"}</strong>
              </p>
            </div>
            {canAdminister && (
              <div className="form-actions">
                <button className="secondary" onClick={() => startEdit(selectedTrainer)}>{t("train.edit")}</button>
                <button className="secondary" onClick={() => recordWork(selectedTrainer)}>{t("train.setPay")}</button>
              </div>
            )}
          </section>
        </div>
      )}
      {confirmDelete && selectedTrainer && createPortal(
        <div
          className="member-details-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setConfirmDelete(false);
          }}
        >
          <section className="member-details-panel form-panel is-confirm" role="dialog" aria-modal="true" aria-labelledby="trainer-delete-title">
            <span className="eyebrow">{t("common.delete")}</span>
            <h3 id="trainer-delete-title">{t("train.deleteSure")}</h3>
            <p className="member-delete-copy">{t("train.confirmDelete", { name: `${selectedTrainer.first_name} ${selectedTrainer.last_name}` })}</p>
            <p className="member-delete-name">{selectedTrainer.first_name} {selectedTrainer.last_name}</p>
            <div className="form-actions">
              <button type="button" className="secondary" disabled={saving} onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="danger"
                disabled={saving}
                onClick={() =>
                  void (async () => {
                    setSaving(true);
                    const ok = await onDelete(selectedTrainer.id);
                    setSaving(false);
                    if (ok !== false) {
                      setConfirmDelete(false);
                      setSelectedTrainer(null);
                    }
                  })()
                }
              >
                {saving ? t("common.saving") : t("common.delete")}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {open && canAdminister && (
        <div className="member-details-overlay" onClick={(event) => { if (event.target === event.currentTarget && !saving) resetForm(); }}>
        <section className="panel form-panel member-details-panel admin-account-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{editing ? t("train.edit") : t("train.new")}</span>
              <h3>{editing ? `${editing.first_name} ${editing.last_name}` : t("train.add")}</h3>
            </div>
            <button type="button" className="membership-details-x" aria-label={t("common.close")} onClick={resetForm}>
              <X size={16} />
            </button>
          </div>
          <FieldGrid>
            <Field label={t("common.firstName")}>
              <input
                value={form.first_name}
                onChange={(event) => setForm({ ...form, first_name: event.target.value })}
              />
            </Field>
            <Field label={t("common.lastName")}>
              <input
                value={form.last_name}
                onChange={(event) => setForm({ ...form, last_name: event.target.value })}
              />
            </Field>
            <Field label={t("train.spec")}>
              <input
                value={form.specialization}
                onChange={(event) => setForm({ ...form, specialization: event.target.value })}
                placeholder={t("train.specPh")}
              />
            </Field>
            <Field label={t("common.phone")}>
              <PhoneField
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </Field>
            <Field label={t("train.monthlyMad")} wide>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="400"
                value={form.monthly_pay}
                onChange={(event) => setForm({ ...form, monthly_pay: event.target.value })}
              />
            </Field>
          </FieldGrid>
          <div className="form-actions">
            <button className="secondary" onClick={resetForm} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button className="primary" onClick={() => void submit()} disabled={saving}>
              {saving ? t("common.saving") : editing ? t("common.save") : t("train.add")}
            </button>
          </div>
        </section>
        </div>
      )}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("train.trainer")}</th>
              <th>{t("train.spec")}</th>
              <th>{t("train.monthly")}</th>
              <th>{t("train.thisMonth")}</th>
              <th>{t("train.paid")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trainer) => {
              const pay = Number(trainer.pay_amount || trainer.monthly_pay || 0);
              return (
                <tr
                  className="record-card record-card-trainer"
                  key={trainer.id}
                  onClick={() => { setConfirmDelete(false); setSelectedTrainer(trainer); }}
                >
                  <td className="record-name" data-label={t("train.trainer")}>
                    <strong>
                      {trainer.first_name} {trainer.last_name}
                    </strong>
                    {trainer.is_paid ? (
                      <Badge value="paid" payment />
                    ) : pay > 0 ? (
                      <Badge value="unpaid" payment />
                    ) : (
                      <span className="status">{t("train.noPay")}</span>
                    )}
                    <small>{trainer.phone || t("common.noPhone")}</small>
                  </td>
                  <td className="record-plan" data-label={t("train.spec")}>
                    {trainer.specialization || "—"}
                  </td>
                  <td className="record-period" data-label={t("train.monthly")}>
                    {Number(trainer.monthly_pay) ? money(trainer.monthly_pay) : "—"}
                  </td>
                  <td className="record-owing table-money" data-label={t("train.thisMonth")}>
                    <strong className={pay > 0 && !trainer.is_paid ? "amount-owing" : "amount-settled"}>
                      {pay ? money(pay) : "—"}
                    </strong>
                  </td>
                  <td className="record-pay" data-label={t("train.paid")}>
                    {trainer.is_paid ? (
                      <Badge value="paid" payment />
                    ) : pay > 0 ? (
                      <Badge value="unpaid" payment />
                    ) : (
                      <span className="status">{t("train.noPay")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState title={canAdminister ? t("train.empty") : t("train.none")} />
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
        <PageHeader
          eyebrow={t("rep.eyebrow")}
          title={t("rep.title")}
          description={canAdminister ? t("rep.admin") : t("rep.staff")}
        />
        {canAdminister && (
          <div className="reports-export">
            <button
              type="button"
              className="secondary"
              disabled={Boolean(exporting)}
              aria-label={exporting === "xlsx" ? t("rep.exporting") : t("rep.excel")}
              onClick={() => void downloadReport("xlsx")}
            >
              <FileSpreadsheet size={15} />
              <span>{exporting === "xlsx" ? t("rep.exporting") : t("rep.excel")}</span>
            </button>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(exporting)}
              aria-label={exporting === "pdf" ? t("rep.exporting") : t("rep.pdf")}
              onClick={() => void downloadReport("pdf")}
            >
              <FileText size={15} />
              <span>{exporting === "pdf" ? t("rep.exporting") : t("rep.pdf")}</span>
            </button>
          </div>
        )}
        <div className="reports-toolbar">
          <div className="reports-month-field">
            <select
              className="ledger-select reports-month-select"
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
          </div>
        </div>
      </div>
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
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
          <section className="panel reports-panel reports-pl-panel">
            <div className="reports-section-head">
              <span className="eyebrow">{t("rep.pl")}</span>
              <h3>{overview?.label || t("dash.thisMonth")}</h3>
            </div>
            {loading && <LoadingState label={t("rep.calc")} />}
            {!loading && overview && (
              <div className="reports-pl">
                <div className="reports-pl-group">
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
                </div>
                <div className="reports-pl-group">
                  <p className="reports-pl-label">{t("rep.out")}</p>
                  <div className="reports-pl-row">
                    <span>{t("rep.operatingExp")}</span>
                    <strong className="amount-owing">{money(overview.operating_total)}</strong>
                  </div>
                  <div className="reports-pl-row">
                    <span>{t("rep.trainerDue")}</span>
                    <strong className="amount-owing">{money(overview.trainer_due)}</strong>
                  </div>
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
                        <tr className="record-card record-card-report" key={item.category}>
                          <td className="record-name" data-label={t("exp.category")}>{item.category_label}</td>
                          <td className="record-plan" data-label={t("rep.items")}>{item.count}</td>
                          <td className="record-owing table-money" data-label={t("common.amount")}>{money(item.total)}</td>
                          <td className="record-pay" data-label={t("rep.share")}>{share.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="record-card record-card-report record-card-total">
                      <td className="record-name">Total</td>
                      <td className="record-plan" data-label={t("rep.items")}>{overview.expenses.length}</td>
                      <td className="record-owing table-money" data-label={t("common.amount")}>{money(overview.operating_total)}</td>
                      <td className="record-pay" data-label={t("rep.share")}>100%</td>
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
                        <tr className="record-card record-card-report" key={expense.id}>
                          <td className="record-plan" data-label={t("exp.category")}>{expense.category_label}</td>
                          <td className="record-name" data-label={t("rep.desc")}>
                            {expense.title || "—"}
                            {expense.notes ? <small>{expense.notes}</small> : null}
                          </td>
                          <td className="record-owing table-money" data-label={t("common.amount")}>{money(expense.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              !loading && <EmptyState title={t("rep.noExp")} />
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
      <section className="panel table-wrap reports-panel">
        <div className="reports-section-head">
          <span className="eyebrow">{t("rep.byClass")}</span>
          <h3>{report?.label || t("rep.breakdown")}</h3>
        </div>
        {loading && <LoadingState label={t("rep.classCalc")} />}
        {!loading && !rows.length && <EmptyState title={t("rep.noClass")} />}
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
                  <tr className="record-card record-card-report" key={item.id ?? "unassigned"}>
                    <td className="record-name" data-label={t("rep.classes")}>
                      {item.name}
                      <small>{item.class_type_label}</small>
                    </td>
                    <td className="record-plan" data-label={t("nav.members")}>{item.member_count}</td>
                    <td className="record-period table-money" data-label={t("rep.expectedBar")}>{money(item.expected_monthly)}</td>
                    <td className="record-owing table-money" data-label={t("rep.collectedBar")}>{money(item.collected)}</td>
                    <td className="record-pay table-money" data-label={t("rep.owed")}>{money(item.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="record-card record-card-report record-card-total">
                  <td className="record-name" colSpan={2}>Total</td>
                  <td className="record-period table-money" data-label={t("rep.expectedBar")}>{money(report?.total_expected || 0)}</td>
                  <td className="record-owing table-money" data-label={t("rep.collectedBar")}>{money(report?.total_collected || 0)}</td>
                  <td className="record-pay table-money" data-label={t("rep.owed")}>{money(report?.total_outstanding || 0)}</td>
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
            <EmptyState title={t("train.none")} />
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
                    <tr className="record-card record-card-report" key={trainer.id}>
                      <td className="record-name" data-label={t("train.title")}>{trainer.name}</td>
                      <td className="record-plan" data-label={t("train.spec")}>{trainer.specialization || "—"}</td>
                      <td className="record-owing table-money" data-label={t("train.monthly")}>
                        <strong className={pay > 0 && !trainer.is_paid ? "amount-owing" : "amount-settled"}>
                          {pay ? money(pay) : "—"}
                        </strong>
                      </td>
                      <td className="record-pay" data-label={t("common.status")}>
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
                <tr className="record-card record-card-report record-card-total">
                  <td className="record-name" colSpan={2}>Total</td>
                  <td className="record-owing table-money" data-label={t("train.monthly")}>{money(payroll.total_due)}</td>
                  <td className="record-pay" data-label={t("common.status")}>
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
