/** Full admins — all admin panel tabs and destructive actions. */
export const ADMIN_EMAILS = [
  'admin@stikmnek.com',
  'testadmin@example.com',
  'stikmnek@gmail.com',
] as const;

/** Onboarding staff — Onboard + Businesses + Approvals only. */
export const STAFF_EMAILS = ['stikmnekstaff@gmail.com'] as const;

export type AppRole = 'tourist' | 'business' | 'admin' | 'staff';

export type AdminTab =
  | 'overview'
  | 'businesses'
  | 'approvals'
  | 'reviews'
  | 'users'
  | 'onboard'
  | 'passes'
  | 'promos'
  | 'emails'
  | 'reports';

export const FULL_ADMIN_TABS: AdminTab[] = [
  'overview',
  'businesses',
  'approvals',
  'reviews',
  'users',
  'onboard',
  'passes',
  'promos',
  'emails',
  'reports',
];

export const STAFF_ADMIN_TABS: AdminTab[] = ['onboard', 'businesses', 'approvals'];

export function isListedAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]);
}

export function isListedStaffEmail(email: string): boolean {
  return STAFF_EMAILS.includes(email.toLowerCase() as (typeof STAFF_EMAILS)[number]);
}

export function isFullAdmin(role: string, email?: string): boolean {
  if (email && isListedAdminEmail(email)) return true;
  return role === 'admin';
}

export function isStaff(role: string, email?: string): boolean {
  if (isFullAdmin(role, email)) return false;
  if (email && isListedStaffEmail(email)) return true;
  return role === 'staff';
}

export function canAccessAdminPanel(role: string, email?: string): boolean {
  return isFullAdmin(role, email) || isStaff(role, email);
}

export function isAdminPanelUser(type: string): boolean {
  return type === 'admin' || type === 'staff';
}

export function adminTabsFor(role: string, email?: string): AdminTab[] {
  if (isFullAdmin(role, email)) return FULL_ADMIN_TABS;
  if (isStaff(role, email)) return STAFF_ADMIN_TABS;
  return [];
}

export function defaultAdminTab(role: string, email?: string): AdminTab {
  if (isStaff(role, email) && !isFullAdmin(role, email)) return 'onboard';
  return 'overview';
}

export function canUseDestructiveAdminActions(role: string, email?: string): boolean {
  return isFullAdmin(role, email);
}
