import { formatHttpError, isAbortError, notifyIfSessionExpired } from './api'
import { translate } from './i18n'

export type MembershipStatus = 'active' | 'expiring_soon' | 'expired' | 'cancelled' | 'suspended' | 'upcoming'
export type GymPaymentStatus = 'paid' | 'partial' | 'unpaid'
export interface Member {
  id: number
  name: string
  phone: string
  email: string
  id_number?: string
  address?: string
  city?: string
  country?: string
  postal_code?: string
  card_code?: string
  class_id?: number | null
  class_name?: string
}
export interface FitnessClass { id: number; name: string; class_type: string; price_per_member: string | number; member_count: number; team_total: string | number; is_active: boolean }
export interface Plan { id: number; name: string; duration_months: number; price: string | number; description: string; is_active: boolean; member_count: number }
export interface Membership { id: number; member_id: number; member_name?: string; plan_id: number; start_date: string; end_date: string; price: string | number; status: MembershipStatus; payment_status: GymPaymentStatus; total_paid: string | number; remaining_balance: string | number; notes?: string }

export interface PageMeta {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface Paged<T> extends PageMeta {
  items: T[]
}
export interface GymPayment {
  id: number
  membership_id: number
  member_id?: number | null
  member_name?: string
  id_number?: string
  amount: string | number
  payment_method: 'cash' | string
  received_by: string
  received_at: string
  notes: string
  remaining_balance?: string | number | null
  receipt_number?: string
}
export interface Attendance {
  id: number
  member_id: number
  member_name?: string
  phone?: string
  card_code?: string
  class_id?: number | null
  class_name?: string
  checked_in_at: string
  checked_out_at?: string | null
  is_inside?: boolean
}
export interface AttendanceDeskMember {
  id: number
  name: string
  phone: string
  card_code: string
  id_number?: string
  class_id?: number | null
  class_name?: string
  membership_status: string
  can_check_in: boolean
  is_inside: boolean
  visit_id?: number | null
  checked_in_at?: string | null
}
export interface GymDashboard { members: number; active_members: number; expiring_soon: number; cash_this_month: string | number; outstanding: string | number; whatsapp_due?: number; recent_members: Member[] }
export interface DashboardSummary {
  date: string
  timezone: string
  attendance: { checked_in: number; inside: number }
  memberships: { active: number; expired: number; expiring_today: number }
  payments: { today_total: string | number; outstanding_total: string | number }
  classes: { today_count: number }
  trainers: { today_count: number }
  attention: { expiring_today: number; expired: number; members_with_balance: number }
}
export interface ClassRevenue {
  id: number | null
  name: string
  class_type: string
  class_type_label: string
  member_count: number
  price_per_member: string | number
  expected_monthly: string | number
  collected: string | number
  outstanding: string | number
}
export interface ClassRevenueReport {
  year: number
  month: number
  label: string
  total_expected: string | number
  total_collected: string | number
  total_outstanding: string | number
  collection_rate: string | number
  classes: ClassRevenue[]
}
export interface Trainer {
  id: number
  first_name: string
  last_name: string
  specialization: string
  phone: string
  is_active: boolean
  monthly_pay: string | number
  pay_amount: string | number
  is_paid: boolean
  year: number
  month: number
}
export interface TrainerPayrollReport {
  year: number
  month: number
  label: string
  total_due: string | number
  total_paid: string | number
  total_unpaid: string | number
  paid_count: number
  unpaid_count: number
  trainers: Array<{
    id: number
    name: string
    specialization: string
    monthly_pay: string | number
    pay_amount: string | number
    is_paid: boolean
  }>
}
export const EXPENSE_CATEGORIES = [
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'internet', label: 'Internet' },
  { value: 'rent', label: 'Rent' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
] as const
export interface GymExpense {
  id: number
  category: string
  category_label: string
  title: string
  amount: string | number
  year: number
  month: number
  notes: string
}
export interface MonthlyOverview {
  year: number
  month: number
  label: string
  collected: string | number
  expected: string | number
  outstanding: string | number
  operating_total: string | number
  trainer_due: string | number
  trainer_paid: string | number
  total_spend: string | number
  net: string | number
  categories: Array<{ category: string; category_label: string; total: string | number; count: number }>
  expenses: GymExpense[]
}
export interface NotificationSettings { id: number; membership_expiring_soon: boolean; membership_expired: boolean; outstanding_payment: boolean; new_member_registered: boolean; payment_received: boolean; important_system_alerts: boolean; new_membership_created: boolean; membership_renewed: boolean; partial_payment: boolean; member_updated: boolean; member_deactivated: boolean; member_check_in: boolean; new_staff_user_created: boolean; user_role_changed: boolean; user_deactivated: boolean }
export interface GymNotification { id: number; category: 'memberships' | 'payments' | 'members' | 'system'; title: string; message: string; is_read: boolean; member_id?: number | null; created_at: string }
export interface WhatsAppReminder {
  membership_id: number
  member_id: number
  member_name: string
  phone: string
  whatsapp_url?: string | null
  status: string
  payment_status: string
  end_date: string
  days_left: number
  remaining: string | number
  reasons: string[]
  message: string
  last_sent_at?: string | null
  reminded_today: boolean
}
export interface WhatsAppReminderList {
  expiring: number
  expired: number
  unpaid: number
  missing_phone: number
  items: WhatsAppReminder[]
}

export interface Member360Class {
  id: number
  name: string
}

export interface Member360Plan {
  id: number
  name: string
  duration_months: number
  price: string | number
}

export interface Member360Member extends Member {
  is_active: boolean
}

export interface Member360Membership {
  id: number
  member_id: number
  member_name?: string
  plan_id: number
  plan: Member360Plan
  start_date: string
  end_date: string
  price: string | number
  status: MembershipStatus | string
  payment_status: GymPaymentStatus | string
  total_paid: string | number
  remaining_balance: string | number
  notes?: string
}

export interface Member360 {
  member: Member360Member
  training_class: Member360Class | null
  memberships: Member360Membership[]
  payments: GymPayment[]
  attendance: Attendance[]
  reminder: WhatsAppReminder | null
}

export type WeekdayName =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface ClassSchedule {
  id: number
  training_class_id: number
  class_name: string
  class_type: string
  weekday: string
  start_time: string
  end_time: string
  trainer_id: number | null
  trainer_name: string | null
  location: string
  group?: string
  color?: string
  capacity: number | null
  is_active: boolean
}

export interface ClassSchedulePayload {
  training_class_id: number
  weekday: string
  start_time: string
  end_time: string
  trainer_id?: number | null
  location?: string
  group?: string
  color?: string
  capacity?: number | null
  is_active?: boolean
}

export interface ClassCalendarItem {
  schedule_id: number
  training_class_id: number
  class_name: string
  class_type: string
  date: string
  weekday: string
  start_time: string
  end_time: string
  starts_at: string
  ends_at: string
  trainer_id: number | null
  trainer_name: string | null
  location: string
  group?: string
  color?: string
  capacity: number | null
  member_count: number
  is_active: boolean
}

export interface ClassCalendar {
  start_date: string
  end_date: string
  timezone: string
  items: ClassCalendarItem[]
}

export interface MemberQrLookup {
  member_id: number
  name: string
  is_active: boolean
}
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
function csrfToken() {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function safeDownloadName(name: string, fallback: string) {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, '_').split(/[/\\]/).pop()?.trim() || ''
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback
  return cleaned.slice(0, 180)
}

function downloadFilename(disposition: string, fallback: string) {
  const utfName = disposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  const plainName = disposition.match(/filename="?([^";]+)"?/i)
  const raw = (utfName?.[1] || plainName?.[1] || fallback).trim()
  try {
    return safeDownloadName(decodeURIComponent(raw.replace(/\+/g, ' ')), fallback)
  } catch {
    return safeDownloadName(raw, fallback)
  }
}

function downloadMime(name: string, type: string) {
  if (type && !type.includes('text/html') && !type.includes('application/json')) return type
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  return type || 'application/octet-stream'
}

const REQUEST_TIMEOUT_MS = 20_000

function requestError(status: number, body: unknown = {}, extras?: { notFound?: string; conflict?: string }) {
  const error = new Error(
    formatHttpError(status, body, {
      notFound: extras?.notFound || translate('http.gymNotFound'),
      conflict: extras?.conflict || translate('http.gymConflict'),
    }),
  ) as Error & { status: number }
  error.status = status
  return error
}

export function readPageMeta(headers: Headers, returned: number): PageMeta {
  const totalRaw = Number(headers.get('X-Total-Count'))
  const limitRaw = Number(headers.get('X-Limit'))
  const offsetRaw = Number(headers.get('X-Offset'))
  const hasMoreHeader = (headers.get('X-Has-More') || '').toLowerCase()
  const total = Number.isFinite(totalRaw) ? totalRaw : returned
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : returned
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0
  const hasMore = hasMoreHeader === 'true' || (hasMoreHeader === '' && offset + returned < total)
  return { total, limit, offset, hasMore }
}

function withTimeoutSignal(userSignal?: AbortSignal | null) {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (userSignal) {
    if (userSignal.aborted) controller.abort()
    else userSignal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timer)
      userSignal?.removeEventListener('abort', onAbort)
    },
  }
}

function listQuery(params: Record<string, string | number | boolean | undefined | null> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export function httpStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  return undefined
}

async function rawFetch(path: string, options?: RequestInit) {
  const timed = withTimeoutSignal(options?.signal)
  try {
    const token = csrfToken()
    const headers: Record<string, string> = { ...(options?.headers as Record<string, string> | undefined) }
    if (options?.body) headers['Content-Type'] = 'application/json'
    if (token) headers['X-CSRFToken'] = token
    return await fetch(`${base}${path}`, { credentials: 'include', ...options, headers, signal: timed.signal })
  } catch (error) {
    if (isAbortError(error)) {
      if (options?.signal?.aborted) throw error
      throw new Error(translate('http.timeout'))
    }
    if (error instanceof TypeError) throw new Error(translate('http.offlineGym'))
    throw error
  } finally {
    timed.cleanup()
  }
}

async function request<T>(path: string, options?: RequestInit, extras?: { notFound?: string; conflict?: string }): Promise<T> {
  const response = await rawFetch(path, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    notifyIfSessionExpired(response.status, body)
    throw requestError(response.status, body, extras)
  }
  return body as T
}

async function requestPaged<T>(path: string, options?: RequestInit): Promise<Paged<T>> {
  const response = await rawFetch(path, options)
  const body = await response.json().catch(() => [])
  if (!response.ok) {
    notifyIfSessionExpired(response.status, body)
    throw requestError(response.status, body)
  }
  const items = Array.isArray(body) ? (body as T[]) : []
  return { items, ...readPageMeta(response.headers, items.length) }
}

export async function collectAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<Paged<T>>,
  pageSize = 500,
): Promise<T[]> {
  const items: T[] = []
  let offset = 0
  for (let i = 0; i < 40; i += 1) {
    const page = await fetchPage(offset, pageSize)
    items.push(...page.items)
    if (!page.hasMore || !page.items.length) break
    offset += page.items.length
  }
  return items
}

async function downloadFile(path: string, fallbackName: string) {
  try {
    const response = await rawFetch(path)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      notifyIfSessionExpired(response.status, body)
      throw requestError(response.status, body)
    }
    const payload = await response.blob()
    const type = response.headers.get('Content-Type') || payload.type || ''
    if (type.includes('text/html') || type.includes('application/json')) {
      throw new Error(translate('http.downloadFail'))
    }
    const filename = downloadFilename(response.headers.get('Content-Disposition') || '', fallbackName)
    const file = new File([payload], filename, { type: downloadMime(filename, type) })
    const appleTouch =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const shareData = { files: [file], title: filename }
    if (appleTouch && typeof navigator.canShare === 'function' && navigator.canShare(shareData) && navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    window.setTimeout(() => {
      link.remove()
      URL.revokeObjectURL(url)
    }, 4000)
  } catch (error) {
    if (error instanceof TypeError) throw new Error(translate('http.offlineGym'))
    throw error
  }
}
export const gymApi = {
  dashboard: () => request<GymDashboard>('/fitness/dashboard'),
  dashboardSummary: (date: string, options?: { signal?: AbortSignal }) =>
    request<DashboardSummary>(`/fitness/dashboard/summary?date=${encodeURIComponent(date)}`, options),
  classRevenue: (year: number, month: number) => request<ClassRevenueReport>(`/fitness/reports/classes?year=${year}&month=${month}`),
  trainerPayroll: (year: number, month: number) => request<TrainerPayrollReport>(`/fitness/reports/trainers?year=${year}&month=${month}`),
  monthlyOverview: (year: number, month: number) => request<MonthlyOverview>(`/fitness/reports/overview?year=${year}&month=${month}`),
  downloadMonthlyReport: (year: number, month: number, format: 'xlsx' | 'pdf') =>
    downloadFile(
      `/fitness/reports/export/${format}?year=${year}&month=${month}`,
      `AUMB-monthly-report-${year}-${String(month).padStart(2, '0')}.${format}`,
    ),
  expenses: (year: number, month: number) => request<GymExpense[]>(`/fitness/expenses?year=${year}&month=${month}`),
  createExpense: (payload: { category: string; title?: string; amount: number | string; year?: number; month?: number; notes?: string }) => request<GymExpense>('/fitness/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  deleteExpense: (id: number) => request<{ success: boolean }>(`/fitness/expenses/${id}`, { method: 'DELETE' }),
  members: (params?: string | { search?: string; limit?: number; offset?: number; signal?: AbortSignal }) => {
    const query = typeof params === 'string' ? { search: params } : params || {}
    return requestPaged<Member>(
      `/fitness/members${listQuery({ search: query.search, limit: query.limit, offset: query.offset })}`,
      { signal: query.signal },
    )
  },
  member360: (id: number, options?: { signal?: AbortSignal }) =>
    request<Member360>(`/fitness/members/${id}/360`, options),
  createMember: (payload: { first_name: string; last_name: string; phone: string; email: string; id_number: string; address?: string; city?: string; country?: string; postal_code?: string }) => request<Member>('/fitness/members', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id: number, payload: { first_name: string; last_name: string; phone: string; email: string; id_number: string; address?: string; city?: string; country?: string; postal_code?: string }) => request<Member>(`/fitness/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id: number) => request<{ success: boolean }>(`/fitness/members/${id}`, { method: 'DELETE' }),
  memberClass: (id: number) => request<{ id: number | null; training_class_id: number | null; client_id: number }>(`/fitness/members/${id}/class`),
  setMemberClass: (id: number, classId: number | null) => request<{ id: number | null; training_class_id: number | null; client_id: number }>(`/fitness/members/${id}/class`, { method: 'PUT', body: JSON.stringify({ class_id: classId }) }),
  classes: () => request<FitnessClass[]>('/fitness/classes'),
  classCalendar: (from: string, to: string, options?: { signal?: AbortSignal }) =>
    request<ClassCalendar>(
      `/fitness/classes/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      options,
    ),
  classSchedules: (trainingClassId?: number) =>
    request<ClassSchedule[]>(
      `/fitness/classes/schedules${trainingClassId ? `?training_class_id=${trainingClassId}` : ''}`,
    ),
  classSchedule: (id: number) => request<ClassSchedule>(`/fitness/classes/schedules/${id}`),
  createClassSchedule: (payload: ClassSchedulePayload) =>
    request<ClassSchedule>('/fitness/classes/schedules', { method: 'POST', body: JSON.stringify(payload) }),
  updateClassSchedule: (id: number, payload: ClassSchedulePayload) =>
    request<ClassSchedule>(`/fitness/classes/schedules/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteClassSchedule: (id: number) =>
    request<{ success: boolean }>(`/fitness/classes/schedules/${id}`, { method: 'DELETE' }),
  classDetail: (id: number) => request<FitnessClass>(`/fitness/classes/${id}`),
  createClass: (payload: { name: string; class_type: string; price_per_member: number | string; is_active?: boolean }) => request<FitnessClass>('/fitness/classes', { method: 'POST', body: JSON.stringify(payload) }),
  updateClass: (id: number, payload: { name: string; class_type: string; price_per_member: number | string; is_active?: boolean }) => request<FitnessClass>(`/fitness/classes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteClass: (id: number) => request<{ success: boolean }>(`/fitness/classes/${id}`, { method: 'DELETE' }),
  addClassMember: (classId: number, clientId: number) => request<{ id: number; training_class_id: number; client_id: number; joined_at: string; is_active: boolean }>(`/fitness/classes/${classId}/members`, { method: 'POST', body: JSON.stringify({ client_id: clientId }) }),
  plans: () => request<Plan[]>('/fitness/plans'),
  createPlan: (payload: { name: string; duration_months: number; price: number | string; description?: string; is_active?: boolean }) => request<Plan>('/fitness/plans', { method: 'POST', body: JSON.stringify(payload) }),
  updatePlan: (id: number, payload: { name: string; duration_months: number; price: number | string; description?: string; is_active?: boolean }) => request<Plan>(`/fitness/plans/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePlan: (id: number) => request<{ success: boolean }>(`/fitness/plans/${id}`, { method: 'DELETE' }),
  memberships: (params?: string | { status?: string; limit?: number; offset?: number; signal?: AbortSignal }) => {
    const query = typeof params === 'string' ? { status: params } : params || {}
    return requestPaged<Membership>(
      `/fitness/memberships${listQuery({ status: query.status, limit: query.limit, offset: query.offset })}`,
      { signal: query.signal },
    )
  },
  expiring: () => request<Membership[]>('/fitness/memberships/expiring'),
  reminders: () => request<WhatsAppReminderList>('/fitness/reminders'),
  markReminderSent: (membershipId: number, message = '') => request<WhatsAppReminder>(`/fitness/reminders/${membershipId}/sent`, { method: 'POST', body: JSON.stringify({ message }) }),
  createMembership: (payload: { member_id: number; plan_id: number; start_date: string; notes: string; price?: number | string }) => request<Membership>('/fitness/memberships', { method: 'POST', body: JSON.stringify(payload) }),
  updateMembership: (id: number, payload: { member_id: number; plan_id: number; start_date: string; notes: string; price?: number | string }) => request<Membership>(`/fitness/memberships/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateMembershipPrice: (id: number, price: number | string) => request<Membership>(`/fitness/memberships/${id}/price`, { method: 'PATCH', body: JSON.stringify({ price }) }),
  updateMembershipRemaining: (id: number, remaining: number | string) => request<Membership>(`/fitness/memberships/${id}/remaining`, { method: 'PATCH', body: JSON.stringify({ remaining }) }),
  deleteMembership: (id: number) =>
    request<{ success: boolean }>(
      `/fitness/memberships/${id}`,
      { method: 'DELETE' },
      { conflict: translate('http.membershipProtected') },
    ),
  cancelMembership: (id: number) => request<Membership>(`/fitness/memberships/${id}/cancel`, { method: 'POST' }),
  renew: (id: number, payload: { member_id: number; plan_id: number; start_date: string; notes: string }) => request<Membership>(`/fitness/memberships/${id}/renew`, { method: 'POST', body: JSON.stringify(payload) }),
  payments: (params?: { q?: string; year?: number; month?: number; limit?: number; offset?: number; signal?: AbortSignal }) =>
    requestPaged<GymPayment>(
      `/fitness/payments${listQuery({
        q: params?.q,
        year: params?.year,
        month: params?.month,
        limit: params?.limit,
        offset: params?.offset,
      })}`,
      { signal: params?.signal },
    ),
  membershipPayments: (id: number) => request<GymPayment[]>(`/fitness/memberships/${id}/payments`),
  payment: (
    id: number,
    payload: { amount: number; received_by: string; notes: string; remaining?: number; idempotency_key?: string },
  ) =>
    request<GymPayment>(
      `/fitness/memberships/${id}/payments`,
      { method: 'POST', body: JSON.stringify(payload) },
      {
        conflict: translate('http.payStale'),
      },
    ),
  downloadCashLog: (year: number, month: number, format: 'xlsx' | 'pdf') =>
    downloadFile(
      `/fitness/payments/export/${format}?year=${year}&month=${month}`,
      `AUMB-cash-log-${year}-${String(month).padStart(2, '0')}.${format}`,
    ),
  downloadPaymentReceipt: (id: number) =>
    downloadFile(`/fitness/payments/${id}/receipt`, `AUMB-receipt-FO-${String(id).padStart(6, '0')}.pdf`),
  openPaymentReceipt: async (id: number) => {
    try {
      const token = csrfToken()
      const headers: Record<string, string> = {}
      if (token) headers['X-CSRFToken'] = token
      const response = await fetch(`${base}/fitness/payments/${id}/receipt.html`, { credentials: 'include', headers })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        notifyIfSessionExpired(response.status, body)
        throw requestError(response.status, body)
      }
      const html = await response.text()
      const win = window.open('', '_blank', 'noopener,noreferrer')
      if (!win) {
        await downloadFile(`/fitness/payments/${id}/receipt`, `AUMB-receipt-FO-${String(id).padStart(6, '0')}.pdf`)
        return
      }
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      win.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      if (error instanceof TypeError) throw new Error(translate('http.offlineGym'))
      throw error
    }
  },
  updatePaymentStatus: (id: number, status: 'paid' | 'unpaid') => request<Membership>(`/fitness/memberships/${id}/payment-status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  attendance: (params?: { limit?: number; offset?: number; signal?: AbortSignal }) =>
    requestPaged<Attendance>(
      `/fitness/attendance${listQuery({ limit: params?.limit, offset: params?.offset })}`,
      { signal: params?.signal },
    ),
  lookupAttendance: (q: string) => request<{ query: string; exact: boolean; matches: AttendanceDeskMember[] }>(`/fitness/attendance/lookup?q=${encodeURIComponent(q)}`),
  checkIn: (member_id: number) =>
    request<Attendance>(
      '/fitness/attendance/check-in',
      { method: 'POST', body: JSON.stringify({ member_id }) },
      { conflict: translate('http.alreadyCheckedIn') },
    ),
  checkOut: (member_id: number) => request<Attendance>('/fitness/attendance/check-out', { method: 'POST', body: JSON.stringify({ member_id }) }),
  memberQrLookup: (token: string) =>
    request<MemberQrLookup>(`/fitness/members/qr/${encodeURIComponent(token)}`),
  memberQrUrl: (id: number) => `${base}/fitness/members/${id}/qr`,
  downloadMemberQr: (id: number) =>
    downloadFile(`/fitness/members/${id}/qr.png`, `FO-${String(id).padStart(6, '0')}-qr.png`),
  trainers: (year?: number, month?: number) => request<Trainer[]>(`/fitness/trainers${year && month ? `?year=${year}&month=${month}` : ''}`),
  createTrainer: (payload: { first_name: string; last_name: string; specialization?: string; phone?: string; monthly_pay?: number | string; pay_amount?: number | string; is_paid?: boolean }) => request<Trainer>('/fitness/trainers', { method: 'POST', body: JSON.stringify(payload) }),
  updateTrainer: (id: number, payload: { first_name: string; last_name: string; specialization?: string; phone?: string; monthly_pay?: number | string }) => request<Trainer>(`/fitness/trainers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateTrainerPayroll: (id: number, payload: { year?: number; month?: number; pay_amount?: number | string; is_paid?: boolean }) => request<Trainer>(`/fitness/trainers/${id}/payroll`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTrainer: (id: number) => request<{ success: boolean }>(`/fitness/trainers/${id}`, { method: 'DELETE' }),
  notificationSettings: () => request<NotificationSettings>('/notifications/settings'),
  updateNotificationSettings: (payload: Omit<NotificationSettings, 'id'>) => request<NotificationSettings>('/notifications/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  notifications: (category = '', unread = false, params?: { limit?: number; offset?: number; signal?: AbortSignal }) =>
    requestPaged<GymNotification>(
      `/notifications${listQuery({
        category: category || undefined,
        unread: unread || undefined,
        limit: params?.limit,
        offset: params?.offset,
      })}`,
      { signal: params?.signal },
    ),
  markNotificationRead: (id: number) => request<GymNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),
  deleteNotification: (id: number) => request<{ success: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),
  deleteAllNotifications: () => request<{ success: boolean }>('/notifications', { method: 'DELETE' }),
}
