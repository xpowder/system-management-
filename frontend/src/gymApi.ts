import { formatHttpError, notifyIfSessionExpired } from './api'

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
export interface Membership { id: number; member_id: number; plan_id: number; start_date: string; end_date: string; price: string | number; status: MembershipStatus; payment_status: GymPaymentStatus; total_paid: string | number; remaining_balance: string | number; notes?: string }
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

function requestError(status: number, body: unknown = {}) {
  return new Error(
    formatHttpError(status, body, {
      notFound: 'The requested gym record was not found.',
      conflict: 'This operation conflicts with an existing gym record.',
    }),
  )
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const token = csrfToken()
    const headers: Record<string, string> = { ...(options?.headers as Record<string, string> | undefined) }
    if (options?.body) headers['Content-Type'] = 'application/json'
    if (token) headers['X-CSRFToken'] = token
    const response = await fetch(`${base}${path}`, { credentials: 'include', ...options, headers })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      notifyIfSessionExpired(response.status, body)
      throw requestError(response.status, body)
    }
    return body as T
  } catch (error) {
    if (error instanceof TypeError) throw new Error("You are offline. Connect to the internet to load gym data.")
    throw error
  }
}

async function downloadFile(path: string, fallbackName: string) {
  try {
    const token = csrfToken()
    const headers: Record<string, string> = {}
    if (token) headers['X-CSRFToken'] = token
    const response = await fetch(`${base}${path}`, { credentials: 'include', headers })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      notifyIfSessionExpired(response.status, body)
      throw requestError(response.status, body)
    }
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') || ''
    const utfName = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    const plainName = disposition.match(/filename="?([^";]+)"?/i)
    const filename = safeDownloadName(
      decodeURIComponent(utfName?.[1] || plainName?.[1] || fallbackName),
      fallbackName,
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    if (error instanceof TypeError) throw new Error("You are offline. Connect to the internet to load gym data.")
    throw error
  }
}
export const gymApi = {
  dashboard: () => request<GymDashboard>('/fitness/dashboard'),
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
  members: (search = '') => request<Member[]>(`/fitness/members${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  member360: (id: number) => request<Member360>(`/fitness/members/${id}/360`),
  createMember: (payload: { first_name: string; last_name: string; phone: string; email: string; id_number: string; address?: string; city?: string; country?: string; postal_code?: string }) => request<Member>('/fitness/members', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id: number, payload: { first_name: string; last_name: string; phone: string; email: string; id_number: string; address?: string; city?: string; country?: string; postal_code?: string }) => request<Member>(`/fitness/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id: number) => request<{ success: boolean }>(`/fitness/members/${id}`, { method: 'DELETE' }),
  memberClass: (id: number) => request<{ id: number | null; training_class_id: number | null; client_id: number }>(`/fitness/members/${id}/class`),
  setMemberClass: (id: number, classId: number | null) => request<{ id: number | null; training_class_id: number | null; client_id: number }>(`/fitness/members/${id}/class`, { method: 'PUT', body: JSON.stringify({ class_id: classId }) }),
  classes: () => request<FitnessClass[]>('/fitness/classes'),
  classDetail: (id: number) => request<FitnessClass>(`/fitness/classes/${id}`),
  createClass: (payload: { name: string; class_type: string; price_per_member: number | string; is_active?: boolean }) => request<FitnessClass>('/fitness/classes', { method: 'POST', body: JSON.stringify(payload) }),
  updateClass: (id: number, payload: { name: string; class_type: string; price_per_member: number | string; is_active?: boolean }) => request<FitnessClass>(`/fitness/classes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteClass: (id: number) => request<{ success: boolean }>(`/fitness/classes/${id}`, { method: 'DELETE' }),
  addClassMember: (classId: number, clientId: number) => request<{ id: number; training_class_id: number; client_id: number; joined_at: string; is_active: boolean }>(`/fitness/classes/${classId}/members`, { method: 'POST', body: JSON.stringify({ client_id: clientId }) }),
  plans: () => request<Plan[]>('/fitness/plans'),
  createPlan: (payload: { name: string; duration_months: number; price: number | string; description?: string; is_active?: boolean }) => request<Plan>('/fitness/plans', { method: 'POST', body: JSON.stringify(payload) }),
  updatePlan: (id: number, payload: { name: string; duration_months: number; price: number | string; description?: string; is_active?: boolean }) => request<Plan>(`/fitness/plans/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePlan: (id: number) => request<{ success: boolean }>(`/fitness/plans/${id}`, { method: 'DELETE' }),
  memberships: (status = '') => request<Membership[]>(`/fitness/memberships${status ? `?status=${status}` : ''}`),
  expiring: () => request<Membership[]>('/fitness/memberships/expiring'),
  reminders: () => request<WhatsAppReminderList>('/fitness/reminders'),
  markReminderSent: (membershipId: number, message = '') => request<WhatsAppReminder>(`/fitness/reminders/${membershipId}/sent`, { method: 'POST', body: JSON.stringify({ message }) }),
  createMembership: (payload: { member_id: number; plan_id: number; start_date: string; notes: string; price?: number | string }) => request<Membership>('/fitness/memberships', { method: 'POST', body: JSON.stringify(payload) }),
  updateMembership: (id: number, payload: { member_id: number; plan_id: number; start_date: string; notes: string; price?: number | string }) => request<Membership>(`/fitness/memberships/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateMembershipPrice: (id: number, price: number | string) => request<Membership>(`/fitness/memberships/${id}/price`, { method: 'PATCH', body: JSON.stringify({ price }) }),
  updateMembershipRemaining: (id: number, remaining: number | string) => request<Membership>(`/fitness/memberships/${id}/remaining`, { method: 'PATCH', body: JSON.stringify({ remaining }) }),
  deleteMembership: (id: number) => request<{ success: boolean }>(`/fitness/memberships/${id}`, { method: 'DELETE' }),
  renew: (id: number, payload: { member_id: number; plan_id: number; start_date: string; notes: string }) => request<Membership>(`/fitness/memberships/${id}/renew`, { method: 'POST', body: JSON.stringify(payload) }),
  payments: (params?: { q?: string; year?: number; month?: number }) => {
    const query = new URLSearchParams()
    if (params?.q) query.set('q', params.q)
    if (params?.year) query.set('year', String(params.year))
    if (params?.month) query.set('month', String(params.month))
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return request<GymPayment[]>(`/fitness/payments${suffix}`)
  },
  membershipPayments: (id: number) => request<GymPayment[]>(`/fitness/memberships/${id}/payments`),
  payment: (id: number, payload: { amount: number; received_by: string; notes: string; remaining?: number }) => request<GymPayment>(`/fitness/memberships/${id}/payments`, { method: 'POST', body: JSON.stringify(payload) }),
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
      if (error instanceof TypeError) throw new Error("You are offline. Connect to the internet to load gym data.")
      throw error
    }
  },
  updatePaymentStatus: (id: number, status: 'paid' | 'unpaid') => request<Membership>(`/fitness/memberships/${id}/payment-status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  attendance: () => request<Attendance[]>('/fitness/attendance'),
  lookupAttendance: (q: string) => request<{ query: string; exact: boolean; matches: AttendanceDeskMember[] }>(`/fitness/attendance/lookup?q=${encodeURIComponent(q)}`),
  checkIn: (member_id: number) => request<Attendance>('/fitness/attendance/check-in', { method: 'POST', body: JSON.stringify({ member_id }) }),
  checkOut: (member_id: number) => request<Attendance>('/fitness/attendance/check-out', { method: 'POST', body: JSON.stringify({ member_id }) }),
  memberQrUrl: (id: number) => `${base}/fitness/members/${id}/qr`,
  trainers: (year?: number, month?: number) => request<Trainer[]>(`/fitness/trainers${year && month ? `?year=${year}&month=${month}` : ''}`),
  createTrainer: (payload: { first_name: string; last_name: string; specialization?: string; phone?: string; monthly_pay?: number | string; pay_amount?: number | string; is_paid?: boolean }) => request<Trainer>('/fitness/trainers', { method: 'POST', body: JSON.stringify(payload) }),
  updateTrainerPayroll: (id: number, payload: { year?: number; month?: number; pay_amount?: number | string; is_paid?: boolean }) => request<Trainer>(`/fitness/trainers/${id}/payroll`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTrainer: (id: number) => request<{ success: boolean }>(`/fitness/trainers/${id}`, { method: 'DELETE' }),
  notificationSettings: () => request<NotificationSettings>('/notifications/settings'),
  updateNotificationSettings: (payload: Omit<NotificationSettings, 'id'>) => request<NotificationSettings>('/notifications/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  notifications: (category = '', unread = false) => request<GymNotification[]>(`/notifications${category || unread ? `?${category ? `category=${encodeURIComponent(category)}` : ''}${category && unread ? '&' : ''}${unread ? 'unread=true' : ''}` : ''}`),
  markNotificationRead: (id: number) => request<GymNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),
  deleteNotification: (id: number) => request<{ success: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),
  deleteAllNotifications: () => request<{ success: boolean }>('/notifications', { method: 'DELETE' }),
}
