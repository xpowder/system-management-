import type { AuthUser } from './api'
import type { GymNotification } from './gymApi'

/** Matches fitness.controllers.ADMIN_ONLY_NOTIFICATION_TITLES. */
export const ADMIN_ONLY_NOTIFICATION_TITLES = [
  'Trainer added',
  'Trainer payroll updated',
  'Trainer removed',
  'Expense recorded',
  'New staff user created',
  'User role changed',
  'User deactivated',
] as const

export type Permission =
  | 'desk.use'
  | 'admin.users'
  | 'admin.assignSuper'
  | 'trainers.manage'
  | 'expenses.manage'
  | 'classes.mutate'
  | 'plans.mutate'
  | 'reports.financial'
  | 'account.update'

export function normalizedRole(user: AuthUser): string {
  return (user.role || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Backend is_admin: Admin / Super Admin, or is_staff when no group. */
export function isGymAdmin(user: AuthUser): boolean {
  const role = normalizedRole(user).replace(/ /g, '')
  if (normalizedRole(user)) return role === 'admin' || role === 'superadmin'
  return Boolean(user.is_staff)
}

/**
 * Backend is_gym_staff: is_staff / superuser, or Reception / Admin / Super Admin.
 * Trainer is assignable but is not desk staff unless also is_staff.
 */
export function isGymDesk(user: AuthUser): boolean {
  if (user.is_staff) return true
  const role = normalizedRole(user)
  return role === 'admin' || role === 'super admin' || role === 'reception'
}

export function isSuperAdmin(user: AuthUser): boolean {
  return normalizedRole(user) === 'super admin'
}

export function isAdminOnlyNotification(item: GymNotification): boolean {
  return (ADMIN_ONLY_NOTIFICATION_TITLES as readonly string[]).includes(item.title)
}

export function can(user: AuthUser, permission: Permission): boolean {
  switch (permission) {
    case 'desk.use':
      return isGymDesk(user)
    case 'admin.users':
    case 'trainers.manage':
    case 'expenses.manage':
    case 'classes.mutate':
    case 'plans.mutate':
    case 'reports.financial':
      return isGymAdmin(user)
    case 'admin.assignSuper':
      return isSuperAdmin(user)
    case 'account.update':
      return true
    default:
      return false
  }
}
