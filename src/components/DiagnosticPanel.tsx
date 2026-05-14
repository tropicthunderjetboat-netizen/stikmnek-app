/**
 * StikmNek Diagnostic Panel
 * ──────────────────────────
 * Temporary component for tracing backend connectivity issues.
 * Access via: Add ?diagnostics=true to the URL, or mount directly.
 *
 * REMOVE THIS COMPONENT BEFORE PRODUCTION DEPLOYMENT.
 */

import React, { useState, useCallback } from 'react';
import {
  runFullDiagnostic,
  diagnoseAuthConfig,
  diagnoseCurrentSession,
  diagnoseEdgeFunctions,
  diagnoseSentry,
  diagnoseDatabase,
  traceSignUp,
  DiagnosticResult,
} from '@/lib/diagnostics';
import {
  Activity, AlertTriangle, CheckCircle, XCircle, Info,
  Play, Loader2, Wifi, Database, Shield, UserPlus,
  ChevronDown, ChevronRight, Copy, Trash2, Terminal
} from 'lucide-react';

const statusIcon = (status: DiagnosticResult['status']) => {
  switch (status) {
    case 'pass': return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
    case 'fail': return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'info': return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  }
};

const statusBg = (status: DiagnosticResult['status']) => {
  switch (status) {
    case 'pass': return 'bg-green-50 border-green-200';
    case 'fail': return 'bg-red-50 border-red-200';
    case 'warn': return 'bg-amber-50 border-amber-200';
    case 'info': return 'bg-blue-50 border-blue-200';
  }
};

const ResultRow: React.FC<{ result: DiagnosticResult }> = ({ result }) => {
  const [expanded, setExpanded] = useState(false);
  const isSection = result.test.startsWith('═══');

  if (isSection) {
    return (
      <div className="py-3 px-4 bg-gray-800 text-gray-200 font-mono text-sm font-bold tracking-wide">
        {result.test}
      </div>
    );
  }

  return (
    <div className={`border-l-4 ${statusBg(result.status)} p-3`}>
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => result.details && setExpanded(!expanded)}
      >
        {statusIcon(result.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-gray-700">{result.test}</span>
            <span className="text-[10px] text-gray-400">{result.timestamp.split('T')[1]?.substring(0, 8)}</span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5 break-words">{result.message}</p>
        </div>
        {result.details && (
          expanded
            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </div>
      {expanded && result.details && (
        <pre className="mt-2 ml-7 p-3 rounded-lg bg-gray-900 text-green-400 text-xs font-mono overflow-x-auto max-h-60 overflow-y-auto">
          {JSON.stringify(result.details, null, 2)}
        </pre>
      )}
    </div>
  );
};

const DiagnosticPanel: React.FC = () => {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  // Sign-up trace state
  const [traceEmail, setTraceEmail] = useState('');
  const [tracePassword, setTracePassword] = useState('');
  const [traceName, setTraceName] = useState('Test User');
  const [traceType, setTraceType] = useState<'tourist' | 'business'>('tourist');

  const runTest = useCallback(async (
    name: string,
    fn: () => Promise<DiagnosticResult[]>
  ) => {
    setRunning(true);
    setActiveTest(name);
    try {
      const newResults = await fn();
      setResults(prev => [...prev, ...newResults]);
    } catch (err: any) {
      setResults(prev => [...prev, {
        test: name,
        status: 'fail' as const,
        message: `Unhandled exception: ${err.message}`,
        details: { stack: err.stack },
        timestamp: new Date().toISOString(),
      }]);
    }
    setRunning(false);
    setActiveTest(null);
  }, []);

  const copyResults = () => {
    const text = results.map(r =>
      `[${r.status.toUpperCase()}] ${r.test}: ${r.message}${r.details ? '\n  Details: ' + JSON.stringify(r.details) : ''}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
  };

  const summary = {
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    warn: results.filter(r => r.status === 'warn').length,
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
            <Terminal className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">StikmNek Backend Diagnostics</h1>
            <p className="text-gray-400 text-sm">Live connectivity tests — find the broken wire</p>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="mb-6 p-4 rounded-xl bg-amber-900/30 border border-amber-700/50 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200">
            <strong>Development Tool Only.</strong> This panel makes live API calls to your Supabase instance.
            Remove <code className="px-1.5 py-0.5 rounded bg-amber-800/50 text-amber-100 text-xs">DiagnosticPanel.tsx</code> before production deployment.
          </div>
        </div>

        {/* Summary Bar */}
        {results.length > 0 && (
          <div className="mb-6 flex items-center gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400 font-mono">{summary.pass} passed</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-400 font-mono">{summary.fail} failed</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-amber-400 font-mono">{summary.warn} warnings</span>
            </div>
            <div className="flex-1" />
            <button onClick={copyResults} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors">
              <Copy className="w-3.5 h-3.5" />
              Copy All
            </button>
            <button onClick={() => setResults([])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}

        {/* Test Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Full Diagnostic */}
          <button
            onClick={() => runTest('Full Diagnostic', runFullDiagnostic)}
            disabled={running}
            className="p-4 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 transition-all text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              {running && activeTest === 'Full Diagnostic'
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Play className="w-5 h-5" />}
              <span className="font-bold">Run All Tests</span>
            </div>
            <p className="text-xs text-white/70">Auth + Session + Edge Functions + Sentry + Database</p>
          </button>

          {/* Auth Config */}
          <button
            onClick={() => runTest('Auth Config', diagnoseAuthConfig)}
            disabled={running}
            className="p-4 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-500 transition-all text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              {running && activeTest === 'Auth Config'
                ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                : <Wifi className="w-5 h-5 text-blue-400" />}
              <span className="font-bold">1. Auth Config</span>
            </div>
            <p className="text-xs text-gray-400">Verify URL, anon key, auth endpoint, email confirmation settings</p>
          </button>

          {/* Current Session */}
          <button
            onClick={() => runTest('Current Session', diagnoseCurrentSession)}
            disabled={running}
            className="p-4 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-500 transition-all text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              {running && activeTest === 'Current Session'
                ? <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                : <Activity className="w-5 h-5 text-purple-400" />}
              <span className="font-bold">2. Session Check</span>
            </div>
            <p className="text-xs text-gray-400">Check active session, stored tokens, server-side verification</p>
          </button>

          {/* Edge Functions */}
          <button
            onClick={() => runTest('Edge Functions', diagnoseEdgeFunctions)}
            disabled={running}
            className="p-4 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-500 transition-all text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              {running && activeTest === 'Edge Functions'
                ? <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
                : <Activity className="w-5 h-5 text-teal-400" />}
              <span className="font-bold">3. Edge Functions</span>
            </div>
            <p className="text-xs text-gray-400">Test all 5 edge functions for deployment & connectivity</p>
          </button>

          {/* Sentry */}
          <button
            onClick={() => runTest('Sentry', diagnoseSentry)}
            disabled={running}
            className="p-4 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-500 transition-all text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              {running && activeTest === 'Sentry'
                ? <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                : <Shield className="w-5 h-5 text-orange-400" />}
              <span className="font-bold">4. Sentry Relay</span>
            </div>
            <p className="text-xs text-gray-400">Health check + send test event to Sentry</p>
          </button>

          {/* Database */}
          <button
            onClick={() => runTest('Database', diagnoseDatabase)}
            disabled={running}
            className="p-4 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-500 transition-all text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              {running && activeTest === 'Database'
                ? <Loader2 className="w-5 h-5 animate-spin text-green-400" />
                : <Database className="w-5 h-5 text-green-400" />}
              <span className="font-bold">5. Database Tables</span>
            </div>
            <p className="text-xs text-gray-400">Check all 8 tables for accessibility & RLS</p>
          </button>
        </div>

        {/* Sign-Up Trace (Special) */}
        <div className="mb-8 p-6 rounded-xl bg-gray-900 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <UserPlus className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-lg">6. Live Sign-Up Trace</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            This will create a REAL test user in your Supabase Auth. Use a disposable email.
            Every step is logged: auth.signUp → edge function → profile verification.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <input
              type="email"
              value={traceEmail}
              onChange={e => setTraceEmail(e.target.value)}
              placeholder="test@example.com"
              className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <input
              type="password"
              value={tracePassword}
              onChange={e => setTracePassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <input
              type="text"
              value={traceName}
              onChange={e => setTraceName(e.target.value)}
              placeholder="Display Name"
              className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <select
              value={traceType}
              onChange={e => setTraceType(e.target.value as 'tourist' | 'business')}
              className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="tourist">Tourist</option>
              <option value="business">Business</option>
            </select>
          </div>
          <button
            onClick={() => {
              if (!traceEmail || !tracePassword) return;
              runTest('SignUp Trace', () => traceSignUp(traceEmail, tracePassword, traceName, traceType));
            }}
            disabled={running || !traceEmail || !tracePassword}
            className="px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {running && activeTest === 'SignUp Trace'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />}
            Run Sign-Up Trace
          </button>
        </div>

        {/* SQL Reference */}
        <div className="mb-8 p-6 rounded-xl bg-gray-900 border border-gray-700">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-yellow-400" />
            SQL Commands — Run in Supabase SQL Editor
          </h3>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-300 mb-2 font-semibold">Check if ANY users exist in auth.users:</p>
              <pre className="p-4 rounded-lg bg-gray-950 text-green-400 text-xs font-mono overflow-x-auto">
{`SELECT id, email, email_confirmed_at, created_at, last_sign_in_at,
       raw_user_meta_data->>'user_type' as user_type,
       raw_user_meta_data->>'name' as name
FROM auth.users
ORDER BY created_at DESC
LIMIT 20;`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-300 mb-2 font-semibold">Check user_profiles table:</p>
              <pre className="p-4 rounded-lg bg-gray-950 text-green-400 text-xs font-mono overflow-x-auto">
{`SELECT id, user_id, role, display_name, email, created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 20;`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-300 mb-2 font-semibold">Manually create a test user (bypasses frontend):</p>
              <pre className="p-4 rounded-lg bg-gray-950 text-yellow-400 text-xs font-mono overflow-x-auto">
{`-- Step 1: Create auth user (run in SQL Editor with service_role)
-- NOTE: This uses Supabase's internal function. If this works but
-- the frontend doesn't, the issue is in the frontend API config.

-- First, check if the handle_new_user trigger exists:
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- If the trigger exists, creating a user via the Auth API should
-- automatically create a profile. If it doesn't, the trigger is broken.

-- To manually insert a profile for an existing auth user:
INSERT INTO public.user_profiles (user_id, role, display_name, email)
SELECT id, 'tourist', 'Manual Test User', email
FROM auth.users
WHERE email = 'your-test@email.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.users.id
  );`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-300 mb-2 font-semibold">Check if the DB trigger is installed:</p>
              <pre className="p-4 rounded-lg bg-gray-950 text-cyan-400 text-xs font-mono overflow-x-auto">
{`-- This trigger should auto-create a user_profile when a new auth user is created
SELECT
  t.tgname AS trigger_name,
  t.tgenabled AS enabled,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'auth.users'::regclass
ORDER BY t.tgname;`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-300 mb-2 font-semibold">Check Edge Function invocation logs:</p>
              <pre className="p-4 rounded-lg bg-gray-950 text-purple-400 text-xs font-mono overflow-x-auto">
{`-- Go to: Supabase Dashboard > Edge Functions > create-user-profile > Logs
-- Look for:
--   1. Any invocations at all (if 0, the function is never being called)
--   2. Error responses (500, 401, etc.)
--   3. The request body (does it contain user_id?)
--
-- Also check: Edge Functions > Settings > Secrets
-- Verify SUPABASE_SERVICE_ROLE_KEY is set
-- Verify SENTRY_DSN is set (for Sentry relay)
-- Verify RESEND_API_KEY is set (for transactional email from edge functions)`}
              </pre>
            </div>

            <div>
              <p className="text-sm text-gray-300 mb-2 font-semibold">Nuclear option — Check if email confirmation is blocking everything:</p>
              <pre className="p-4 rounded-lg bg-gray-950 text-red-400 text-xs font-mono overflow-x-auto">
{`-- If users are being created but email_confirmed_at is NULL,
-- they exist but can't sign in. To auto-confirm all pending users:

UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- OR to disable email confirmation entirely:
-- Go to: Supabase Dashboard > Authentication > Providers > Email
-- Toggle OFF "Confirm email"
-- This will auto-confirm all future signups`}
              </pre>
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-gray-700">
            <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-sm">Test Results ({results.length})</h3>
              <span className="text-xs text-gray-400 font-mono">
                Click any row to expand details
              </span>
            </div>
            <div className="divide-y divide-gray-800 bg-white">
              {results.map((result, i) => (
                <ResultRow key={i} result={result} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {results.length === 0 && (
          <div className="text-center py-20">
            <Terminal className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-500 mb-2">No tests run yet</h3>
            <p className="text-gray-600 text-sm">Click "Run All Tests" above to start the diagnostic</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiagnosticPanel;
