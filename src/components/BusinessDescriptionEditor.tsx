import React, { useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { cn } from '@/lib/utils';

const MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
};

const FORMATS = ['header', 'bold', 'italic', 'underline', 'list'];

export interface BusinessDescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Extra classes for the Quill wrapper (e.g. `[&_.ql-editor]:min-h-[8rem]`). */
  quillClassName?: string;
}

const BusinessDescriptionEditor: React.FC<BusinessDescriptionEditorProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  quillClassName,
}) => {
  const modules = useMemo(() => MODULES, []);

  return (
    <div
      className={cn(
        'business-description-editor w-full min-w-0 max-w-full overflow-x-hidden rounded-xl border border-gray-200 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-0',
        className,
      )}
    >
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={FORMATS}
        placeholder={placeholder}
        readOnly={disabled}
        className={cn(
          'w-full min-w-0 max-w-full [&_.ql-toolbar]:!flex [&_.ql-toolbar]:!flex-wrap [&_.ql-toolbar]:gap-y-1 [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-toolbar]:rounded-none [&_.ql-container]:!w-full [&_.ql-container]:!max-w-full [&_.ql-container]:border-0 [&_.ql-editor]:!max-w-full [&_.ql-editor]:min-h-[7.5rem] [&_.ql-editor]:text-base sm:[&_.ql-editor]:text-sm [&_.ql-editor]:text-gray-900',
          quillClassName,
        )}
      />
    </div>
  );
};

export default BusinessDescriptionEditor;
