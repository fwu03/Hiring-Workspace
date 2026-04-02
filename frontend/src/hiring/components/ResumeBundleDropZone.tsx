import { useCallback, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { HiringCandidate } from '../data/hiringTypes';
import { createCandidate, uploadResumePdf } from '../services/hiringApi';

function filterPdfFiles(files: File[]): File[] {
  return files.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
  );
}

/** Read all entries from a directory reader (Chrome batches readEntries). */
async function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const acc: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    acc.push(...batch);
  }
  return acc;
}

async function flattenEntryToFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      (entry as FileSystemFileEntry).file((f) => resolve([f]), reject);
    });
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children = await readAllDirectoryEntries(reader);
  const out: File[] = [];
  for (const ch of children) {
    out.push(...(await flattenEntryToFiles(ch)));
  }
  return out;
}

function itemWebkitEntry(item: DataTransferItem): FileSystemEntry | null {
  const w = item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null };
  return w.webkitGetAsEntry?.() ?? null;
}

/** Files from a drop: supports multiple files and folders (Chromium). */
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  // Prefer DataTransfer.files when populated — reliable for multi-file PDF drops.
  // The webkit directory path can return wrong/empty lists in some cases.
  const fromDt = Array.from(dt.files ?? []);
  if (fromDt.length > 0) {
    return fromDt;
  }
  const items = dt.items;
  const first = items[0] as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null };
  if (items?.length && typeof first.webkitGetAsEntry === 'function') {
    try {
      const out: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = itemWebkitEntry(items[i]);
        if (entry) out.push(...(await flattenEntryToFiles(entry)));
      }
      if (out.length) return out;
    } catch {
      /* fall through */
    }
  }
  return fromDt;
}

export interface BundleImportResult {
  added: HiringCandidate[];
  errors: string[];
}

interface ResumeBundleDropZoneProps {
  batchId: string;
  disabled?: boolean;
  onComplete: (result: BundleImportResult) => void;
}

export function ResumeBundleDropZone({ batchId, disabled, onComplete }: ResumeBundleDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const runImport = useCallback(
    async (files: File[]) => {
      if (!batchId?.trim()) {
        onComplete({ added: [], errors: ['Missing batch id. Go back to batches and open this batch again.'] });
        return;
      }
      const pdfs = filterPdfFiles(files);
      if (pdfs.length === 0) {
        setStatusLine('No PDF files found. Drop .pdf files or a folder of PDFs.');
        return;
      }
      setBusy(true);
      setStatusLine(null);
      const added: HiringCandidate[] = [];
      const errors: string[] = [];
      let i = 0;
      for (const file of pdfs) {
        i += 1;
        setStatusLine(`Importing ${i} of ${pdfs.length}…`);
        const label = file.name;
        try {
          const created = await createCandidate(batchId, { name: 'Candidate', resumeText: '' });
          const withPdf = await uploadResumePdf(created.id, file);
          added.push(withPdf);
        } catch (e) {
          errors.push(`${label}: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }
      setBusy(false);
      setStatusLine(
        added.length ? `Added ${added.length} candidate${added.length === 1 ? '' : 's'} from PDFs.` : null,
      );
      onComplete({ added, errors });
    },
    [batchId, onComplete],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (disabled || busy) return;
      const raw = await filesFromDataTransfer(e.dataTransfer);
      void runImport(raw);
    },
    [disabled, busy, runImport],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !busy) setDragOver(true);
  }, [disabled, busy]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      e.target.value = '';
      if (!list?.length) return;
      void runImport(Array.from(list));
    },
    [runImport],
  );

  const dimmed = disabled || busy;

  return (
    <div
      className={`rounded-lg border-2 border-dashed transition-colors ${
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-border bg-muted/20 hover:border-muted-foreground/40'
      } ${dimmed ? 'opacity-70' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div className="flex flex-col gap-3 px-4 py-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Drop PDF resumes here</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One candidate per file. We infer candidate names from resume content after upload. You can select many
              PDFs or drop a folder (if your browser allows).
            </p>
            {statusLine ? <p className="mt-1 text-xs text-muted-foreground">{statusLine}</p> : null}
          </div>
        </div>
      </div>
      <div className="flex justify-center border-t border-border/60 px-4 py-3 sm:justify-end">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={onPickFiles}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || busy}
          className="shrink-0"
          onClick={() => inputRef.current?.click()}
        >
          Choose PDFs…
        </Button>
      </div>
    </div>
  );
}
