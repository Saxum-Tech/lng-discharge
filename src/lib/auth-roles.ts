import type { UserRole } from '@/lib/types'

export const ADMIN_ROLES = ['superadmin'] as const satisfies readonly UserRole[]
export const PORTAL_ROLES = ['superadmin', 'company_admin', 'viewer'] as const satisfies readonly UserRole[]

export type AdminRole = (typeof ADMIN_ROLES)[number]
export type PortalRole = (typeof PORTAL_ROLES)[number]

export function roleCanAccessAdmin(role: UserRole | null | undefined): role is AdminRole {
  return role === 'superadmin'
}

export function roleCanAccessPortal(role: UserRole | null | undefined): role is PortalRole {
  return role === 'superadmin' || role === 'company_admin' || role === 'viewer'
}

export function roleIsAllowed(role: UserRole | null | undefined, allowedRoles: readonly UserRole[]) {
  return Boolean(role && allowedRoles.includes(role))
}
