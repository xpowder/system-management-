import { translate } from './i18n'

export type BookingStatus = 'pending' | 'approved' | 'active' | 'completed' | 'cancelled' | 'rejected' | 'expired'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export interface Booking {
  id: number
  client_id: number
  provider_id: number
  property_ref_id: number
  start_date: string
  end_date: string
  monthly_price: string
  number_of_months: number
  total_price: string
  status: BookingStatus
  payment_status: PaymentStatus
  payment_method: 'cash' | 'check' | 'transfer'
  total_paid: string
  remaining_balance: string
  notes: string
  created_at: string
}
export interface Client { id: number; user_id: number; phone: string; city: string; id_number: string; user?: { first_name: string; last_name: string } }
export interface Property { id: number; provider_id: number; name: string; city: string; property_type: string; monthly_price: string | number; is_active: boolean }
export interface Dashboard { total_properties: number; available_properties: number; occupied_properties: number; active_bookings: number; pending_bookings: number; today_payments: string; month_payments: string; outstanding_balance: string }
export interface Payment { id: number; booking_id: number; amount: string; payment_method: string; received_by_user: string; received_at: string; receipt_number?: string; notes: string }
export interface AdminUser { id: number; username: string; first_name: string; last_name: string; email: string; is_active: boolean; is_staff: boolean; role: string; last_login?: string | null; date_joined: string }
export interface AuthUser { id: number; username: string; first_name: string; last_name: string; email: string; role?: string | null; is_staff: boolean; phone?: string; date_joined: string; last_login?: string | null }

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

function csrfToken() {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function humanizeField(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function looksLikeStackTrace(text: string) {
  return /Traceback \(most recent call last\)|File ".*", line \d+|^\s*at \S+ \(/m.test(text)
}

function flattenApiMessages(value: unknown, field?: string): string[] {
  if (value == null || value === '') return []
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text || text === '[object Object]' || looksLikeStackTrace(text)) return []
    if (field && !['detail', 'error', 'message', 'non_field_errors', 'msg'].includes(field)) {
      return [`${humanizeField(field)}: ${text}`]
    }
    return [text]
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => flattenApiMessages(item, field))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      if (key === 'traceback' || key === 'exception' || key === 'stack') return []
      return flattenApiMessages(item, key)
    })
  }
  return []
}

function isInvalidCredentialsMessage(text: string) {
  return /invalid username or password|invalid credentials|incorrect password/i.test(text)
}

type SessionExpiredListener = () => void
let sessionExpiredListener: SessionExpiredListener | null = null
let sessionExpiredNotified = false

export function setSessionExpiredListener(listener: SessionExpiredListener | null) {
  sessionExpiredListener = listener
}

export function resetSessionExpiredNotice() {
  sessionExpiredNotified = false
}

export function notifyIfSessionExpired(status: number, body: unknown) {
  if (status !== 401) return
  const joined = flattenApiMessages(body).join(' ').trim()
  if (isInvalidCredentialsMessage(joined)) return
  if (sessionExpiredNotified) return
  sessionExpiredNotified = true
  sessionExpiredListener?.()
}

export function formatHttpError(
  status: number,
  body: unknown,
  extras?: { notFound?: string; conflict?: string },
) {
  const joined = flattenApiMessages(body).join(' ').trim()
  if (status === 401) {
    if (isInvalidCredentialsMessage(joined)) {
      return joined
    }
    return translate('http.sessionExpired')
  }
  if (status === 403) return translate('http.forbidden')
  if (status === 404) return extras?.notFound || translate('http.notFound')
  if (status === 422) return joined || translate('http.badRequest')
  if (status === 429) return translate('http.tooMany')
  if (status >= 500) return translate('http.server')
  if (status === 409) {
    const lower = joined.toLowerCase()
    if (lower.includes('remaining balance') || lower.includes('payment exceeds')) {
      return extras?.conflict || translate('http.payStale')
    }
    if (lower.includes('cannot be deleted') || lower.includes('payment history')) {
      return extras?.conflict || translate('http.membershipProtected')
    }
    if (lower.includes('already checked in')) {
      return extras?.conflict || joined
    }
    return extras?.conflict || joined || translate('http.conflict')
  }
  if (joined) return joined
  if (status === 400) return translate('http.badRequest')
  return translate('http.generic')
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

const REQUEST_TIMEOUT_MS = 20_000

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const timed = withTimeoutSignal(options?.signal)
  try {
    const token = csrfToken()
    const headers: Record<string, string> = { ...(options?.headers as Record<string, string> | undefined) }
    if (options?.body) headers['Content-Type'] = 'application/json'
    if (token) headers['X-CSRFToken'] = token
    const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers, signal: timed.signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      notifyIfSessionExpired(response.status, body)
      throw new Error(formatHttpError(response.status, body))
    }
    return body as T
  } catch (error) {
    if (isAbortError(error)) {
      if (options?.signal?.aborted) throw error
      throw new Error(translate('http.timeout'))
    }
    if (error instanceof TypeError) throw new Error(translate('http.offline'))
    throw error
  } finally {
    timed.cleanup()
  }
}

export const bookingApi = {
  me: () => request<AuthUser>('/auth/me'),
  login: (payload: { username: string; password: string }) => request<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  updateMyProfile: (payload: { first_name: string; last_name: string; email: string; phone: string }) => request<AuthUser>('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  changeMyPassword: (payload: { current_password: string; new_password: string }) => request<AuthUser>('/auth/password', { method: 'POST', body: JSON.stringify(payload) }),
  adminUsers: (search = '') => request<AdminUser[]>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createAdminUser: (payload: { username: string; password: string; first_name: string; last_name: string; email: string; role: string }) => request<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdminUser: (id: number, payload: { first_name?: string; last_name?: string; email?: string; is_active?: boolean; role?: string; password?: string }) => request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAdminUser: (id: number) => request<{ success: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
  dashboard: () => request<Dashboard>('/dashboard'),
  bookings: (query = '') => request<Booking[]>(`/bookings${query ? `?${query}` : ''}`),
  booking: (id: number) => request<Booking>(`/bookings/${id}`),
  clients: () => request<Client[]>('/clients'),
  properties: () => request<Property[]>('/properties'),
  availability: (propertyId: number, start: string, end: string) => request<{ available: boolean }>(`/properties/${propertyId}/availability?start_date=${start}&end_date=${end}`),
  create: (payload: { client_id: number; provider_id: number; property_ref_id: number; start_date: string; end_date: string; notes: string }) => request<Booking>('/bookings', { method: 'POST', body: JSON.stringify(payload) }),
  approve: (id: number) => request<Booking>(`/bookings/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes: '' }) }),
  reject: (id: number, notes: string) => request<Booking>(`/bookings/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }),
  cancel: (id: number, notes: string) => request<Booking>(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ notes }) }),
  payments: (id: number) => request<Payment[]>(`/bookings/${id}/payments`),
  payment: (id: number, payload: { amount: string; received_by_user: string; notes: string }) => request<Payment>(`/bookings/${id}/payments`, { method: 'POST', body: JSON.stringify({ ...payload, payment_method: 'cash' }) }),
}
