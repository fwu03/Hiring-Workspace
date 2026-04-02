import { useCallback } from 'react';
import { ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { fetchResumePdfObjectUrl } from '../../auth/resumePdf';
import { useResumePdfBlobUrl } from '../hooks/useResumePdfBlobUrl';

interface ResumePreviewModalProps {
  candidateId: string;
  candidateName: string;
  hasResumePdf: boolean;
  resumeText: string;
  open: boolean;
  onClose: () => void;
}

export function ResumePreviewModal({
  candidateId,
  candidateName,
  hasResumePdf,
  resumeText,
  open,
  onClose,
}: ResumePreviewModalProps) {
  const { blobUrl, loading, error } = useResumePdfBlobUrl(candidateId, open && hasResumePdf);

  const pdfSrc = blobUrl ? `${blobUrl}#view=FitH` : '';

  const handleOpenTab = useCallback(async () => {
    try {
      const url = await fetchResumePdfObjectUrl(candidateId);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch {
      /* ignore */
    }
  }, [candidateId]);

  if (!open) return null;

  const hasText = Boolean(resumeText?.trim());

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-[1px]"
        aria-label="Close resume preview"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[70] flex h-[min(92vh,820px)] w-[min(100vw-1rem,56rem)] -translate-x-1/2 -translate-y-1/2 flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-preview-title"
      >
        <Card className="flex h-full max-h-[min(92vh,820px)] flex-col overflow-hidden shadow-lg">
          <CardHeader className="flex shrink-0 flex-row items-start justify-between space-y-0 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <CardTitle id="resume-preview-title" className="text-base">
                  Resume preview
                </CardTitle>
                <p className="mt-0.5 text-sm font-normal text-muted-foreground">{candidateName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {hasResumePdf ? (
                <Button variant="outline" size="sm" className="gap-1" type="button" onClick={() => void handleOpenTab()}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
            {hasResumePdf && loading ? (
              <div className="flex h-[min(480px,50vh)] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading PDF…
              </div>
            ) : hasResumePdf && error ? (
              <div className="p-4 text-sm text-destructive">{error}</div>
            ) : hasResumePdf && pdfSrc ? (
              <iframe
                title={`Resume PDF for ${candidateName}`}
                src={pdfSrc}
                className="h-full min-h-[480px] w-full border-0 bg-muted/30"
              />
            ) : (
              <div className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">
                  No PDF uploaded for this candidate yet. Someone with edit access can upload the original file in the
                  candidate panel.
                </p>
                {hasText ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Plain text on file (fallback)</p>
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 font-sans text-xs leading-relaxed text-foreground">
                      {resumeText}
                    </pre>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
