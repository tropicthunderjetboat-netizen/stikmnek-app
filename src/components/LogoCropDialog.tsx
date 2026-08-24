import React, { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, ZoomIn } from 'lucide-react';
import {
  dataUrlToFile,
  getCroppedImageDataUrl,
  sourceToJpegFile,
} from '@/lib/cropImage';
import { FeedFitPhoto } from '@/components/FeedFitPhoto';
import type { Language } from '@/data/translations';

export type CropVariant = 'logo' | 'portrait';

type LogoCropDialogProps = {
  open: boolean;
  imageSrc: string;
  fileName: string;
  language: Language;
  onClose: () => void;
  onCropped: (file: File, previewDataUrl: string) => void | Promise<void>;
  /** Square logo (default) or feed photo (fills the phone, any shape). */
  variant?: CropVariant;
};

const LogoCropDialog: React.FC<LogoCropDialogProps> = ({
  open,
  imageSrc,
  fileName,
  language,
  onClose,
  onCropped,
  variant = 'logo',
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [imageSrc]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const isFeedPhoto = variant === 'portrait';

  const t = isFeedPhoto
    ? {
        title:
          language === 'en'
            ? 'Photo fills the phone'
            : language === 'fr'
              ? 'La photo remplit l’écran'
              : 'Foto i fulumap phone',
        hint:
          language === 'en'
            ? 'Any shape works. The photo fills the swipe card — extra edges are cropped, nothing sits in empty bars.'
            : language === 'fr'
              ? 'Tous les formats conviennent. La photo remplit la carte — les bords en trop sont coupés, pas de bandes vides.'
              : 'Eni shape i wok. Foto i fulumap swipe card — no empty bar.',
        cancel: language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'Kanselem',
        save: language === 'en' ? 'Use photo' : language === 'fr' ? 'Utiliser' : 'Yusem foto',
      }
    : {
        title:
          language === 'en'
            ? 'Adjust your logo'
            : language === 'fr'
              ? 'Ajuster votre logo'
              : 'Adjustem logo',
        hint:
          language === 'en'
            ? 'Drag to reposition and use the slider to zoom — like a profile photo. This is how it will appear on your listing.'
            : language === 'fr'
              ? 'Glissez pour repositionner et zoomez. C’est ainsi qu’il apparaîtra sur votre annonce.'
              : 'Drag mo zoom — olsem bae i luk long listing.',
        zoom: language === 'en' ? 'Zoom' : language === 'fr' ? 'Zoom' : 'Zoom',
        cancel: language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'Kanselem',
        save: language === 'en' ? 'Save logo' : language === 'fr' ? 'Enregistrer' : 'Sevem logo',
      };

  const handleSave = async () => {
    if (isFeedPhoto) {
      setSaving(true);
      try {
        const { file, preview } = await sourceToJpegFile(
          imageSrc,
          fileName.replace(/\.[^.]+$/, '') + '-photo.jpg',
        );
        await onCropped(file, preview);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const dataUrl = await getCroppedImageDataUrl(imageSrc, croppedAreaPixels, 800, 800);
      const file = await dataUrlToFile(dataUrl, fileName.replace(/\.[^.]+$/, '') + '-logo.jpg');
      await onCropped(file, dataUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden sm:rounded-2xl z-[120]"
        overlayClassName="z-[120]"
      >
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.hint}</DialogDescription>
        </DialogHeader>

        {isFeedPhoto ? (
          <div className="bg-neutral-950 px-5 py-4 flex justify-center">
            <div className="relative w-[min(100%,240px)] aspect-[9/19.5] rounded-[1.6rem] overflow-hidden ring-1 ring-white/20 shadow-2xl">
              <FeedFitPhoto src={imageSrc} className="absolute inset-0 h-full w-full" priority />
            </div>
          </div>
        ) : (
          <>
            <div className="relative w-full bg-gray-900 h-[min(52vw,280px)]">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="px-5 py-4 space-y-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <ZoomIn className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />
                <span className="text-xs font-medium text-gray-600 w-10">{t.zoom}</span>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.05}
                  onValueChange={(v) => setZoom(v[0] ?? 1)}
                  className="flex-1"
                />
              </div>
            </div>
          </>
        )}

        <DialogFooter className="px-5 pb-5 gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || (!isFeedPhoto && !croppedAreaPixels)}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogoCropDialog;
