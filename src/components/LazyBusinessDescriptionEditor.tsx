import React, { Suspense } from 'react';
import type { BusinessDescriptionEditorProps } from './BusinessDescriptionEditor';

const Editor = React.lazy(() => import('./BusinessDescriptionEditor'));

function EditorFallback() {
  return (
    <div
      className="min-h-[7.5rem] w-full rounded-xl border border-gray-200 bg-gray-50 animate-pulse"
      aria-hidden
    />
  );
}

/**
 * Defer react-quill + Quill CSS until this mount (large dependency).
 * Props match {@link BusinessDescriptionEditor}.
 */
const LazyBusinessDescriptionEditor: React.FC<BusinessDescriptionEditorProps> = ({
  className,
  ...rest
}) => (
  <Suspense fallback={<EditorFallback />}>
    <Editor className={className} {...rest} />
  </Suspense>
);

export default LazyBusinessDescriptionEditor;
export type { BusinessDescriptionEditorProps } from './BusinessDescriptionEditor';
