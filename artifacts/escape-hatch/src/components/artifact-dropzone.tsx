import { useId, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';

/** Chooser and drop share one intake. A file is never approval. */
export function ArtifactDropzone({ label, hint, accept, disabled = false, onFile }: {
  label: string; hint: string; accept: string; disabled?: boolean; onFile: (file: File) => void | Promise<void>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  function receive(files: File[]) {
    if (disabled) return;
    setDragging(false);
    if (files.length !== 1) { setError('Add one file at a time so you can review each artifact.'); return; }
    setError('');
    void onFile(files[0]);
  }
  return <div className={`artifact-dropzone ${dragging && !disabled ? 'artifact-dropzone-active' : ''}`}
    onDragEnter={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); receive(Array.from(event.dataTransfer.files)); }}>
    <FileUp size={22} aria-hidden="true" className="text-primary" />
    <label htmlFor={id} className="mt-2 block font-bold">{label}</label>
    <p id={`${id}-hint`} className="mt-1 text-sm leading-6 text-muted-foreground">{hint}</p>
    <button type="button" disabled={disabled} onClick={() => input.current?.click()}
      className="mt-3 min-h-11 rounded-lg border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-50">Choose file</button>
    <input ref={input} id={id} type="file" accept={accept} disabled={disabled} aria-describedby={`${id}-hint`}
      className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) receive(files); event.target.value = ''; }} />
    <p role="status" className="mt-2 text-sm text-destructive">{error}</p>
  </div>;
}
