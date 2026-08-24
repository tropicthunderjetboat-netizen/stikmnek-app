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
  sourceToJpegFile,
  PORTRAIT_ASPECT,
  PORTRAIT_OUTPUT_HEIGHT,
  PORTRAIT_OUTPUT_WIDTH,
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
  /** Square logo (default) or feed photo. */
  variant?: CropVariant;
};

function applyNaturalSize(
  width: number,
  height: number,
  setSize: (size: { width: number; height: number }) => void,
) {
  if (width < 2 || height < 2) return;
  setSize({ width, height });
}

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
        if (!cancelled) applyNaturalSize(size.width, size.height, setSourceSize);
      })
      .catch(() => {
        // Prefer the wide-photo feed layout over a tall crop if we cannot measure.
        if (!cancelled) setSourceSize({ width: 16, height: 9 });
      });
    return () => {
      cancelled = true;
    };
  }, [imageSrc, variant]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const isPortrait = variant === 'portrait';
  const orientation: 'unknown' | 'landscape' | 'portrait' = !isPortrait
    ? 'portrait'
    : !sourceSize
      ? 'unknown'
      : isLandscapeSize(sourceSize.width, sourceSize.height)
        ? 'landscape'
        : 'portrait';
  const sourceIsLandscape = orientation === 'landscape';
  const cropAspect = !isPortrait ? 1 : PORTRAIT_ASPECT;

  const t = isPortrait
    ? {
        title:
          orientation === 'unknown'
            ? language === 'en'
              ? 'Preparing photo…'
              : language === 'fr'
                ? 'Préparation de la photo…'
                : 'Preparem foto…'
            : sourceIsLandscape
              ? language === 'en'
                ? 'Wide photo — shown in full'
                : language === 'fr'
                  ? 'Photo paysage — affichée en entier'
                  : 'Wide foto — ful long screen'
              : language === 'en'
                ? 'Frame your photo'
                : language === 'fr'
                  ? 'Cadrez votre photo'
                  : 'Frameem foto',
        hint:
          orientation === 'unknown'
            ? language === 'en'
              ? 'Checking whether this is a wide camera photo or a tall phone photo.'
              : language === 'fr'
                ? 'Vérification du format de la photo.'
                : 'Checkem format blong foto.'
            : sourceIsLandscape
              ? language === 'en'
                ? 'The whole photo stays visible on the swipe feed. Empty space is a blur of the same image — we do not crop the sides of wide camera shots.'
                : language === 'fr'
                  ? 'Toute la photo reste visible sur le fil. L’espace autour est un flou de la même image — les côtés ne sont pas coupés.'
                  : 'Ful foto i stap long swipe feed. Space raonem i blur — no katem sides blong wide foto.'
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
    if (isPortrait && orientation === 'unknown') return;
    if (isPortrait && sourceIsLandscape) {
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

  const showLandscapePreview = isPortrait && orientation === 'landscape';
  const showCropper = !isPortrait || orientation === 'portrait';
  const showMeasuring = isPortrait && orientation === 'unknown';

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

        {isPortrait ? (
          <img
            src={imageSrc}
            alt=""
            className="pointer-events-none absolute h-px w-px opacity-0"
            onLoad={(e) => {
              const el = e.currentTarget;
              applyNaturalSize(el.naturalWidth, el.naturalHeight, setSourceSize);
            }}
          />
        ) : null}

        {showMeasuring ? (
          <div className="flex h-[min(52vh,320px)] items-center justify-center bg-neutral-950">
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          </div>
        ) : showLandscapePreview ? (
          <div className="bg-neutral-950 px-5 py-4 flex justify-center">
            <div className="relative w-[min(100%,240px)] aspect-[9/19.5] rounded-[1.6rem] overflow-hidden ring-1 ring-white/20 shadow-2xl">
              <FeedFitPhoto src={imageSrc} className="absolute inset-0 h-full w-full" priority />
            </div>
          </div>
        ) : showCropper ? (
          <>
            <div
              className={`relative w-full bg-gray-900 ${
                isPortrait ? 'h-[min(68vh,440px)]' : 'h-[min(52vw,280px)]'
              }`}
            >
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
                cropShape="rect"
                showGrid
                objectFit="cover"
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
        ) : null}

        <DialogFooter className="px-5 pb-5 gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={
              saving ||
              orientation === 'unknown' ||
              (!sourceIsLandscape && !croppedAreaPixels)
            }
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
