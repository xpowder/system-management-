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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const token = csrfToken()
    const headers: Record<string, string> = { ...(options?.headers as Record<string, string> | undefined) }
    if (options?.body) headers['Content-Type'] = 'application/json'
    if (token) headers['X-CSRFToken'] = token
    const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.detail || body.error || ({ 401: 'Your session has expired. Please log in again.', 403: "You don't have permission to perform this action.", 404: 'The requested record was not found.', 409: 'This property is no longer available for the selected dates.' } as Record<number, string>)[response.status] || 'Something went wrong. Please try again.')
    return body as T
  } catch (error) {
    if (error instanceof TypeError) throw new Error("You're currently offline. Homezup needs an internet connection to access the booking database.")
    throw error
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
