import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  gymApi,
  type ClassCalendarItem,
  type ClassSchedule,
  type ClassSchedulePayload,
  type FitnessClass,
  type Trainer,
} from "./gymApi";
import { localeFor, monthLabel, useLang, type Msg } from "./i18n";
import { Alert, EmptyState, LoadingState } from "./ui";

type CalendarView = "month" | "week" | "day";

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
}

function mondayOf(value: Date) {
  const day = (value.getDay() + 6) % 7;
  return addDays(startOfDay(value), -day);
}

function periodRange(anchor: Date, view: CalendarView) {
  if (view === "day") {
    const iso = toIsoDate(anchor);
    return { from: iso, to: iso };
  }
  if (view === "week") {
    const start = mondayOf(anchor);
    return { from: toIsoDate(start), to: toIsoDate(addDays(start, 6)) };
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

function shiftAnchor(anchor: Date, view: CalendarView, direction: -1 | 1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

function formatClock(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return value;
}

function timeToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function toTimeInput(value: string) {
  return formatClock(value);
}

function toTimePayload(value: string) {
  const clock = formatClock(value);
  return clock.length === 5 ? `${clock}:00` : clock;
}

function weekdayKey(value: string): Msg {
  const key = `cal.weekday.${value}` as Msg;
  return WEEKDAYS.includes(value as (typeof WEEKDAYS)[number]) ? key : "cal.dayLabel";
}

function formatLocalDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(localeFor(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function weekdayShort(index: number) {
  return new Intl.DateTimeFormat(localeFor(), { weekday: "short" }).format(
    new Date(2026, 8, 7 + index),
  );
}

function monthCells(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const pad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
  for (let i = 0; i < pad; i += 1) {
    const date = addDays(first, i - pad);
    cells.push({ iso: toIsoDate(date), day: date.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    cells.push({ iso: toIsoDate(date), day, inMonth: true });
  }
  while (cells.length % 7) {
    const last = cells[cells.length - 1];
    const [year, month, day] = last.iso.split("-").map(Number);
    const date = addDays(new Date(year, month - 1, day), 1);
    cells.push({ iso: toIsoDate(date), day: date.getDate(), inMonth: false });
  }
  return cells;
}

function weekCells(anchor: Date) {
  const start = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return { iso: toIsoDate(date), day: date.getDate(), inMonth: true };
  });
}

function trainerLabel(trainer: Trainer) {
  return `${trainer.first_name} ${trainer.last_name}`.trim();
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

const SLOT_COLORS = [
  "#ef735c",
  "#e6b325",
  "#3d7a52",
  "#2b6cb0",
  "#7c3aed",
  "#db2777",
  "#0f766e",
  "#c2410c",
  "#142024",
];

function slotLabel(value?: string | null) {
  return (value || "").trim();
}

function slotColor(value?: string | null) {
  const raw = (value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(raw) ? raw : "";
}

function contrastInk(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 150 ? "#142024" : "#f4f6f2";
}

function eventName(className: string, value?: string | null) {
  const label = slotLabel(value);
  if (!label) return className;
  const key = label.toLowerCase();
  if (key === "kids" || key === "adults") return `${className}-${key}`;
  return label;
}

type ScheduleFormState = {
  training_class_id: string;
  weekday: string;
  start_time: string;
  end_time: string;
  trainer_id: string;
  location: string;
  group: string;
  color: string;
  capacity: string;
  is_active: boolean;
};

const emptyScheduleForm: ScheduleFormState = {
  training_class_id: "",
  weekday: "monday",
  start_time: "18:00",
  end_time: "19:00",
  trainer_id: "",
  location: "",
  group: "",
  color: "#ef735c",
  capacity: "",
  is_active: true,
};

function formFromSchedule(schedule: ClassSchedule): ScheduleFormState {
  return {
    training_class_id: String(schedule.training_class_id),
    weekday: schedule.weekday,
    start_time: toTimeInput(schedule.start_time),
    end_time: toTimeInput(schedule.end_time),
    trainer_id: schedule.trainer_id ? String(schedule.trainer_id) : "",
    location: schedule.location || "",
    group: slotLabel(schedule.group),
    color: slotColor(schedule.color) || "#ef735c",
    capacity: schedule.capacity == null ? "" : String(schedule.capacity),
    is_active: schedule.is_active,
  };
}

function eventTitle(item: ClassCalendarItem) {
  return [
    eventName(item.class_name, item.group),
    `${formatClock(item.start_time)}–${formatClock(item.end_time)}`,
    item.trainer_name,
    item.location,
  ]
    .filter(Boolean)
    .join(" · ");
}

function EventCard({
  item,
  compact,
  onOpen,
}: {
  item: ClassCalendarItem;
  compact?: boolean;
  onOpen: (item: ClassCalendarItem) => void;
}) {
  const name = eventName(item.class_name, item.group);
  const color = slotColor(item.color);
  const ink = color ? contrastInk(color) : "";
  return (
    <button
      type="button"
      className={`class-cal-event${compact ? " is-compact" : ""}${color ? " has-color" : ""}`}
      title={eventTitle(item)}
      style={color ? { background: color, color: ink, borderColor: color } : undefined}
      onClick={() => onOpen(item)}
    >
      <strong>{name}</strong>
      <small>
        {formatClock(item.start_time)}–{formatClock(item.end_time)}
      </small>
      {!compact && item.trainer_name ? <small>{item.trainer_name}</small> : null}
      {!compact && item.location ? <small>{item.location}</small> : null}
    </button>
  );
}

export function ClassCalendar({
  classes,
  trainers,
  canManageSchedules,
}: {
  classes: FitnessClass[];
  trainers: Trainer[];
  canManageSchedules: boolean;
}) {
  const { t, lang } = useLang();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<ClassCalendarItem[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ClassCalendarItem | ClassSchedule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(emptyScheduleForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => periodRange(anchor, view), [anchor, view]);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const calendarSeq = useRef(0);
  const scheduleSeq = useRef(0);
  const todayIso = toIsoDate(new Date());
  const selectedClass = classes.find((item) => String(item.id) === form.training_class_id);

  const namedItems = useMemo(() => {
    const byId = new Map(schedules.map((row) => [row.id, row]));
    return items.map((item) => {
      const schedule = byId.get(item.schedule_id);
      return {
        ...item,
        group: slotLabel(item.group) || slotLabel(schedule?.group),
        color: slotColor(item.color) || slotColor(schedule?.color),
      };
    });
  }, [items, schedules]);

  const byDate = useMemo(() => {
    const map = new Map<string, ClassCalendarItem[]>();
    namedItems.forEach((item) => {
      const key = item.date.slice(0, 10);
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [namedItems]);

  const periodLabel = useMemo(() => {
    if (view === "month") return monthLabel(anchor.getFullYear(), anchor.getMonth() + 1);
    if (view === "day") return formatLocalDate(toIsoDate(anchor));
    const start = mondayOf(anchor);
    const end = addDays(start, 6);
    return `${new Intl.DateTimeFormat(localeFor(), { day: "numeric", month: "short" }).format(start)} – ${new Intl.DateTimeFormat(localeFor(), { day: "numeric", month: "short", year: "numeric" }).format(end)}`;
  }, [anchor, view, lang]);

  const gridCells = view === "month" ? monthCells(anchor) : view === "week" ? weekCells(anchor) : [];
  const listDays = useMemo(() => {
    const start = range.from;
    const end = range.to;
    const days: string[] = [];
    let current = start;
    while (current <= end) {
      days.push(current);
      const [year, month, day] = current.split("-").map(Number);
      current = toIsoDate(addDays(new Date(year, month - 1, day), 1));
    }
    return days;
  }, [range.from, range.to]);

  const fetchCalendar = async (from: string, to: string, showLoading: boolean) => {
    if (!showLoading && (from !== rangeRef.current.from || to !== rangeRef.current.to)) return;
    const requestId = ++calendarSeq.current;
    if (showLoading) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await gymApi.classCalendar(from, to);
      if (requestId !== calendarSeq.current) return;
      if (from !== rangeRef.current.from || to !== rangeRef.current.to) return;
      setItems(data.items || []);
      if (showLoading) setError("");
    } catch (e) {
      if (requestId !== calendarSeq.current) return;
      if (from !== rangeRef.current.from || to !== rangeRef.current.to) return;
      if (showLoading) setItems([]);
      setError(e instanceof Error ? e.message : t("cal.loadFail"));
    } finally {
      if (
        requestId === calendarSeq.current &&
        from === rangeRef.current.from &&
        to === rangeRef.current.to
      ) {
        setLoading(false);
      }
    }
  };

  const refreshSchedules = async () => {
    const requestId = ++scheduleSeq.current;
    try {
      const rows = await gymApi.classSchedules();
      if (requestId !== scheduleSeq.current) return;
      setSchedules(rows);
    } catch {
      if (requestId !== scheduleSeq.current) return;
    }
  };

  useEffect(() => {
    void fetchCalendar(range.from, range.to, true);
  }, [range.from, range.to]);

  useEffect(() => {
    void refreshSchedules();
  }, []);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyScheduleForm);
    setFormError("");
  };

  const openCreate = () => {
    setSelected(null);
    setEditingId(null);
    setForm({
      ...emptyScheduleForm,
      training_class_id: classes.find((item) => item.is_active)?.id
        ? String(classes.find((item) => item.is_active)?.id)
        : "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = async (scheduleId: number, fallback?: ClassCalendarItem | ClassSchedule) => {
    setFormError("");
    setSaving(true);
    try {
      const schedule = await gymApi.classSchedule(scheduleId);
      setEditingId(schedule.id);
      setForm(formFromSchedule(schedule));
      setFormOpen(true);
      setSelected(null);
    } catch (e) {
      if (fallback && "weekday" in fallback) {
        setEditingId(scheduleId);
        if ("schedule_id" in fallback) {
          setForm({
            training_class_id: String(fallback.training_class_id),
            weekday: fallback.weekday,
            start_time: toTimeInput(fallback.start_time),
            end_time: toTimeInput(fallback.end_time),
            trainer_id: fallback.trainer_id ? String(fallback.trainer_id) : "",
            location: fallback.location || "",
            group: slotLabel(fallback.group),
            color: slotColor(fallback.color) || "#ef735c",
            capacity: fallback.capacity == null ? "" : String(fallback.capacity),
            is_active: fallback.is_active,
          });
        } else {
          setForm(formFromSchedule(fallback));
        }
        setFormOpen(true);
        setSelected(null);
      } else {
        setError(e instanceof Error ? e.message : t("cal.saveFail"));
      }
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = (): ClassSchedulePayload | null => {
    if (!form.training_class_id) {
      setFormError(t("cal.classRequired"));
      return null;
    }
    if (!form.weekday) {
      setFormError(t("cal.dayRequired"));
      return null;
    }
    if (!form.start_time) {
      setFormError(t("cal.startRequired"));
      return null;
    }
    if (!form.end_time) {
      setFormError(t("cal.endRequired"));
      return null;
    }
    if (!(timeToMinutes(form.end_time) > timeToMinutes(form.start_time))) {
      setFormError(t("cal.endAfterStart"));
      return null;
    }
    let capacity: number | null = null;
    if (form.capacity.trim()) {
      const value = Number(form.capacity);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        setFormError(t("cal.capacityInvalid"));
        return null;
      }
      capacity = value;
    }
    return {
      training_class_id: Number(form.training_class_id),
      weekday: form.weekday,
      start_time: toTimePayload(form.start_time),
      end_time: toTimePayload(form.end_time),
      trainer_id: form.trainer_id ? Number(form.trainer_id) : null,
      location: form.location.trim(),
      group: slotLabel(form.group),
      color: slotColor(form.color) || "#ef735c",
      capacity,
      is_active: form.is_active,
    };
  };

  const saveSchedule = async () => {
    if (saving) return;
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        await gymApi.updateClassSchedule(editingId, payload);
        setNotice(t("cal.updated"));
      } else {
        await gymApi.createClassSchedule(payload);
        setNotice(t("cal.saved"));
      }
      closeForm();
      await fetchCalendar(rangeRef.current.from, rangeRef.current.to, false);
      await refreshSchedules();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("cal.saveFail"));
    } finally {
      setSaving(false);
    }
  };

  const mutateSchedule = async (
    action: () => Promise<void>,
    success: Msg,
    fail: Msg,
    confirm?: Msg,
  ) => {
    if (saving) return;
    if (confirm && !window.confirm(t(confirm))) return;
    setSaving(true);
    setError("");
    try {
      await action();
      setNotice(t(success));
      setSelected(null);
      closeForm();
      await fetchCalendar(rangeRef.current.from, rangeRef.current.to, false);
      await refreshSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(fail));
    } finally {
      setSaving(false);
    }
  };

  const selectedSchedule = selected && "id" in selected ? selected : null;
  const selectedOccurrence = selected && "schedule_id" in selected ? selected : null;
  const detail = selectedOccurrence || selectedSchedule;
  const detailScheduleId = selectedOccurrence?.schedule_id || selectedSchedule?.id;

  return (
    <div className="class-calendar">
      {notice ? (
        <Alert tone="success" onDismiss={() => setNotice("")} dismissLabel={t("common.dismiss")}>
          {notice}
        </Alert>
      ) : null}
      {error ? (
        <Alert onDismiss={() => setError("")} dismissLabel={t("common.dismiss")}>
          {error}
        </Alert>
      ) : null}

      <div className="toolbar class-calendar-toolbar">
        <div className="class-view-switch" role="tablist" aria-label={t("cal.calendar")}>
          {(["month", "week", "day"] as CalendarView[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`class-view-switch-btn${view === option ? " active" : ""}`}
              onClick={() => setView(option)}
            >
              {option === "month" ? t("cal.month") : option === "week" ? t("cal.week") : t("cal.day")}
            </button>
          ))}
        </div>
        <div className="class-calendar-nav">
          <button type="button" className="secondary" onClick={() => setAnchor(shiftAnchor(anchor, view, -1))} aria-label={t("cal.prev")}>
            <ChevronLeft size={16} />
            <span>{t("cal.prev")}</span>
          </button>
          <button type="button" className="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>
            {t("cal.today")}
          </button>
          <button type="button" className="secondary" onClick={() => setAnchor(shiftAnchor(anchor, view, 1))} aria-label={t("cal.next")}>
            <span>{t("cal.next")}</span>
            <ChevronRight size={16} />
          </button>
          <strong className="class-calendar-label">{periodLabel}</strong>
        </div>
        {canManageSchedules && !formOpen ? (
          <button type="button" className="primary" onClick={openCreate}>
            {t("cal.create")}
          </button>
        ) : null}
      </div>

      {formOpen && canManageSchedules ? (
        <section className="panel form-panel">
          <span className="eyebrow">{editingId ? t("cal.edit") : t("cal.create")}</span>
          <p className="class-calendar-preview-note">{t("cal.preview")}</p>
          <div className="date-fields">
            <label>
              {t("cal.class")}
              <select
                value={form.training_class_id}
                onChange={(event) => setForm({ ...form, training_class_id: event.target.value })}
              >
                <option value="">{t("cal.none")}</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("cal.slotName")}
              <input
                value={form.group}
                placeholder={t("cal.slotNameHint")}
                onChange={(event) => setForm({ ...form, group: event.target.value })}
              />
            </label>
          </div>
          <div className="class-cal-name-shortcuts">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setForm({
                  ...form,
                  group: selectedClass?.name ? `${selectedClass.name}-kids` : "kids",
                })
              }
            >
              {t("cal.groupKids")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setForm({
                  ...form,
                  group: selectedClass?.name ? `${selectedClass.name}-adults` : "adults",
                })
              }
            >
              {t("cal.groupAdults")}
            </button>
          </div>
          <div className="class-cal-color-field">
            <span>{t("cal.color")}</span>
            <div className="class-cal-color-swatches" role="radiogroup" aria-label={t("cal.color")}>
              {SLOT_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={form.color === hex}
                  className={`class-cal-swatch${form.color === hex ? " is-selected" : ""}`}
                  style={{ background: hex }}
                  onClick={() => setForm({ ...form, color: hex })}
                  title={hex}
                />
              ))}
              <label className="class-cal-swatch-custom">
                <input
                  type="color"
                  value={slotColor(form.color) || "#ef735c"}
                  onChange={(event) => setForm({ ...form, color: event.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="date-fields">
            <label>
              {t("cal.dayLabel")}
              <select value={form.weekday} onChange={(event) => setForm({ ...form, weekday: event.target.value })}>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {t(weekdayKey(day))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("cal.startTime")}
              <input
                type="time"
                value={form.start_time}
                onChange={(event) => setForm({ ...form, start_time: event.target.value })}
              />
            </label>
            <label>
              {t("cal.endTime")}
              <input
                type="time"
                value={form.end_time}
                onChange={(event) => setForm({ ...form, end_time: event.target.value })}
              />
            </label>
          </div>
          <div className="date-fields">
            <label>
              {t("cal.trainer")}
              <select
                value={form.trainer_id}
                onChange={(event) => setForm({ ...form, trainer_id: event.target.value })}
              >
                <option value="">{t("cal.none")}</option>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainerLabel(trainer)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("cal.location")}
              <input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </label>
          </div>
          <div className="date-fields">
            <label>
              {t("cal.capacity")}
              <input
                type="number"
                min="1"
                step="1"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </label>
            <label>
              {t("cal.active")}
              <select
                value={String(form.is_active)}
                onChange={(event) => setForm({ ...form, is_active: event.target.value === "true" })}
              >
                <option value="true">{t("common.active")}</option>
                <option value="false">{t("common.inactive")}</option>
              </select>
            </label>
          </div>
          <div className="class-calendar-repeat">
            <p>
              {t("cal.class")}: {eventName(selectedClass?.name || t("cal.none"), form.group)}
            </p>
            <p>
              {t("cal.dayLabel")}: {t(weekdayKey(form.weekday))}
            </p>
            <p>
              {t("cal.time")}: {formatClock(form.start_time) || "—"}–{formatClock(form.end_time) || "—"}
            </p>
            <p>
              <strong>{t("cal.repeatsEvery", { day: t(weekdayKey(form.weekday)) })}</strong>
            </p>
          </div>
          {formError ? <Alert>{formError}</Alert> : null}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeForm} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button type="button" className="primary" onClick={() => void saveSchedule()} disabled={saving}>
              {saving ? t("common.saving") : editingId ? t("common.save") : t("cal.create")}
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <LoadingState label={t("common.loading")} />
      ) : items.length ? (
        <>
          {view !== "day" ? (
            <section className="panel class-calendar-grid-wrap">
              <div className={`class-calendar-grid${view === "week" ? " is-week" : ""}`}>
                {WEEKDAYS.map((day, index) => (
                  <div key={day} className="class-calendar-head">
                    {weekdayShort(index)}
                  </div>
                ))}
                {gridCells.map((cell) => {
                  const events = cell.inMonth || view === "week" ? byDate.get(cell.iso) || [] : [];
                  return (
                    <div
                      key={cell.iso}
                      className={`class-calendar-cell${cell.inMonth ? "" : " is-muted"}${cell.iso === todayIso ? " is-today" : ""}`}
                    >
                      <span className="class-calendar-daynum">{cell.day}</span>
                      <div className="class-calendar-events">
                        {events.map((item) => (
                          <EventCard
                            key={`${item.schedule_id}-${item.date}-${item.start_time}-${item.training_class_id}`}
                            item={item}
                            compact={view === "month"}
                            onOpen={setSelected}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section className={`panel class-calendar-list${view === "day" ? " is-visible" : ""}`}>
            {listDays
              .filter((iso) => (byDate.get(iso) || []).length > 0)
              .map((iso) => (
                <div key={iso} className="class-calendar-list-day">
                  <h3>
                    {formatLocalDate(iso)}
                    {iso === todayIso ? ` · ${t("cal.today")}` : ""}
                  </h3>
                  <div className="class-calendar-events">
                    {(byDate.get(iso) || []).map((item) => (
                      <EventCard
                        key={`${item.schedule_id}-${item.date}-${item.start_time}-${item.training_class_id}`}
                        item={item}
                        onOpen={setSelected}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </section>
        </>
      ) : error ? null : (
        <EmptyState title={t("cal.empty")} hint={t("cal.emptyHint")} />
      )}

      {schedules.length ? (
        <section className="panel table-wrap">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{t("cal.schedule")}</span>
              <h3>{t("cal.allSchedules")}</h3>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("cal.class")}</th>
                <th>{t("cal.dayLabel")}</th>
                <th>{t("cal.time")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((item) => (
                <tr className="record-card" key={item.id}>
                  <td className="record-name" data-label={t("cal.class")}>
                    <strong>{eventName(item.class_name, item.group)}</strong>
                  </td>
                  <td data-label={t("cal.dayLabel")}>{t(weekdayKey(item.weekday))}</td>
                  <td data-label={t("cal.time")}>
                    {formatClock(item.start_time)}–{formatClock(item.end_time)}
                  </td>
                  <td data-label={t("common.status")}>
                    {item.is_active ? t("common.active") : t("common.inactive")}
                  </td>
                  <td className="record-actions" data-label={t("common.actions")}>
                    <div className="table-actions">
                      <button type="button" className="text-button" onClick={() => setSelected(item)}>
                        {t("class.view")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {detail
        ? createPortal(
            <div
              className="member-details-overlay"
              onClick={(event) => {
                if (event.target === event.currentTarget) setSelected(null);
              }}
            >
              <section className="member-details-panel class-detail class-cal-details">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">{t("cal.details")}</span>
                    <h3>{eventName(detail.class_name, detail.group)}</h3>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setSelected(null)}
                    aria-label={t("common.close")}
                  >
                    ×
                  </button>
                </div>
                <div className="info-list">
                  <p>
                    <span>{t("cal.class")}</span>
                    <strong>{detail.class_name}</strong>
                  </p>
                  {slotLabel(detail.group) ? (
                    <p>
                      <span>{t("cal.slotName")}</span>
                      <strong>{eventName(detail.class_name, detail.group)}</strong>
                    </p>
                  ) : null}
                  {slotColor(detail.color) ? (
                    <p>
                      <span>{t("cal.color")}</span>
                      <strong className="class-cal-color-value">
                        <i style={{ background: slotColor(detail.color) }} />
                        {slotColor(detail.color)}
                      </strong>
                    </p>
                  ) : null}
                  <p>
                    <span>{t("class.type")}</span>
                    <strong>{classTypeLabel(detail.class_type, t)}</strong>
                  </p>
                  {selectedOccurrence ? (
                    <p>
                      <span>{t("cal.date")}</span>
                      <strong>{formatLocalDate(selectedOccurrence.date)}</strong>
                    </p>
                  ) : null}
                  <p>
                    <span>{t("cal.dayLabel")}</span>
                    <strong>{t(weekdayKey(detail.weekday))}</strong>
                  </p>
                  <p>
                    <span>{t("cal.startTime")}</span>
                    <strong>{formatClock(detail.start_time)}</strong>
                  </p>
                  <p>
                    <span>{t("cal.endTime")}</span>
                    <strong>{formatClock(detail.end_time)}</strong>
                  </p>
                  {detail.location ? (
                    <p>
                      <span>{t("cal.location")}</span>
                      <strong>{detail.location}</strong>
                    </p>
                  ) : null}
                  {detail.trainer_name ? (
                    <p>
                      <span>{t("cal.trainer")}</span>
                      <strong>{detail.trainer_name}</strong>
                    </p>
                  ) : null}
                  {detail.capacity != null ? (
                    <p>
                      <span>{t("cal.capacity")}</span>
                      <strong>{detail.capacity}</strong>
                    </p>
                  ) : null}
                  {selectedOccurrence ? (
                    <p>
                      <span>{t("cal.roster")}</span>
                      <strong>{selectedOccurrence.member_count}</strong>
                    </p>
                  ) : null}
                </div>
                <p className="class-calendar-preview-note">
                  {t("cal.repeatsEvery", { day: t(weekdayKey(detail.weekday)) })}
                </p>
                {canManageSchedules && detailScheduleId ? (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      onClick={() => void openEdit(detailScheduleId, detail)}
                    >
                      {t("cal.edit")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      onClick={() =>
                        void mutateSchedule(
                          async () => {
                            const current =
                              selectedSchedule ||
                              (await gymApi.classSchedule(detailScheduleId));
                            await gymApi.updateClassSchedule(detailScheduleId, {
                              training_class_id: current.training_class_id,
                              weekday: current.weekday,
                              start_time: toTimePayload(current.start_time),
                              end_time: toTimePayload(current.end_time),
                              trainer_id: current.trainer_id,
                              location: current.location || "",
                              group: slotLabel(current.group),
                              color: slotColor(current.color) || "#ef735c",
                              capacity: current.capacity,
                              is_active: !current.is_active,
                            });
                          },
                          detail.is_active ? "cal.deactivated" : "cal.activated",
                          "cal.saveFail",
                          detail.is_active ? "cal.confirmDeactivate" : undefined,
                        )
                      }
                    >
                      {detail.is_active ? t("cal.deactivate") : t("cal.activate")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      onClick={() =>
                        void mutateSchedule(
                          () => gymApi.deleteClassSchedule(detailScheduleId).then(() => undefined),
                          "cal.deleted",
                          "cal.deleteFail",
                          "cal.confirmDelete",
                        )
                      }
                    >
                      {t("cal.delete")}
                    </button>
                  </div>
                ) : null}
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
