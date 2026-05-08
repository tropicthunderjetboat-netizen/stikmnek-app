import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';
import { updateUserPassPreferences } from '@/lib/userPassPreferences';
import { clampPartySize } from '@/data/pricing';

export interface PostPurchasePassPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: Language;
  userId: string;
  partySize: number;
  isExtended: boolean;
  onSaved: () => void | Promise<void>;
}

/**
 * After a successful pass purchase, offers to persist the purchased party size and duration
 * as `user_profiles` defaults. Dismissing marks the prompt so it does not repeat for the same receipt.
 */
const PostPurchasePassPreferencesDialog: React.FC<PostPurchasePassPreferencesDialogProps> = ({
  open,
  onOpenChange,
  language,
  userId,
  partySize,
  isExtended,
  onSaved,
}) => {
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRemember(true);
  }, [open]);

  const handleSkip = () => onOpenChange(false);

  const handleSave = async () => {
    if (!remember) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const result = await updateUserPassPreferences(userId, {
        partySize: clampPartySize(partySize),
        preferredDuration: isExtended ? 'extended' : 'short',
      });
      if (result.ok) {
        toast.success(t('passPrefs.saved', language));
        await onSaved();
        onOpenChange(false);
      } else {
        toast.error(t('passPrefs.save_failed', language), { description: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('passPrefs.post_title', language)}</DialogTitle>
          <DialogDescription>{t('passPrefs.post_desc', language)}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <Checkbox
            id="pass-prefs-remember"
            checked={remember}
            onCheckedChange={(c) => setRemember(c === true)}
            disabled={saving}
          />
          <Label htmlFor="pass-prefs-remember" className="text-sm font-normal leading-snug cursor-pointer">
            {t('passPrefs.post_remember', language)}
          </Label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleSkip} disabled={saving}>
            {t('passPrefs.post_skip', language)}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('passPrefs.saving', language)}
              </>
            ) : (
              t('passPrefs.post_save', language)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PostPurchasePassPreferencesDialog;
