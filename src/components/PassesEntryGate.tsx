import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { shouldOpenCheckoutInsteadOfPassesPage } from '@/utils/passNavigation';
import { t } from '@/data/translations';
import PassCards from '@/components/PassCards';

/**
 * `/passes` route: signed-in tourists/admins without an active pass go straight to
 * checkout. Others see the full Passes page. Append `?info=1` to force the marketing page.
 */
const PassesEntryGate: React.FC = () => {
  const { user, purchasePass, language, authLoading } = useAppContext();
  const location = useLocation();
  const redirected = useRef(false);
  const [phase, setPhase] = useState<'boot' | 'marketing' | 'redirecting'>('boot');

  const forceMarketing = new URLSearchParams(location.search).get('info') === '1';

  useEffect(() => {
    if (authLoading) return;
    if (phase !== 'boot') return;
    if (forceMarketing || !shouldOpenCheckoutInsteadOfPassesPage(user)) {
      setPhase('marketing');
      return;
    }
    if (redirected.current) return;
    redirected.current = true;
    setPhase('redirecting');
    void purchasePass();
  }, [authLoading, user, purchasePass, phase, forceMarketing]);

  if (authLoading || phase === 'boot') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 pt-24 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {t('passFlow.redirecting', language)}
        </p>
      </div>
    );
  }

  if (phase === 'marketing') {
    return <PassCards />;
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 pt-24 px-4">
      <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {t('passFlow.redirecting', language)}
      </p>
    </div>
  );
};

export default PassesEntryGate;
