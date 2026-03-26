import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Lock, Loader2, CheckCircle } from 'lucide-react';

/**
 * Password reset confirmation page.
 * User lands here after clicking the link in the "Forgot password" email.
 * Supabase redirects to this URL with tokens in the hash; we show a form
 * to set a new password and call updateUser({ password }).
 */
const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;

    const resolve = (ready: boolean) => {
      if (cancelled || resolved) return;
      resolved = true;
      setSessionReady(ready);
    };

    // Avoid a flash of "Invalid link" while Supabase is still processing the URL hash.
    // We wait briefly for auth events / session to materialize, then decide.
    const MAX_WAIT_MS = 1500;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        resolve(!!data?.session?.user);
      } catch {
        resolve(false);
      }
    }, MAX_WAIT_MS);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) resolve(true);
    });

    void (async () => {
      try {
        // Let Supabase parse the hash and establish session (detectSessionInUrl is true)
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) resolve(true);
      } catch {
        // ignore; timer will resolve false if nothing materializes
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      toast.success('Password updated. You can now sign in with your new password.');
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
      setSubmitting(false);
    }
  };

  if (sessionReady === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
          <p className="text-gray-600">Checking your reset link…</p>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid or expired link</h1>
          <p className="text-gray-600 text-sm mb-6">
            This password reset link is invalid or has expired. Please request a new one from the sign-in page.
          </p>
          <Link
            to="/"
            className="inline-block w-full py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Password updated</h1>
          <p className="text-gray-600 text-sm mb-6">
            Redirecting you to the home page. You can sign in with your new password.
          </p>
          <Link
            to="/"
            className="inline-block w-full py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 transition-colors"
          >
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-7 text-white">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-white/80 text-sm mt-1">
            Enter your new password below. You’ll use it to sign in from now on.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Same as above"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Updating…' : 'Update password'}
          </button>
          <Link to="/" className="block text-center text-sm text-gray-500 hover:text-teal-600">
            Cancel and go back to home
          </Link>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
