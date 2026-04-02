import { useRef, useState } from 'react';
import { useResumePdfBlobUrl } from '../hooks/useResumePdfBlobUrl';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Mail,
  Phone,
  GraduationCap,
  Briefcase,
  AlertTriangle,
  History,
  MessageSquare,
  Star,
  FileText,
  Upload,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import type { HiringCandidate } from '../data/hiringTypes';
import { formatStatusLabel } from '../state/batchSessionState';
import { uploadResumePdf } from '../services/hiringApi';
import {
  parseInterviewWorkspace,
  recommendationLabel,
} from '../utils/interviewWorkspace';

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function displayYearsOfExperience(c: HiringCandidate): string {
  if (c.yearsOfExperience > 0) return `${c.yearsOfExperience} years experience`;
  if (c.school?.trim() || c.degree?.trim()) return `${c.yearsOfExperience} years experience`;
  return '—';
}

function displayDegreeSchool(c: HiringCandidate): string {
  const d = c.degree?.trim() || '';
  const s = c.school?.trim() || '';
  if (d && s) return `${d}, ${s}`;
  if (d) return d;
  if (s) return s;
  return '—';
}

interface CandidateDrawerProps {
  batchId: string;
  candidate: HiringCandidate | null;
  open: boolean;
  /** Hiring managers can replace/upload resume PDFs; interviewers cannot. */
  canUploadResume?: boolean;
  onClose: () => void;
  onCandidateUpdated?: (c: HiringCandidate) => void;
  /** Shown for candidates in New when provided (hiring manager and interviewer). */
  onAddToShortlist?: () => void;
  /** Hiring-manager-only summary from the interview workspace; hidden for interviewers. */
  showFinalRecommendation?: boolean;
}

export function CandidateDrawer({
  batchId,
  candidate,
  open,
  canUploadResume = false,
  onClose,
  onCandidateUpdated,
  onAddToShortlist,
  showFinalRecommendation = true,
}: CandidateDrawerProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const pdfCandidateId = open && candidate ? candidate.id : null;
  const shouldLoadPdf = Boolean(open && candidate?.hasResumePdf);
  const { blobUrl: pdfBlobUrl, loading: pdfLoading } = useResumePdfBlobUrl(pdfCandidateId, shouldLoadPdf);

  if (!open || !candidate) return null;

  const openWorkspace = () => {
    navigate(`/batches/${batchId}/workspace/${candidate.id}`);
  };

  const st = candidate.status;
  const hasPdf = Boolean(candidate.hasResumePdf);
  const interviewParsed = parseInterviewWorkspace(candidate.interviewWorkspace ?? undefined);
  const hasLegacyInterviewRounds = (candidate.interviewRounds?.length ?? 0) > 0;

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      window.alert('Please choose a PDF file.');
      return;
    }
    setUploadingPdf(true);
    try {
      const updated = await uploadResumePdf(candidate.id, file);
      onCandidateUpdated?.(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPdf(false);
    }
  };

  const pdfUrl = pdfBlobUrl ? `${pdfBlobUrl}#view=FitH` : '';

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px]"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-candidate-name"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 id="drawer-candidate-name" className="text-lg font-semibold text-foreground">
            {candidate.name}
          </h2>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium text-foreground">
              {initials(candidate.name)}
            </div>
            <div className="min-w-0">
              <Badge variant="outline">{formatStatusLabel(st)}</Badge>
              {candidate.llmScore != null && (
                <p
                  className="mt-1 text-sm text-muted-foreground"
                  title={candidate.llmRationale?.trim() || undefined}
                >
                  LLM score: {Math.round(candidate.llmScore)}
                </p>
              )}
            </div>
          </div>

          {st === 'new' && onAddToShortlist ? (
            <div className="mb-6">
              <Button type="button" variant="secondary" className="w-full justify-start gap-2" onClick={onAddToShortlist}>
                <Star className="h-4 w-4" />
                Add to shortlist
              </Button>
            </div>
          ) : null}

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" />
              <a
                href={`mailto:${candidate.email}`}
                className="truncate text-foreground underline underline-offset-2 hover:opacity-80"
              >
                {candidate.email}
              </a>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0" />
              <span>{candidate.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="h-4 w-4 shrink-0" />
              <span>{displayYearsOfExperience(candidate)}</span>
            </div>
            <div className="flex items-start gap-2 text-muted-foreground">
              <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{displayDegreeSchool(candidate)}</span>
            </div>
          </div>

          {(candidate.flags.seenBefore ||
            candidate.flags.interviewedBefore ||
            candidate.flags.otherBatch) && (
            <Card className="mt-6 border-amber-200 bg-amber-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Flags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-amber-900">
                {candidate.flags.seenBefore && <p>Seen in a previous batch</p>}
                {candidate.flags.interviewedBefore && <p>Interviewed before</p>}
                {candidate.flags.otherBatch && (
                  <p>
                    Also in batch: {candidate.flags.otherBatchInfo ?? 'another batch'}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {candidate.hmComment && (
            <Card className="mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4" />
                  Hiring manager note
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{candidate.hmComment}</CardContent>
            </Card>
          )}

          {candidate.history.length > 0 && (
            <Card className="mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <History className="h-4 w-4" />
                  History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidate.history.map((h, i) => (
                  <div key={`${h.date}-${i}`} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                    <p className="font-medium text-foreground">{h.batchTag}</p>
                    <p className="text-xs text-muted-foreground">{h.date}</p>
                    <p className="mt-1 text-muted-foreground">
                      {h.status} — {h.outcome}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(interviewParsed || hasLegacyInterviewRounds) && (
            <Card className="mt-6 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Interview feedback
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0 text-sm">
                {interviewParsed?.rounds.map((round) => (
                  <div key={round.id} className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="font-medium text-foreground">{round.roundTitle || 'Interview round'}</p>
                    <div className="mt-2 space-y-3">
                      {round.interviewers.map((int, idx) => (
                        <div key={int.id || `${round.id}-int-${idx}`} className="border-t border-border/80 pt-2 first:border-t-0 first:pt-0">
                          <p className="text-xs text-muted-foreground">
                            Interviewer {idx + 1}
                            {int.interviewerName?.trim() ? ` — ${int.interviewerName.trim()}` : ''}
                          </p>
                          {int.strengths?.trim() ? (
                            <p className="mt-1 text-xs">
                              <span className="font-medium text-foreground">Strengths: </span>
                              <span className="text-muted-foreground">{int.strengths}</span>
                            </p>
                          ) : null}
                          {int.concerns?.trim() ? (
                            <p className="mt-1 text-xs">
                              <span className="font-medium text-foreground">Concerns: </span>
                              <span className="text-muted-foreground">{int.concerns}</span>
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Recommendation: {recommendationLabel(int.recommendation)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {showFinalRecommendation && interviewParsed?.finalRecommendation?.trim() ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-foreground">Final recommendation</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {interviewParsed.finalRecommendation}
                    </p>
                  </div>
                ) : null}
                {!interviewParsed && hasLegacyInterviewRounds
                  ? candidate.interviewRounds.map((r) => (
                      <div key={r.id} className="rounded-md border border-border bg-muted/20 p-3">
                        <p className="font-medium text-foreground">{r.roundName}</p>
                        <p className="text-xs text-muted-foreground">Interviewer: {r.interviewer}</p>
                        {r.notes?.trim() ? (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{r.notes}</p>
                        ) : null}
                      </div>
                    ))
                  : null}
              </CardContent>
            </Card>
          )}

          <Card className="mt-6 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Resume PDF
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {canUploadResume ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => void handlePdfSelected(e)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    disabled={uploadingPdf}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {hasPdf ? 'Replace PDF' : 'Upload resume PDF'}
                  </Button>
                </>
              ) : null}
              {hasPdf && pdfLoading ? (
                <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading PDF…
                </div>
              ) : hasPdf && pdfUrl ? (
                <div className="overflow-hidden rounded-md border border-border bg-muted/20">
                  <iframe
                    title={`Resume PDF — ${candidate.name}`}
                    src={pdfUrl}
                    className="h-64 w-full border-0"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No PDF on file.</p>
              )}
            </CardContent>
          </Card>

        </div>

        <div className="border-t border-border p-4">
          <Button className="w-full gap-2" onClick={openWorkspace}>
            <MessageSquare className="h-4 w-4" />
            Open interview workspace
          </Button>
        </div>
      </aside>
    </>
  );
}
