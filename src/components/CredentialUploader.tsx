import React, { useRef, useState } from 'react';
import { FileText, Loader2, Upload, X, CheckCircle } from 'lucide-react';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export type CredentialUpload = {
  filePath: string;
  fileName: string;
};

type CredentialUploaderProps = {
  businessId: string;
  userId: string;
  value: CredentialUpload | null;
  onChange: (v: CredentialUpload | null) => void;
  label: string;
  hint?: string;
  language: 'en' | 'fr' | 'bi';
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.length > 0) resolve(result);
      else reject(new Error('Empty file'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

const CredentialUploader: React.FC<CredentialUploaderProps> = ({
  businessId,
  userId,
  value,
  onChange,
  label,
  hint,
  language,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error(
        language === 'en'
          ? 'File must be under 10 MB'
          : language === 'fr'
            ? 'Fichier max. 10 Mo'
            : 'Faol i mas 10 MB',
      );
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { data, error } = await supabase.functions.invoke('upload-credential', {
        headers: await getEdgeAuthHeaders(),
        body: {
          fileBase64: dataUrl,
          fileName: file.name,
          contentType: file.type || 'application/pdf',
          userId,
          businessId,
        },
      });
      if (error) throw error;
      if (!data?.success || !data?.filePath) {
        throw new Error(data?.error || 'Upload failed');
      }
      onChange({ filePath: data.filePath, fileName: file.name });
      toast.success(
        language === 'en'
          ? 'Document uploaded — pending admin review'
          : language === 'fr'
            ? 'Document téléchargé — en attente de validation'
            : 'Dokumen i upload — wetem admin',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      {hint && <p className="text-xs text-gray-500 mt-0.5 mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}

      {value ? (
        <div className="flex items-center gap-2 rounded-lg bg-white border border-teal-100 px-3 py-2.5">
          <FileText className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-sm text-gray-700 truncate flex-1">{value.fileName}</span>
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
            aria-label="Remove"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50/50 transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {language === 'en'
            ? 'Upload PDF or image'
            : language === 'fr'
              ? 'Télécharger PDF ou image'
              : 'Upload PDF o foto'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
};

export default CredentialUploader;
