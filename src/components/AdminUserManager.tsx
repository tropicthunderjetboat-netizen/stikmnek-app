import React, { useState, useEffect, useCallback } from 'react';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Users, Trash2, Loader2, RefreshCw, AlertTriangle,
  ShieldCheck, Briefcase, User, CheckCircle, XCircle, X, Search, Shield, FileText
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
      const clone = res.clone();
      const ct = clone.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await clone.json();
        return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
      }
      const text = await clone.text();
      if (text && text.trim().startsWith('{')) {
        const body = JSON.parse(text) as Record<string, unknown>;
        return body && typeof body === 'object' ? body : null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Real message from edge JSON body — often in `data` even when invoke sets a generic `error`. */
function getEdgeFunctionErrorMessage(
  data: unknown,
  errJson: Record<string, unknown> | null,
  invokeError: unknown,
): string {
  const fromObj = (o: unknown): string => {
    if (!o || typeof o !== 'object') return '';
    const r = o as Record<string, unknown>;
    if (typeof r.error === 'string' && r.error.trim()) return r.error.trim();
    if (typeof r.message === 'string' && r.message.trim()) return r.message.trim();
    return '';
  };
  return (
    fromObj(data) ||
    (errJson && (typeof errJson.error === 'string' ? errJson.error.trim() : '')) ||
    (errJson && (typeof errJson.message === 'string' ? errJson.message.trim() : '')) ||
    (invokeError as { message?: string } | null)?.message?.trim() ||
    ''
  );
}

const AdminUserManager: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'tourist' | 'business' | 'admin'>('all');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [showSingleConfirm, setShowSingleConfirm] = useState<string | null>(null);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [bulkDeleteAcknowledged, setBulkDeleteAcknowledged] = useState(false);
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

  /** Server-side purge + `auth.admin.deleteUser` via `manage-business` (service role). */
  const invokeAdminDeleteUser = async (
    userId: string,
    logLine: (msg: string) => void,
  ): Promise<{ ok: boolean; message: string }> => {
    const headers = await getEdgeAuthHeaders();
    if (!headers.Authorization) {
      return { ok: false, message: 'No admin session. Sign in again and retry.' };
    }
    const { data, error } = await supabase.functions.invoke('manage-business', {
      body: {
        action: 'admin_delete_user',
        userId,
        targetUserId: userId,
      },
      headers,
    });
    const errJson = error ? await getInvokeErrorJson(error) : null;
    const msg = getEdgeFunctionErrorMessage(data, errJson, error);
    const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const failed =
      Boolean(error) ||
      payload?.success === false ||
      (typeof payload?.error === 'string' && payload.error.length > 0);
    if (failed) {
      const status = getInvokeHttpStatus(error);
      const generic = msg === 'Edge Function returned a non-2xx status code' || !msg;
      const detail = generic ? 'Edge function request failed' : msg;
      logLine(`  [ERROR] ${detail}${status != null ? ` (HTTP ${status})` : ''}`);
      return {
        ok: false,
        message: generic
          ? 'Could not delete user. If this persists: redeploy manage-business (see config verify_jwt), then check Edge Function logs in Supabase.'
          : msg,
      };
    }
    if ((data as { success?: boolean } | null)?.success === true) {
      logLine('  [OK] Public data cleared and auth user removed.');
      return { ok: true, message: '' };
    }
    logLine('  [ERROR] Unexpected response from server.');
    return { ok: false, message: 'Unexpected response from server.' };
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
      const { ok, message } = await invokeAdminDeleteUser(userId, addLog);
      if (ok) {
        setUsers(prev => prev.filter(u => u.user_id !== userId));
        toast.success(
          `User "${userProfile.display_name || 'Unknown'}" removed (data + login).`,
        );
        addLog('Done. Email can be used for a new account.');
      } else {
        toast.error(message);
        addLog(`Failed: ${message}`);
      }
    } catch (err: any) {
      toast.error('Failed to delete user: ' + (err.message || 'Unknown error'));
      addLog(`ERROR: ${err.message}`);
    } finally {
      setDeletingUserId(null);
      setDeleteAcknowledged(false);
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

    for (const userProfile of nonAdminUsers) {
      addLog(`\nProcessing: ${userProfile.display_name || userProfile.email || userProfile.user_id} (${userProfile.role})`);

      try {
        const { ok } = await invokeAdminDeleteUser(userProfile.user_id, addLog);
        if (ok) deletedCount++;
        else failedCount++;
      } catch (err: any) {
        addLog(`  [ERROR] ${err.message}`);
        failedCount++;
      }

      await new Promise(r => setTimeout(r, 200));
    }

    addLog('─'.repeat(50));
    addLog(`\nBulk deletion complete!`);
    addLog(`  Removed: ${deletedCount} user(s)`);
    if (failedCount > 0) addLog(`  Failed: ${failedCount}`);

    await loadUsers();

    toast.success(`Removed ${deletedCount} user(s)`, {
      description:
        failedCount > 0
          ? `${failedCount} could not be removed — see the log for details.`
          : 'Each user was purged and deleted from authentication.',
      duration: 10000,
    });

    setBulkDeleting(false);
    setBulkDeleteAcknowledged(false);
    setShowBulkConfirm(false);
  };

  const nonAdminUsers = users.filter(u => u.role !== 'admin');
  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.user_id.toLowerCase().includes(q)
    );
  });

  const roleCounts = {
    all: users.length,
    tourist: users.filter((u) => u.role === 'tourist').length,
    business: users.filter((u) => u.role === 'business').length,
    admin: users.filter((u) => u.role === 'admin').length,
  };

  const handleRoleFilter = (filter: typeof roleFilter) => {
    setRoleFilter(filter);
    setSearchQuery('');
  };

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
      {/* Header with stats — click to filter the list */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => handleRoleFilter('all')}
          className={`p-4 rounded-xl bg-white border shadow-sm text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
            roleFilter === 'all' ? 'border-teal-400 ring-2 ring-teal-200' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{roleCounts.all}</p>
              <p className="text-xs text-gray-500">Total Users</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleRoleFilter('tourist')}
          className={`p-4 rounded-xl bg-white border shadow-sm text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
            roleFilter === 'tourist' ? 'border-teal-400 ring-2 ring-teal-200' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <User className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-teal-700">{roleCounts.tourist}</p>
              <p className="text-xs text-gray-500">Tourists</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleRoleFilter('business')}
          className={`p-4 rounded-xl bg-white border shadow-sm text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            roleFilter === 'business' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{roleCounts.business}</p>
              <p className="text-xs text-gray-500">Businesses</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleRoleFilter('admin')}
          className={`p-4 rounded-xl bg-white border shadow-sm text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            roleFilter === 'admin' ? 'border-purple-400 ring-2 ring-purple-200' : 'border-gray-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700">{roleCounts.admin}</p>
              <p className="text-xs text-gray-500">Admins</p>
            </div>
          </div>
        </button>
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
        <div className="flex items-center gap-3 flex-wrap">
          {roleFilter !== 'all' && (
            <button
              type="button"
              onClick={() => handleRoleFilter('all')}
              className="px-3 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold hover:bg-teal-100 transition-colors"
            >
              Clear filter · showing {roleFilter}s
            </button>
          )}
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
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
                            onClick={() => {
                            setDeleteAcknowledged(false);
                            setShowSingleConfirm(userProfile.user_id);
                          }}
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
                {searchQuery
                  ? 'No users match your search.'
                  : roleFilter !== 'all'
                    ? `No ${roleFilter} users found.`
                    : 'No users found in the database.'}
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

      {/* SQL fallback — scripts live in repo, not in this UI */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" aria-hidden />
          If in-app delete fails — SQL fallback (developers only)
        </h4>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
          Normal workflow: use <strong>Delete</strong> on a row, or <strong>Danger zone</strong> below for bulk removal.
          If the edge function errors or you are resetting a dev database, use the SQL scripts in the GitHub repo — not shown here on purpose.
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-gray-600 font-mono">
          <li>
            <span className="text-gray-500 font-sans">Guide →</span>{' '}
            <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200">docs/ADMIN_USER_PURGE_SQL.md</code>
          </li>
          <li>
            <span className="text-gray-500 font-sans">Script →</span>{' '}
            <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200">supabase/scripts/admin-purge-non-admin-users.sql</code>
          </li>
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          Run in <strong>Supabase Dashboard → SQL Editor</strong>. Keeps <code className="text-[11px]">{ADMIN_EMAIL}</code>.
          Last resort: <strong>Authentication → Users</strong> and delete manually.
        </p>
      </div>

      {/* Danger zone — bulk delete at bottom to avoid accidental clicks */}
      {nonAdminUsers.length > 0 && (
        <div className="rounded-xl border-2 border-dashed border-red-200 bg-red-50/40 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" aria-hidden />
                Danger zone
              </h4>
              <p className="text-xs text-red-800/80 mt-1 max-w-xl">
                Permanently delete every non-admin user and their data. Admin ({ADMIN_EMAIL}) is preserved.
                Use only when resetting a test environment — not for routine management.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBulkDeleteAcknowledged(false);
                setShowBulkConfirm(true);
              }}
              disabled={bulkDeleting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Non-Admin ({nonAdminUsers.length})
            </button>
          </div>
        </div>
      )}

      {/* ═══ BULK DELETE CONFIRMATION MODAL ═══ */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!bulkDeleting) {
                setBulkDeleteAcknowledged(false);
                setShowBulkConfirm(false);
              }
            }}
          />
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
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-900">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-red-300"
                  checked={bulkDeleteAcknowledged}
                  onChange={e => setBulkDeleteAcknowledged(e.target.checked)}
                  disabled={bulkDeleting}
                />
                <span>I understand this permanently deletes these users and their data. This cannot be undone.</span>
              </label>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setBulkDeleteAcknowledged(false);
                  setShowBulkConfirm(false);
                }}
                disabled={bulkDeleting}
                className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting || !bulkDeleteAcknowledged}
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
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                if (!deletingUserId) {
                  setDeleteAcknowledged(false);
                  setShowSingleConfirm(null);
                }
              }}
            />
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
                <p className="text-sm text-gray-600 mb-3">
                  This removes their profile, listings, passes, tickets, and login in one step.
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-red-300"
                    checked={deleteAcknowledged}
                    onChange={e => setDeleteAcknowledged(e.target.checked)}
                    disabled={!!deletingUserId}
                  />
                  <span>I understand this permanently deletes this user. This cannot be undone.</span>
                </label>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setDeleteAcknowledged(false);
                    setShowSingleConfirm(null);
                  }}
                  disabled={!!deletingUserId}
                  className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(showSingleConfirm)}
                  disabled={!deleteAcknowledged || !!deletingUserId}
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
