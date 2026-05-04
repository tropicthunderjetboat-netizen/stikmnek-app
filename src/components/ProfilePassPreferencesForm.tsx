import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { updateUserPassPreferences } from '@/lib/userPassPreferences';
import { clampPartySize, MAX_PARTY_SIZE } from '@/data/pricing';
import { t } from '@/data/translations';
import type { PassDuration } from '@/types/database.types';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

/**
 * Saves pass checkout defaults to `user_profiles` (party_size, preferred_pass_duration).
 * Group size 1 is stored as NULL so checkout can fall back to travel party / metadata.
 */
const ProfilePassPreferencesForm: React.FC = () => {
  const { user, userProfile, language, refreshUserProfile } = useAppContext();
  const [formParty, setFormParty] = useState(1);
  const [duration, setDuration] = useState<PassDuration>('short');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const p = userProfile?.party_size;
    const d = userProfile?.preferred_pass_duration;
    setFormParty(typeof p === 'number' && p >= 1 && p <= MAX_PARTY_SIZE ? p : 1);
    setDuration(d === 'extended' ? 'extended' : 'short');
  }, [userProfile?.party_size, userProfile?.preferred_pass_duration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const partySizeToSave = formParty === 1 ? null : clampPartySize(formParty);
      const result = await updateUserPassPreferences(user.id, {
        partySize: partySizeToSave,
        preferredDuration: duration,
      });
      if (result.ok) {
        toast.success(t('passPrefs.saved', language));
        await refreshUserProfile();
      } else {
        toast.error(t('passPrefs.save_failed', language), { description: result.error });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const peopleLabel = (n: number) =>
    n === 1
      ? t('passPrefs.just_me', language)
      : t('passPrefs.people_n', language).replace('{n}', String(n));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="pass-pref-party">{t('passPrefs.group_label', language)}</Label>
        <Select
          value={String(formParty)}
          onValueChange={(v) => setFormParty(clampPartySize(Number(v)))}
          disabled={isLoading}
        >
          <SelectTrigger id="pass-pref-party" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {peopleLabel(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {formParty === 1
            ? t('passPrefs.group_hint_none', language)
            : t('passPrefs.group_hint_saved', language)}
        </p>
      </div>

      <div className="space-y-3">
        <Label>{t('passPrefs.duration_label', language)}</Label>
        <RadioGroup
          value={duration}
          onValueChange={(v) => setDuration(v === 'extended' ? 'extended' : 'short')}
          disabled={isLoading}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="short" id="pass-pref-short" />
            <Label htmlFor="pass-pref-short" className="font-normal cursor-pointer">
              {t('passPrefs.duration_short', language)}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="extended" id="pass-pref-extended" />
            <Label htmlFor="pass-pref-extended" className="font-normal cursor-pointer">
              {t('passPrefs.duration_extended', language)}
            </Label>
          </div>
        </RadioGroup>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('passPrefs.saving', language)}
          </>
        ) : (
          t('passPrefs.save', language)
        )}
      </Button>
    </form>
  );
};

export default ProfilePassPreferencesForm;
