import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
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
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  status: 'reading' | 'compressing' | 'uploading' | 'done' | 'error';
  preview: string;
  errorMessage?: string;
}

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

/**
 * Compress an image from a data URL using Canvas.
 * Takes a data URL string, loads it into an Image, draws on Canvas, returns compressed data URL.
 */
function compressImageFromDataUrl(
  dataUrl: string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    
    // Set a timeout - if image doesn't load in 10 seconds, fail
    const timeout = setTimeout(() => {
      reject(new Error('Image load timed out after 10 seconds'));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Validate dimensions
        if (width === 0 || height === 0) {
          reject(new Error('Image has zero dimensions'));
          return;
        }

        // Scale down if needed
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Ensure minimum dimensions
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

        // Draw the image onto the canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format - always use JPEG for compression (smaller size)
        const isTransparent = dataUrl.includes('image/png');
        const outputType = isTransparent ? 'image/png' : 'image/jpeg';
        const outputQuality = isTransparent ? undefined : quality;

        const compressed = canvas.toDataURL(outputType, outputQuality);

        if (!compressed || compressed === 'data:,' || compressed.length < 100) {
          reject(new Error('Canvas produced empty or invalid output'));
          return;
        }

        console.log(`Compressed: ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}, size: ${Math.round(compressed.length / 1024)}KB`);
        resolve(compressed);
      } catch (err: any) {
        reject(new Error(`Canvas error: ${err.message || 'unknown'}`));
      }
    };

    img.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error('Failed to load image into Image element'));
    };

    // Load the data URL into the image
    img.src = dataUrl;
  });
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
}) => {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


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
    if (!userId || userId.trim() === '') {
      toast.error('Please sign in before uploading photos.');
      return null;
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
        console.log(`[${file.name}] Compressing via canvas...`);
        finalBase64 = await compressImageFromDataUrl(dataUrl, 1200, 1200, 0.75);
        console.log(`[${file.name}] Compression success, length: ${finalBase64.length}`);
      } catch (compressErr: any) {
        console.warn(`[${file.name}] Compression failed:`, compressErr.message);
        
        // Fallback: use the raw data URL without compression
        // Check if it's not too large (< 5MB base64)
        if (dataUrl.length < 7 * 1024 * 1024) {
          console.log(`[${file.name}] Using uncompressed data URL (${Math.round(dataUrl.length / 1024)}KB)`);
          finalBase64 = dataUrl;
        } else {
          throw new Error(
            `Cannot compress "${file.name}" and it's too large to upload uncompressed. ` +
            `Please try a smaller image or a different format (JPG recommended).`
          );
        }
      }

      const compressedSize = estimateBase64Size(finalBase64);
      console.log(`[${file.name}] Final: original ~${Math.round(file.size / 1024)}KB, final ~${Math.round(compressedSize / 1024)}KB`);

      // ── STEP 3: Upload via edge function ──
      setUploading(prev => prev.map(u =>
        u.id === fileId ? { ...u, status: 'uploading', progress: 40 } : u
      ));

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploading(prev => prev.map(u =>
          u.id === fileId && u.status === 'uploading'
            ? { ...u, progress: Math.min(u.progress + 6, 85) }
            : u
        ));
      }, 400);

      let uploadData: any;
      let uploadError: any;

      // Retry logic for upload-photo edge function (up to 3 attempts)
      const maxUploadRetries = 2;
      for (let attempt = 0; attempt <= maxUploadRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = 500 * attempt;
            console.log(`[${file.name}] Upload retry ${attempt}/${maxUploadRetries} after ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
          const startMs = Date.now();
          const result = await supabase.functions.invoke('upload-photo', {
            body: {
              fileBase64: finalBase64,
              fileName: file.name,
              contentType: file.type || 'image/jpeg',
              userId: userId,
            },
          });
          const elapsed = Date.now() - startMs;
          console.log(`[${file.name}] Upload attempt ${attempt}: ${elapsed}ms, hasData=${!!result.data}, hasError=${!!result.error}`);
          
          if (result.error) {
            uploadError = result.error;
            console.warn(`[${file.name}] Upload attempt ${attempt} error:`, result.error.message || result.error);
            continue; // Retry
          }
          if (result.data?.error) {
            uploadError = { message: result.data.error };
            console.warn(`[${file.name}] Upload attempt ${attempt} server error:`, result.data.error);
            continue; // Retry
          }
          // Success!
          uploadData = result.data;
          uploadError = null;
          break;
        } catch (invokeErr: any) {
          uploadError = invokeErr;
          console.warn(`[${file.name}] Upload attempt ${attempt} threw:`, invokeErr.message);
        }
      }


      clearInterval(progressInterval);

      if (uploadError) {
        console.error(`[${file.name}] Upload error:`, uploadError);
        
        // Check if it's a non-2xx response with data
        if (uploadError.context?.body) {
          try {
            const errorBody = await uploadError.context.body.json?.() || {};
            console.error(`[${file.name}] Error body:`, errorBody);
          } catch (_) {}
        }
        
        setUploading(prev => prev.map(u =>
          u.id === fileId ? { ...u, status: 'error', progress: 0, errorMessage: 'Upload failed. Please try again.' } : u
        ));
        toast.error(`Failed to upload "${file.name}". Please try again.`);
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
   * Handle selected files. CRITICAL: We start reading files IMMEDIATELY
   * in this handler, before any async gaps, to prevent stale file references.
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = maxPhotos - photos.length;

    if (remaining <= 0) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    // Filter valid image files
    const validFiles = fileArray.filter(f => f && f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      toast.error('No valid image files selected');
      return;
    }

    const filesToUpload = validFiles.slice(0, remaining);
    if (fileArray.length > remaining) {
      toast.info(`Only uploading ${remaining} of ${fileArray.length} files (max ${maxPhotos})`);
    }

    // ── CRITICAL: Start reading ALL files IMMEDIATELY ──
    // FileReader must be initiated synchronously from the input change handler.
    // If we wait (e.g., for a previous upload to finish), the File reference
    // may become stale on mobile browsers.
    console.log(`Starting immediate read of ${filesToUpload.length} files...`);
    
    const fileReads: Array<{ file: File; dataUrlPromise: Promise<string> }> = [];
    
    for (const file of filesToUpload) {
      // Start FileReader IMMEDIATELY for each file
      const dataUrlPromise = readFileAsDataUrl(file).catch(err => {
        console.warn(`Immediate read failed for ${file.name}:`, err.message);
        // Return empty string - uploadFile will try alternative methods
        return '';
      });
      fileReads.push({ file, dataUrlPromise });
    }

    // Now process files sequentially (but reads are already started)
    const successful: UploadedPhoto[] = [];
    for (const { file, dataUrlPromise } of fileReads) {
      // Wait for the pre-read to complete
      const preReadDataUrl = await dataUrlPromise;
      
      const result = await uploadFile(file, preReadDataUrl || undefined);
      if (result) {
        successful.push(result);
        // Update photos incrementally so user sees progress
        onPhotosChange([...photos, ...successful]);
      }
    }

    if (successful.length > 0) {
      toast.success(`${successful.length} photo${successful.length > 1 ? 's' : ''} uploaded!`);
    }
  }, [photos, maxPhotos, uploadFile, onPhotosChange]);

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
  const canUploadMore = photos.length < maxPhotos;

  return (
    <div className="space-y-3">
      {/* Hidden file input - accept common image formats */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
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
              {photos.length}/{maxPhotos} photos
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
        <div className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-square border border-gray-200 hover:border-teal-300 transition-all"
            >
              <img
                src={photo.url || photo.preview}
                alt={photo.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePhoto(photo);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-all w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100"
                  title="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* File info badge */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all">
                <p className="text-[10px] text-white truncate font-medium">{photo.name}</p>
                <p className="text-[9px] text-white/70">{formatSize(photo.size)}</p>
              </div>

              {/* Main photo badge */}
              {index === 0 && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9px] font-bold uppercase tracking-wider">
                  Main
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
      )}

      {/* Max photos reached */}
      {!canUploadMore && photos.length > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-center">
          Maximum of {maxPhotos} photos reached. Remove a photo to upload a new one.
        </p>
      )}
    </div>
  );
};

export default PhotoUploader;
