import React, { useState, useRef, useCallback } from 'react';
import { supabase, getEdgeAuthHeaders } from '@/lib/supabase';
import {
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  AlertCircle,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';

export interface UploadedPhoto {
  id: string;
  url: string;
  filePath: string;
  name: string;
  size: number;
  preview: string;
}

interface PhotoUploaderProps {
  photos: UploadedPhoto[];
  onPhotosChange: (photos: UploadedPhoto[]) => void;
  maxPhotos?: number;
  maxSizeMB?: number;
  userId: string;
  label?: string;
  sublabel?: string;
  compact?: boolean;
  /** When true (default if maxPhotos > 1), owners can drag to reorder and set cover image (first in list). */
  allowReorder?: boolean;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  status: 'reading' | 'compressing' | 'uploading' | 'done' | 'error';
  preview: string;
  errorMessage?: string;
}

/** Client-side ceiling for direct storage race + edge invoke `timeout` (generous; avoids hanging forever). */
const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

/** 
 * Immediately read a File as a data URL using FileReader.
 * Must be called synchronously from the file input change handler
 * before any async gaps that could cause the file reference to become stale.
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string' && result.length > 0) {
          resolve(result);
        } else {
          reject(new Error('FileReader produced empty result'));
        }
      };
      
      reader.onerror = () => {
        const error = reader.error;
        reject(new Error(`FileReader error: ${error?.message || 'unknown'}`));
      };
      
      reader.onabort = () => {
        reject(new Error('FileReader was aborted'));
      };
      
      reader.readAsDataURL(file);
    } catch (err: any) {
      reject(new Error(`FileReader init failed: ${err.message || 'unknown'}`));
    }
  });
}

/**
 * Read a File as a data URL using object URL → fetch → blob → FileReader fallback.
 * This is a backup method when direct FileReader fails.
 */
function readFileViaObjectUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      
      // Use fetch to read the blob URL, then convert to data URL
      fetch(objectUrl)
        .then(response => response.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const result = reader.result;
            if (typeof result === 'string' && result.length > 0) {
              resolve(result);
            } else {
              reject(new Error('Blob FileReader produced empty result'));
            }
          };
          reader.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Blob FileReader failed'));
          };
          reader.readAsDataURL(blob);
        })
        .catch(err => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`Fetch blob failed: ${err.message}`));
        });
    } catch (err: any) {
      reject(new Error(`Object URL creation failed: ${err.message}`));
    }
  });
}

/** Target decoded size after base64 decode (listing photos — keeps Storage / Edge payloads small). */
const MAX_COMPRESSED_IMAGE_BYTES = 800 * 1024;
const JPEG_QUALITY_HIGH = 0.7;
const JPEG_QUALITY_MED = 0.55;
const JPEG_QUALITY_LOW = 0.45;
const JPEG_QUALITY_MIN = 0.42;

/**
 * Encode as JPEG only (smaller than PNG for photos). Opaque white behind image so PNG alpha does not force PNG output.
 */
function compressImageToJpegDataUrl(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    const timeout = setTimeout(() => {
      reject(new Error('Image load timed out after 10 seconds'));
    }, 10_000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width === 0 || height === 0) {
          reject(new Error('Image has zero dimensions'));
          return;
        }

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        width = Math.max(1, width);
        height = Math.max(1, height);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas 2D context'));
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', quality);

        if (!compressed || compressed === 'data:,' || compressed.length < 100) {
          reject(new Error('Canvas produced empty or invalid output'));
          return;
        }

        const approxKb = Math.round(estimateBase64Size(compressed) / 1024);
        console.log(
          `JPEG ${quality}: ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}, ~${approxKb}KB decoded`,
        );
        resolve(compressed);
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : 'unknown';
        reject(new Error(`Canvas error: ${m}`));
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load image into Image element'));
    };

    img.src = dataUrl;
  });
}

/**
 * Iteratively shrink dimensions / quality until decoded size ≤ MAX_COMPRESSED_IMAGE_BYTES (best effort).
 */
async function compressImageForUpload(dataUrl: string): Promise<string> {
  let maxSide = 1600;
  const qualities = [JPEG_QUALITY_HIGH, JPEG_QUALITY_MED, JPEG_QUALITY_LOW];

  while (maxSide >= 480) {
    for (const q of qualities) {
      const out = await compressImageToJpegDataUrl(dataUrl, maxSide, maxSide, q);
      if (estimateBase64Size(out) <= MAX_COMPRESSED_IMAGE_BYTES) {
        return out;
      }
    }
    maxSide = Math.round(maxSide * 0.82);
  }

  return compressImageToJpegDataUrl(dataUrl, 480, 480, JPEG_QUALITY_MIN);
}

/**
 * Estimate byte size from a base64 data URL string.
 */
function estimateBase64Size(base64: string): number {
  const commaIndex = base64.indexOf(',');
  const raw = commaIndex >= 0 ? base64.substring(commaIndex + 1) : base64;
  return Math.round((raw.length * 3) / 4);
}

const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  maxSizeMB = 5,
  userId,
  label = 'Upload Photos',
  sublabel = 'Drag & drop or click to browse. PNG, JPG up to 5MB each.',
  compact = false,
  allowReorder: allowReorderProp,
}) => {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPhotoIndex, setDragPhotoIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allowReorder = allowReorderProp ?? maxPhotos > 1;
  const isSingleSlot = maxPhotos === 1;

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Process and upload a single file.
   * @param file - The File object
   * @param preReadDataUrl - A pre-read data URL (if available from immediate FileReader)
   */
  const uploadFile = useCallback(async (
    file: File,
    preReadDataUrl?: string
  ): Promise<UploadedPhoto | null> => {
    // Resolve user id: use prop or fetch from session (handles loading state)
    let effectiveUserId = userId?.trim() || '';
    if (!effectiveUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in before uploading photos.');
        return null;
      }
      effectiveUserId = user.id;
    }

    if (!file) {
      toast.error('No file selected');
      return null;
    }

    if (!file.type.startsWith('image/')) {
      toast.error(`"${file.name}" is not an image file`);
      return null;
    }

    if (file.size > maxSizeBytes * 2) {
      toast.error(`"${file.name}" is too large (max ${maxSizeMB * 2}MB)`);
      return null;
    }

    const fileId = generateId();

    // Use pre-read data URL for preview, or create a simple placeholder
    const previewUrl = preReadDataUrl || '';

    // Add to uploading state
    setUploading(prev => [...prev, {
      id: fileId,
      name: file.name,
      progress: 5,
      status: 'reading',
      preview: previewUrl,
    }]);

    try {
      // ── STEP 1: Get the file data as a data URL ──
      let dataUrl: string = preReadDataUrl || '';

      if (!dataUrl) {
        // Strategy A: Direct FileReader
        setUploading(prev => prev.map(u =>
          u.id === fileId ? { ...u, status: 'reading', progress: 5 } : u
        ));

        try {
          console.log(`[${file.name}] Trying FileReader.readAsDataURL...`);
          dataUrl = await readFileAsDataUrl(file);
          console.log(`[${file.name}] FileReader success, length: ${dataUrl.length}`);
        } catch (readerErr: any) {
          console.warn(`[${file.name}] FileReader failed:`, readerErr.message);
        }
      }

      if (!dataUrl) {
        // Strategy B: Object URL → fetch → blob → FileReader
        try {
          console.log(`[${file.name}] Trying object URL → fetch → blob...`);
          dataUrl = await readFileViaObjectUrl(file);
          console.log(`[${file.name}] Object URL method success, length: ${dataUrl.length}`);
        } catch (objUrlErr: any) {
          console.warn(`[${file.name}] Object URL method failed:`, objUrlErr.message);
        }
      }

      if (!dataUrl) {
        // Strategy C: Try FileReader again after a small delay (file ref might need a tick)
        try {
          console.log(`[${file.name}] Retrying FileReader after 200ms delay...`);
          await new Promise(resolve => setTimeout(resolve, 200));
          dataUrl = await readFileAsDataUrl(file);
          console.log(`[${file.name}] Delayed FileReader success, length: ${dataUrl.length}`);
        } catch (retryErr: any) {
          console.warn(`[${file.name}] Delayed FileReader also failed:`, retryErr.message);
        }
      }

      if (!dataUrl) {
        throw new Error(
          `Cannot read "${file.name}". The file may be inaccessible. ` +
          `Please try selecting the photo again, or try a different image.`
        );
      }

      // Update preview with the data URL
      setUploading(prev => prev.map(u =>
        u.id === fileId ? { ...u, preview: dataUrl, status: 'compressing', progress: 20 } : u
      ));

      // ── STEP 2: Compress the image ──
      let finalBase64: string;
      
      try {
        console.log(`[${file.name}] Compressing to JPEG (≤${MAX_COMPRESSED_IMAGE_BYTES / 1024}KB target)...`);
        finalBase64 = await compressImageForUpload(dataUrl);
        console.log(`[${file.name}] Compression success, length: ${finalBase64.length}`);
      } catch (compressErr: unknown) {
        const cm = compressErr instanceof Error ? compressErr.message : String(compressErr);
        console.warn(`[${file.name}] Compression failed:`, cm);
        throw new Error(
          `Could not compress "${file.name}". Try a smaller JPG/PNG photo (${cm})`,
        );
      }

      const compressedSize = estimateBase64Size(finalBase64);
      console.log(`[${file.name}] Final: original ~${Math.round(file.size / 1024)}KB, final ~${Math.round(compressedSize / 1024)}KB`);

      // ── STEP 3: Upload (direct storage first — avoids Edge Function hang/cold start) ──
      setUploading(prev => prev.map(u =>
        u.id === fileId ? { ...u, status: 'uploading', progress: 40 } : u
      ));

      const progressInterval = setInterval(() => {
        setUploading(prev => prev.map(u =>
          u.id === fileId && u.status === 'uploading'
            ? { ...u, progress: Math.min(u.progress + 6, 85) }
            : u
        ));
      }, 400);

      let uploadData: any;
      let uploadError: any;

      // Strategy A: Direct storage upload (fast, no Edge Function; RLS allows authenticated)
      // Strip data-URL prefix: must allow subtypes like image/svg+xml (not only \w+).
      const base64Data = finalBase64.replace(/^data:image\/[^;]+;base64,/, '');
      let binary: Uint8Array;
      try {
        binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      } catch (decodeErr: any) {
        throw new Error(
          `Could not read image data (${decodeErr?.message || 'invalid base64'}). Try JPG or PNG.`,
        );
      }
      const filePath = `${effectiveUserId}/${crypto.randomUUID()}.jpg`;
      const blob = new Blob([binary], { type: 'image/jpeg' });

      // NOTE: @supabase/storage-js upload() accepts `signal` but uploadOrUpdate does not pass it to
      // fetch — awaiting upload({ signal }) never cancels. Use Promise.race so we can fall back to
      // upload-photo Edge Function after a ceiling (same as pre-regression behavior).
      try {
        const startMs = Date.now();
        const uploadPromise = supabase.storage
          .from('business-photos')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          });
        const raced = await Promise.race([
          uploadPromise.then((r) => ({ kind: 'done' as const, r })),
          new Promise<{ kind: 'timeout' }>((resolve) =>
            setTimeout(() => resolve({ kind: 'timeout' }), PHOTO_UPLOAD_TIMEOUT_MS),
          ),
        ]);
        const elapsed = Date.now() - startMs;
        if (raced.kind === 'timeout') {
          uploadError = { message: 'Direct storage timed out' };
          console.warn(
            `[${file.name}] Direct storage no response after ${PHOTO_UPLOAD_TIMEOUT_MS}ms — trying Edge Function`,
          );
        } else {
          const { error: storageErr } = raced.r;
          if (!storageErr) {
            const { data: urlData } = supabase.storage.from('business-photos').getPublicUrl(filePath);
            uploadData = { url: urlData.publicUrl, filePath, success: true };
            console.log(`[${file.name}] Direct storage upload succeeded (${elapsed}ms)`);
          } else {
            uploadError = { message: storageErr.message };
            console.warn(`[${file.name}] Direct storage failed:`, storageErr.message);
          }
        }
      } catch (directErr: any) {
        uploadError = directErr;
        console.warn(`[${file.name}] Direct storage threw:`, directErr?.message || directErr);
      }

      // Strategy B: Edge Function fallback (if direct storage fails, e.g. RLS not applied)
      if (!uploadData && uploadError) {
        console.warn(`[${file.name}] Trying upload-photo Edge Function...`);
        try {
          let headers: Record<string, string> = {};
          try {
            headers = await getEdgeAuthHeaders();
          } catch (authHdrErr: unknown) {
            const msg = authHdrErr instanceof Error ? authHdrErr.message : '';
            if (msg.includes('Session retrieval timed out')) {
              throw authHdrErr;
            }
            const { data: sess } = await supabase.auth.getSession();
            const t = sess?.session?.access_token;
            if (t) headers = { Authorization: `Bearer ${t}` };
          }

          const result = await supabase.functions.invoke('upload-photo', {
            body: {
              fileBase64: finalBase64,
              fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
              contentType: 'image/jpeg',
              userId: effectiveUserId,
            },
            headers,
            timeout: PHOTO_UPLOAD_TIMEOUT_MS,
          });
          if (!result.error && !result.data?.error) {
            uploadData = result.data;
            uploadError = null;
            console.log(`[${file.name}] Edge Function succeeded`);
          } else {
            uploadError = result.error || { message: result.data?.error };
          }
        } catch (invokeErr: unknown) {
          const detail = invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
          console.warn(`[${file.name}] Edge Function failed:`, detail);
          uploadError = { message: detail };
        }
      }

      clearInterval(progressInterval);

      if (uploadError && !uploadData) {
        console.error(`[${file.name}] Upload error:`, uploadError);
        const userMsg = `Failed to upload "${file.name}". Please try again.`;
        setUploading(prev => prev.map(u =>
          u.id === fileId
            ? { ...u, status: 'error', progress: 0, errorMessage: userMsg }
            : u
        ));
        toast.error(userMsg);
        setTimeout(() => {
          setUploading(prev => prev.filter(u => u.id !== fileId));
        }, 4000);
        return null;
      }

      if (uploadData?.error) {
        console.error(`[${file.name}] Server error:`, uploadData.error);
        setUploading(prev => prev.map(u =>
          u.id === fileId ? { ...u, status: 'error', progress: 0, errorMessage: uploadData.error } : u
        ));
        toast.error(`Upload failed: ${uploadData.error}`);
        setTimeout(() => {
          setUploading(prev => prev.filter(u => u.id !== fileId));
        }, 4000);
        return null;
      }

      // ── SUCCESS ──
      setUploading(prev => prev.map(u =>
        u.id === fileId ? { ...u, status: 'done', progress: 100 } : u
      ));

      console.log('[PhotoUploader] Upload Succeeded:', file.name);

      setTimeout(() => {
        setUploading(prev => prev.filter(u => u.id !== fileId));
      }, 1500);

      // Use the server URL for display, keep it as preview too
      // (server URL is more reliable than a potentially large data URL)
      return {
        id: fileId,
        url: uploadData.url,
        filePath: uploadData.filePath,
        name: file.name,
        size: compressedSize,
        preview: uploadData.url,
      };

    } catch (err: any) {
      console.error(`[${file.name}] Fatal error:`, err);
      setUploading(prev => prev.map(u =>
        u.id === fileId ? { ...u, status: 'error', progress: 0, errorMessage: err.message || 'Upload failed' } : u
      ));
      toast.error(err.message || `Failed to upload "${file.name}"`);
      setTimeout(() => {
        setUploading(prev => prev.filter(u => u.id !== fileId));
      }, 4000);
      return null;
    }
  }, [userId, maxSizeBytes, maxSizeMB]);

  /**
   * Handle selected files — strictly serial (read → compress+upload per file).
   * Avoids overlapping storage / session token work that can stall when many files start at once.
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Filter valid image files
    const validFiles = fileArray.filter(f => f && f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      toast.error('No valid image files selected');
      return;
    }

    let basePhotos = [...photos];
    let remaining = maxPhotos - basePhotos.length - uploading.filter((u) => u.status !== 'error').length;

    // Logo / single-slot: picking a new file replaces the current image instead of blocking.
    if (remaining <= 0 && isSingleSlot && validFiles.length > 0) {
      if (basePhotos.length > 0) {
        const old = basePhotos[0];
        try {
          await supabase.storage.from('business-photos').remove([old.filePath]);
        } catch (err) {
          console.warn('Failed to remove previous image (non-critical):', err);
        }
        basePhotos = [];
        onPhotosChange([]);
      }
      remaining = 1;
    }

    if (remaining <= 0) {
      toast.error(
        isSingleSlot
          ? 'Only one image allowed. Remove the current image first, or choose a new file to replace it.'
          : `Maximum ${maxPhotos} photos allowed`,
      );
      return;
    }

    const filesToUpload = validFiles.slice(0, remaining);
    if (!isSingleSlot && fileArray.length > remaining) {
      toast.info(`Only uploading ${remaining} of ${fileArray.length} files (max ${maxPhotos})`);
    } else if (isSingleSlot && validFiles.length > 1) {
      toast.info('Only one logo at a time — using the first image you selected.');
    }

    console.log(`[PhotoUploader] Serial queue: ${filesToUpload.length} file(s)`);

    const successful: UploadedPhoto[] = [];
    let accumulated = [...basePhotos];

    for (const file of filesToUpload) {
      let preReadDataUrl = '';
      try {
        preReadDataUrl = await readFileAsDataUrl(file);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[PhotoUploader] Initial read failed for ${file.name}:`, msg);
      }

      const result = await uploadFile(file, preReadDataUrl || undefined);
      if (result) {
        successful.push(result);
        accumulated = [...accumulated, result];
        onPhotosChange(accumulated);
      }
    }

    if (successful.length > 0) {
      toast.success(`${successful.length} photo${successful.length > 1 ? 's' : ''} uploaded!`);
    }
  }, [photos, maxPhotos, isSingleSlot, uploadFile, onPhotosChange, uploading]);

  const reorderPhotos = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= photos.length || toIndex >= photos.length) return;
      const next = [...photos];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      onPhotosChange(next);
    },
    [photos, onPhotosChange],
  );

  const setPhotoAsMain = useCallback(
    (index: number) => {
      if (index <= 0 || index >= photos.length) return;
      const next = [...photos];
      const [moved] = next.splice(index, 1);
      next.unshift(moved);
      onPhotosChange(next);
      toast.success('Cover photo updated');
    },
    [photos, onPhotosChange],
  );

  const movePhoto = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= photos.length) return;
      reorderPhotos(index, target);
    },
    [photos.length, reorderPhotos],
  );

  const handleRemovePhoto = useCallback(async (photo: UploadedPhoto) => {
    try {
      await supabase.storage.from('business-photos').remove([photo.filePath]);
    } catch (err) {
      console.warn('Failed to remove from storage (non-critical):', err);
    }

    onPhotosChange(photos.filter(p => p.id !== photo.id));
    toast.success('Photo removed');
  }, [photos, onPhotosChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // CRITICAL: Capture files and start processing IMMEDIATELY
      // Do NOT await anything before calling handleFiles
      const fileList = e.target.files;
      handleFiles(fileList);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isUploading = uploading.some(u => u.status === 'uploading' || u.status === 'compressing' || u.status === 'reading');
  const inFlightCount = uploading.filter((u) => u.status !== 'error').length;
  const slotsUsed = photos.length + inFlightCount;
  const canUploadMore = slotsUsed < maxPhotos;

  return (
    <div className="space-y-3">
      {/* Hidden file input - accept common image formats */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={maxPhotos > 1}
        onChange={handleFileInput}
        className="hidden"
        capture={undefined}
      />

      {/* Upload Drop Zone */}
      {canUploadMore && (
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer ${
            compact ? 'p-4' : 'p-6'
          } ${
            isDragging
              ? 'border-teal-500 bg-teal-50 scale-[1.01]'
              : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/30'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <div className={`rounded-full flex items-center justify-center mb-2 ${
              compact ? 'w-10 h-10' : 'w-12 h-12'
            } ${isDragging ? 'bg-teal-100' : 'bg-gray-100'}`}>
              <Upload className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} ${isDragging ? 'text-teal-600' : 'text-gray-400'}`} />
            </div>
            <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'} ${isDragging ? 'text-teal-700' : 'text-gray-700'}`}>
              {isDragging ? 'Drop photos here' : label}
            </p>
            <p className={`text-gray-400 mt-0.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {sublabel}
            </p>
            <p className={`text-gray-300 mt-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {isSingleSlot
                ? photos.length > 0
                  ? '1 logo uploaded — choose another file to replace'
                  : 'One image'
                : `${photos.length}/${maxPhotos} photos`}
            </p>
          </div>
        </div>
      )}

      {/* Uploading Progress */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map(file => (
            <div key={file.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                {file.preview ? (
                  <img src={file.preview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{file.name}</p>
                <p className="text-[10px] text-gray-400">
                  {file.status === 'reading' ? 'Reading file...' :
                   file.status === 'compressing' ? 'Compressing image...' :
                   file.status === 'uploading' ? 'Uploading...' :
                   file.status === 'done' ? 'Complete!' :
                   file.errorMessage || 'Error'}
                </p>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      file.status === 'error' ? 'bg-red-500' :
                      file.status === 'done' ? 'bg-green-500' :
                      file.status === 'reading' ? 'bg-blue-500' :
                      file.status === 'compressing' ? 'bg-amber-500' :
                      'bg-teal-500'
                    }`}
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex-shrink-0">
                {(file.status === 'uploading' || file.status === 'compressing' || file.status === 'reading') && (
                  <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
                )}
                {file.status === 'done' && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {file.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Previews / Thumbnails */}
      {photos.length > 0 && (
        <div className="space-y-2">
          {allowReorder && photos.length > 1 && (
            <p className="text-xs text-gray-500">
              Drag to reorder, or tap <span className="font-medium">Set cover</span>. The first photo is your listing cover.
            </p>
          )}
          <div className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              draggable={allowReorder && photos.length > 1}
              onDragStart={(e) => {
                if (!allowReorder || photos.length <= 1) return;
                setDragPhotoIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragEnd={() => {
                setDragPhotoIndex(null);
                setDropTargetIndex(null);
              }}
              onDragOver={(e) => {
                if (!allowReorder || dragPhotoIndex === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropTargetIndex(index);
              }}
              onDragLeave={() => {
                if (dropTargetIndex === index) setDropTargetIndex(null);
              }}
              onDrop={(e) => {
                if (!allowReorder || dragPhotoIndex === null) return;
                e.preventDefault();
                reorderPhotos(dragPhotoIndex, index);
                setDragPhotoIndex(null);
                setDropTargetIndex(null);
              }}
              className={`group relative rounded-xl overflow-hidden bg-gray-100 aspect-square border transition-all ${
                dropTargetIndex === index && dragPhotoIndex !== null && dragPhotoIndex !== index
                  ? 'border-teal-500 ring-2 ring-teal-300 scale-[1.02]'
                  : dragPhotoIndex === index
                    ? 'border-teal-400 opacity-60'
                    : 'border-gray-200 hover:border-teal-300'
              } ${allowReorder && photos.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              <img
                src={photo.url || photo.preview}
                alt={photo.name}
                className="w-full h-full object-cover pointer-events-none"
                loading="lazy"
                draggable={false}
              />

              {allowReorder && photos.length > 1 && (
                <div
                  className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 text-white flex items-center justify-center opacity-70 group-hover:opacity-100"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4" aria-hidden />
                </div>
              )}

              {/* Overlay on hover / focus-within */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 group-focus-within:bg-black/45 transition-all flex flex-col items-center justify-center gap-1.5 p-2">
                {allowReorder && index > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoAsMain(index);
                    }}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all px-2 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-semibold flex items-center gap-1"
                    title="Use as cover photo"
                  >
                    <Star className="w-3 h-3 fill-current" />
                    Set cover
                  </button>
                )}
                {allowReorder && photos.length > 1 && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        movePhoto(index, -1);
                      }}
                      className="w-7 h-7 rounded-full bg-white/90 text-gray-800 flex items-center justify-center disabled:opacity-40 shadow"
                      title="Move earlier"
                      aria-label="Move photo earlier"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === photos.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        movePhoto(index, 1);
                      }}
                      className="w-7 h-7 rounded-full bg-white/90 text-gray-800 flex items-center justify-center disabled:opacity-40 shadow"
                      title="Move later"
                      aria-label="Move photo later"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePhoto(photo);
                  }}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg"
                  title="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* File info badge */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                <p className="text-[10px] text-white truncate font-medium">{photo.name}</p>
                <p className="text-[9px] text-white/70">{formatSize(photo.size)}</p>
              </div>

              {/* Cover photo badge */}
              {index === 0 && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9px] font-bold uppercase tracking-wider pointer-events-none">
                  Cover
                </div>
              )}
            </div>
          ))}

          {/* Add more button */}
          {canUploadMore && (
            <div
              onClick={handleClick}
              className="rounded-xl border-2 border-dashed border-gray-200 aspect-square flex flex-col items-center justify-center hover:border-teal-300 hover:bg-teal-50/30 transition-all cursor-pointer"
            >
              <Upload className="w-6 h-6 text-gray-300 mb-1" />
              <span className="text-[10px] text-gray-400 font-medium">Add More</span>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Max photos reached */}
      {!canUploadMore && photos.length > 0 && inFlightCount === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-center">
          {isSingleSlot
            ? 'Logo uploaded. Remove it or pick a new file to replace it.'
            : `Maximum of ${maxPhotos} photos reached. Remove a photo to upload a new one.`}
        </p>
      )}
    </div>
  );
};

export default PhotoUploader;
