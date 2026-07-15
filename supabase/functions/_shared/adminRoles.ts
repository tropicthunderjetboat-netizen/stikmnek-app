/** Keep in sync with `src/lib/adminRoles.ts`. */

export const ADMIN_EMAILS = [
  'admin@stikmnek.com',
  'testadmin@example.com',
  'stikmnek@gmail.com',
] as const;

export const STAFF_EMAILS = ['stikmnekstaff@gmail.com'] as const;

type ProfileRow = { role?: string | null; user_type?: string | null };

export function isListedAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]);
}

export function isListedStaffEmail(email: string): boolean {
  return STAFF_EMAILS.includes(email.toLowerCase() as (typeof STAFF_EMAILS)[number]);
}

export function profileIsFullAdmin(profile: ProfileRow | null | undefined): boolean {
  if (!profile) return false;
  return profile.role === 'admin' || profile.user_type === 'admin';
}

export function profileIsStaff(profile: ProfileRow | null | undefined): boolean {
  if (!profile) return false;
  return profile.role === 'staff' || profile.user_type === 'staff';
}

export async function fetchUserProfile(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('role, user_type')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export async function isFullAdminUser(
  supabase: { from: (table: string) => any },
  userId: string,
  email?: string,
): Promise<boolean> {
  if (email && isListedAdminEmail(email)) return true;
  const profile = await fetchUserProfile(supabase, userId);
  return profileIsFullAdmin(profile);
}

export async function isStaffUser(
  supabase: { from: (table: string) => any },
  userId: string,
  email?: string,
): Promise<boolean> {
  if (await isFullAdminUser(supabase, userId, email)) return false;
  if (email && isListedStaffEmail(email)) return true;
  const profile = await fetchUserProfile(supabase, userId);
  return profileIsStaff(profile);
}

export async function isStaffOrAdminUser(
  supabase: { from: (table: string) => any },
  userId: string,
  email?: string,
): Promise<boolean> {
  return (await isFullAdminUser(supabase, userId, email)) || (await isStaffUser(supabase, userId, email));
}

/** Actions staff may invoke via manage-business (onboard + businesses + approvals). */
export const STAFF_ALLOWED_ACTIONS = new Set([
  'diagnose_business_photos',
  'get_pending',
  'get_pending_edits',
  'get_owner_offerings_live',
  'attach_pending_photos',
  'admin_create_business',
  'admin_create_business_user',
  'admin_create_listing_for_owner',
  'review_business',
  'repair_approved_submission',
  'sync_listing_gallery',
  'submit_edit',
  'review_edit',
  'update_business',
  'toggle_active',
  'reactivate_offering',
  'get_all_photos',
  'approve_photo',
  'reject_photo',
  'replace_photo',
  'get_analytics',
  'upsert_business_credentials',
  'admin_verify_credential',
  'get_credential_signed_url',
  'get_business_credentials',
]);
