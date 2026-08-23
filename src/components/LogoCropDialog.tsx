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
  getImageNaturalSize,
  isLandscapeSize,
  landscapeOutputSize,
  PORTRAIT_ASPECT,
  PORTRAIT_OUTPUT_HEIGHT,
  PORTRAIT_OUTPUT_WIDTH,
} from '@/lib/cropImage';
import type { Language } from '@/data/translations';

export type CropVariant = 'logo' | 'portrait';

type LogoCropDialogProps = {
  open: boolean;
  imageSrc: string;
  fileName: string;
  language: Language;
  onClose: () => void;
  onCropped: (file: File, previewDataUrl: string) => void | Promise<void>;
  /** Square logo (default) or feed photo. */
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
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setSourceSize(null);
    if (!imageSrc || variant !== 'portrait') return;
    let cancelled = false;
    void getImageNaturalSize(imageSrc)
      .then((size) => {
        if (!cancelled) setSourceSize(size);
      })
      .catch(() => {
        if (!cancelled) setSourceSize({ width: 9, height: 19.5 });
      });
    return () => {
      cancelled = true;
    };
  }, [imageSrc, variant]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const isPortrait = variant === 'portrait';
  const sourceIsLandscape = Boolean(
    sourceSize && isLandscapeSize(sourceSize.width, sourceSize.height),
  );
  const cropAspect = !isPortrait
    ? 1
    : sourceIsLandscape && sourceSize
      ? sourceSize.width / sourceSize.height
      : PORTRAIT_ASPECT;
  const cropperReady = !isPortrait || sourceSize != null;

  const t = isPortrait
    ? {
        title: sourceIsLandscape
          ? language === 'en'
            ? 'Keep the full wide photo'
            : language === 'fr'
              ? 'Garder la photo en largeur'
              : 'Kipem wide foto'
          : language === 'en'
            ? 'Frame your photo'
            : language === 'fr'
              ? 'Cadrez votre photo'
              : 'Frameem foto',
        hint: sourceIsLandscape
          ? language === 'en'
            ? 'Wide camera photos stay in full on the swipe feed, with a blurred fill around them. You can still trim the edges.'
            : language === 'fr'
              ? 'Les photos paysage restent entières sur le fil, avec un fond flou. Vous pouvez encore recadrer les bords.'
              : 'Wide foto i stap ful long feed, wetem blur raon. Yu save trim edges.'
          : language === 'en'
            ? 'Crop to vertical — this is how it looks on the phone swipe feed. Drag to reposition, zoom to fill.'
            : language === 'fr'
              ? 'Cadrez en vertical — comme sur le fil mobile. Glissez et zoomez.'
              : 'Crop vertical — olsem long phone feed. Drag mo zoom.',
        zoom: language === 'en' ? 'Zoom' : language === 'fr' ? 'Zoom' : 'Zoom',
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
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const landscapeCrop =
        isPortrait && croppedAreaPixels.width > croppedAreaPixels.height;
      const out = !isPortrait
        ? { width: 800, height: 800 }
        : landscapeCrop
          ? landscapeOutputSize(croppedAreaPixels.width, croppedAreaPixels.height)
          : { width: PORTRAIT_OUTPUT_WIDTH, height: PORTRAIT_OUTPUT_HEIGHT };
      const dataUrl = await getCroppedImageDataUrl(
        imageSrc,
        croppedAreaPixels,
        out.width,
        out.height,
      );
      const suffix = isPortrait ? '-photo.jpg' : '-logo.jpg';
      const file = await dataUrlToFile(dataUrl, fileName.replace(/\.[^.]+$/, '') + suffix);
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

        <div
          className={`relative w-full bg-gray-900 ${
            isPortrait && sourceIsLandscape
              ? 'h-[min(52vh,320px)]'
              : isPortrait
                ? 'h-[min(68vh,440px)]'
                : 'h-[min(52vw,280px)]'
          }`}
        >
          {cropperReady ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={cropAspect}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white/70" />
            </div>
          )}
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

        <DialogFooter className="px-5 pb-5 gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !croppedAreaPixels}
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
