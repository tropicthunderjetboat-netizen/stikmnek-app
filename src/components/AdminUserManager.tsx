import React, { useState, useEffect, useCallback } from 'react';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Users, Trash2, Loader2, RefreshCw, AlertTriangle, Shield,
  ShieldCheck, Briefcase, User, CheckCircle, XCircle, X, Search, Copy
} from 'lucide-react';

interface UserProfile {
  id: string;
  user_id: string;
  role: 'tourist' | 'business' | 'admin';
  display_name: string;
  email?: string;
  created_at: string;
  updated_at?: string;
}

// All public tables that may reference user_id
const USER_DEPENDENT_TABLES = [
  { table: 'favorites', column: 'user_id' },
  { table: 'pass_purchases', column: 'user_id' },
  { table: 'payment_sessions', column: 'user_id' },
  { table: 'passes', column: 'user_id' },
  { table: 'redemptions', column: 'user_id' },
  { table: 'search_history', column: 'user_id' },
  { table: 'notifications', column: 'user_id' },
  { table: 'feedback', column: 'user_id' },
  { table: 'error_logs', column: 'user_id' },
  { table: 'reviews', column: 'user_id' },
  { table: 'review_responses', column: 'user_id' },
  { table: 'business_photos', column: 'uploaded_by' },
  { table: 'pending_businesses', column: 'owner_id' },
  { table: 'pending_edits', column: 'owner_id' },
  { table: 'social_activity', column: 'user_id' },
];

const ADMIN_EMAIL = 'admin@stikmnek.com';

function getInvokeHttpStatus(error: unknown): number | null {
  try {
    const ctx = (error as { context?: Response })?.context;
    if (ctx && typeof ctx.status === 'number') return ctx.status;
  } catch {
    /* ignore */
  }
  return null;
}

async function getInvokeErrorJson(error: unknown): Promise<Record<string, unknown> | null> {
  try {
    const res = (error as { context?: Response })?.context;
    if (res && typeof res.clone === 'function') {
      const body = await res.clone().json();
      return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// FAULT-TOLERANT SQL - each DELETE wrapped in its own block
// so missing tables won't crash the whole script
// ═══════════════════════════════════════════════════════════
const ROBUST_SQL_SCRIPT = `-- FAULT-TOLERANT: Delete ALL non-admin users
-- Keeps: admin@stikmnek.com
-- Each table wrapped in its own block so missing tables are skipped

DO $$
DECLARE
  admin_id uuid;
  r record;
  del_count int := 0;
BEGIN
  -- Step 1: Find admin user ID
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@stikmnek.com';
  
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin user admin@stikmnek.com not found in auth.users!';
  END IF;
  
  RAISE NOTICE 'Admin ID: %', admin_id;

  -- Step 2: Clean each public table (skip if table doesn't exist)
  BEGIN DELETE FROM favorites WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'favorites: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: favorites table not found'; WHEN undefined_column THEN RAISE NOTICE 'SKIP: favorites column mismatch'; WHEN OTHERS THEN RAISE NOTICE 'SKIP favorites: %', SQLERRM; END;

  BEGIN DELETE FROM pass_purchases WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'pass_purchases: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: pass_purchases table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP pass_purchases: %', SQLERRM; END;

  BEGIN DELETE FROM passes WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'passes: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: passes table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP passes: %', SQLERRM; END;

  BEGIN DELETE FROM redemptions WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'redemptions: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: redemptions table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP redemptions: %', SQLERRM; END;

  BEGIN DELETE FROM search_history WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'search_history: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: search_history table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP search_history: %', SQLERRM; END;

  BEGIN DELETE FROM support_tickets WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'support_tickets: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: support_tickets table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP support_tickets: %', SQLERRM; END;

  BEGIN DELETE FROM notifications WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'notifications: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: notifications table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP notifications: %', SQLERRM; END;

  BEGIN DELETE FROM feedback WHERE user_id IS NOT NULL AND user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'feedback: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: feedback table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP feedback: %', SQLERRM; END;

  BEGIN DELETE FROM error_logs WHERE user_id IS NOT NULL AND user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'error_logs: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: error_logs table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP error_logs: %', SQLERRM; END;

  BEGIN DELETE FROM reviews WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'reviews: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: reviews table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP reviews: %', SQLERRM; END;

  BEGIN DELETE FROM review_responses WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'review_responses: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: review_responses table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP review_responses: %', SQLERRM; END;

  BEGIN DELETE FROM business_photos WHERE uploaded_by != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'business_photos: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: business_photos table not found'; WHEN undefined_column THEN RAISE NOTICE 'SKIP: business_photos.uploaded_by column not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP business_photos: %', SQLERRM; END;

  BEGIN DELETE FROM pending_businesses WHERE owner_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'pending_businesses: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: pending_businesses table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP pending_businesses: %', SQLERRM; END;

  BEGIN DELETE FROM pending_edits WHERE owner_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'pending_edits: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: pending_edits table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP pending_edits: %', SQLERRM; END;

  -- Step 3: Delete user_profiles
  BEGIN DELETE FROM user_profiles WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'user_profiles: % rows deleted', del_count; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP user_profiles: %', SQLERRM; END;

  -- Step 4: Delete from auth.users (the important part!)
  FOR r IN SELECT id, email FROM auth.users WHERE id != admin_id
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = r.id;
      RAISE NOTICE 'Deleted auth user: % (%)', r.email, r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FAILED to delete auth user % (%): %', r.email, r.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DONE! All non-admin users deleted.';
  RAISE NOTICE 'Admin preserved: admin@stikmnek.com';
  RAISE NOTICE '========================================';
END $$;`;

// ═══════════════════════════════════════════════════════════
// SIMPLE VERSION - just user_profiles + auth.users
// ═══════════════════════════════════════════════════════════
const SIMPLE_SQL_SCRIPT = `-- SIMPLE VERSION: Just delete user_profiles + auth.users
-- Use this if the full script fails

-- Step 1: Delete all non-admin profiles
DELETE FROM user_profiles 
WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');

-- Step 2: Delete all non-admin auth users
-- Run this AFTER step 1 succeeds
DO $$
DECLARE
  admin_id uuid;
  r record;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@stikmnek.com';
  FOR r IN SELECT id, email FROM auth.users WHERE id != admin_id
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = r.id;
      RAISE NOTICE 'Deleted: %', r.email;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed %: %', r.email, SQLERRM;
    END;
  END LOOP;
END $$;`;

// ═══════════════════════════════════════════════════════════
// STEP BY STEP - individual queries to run one at a time
// ═══════════════════════════════════════════════════════════
const STEP_BY_STEP_QUERIES = [
  `DELETE FROM favorites WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM pass_purchases WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM passes WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM redemptions WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM search_history WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM support_tickets WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM notifications WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM feedback WHERE user_id IS NOT NULL AND user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM error_logs WHERE user_id IS NOT NULL AND user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM reviews WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM review_responses WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM pending_businesses WHERE owner_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM pending_edits WHERE owner_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `DELETE FROM user_profiles WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`,
  `-- LAST: Delete auth users (run this after ALL above succeed)
DO $$ DECLARE admin_id uuid; r record; BEGIN SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@stikmnek.com'; FOR r IN SELECT id FROM auth.users WHERE id != admin_id LOOP DELETE FROM auth.users WHERE id = r.id; END LOOP; END $$;`,
];


const AdminUserManager: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [showSingleConfirm, setShowSingleConfirm] = useState<string | null>(null);
  const [deletionLog, setDeletionLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Strategy 1: RPC (bypasses RLS, admin-only)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_all_users_for_admin');
      if (!rpcError && Array.isArray(rpcData)) {
        setUsers((rpcData || []) as UserProfile[]);
        return;
      }
      // Strategy 2: Direct query (may fail if RLS blocks)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers((data || []) as UserProfile[]);
    } catch (err: any) {
      toast.error('Failed to load users: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const addLog = (msg: string) => {
    setDeletionLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  /** Clears app tables; `authDeleted` is true only when the edge function removed `auth.users`. */
  const cleanUserData = async (
    userId: string,
    displayName: string,
  ): Promise<{ profilesOk: boolean; authDeleted: boolean }> => {
    let profilesOk = true;
    let authDeleted = false;

    for (const { table, column } of USER_DEPENDENT_TABLES) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq(column, userId);

        if (error) {
          addLog(`  [WARN] ${table}: ${error.message}`);
        } else {
          addLog(`  [OK] Cleaned ${table}`);
        }
      } catch (err: any) {
        addLog(`  [SKIP] ${table}: ${err.message}`);
      }
    }

    // referrals: referrer_id OR referred_user_id (not a single-column eq)
    try {
      const { error } = await supabase
        .from('referrals')
        .delete()
        .or(`referrer_id.eq.${userId},referred_user_id.eq.${userId}`);
      if (error) addLog(`  [WARN] referrals: ${error.message}`);
      else addLog(`  [OK] Cleaned referrals`);
    } catch (err: any) {
      addLog(`  [SKIP] referrals: ${err.message}`);
    }

    // support tickets: responses first (FK), then tickets
    try {
      await supabase.from('ticket_responses').delete().eq('responder_id', userId);
      const { data: ticketIds } = await supabase.from('support_tickets').select('id').eq('user_id', userId);
      const ids = (ticketIds || []).map((r: { id: string }) => r.id).filter(Boolean);
      if (ids.length > 0) {
        await supabase.from('ticket_responses').delete().in('ticket_id', ids);
      }
      const { error: stErr } = await supabase.from('support_tickets').delete().eq('user_id', userId);
      if (stErr) addLog(`  [WARN] support_tickets: ${stErr.message}`);
      else addLog(`  [OK] Cleaned support_tickets / ticket_responses`);
    } catch (err: any) {
      addLog(`  [SKIP] support_tickets: ${err.message}`);
    }

    // Remove approved business profiles owned by this user (cascades to business_offerings, etc.)
    try {
      const { error } = await supabase.from('businesses').delete().eq('owner_id', userId);
      if (error) {
        addLog(`  [WARN] businesses (owner listings): ${error.message}`);
      } else {
        addLog(`  [OK] Removed businesses owned by this user`);
      }
    } catch (err: any) {
      addLog(`  [SKIP] businesses: ${err.message}`);
    }

    // Delete from user_profiles
    try {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('user_id', userId);

      if (error) {
        addLog(`  [ERROR] user_profiles: ${error.message}`);
        profilesOk = false;
      } else {
        addLog(`  [OK] Deleted user_profiles record`);
      }
    } catch (err: any) {
      addLog(`  [ERROR] user_profiles: ${err.message}`);
      profilesOk = false;
    }

    // Remove auth user — required or the email stays reserved and sign-up says "already exists"
    try {
      const headers = await getEdgeAuthHeaders();
      if (!headers.Authorization) {
        addLog(`  [ERROR] auth.users: No admin session — sign in again, then retry delete, or remove user in Supabase Dashboard → Authentication`);
      } else {
        const { data, error } = await supabase.functions.invoke('manage-business', {
          body: {
            action: 'admin_delete_user',
            userId: userId,
            targetUserId: userId,
          },
          headers,
        });
        const status = getInvokeHttpStatus(error);
        const errJson = error ? await getInvokeErrorJson(error) : null;
        const serverError =
          (typeof errJson?.error === 'string' && errJson.error) ||
          (typeof (data as { error?: string } | null)?.error === 'string' && (data as { error: string }).error) ||
          '';
        const msg = serverError || (error as { message?: string } | null)?.message || '';

        // #region agent log
        fetch('http://127.0.0.1:7527/ingest/1d246a66-fce1-41c9-9015-ebb5a8c5e87f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7b96fa' },
          body: JSON.stringify({
            sessionId: '7b96fa',
            location: 'AdminUserManager.tsx:admin_delete_user',
            message: 'manage-business admin_delete_user invoke result',
            data: {
              hypothesisId: 'H1-H5',
              httpStatus: status,
              hasError: Boolean(error),
              dataSuccess: (data as { success?: boolean } | null)?.success === true,
              serverErrorSnippet: serverError ? serverError.slice(0, 240) : null,
              errorCode: errJson?.errorCode ?? null,
              targetUserIdLen: typeof userId === 'string' ? userId.length : null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        if (error || (data as { error?: string } | null)?.error) {
          addLog(
            `  [ERROR] auth.users (HTTP ${status ?? '?'})${serverError ? `: ${serverError}` : `: ${msg || 'Edge function failed'}`} — if this persists, delete in Dashboard → Authentication → Users`,
          );
        } else if ((data as { success?: boolean } | null)?.success === true) {
          authDeleted = true;
          addLog(`  [OK] Deleted from auth.users (email can be reused)`);
        } else {
          addLog(`  [ERROR] auth.users: Unexpected response — delete manually in Supabase Dashboard → Authentication`);
        }
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      addLog(`  [ERROR] auth.users: ${m} — delete manually in Supabase Dashboard → Authentication`);
    }

    return { profilesOk, authDeleted };
  };

  // Delete a single user
  const handleDeleteUser = async (userId: string) => {
    const userProfile = users.find(u => u.user_id === userId);
    if (!userProfile) return;

    if (userProfile.role === 'admin') {
      toast.error('Cannot delete admin users!');
      return;
    }

    setDeletingUserId(userId);
    setDeletionLog([]);
    setShowLog(true);
    addLog(`Deleting user: ${userProfile.display_name || userProfile.email || userId}`);

    try {
      const { profilesOk, authDeleted } = await cleanUserData(
        userId,
        userProfile.display_name || 'Unknown',
      );
      if (profilesOk) {
        setUsers(prev => prev.filter(u => u.user_id !== userId));
      }
      if (profilesOk && authDeleted) {
        toast.success(`User "${userProfile.display_name || 'Unknown'}" fully removed (profile + login).`);
        addLog(`Done! Profile and Authentication user removed — email can sign up again.`);
      } else if (profilesOk && !authDeleted) {
        toast.error('Profile removed, but login still exists in Supabase Auth', {
          description:
            'That email cannot register again until you delete the user in Supabase Dashboard → Authentication → Users (search by email).',
          duration: 12000,
        });
        addLog(`Done with warning: remove ${userProfile.email || 'this user'} from Authentication manually.`);
      } else {
        toast.error('Could not fully delete user — check the log for details.');
        addLog(`Done with errors — review log above.`);
      }
    } catch (err: any) {
      toast.error('Failed to delete user: ' + (err.message || 'Unknown error'));
      addLog(`ERROR: ${err.message}`);
    } finally {
      setDeletingUserId(null);
      setShowSingleConfirm(null);
    }
  };

  // Bulk delete all non-admin users
  const handleBulkDelete = async () => {
    const nonAdminUsers = users.filter(u => u.role !== 'admin');
    if (nonAdminUsers.length === 0) {
      toast.info('No non-admin users to delete');
      return;
    }

    setBulkDeleting(true);
    setDeletionLog([]);
    setShowLog(true);
    addLog(`Starting bulk deletion of ${nonAdminUsers.length} non-admin user(s)...`);
    addLog(`Admin account (${ADMIN_EMAIL}) will be preserved.`);
    addLog('─'.repeat(50));

    let deletedCount = 0;
    let failedCount = 0;
    let authMissCount = 0;

    for (const userProfile of nonAdminUsers) {
      addLog(`\nProcessing: ${userProfile.display_name || userProfile.email || userProfile.user_id} (${userProfile.role})`);

      try {
        const { profilesOk, authDeleted } = await cleanUserData(
          userProfile.user_id,
          userProfile.display_name || 'Unknown',
        );
        if (profilesOk) {
          deletedCount++;
          if (!authDeleted) authMissCount++;
        } else {
          failedCount++;
        }
      } catch (err: any) {
        addLog(`  [ERROR] ${err.message}`);
        failedCount++;
      }

      await new Promise(r => setTimeout(r, 200));
    }

    addLog('─'.repeat(50));
    addLog(`\nBulk deletion complete!`);
    addLog(`  Profiles cleared: ${deletedCount} user(s)`);
    if (failedCount > 0) addLog(`  Profile errors: ${failedCount}`);
    if (authMissCount > 0) {
      addLog(`  Auth not removed for ${authMissCount} user(s) — Dashboard → Authentication → Users`);
    }

    await loadUsers();

    toast.success(`Processed ${deletedCount} user(s)`, {
      description:
        failedCount > 0
          ? `${failedCount} profile error(s). ${authMissCount > 0 ? `${authMissCount} still need Auth cleanup in Dashboard.` : ''}`
          : authMissCount > 0
            ? `${authMissCount} login(s) still in Authentication — remove in Supabase Dashboard if emails must be reused.`
            : 'Public data and Auth users removed where the edge function succeeded.',
      duration: 10000,
    });

    setBulkDeleting(false);
    setShowBulkConfirm(false);
  };

  const nonAdminUsers = users.filter(u => u.role !== 'admin');
  const filteredUsers = users.filter(u =>
    (u.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <ShieldCheck className="w-4 h-4 text-purple-600" />;
      case 'business': return <Briefcase className="w-4 h-4 text-blue-600" />;
      default: return <User className="w-4 h-4 text-teal-600" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'business': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-teal-50 text-teal-700 border-teal-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              <p className="text-xs text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <User className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-teal-700">{users.filter(u => u.role === 'tourist').length}</p>
              <p className="text-xs text-gray-500">Tourists</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{users.filter(u => u.role === 'business').length}</p>
              <p className="text-xs text-gray-500">Businesses</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700">{users.filter(u => u.role === 'admin').length}</p>
              <p className="text-xs text-gray-500">Admins</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name, email, role, or ID..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {nonAdminUsers.length > 0 && (
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Non-Admin ({nonAdminUsers.length})
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">User Deletion Process</p>
            <p className="text-xs text-amber-700 mt-1">
              Clicking "Delete" removes all user data from public tables (profiles, favorites, passes, redemptions, etc.).
              After deletion, you may also need to remove the auth record from{' '}
              <strong>Supabase Dashboard &gt; Authentication &gt; Users</strong> to fully free the email for reuse.
            </p>
          </div>
        </div>
      </div>

      {/* Users table */}
      {loading && users.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading users...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">User</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">User ID</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Created</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(userProfile => {
                  const isAdmin = userProfile.role === 'admin';
                  return (
                    <tr key={userProfile.id} className={`hover:bg-gray-50 transition-colors ${isAdmin ? 'bg-purple-50/30' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                            isAdmin ? 'bg-purple-100' : userProfile.role === 'business' ? 'bg-blue-100' : 'bg-teal-100'
                          }`}>
                            {getRoleIcon(userProfile.role)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {userProfile.display_name || 'No name'}
                              {isAdmin && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold uppercase">Protected</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">{userProfile.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold capitalize border ${getRoleBadge(userProfile.role)}`}>
                          {getRoleIcon(userProfile.role)}
                          {userProfile.role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <code className="text-[11px] text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded">
                          {userProfile.user_id.substring(0, 8)}...
                        </code>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-gray-500">
                          {new Date(userProfile.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {isAdmin ? (
                          <span className="flex items-center gap-1.5 text-xs text-purple-500 font-semibold">
                            <Shield className="w-3.5 h-3.5" />
                            Protected
                          </span>
                        ) : (
                          <button
                            onClick={() => setShowSingleConfirm(userProfile.user_id)}
                            disabled={deletingUserId === userProfile.user_id || bulkDeleting}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            {deletingUserId === userProfile.user_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
            <div className="p-8 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {searchQuery ? 'No users match your search.' : 'No users found in the database.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Deletion Log */}
      {showLog && deletionLog.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-green-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Deletion Log
            </h4>
            <button
              onClick={() => { setShowLog(false); setDeletionLog([]); }}
              className="p-1 rounded hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
            {deletionLog.map((line, i) => (
              <div key={i} className={`${
                line.includes('[OK]') ? 'text-green-400' :
                line.includes('[ERROR]') ? 'text-red-400' :
                line.includes('[WARN]') ? 'text-yellow-400' :
                line.includes('[INFO]') ? 'text-blue-400' :
                line.includes('[SKIP]') ? 'text-gray-500' :
                line.includes('IMPORTANT') ? 'text-amber-400 font-bold' :
                line.includes('Done') || line.includes('complete') ? 'text-green-300 font-bold' :
                'text-gray-300'
              }`}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SQL HELPER - FAULT TOLERANT VERSION ═══ */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Shield className="w-4 h-4 text-teal-600" />
          Fault-Tolerant SQL Script (Supabase SQL Editor)
        </h4>
        <p className="text-xs text-gray-500 mb-1">
          This script skips tables that don't exist and won't fail on missing columns.
          Copy and paste into <strong>Supabase Dashboard &gt; SQL Editor</strong> and click <strong>Run</strong>.
        </p>
        <p className="text-xs text-red-600 font-semibold mb-3">
          Keeps admin@stikmnek.com. Deletes ALL other users from every table including auth.users.
        </p>
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-[11px] text-green-400 overflow-x-auto max-h-80 overflow-y-auto">
          <pre className="whitespace-pre-wrap">{ROBUST_SQL_SCRIPT}</pre>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(ROBUST_SQL_SCRIPT);
              toast.success('Fault-tolerant SQL copied to clipboard!', {
                description: 'Paste in Supabase SQL Editor and click Run',
                duration: 5000,
              });
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors shadow-sm"
          >
            <Copy className="w-4 h-4" />
            Copy Fault-Tolerant SQL
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(SIMPLE_SQL_SCRIPT);
              toast.success('Simple SQL copied!', {
                description: 'Try this if the full script fails',
                duration: 5000,
              });
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Simple Version
          </button>
        </div>
      </div>

      {/* ═══ STEP BY STEP MANUAL INSTRUCTIONS ═══ */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          If SQL Still Fails - Run One at a Time
        </h4>
        <p className="text-xs text-gray-500 mb-4">
          Run each query individually in the SQL Editor. <strong>Skip any that give errors</strong> and move to the next. 
          The last step (auth.users) is the most important one.
        </p>
        <div className="space-y-2">
          {STEP_BY_STEP_QUERIES.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center mt-1 ${
                i === STEP_BY_STEP_QUERIES.length - 1 
                  ? 'bg-red-100 text-red-700' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {i + 1}
              </span>
              <code className="flex-1 text-[10px] text-gray-700 font-mono bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 break-all leading-relaxed">
                {q.length > 120 ? q.substring(0, 120) + '...' : q}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(q);
                  toast.success(`Step ${i + 1} copied!`);
                }}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors mt-0.5 ${
                  i === STEP_BY_STEP_QUERIES.length - 1
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-700">
            <strong>Last resort:</strong> Go to <strong>Supabase Dashboard &gt; Authentication &gt; Users</strong> and manually delete each user 
            (click the 3 dots next to each user &gt; Delete User). This always works but is slower.
          </p>
        </div>
      </div>

      {/* ═══ BULK DELETE CONFIRMATION MODAL ═══ */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !bulkDeleting && setShowBulkConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900">Delete All Non-Admin Users</h3>
                <p className="text-xs text-red-600">This action cannot be undone</p>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4">
                This will delete <strong className="text-red-600">{nonAdminUsers.length} user(s)</strong> and all their associated data from the database.
              </p>
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 mb-4">
                <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Protected: {ADMIN_EMAIL} (admin) will NOT be deleted
                </p>
              </div>
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">Users to be deleted:</p>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {nonAdminUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-red-50">
                      {getRoleIcon(u.role)}
                      <span className="font-medium text-gray-700">{u.display_name || 'No name'}</span>
                      <span className="text-gray-400">({u.role})</span>
                      {u.email && <span className="text-gray-400 ml-auto">{u.email}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase">Data to be removed:</p>
                {[
                  'User profiles', 'Favorites', 'Passes & redemptions',
                  'Search history', 'Support tickets', 'Notifications',
                  'Feedback', 'Reviews', 'Pending business submissions'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkConfirm(false)}
                disabled={bulkDeleting}
                className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {bulkDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete {nonAdminUsers.length} User(s)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SINGLE DELETE CONFIRMATION MODAL ═══ */}
      {showSingleConfirm && (() => {
        const userToDelete = users.find(u => u.user_id === showSingleConfirm);
        if (!userToDelete) return null;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deletingUserId && setShowSingleConfirm(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900">Delete User</h3>
                  <p className="text-xs text-red-600">This will remove all user data</p>
                </div>
              </div>
              <div className="px-6 py-5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 mb-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    userToDelete.role === 'business' ? 'bg-blue-100' : 'bg-teal-100'
                  }`}>
                    {getRoleIcon(userToDelete.role)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{userToDelete.display_name || 'No name'}</p>
                    <p className="text-xs text-gray-500">{userToDelete.email || userToDelete.user_id}</p>
                    <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold capitalize border ${getRoleBadge(userToDelete.role)}`}>
                      {userToDelete.role}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete this user and all their associated data?
                </p>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowSingleConfirm(null)}
                  disabled={!!deletingUserId}
                  className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(showSingleConfirm)}
                  disabled={!!deletingUserId}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {deletingUserId === showSingleConfirm ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete User
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AdminUserManager;
