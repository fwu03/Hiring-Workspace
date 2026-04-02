import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  ChevronUp,
  ChevronDown,
  User,
  Loader2,
  FileText,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { CandidateDrawer } from './CandidateDrawer';
import { ResumePreviewModal } from './ResumePreviewModal';
import { ResumeBundleDropZone, type BundleImportResult } from './ResumeBundleDropZone';
import {
  getLlmConfig,
  isAzureOpenAiReady,
  isOpenAiReady,
  isResumeScoringAvailable,
  usePythonBackendForScoring,
} from '../../config/llm.config';
import { useAuth } from '../../auth/AuthContext';
import { scoreResumeWithLlm } from '../services/llmScoring';
import { formatStatusLabel } from '../state/batchSessionState';
import type { HiringBatch, HiringCandidate } from '../data/hiringTypes';
import {
  getBatchDetail,
  hiringApiConfigured,
  patchBatch,
  patchCandidate,
} from '../services/hiringApi';

type SortKey = 'name' | 'llmScore' | 'yearsOfExperience' | 'status';
type SortDir = 'asc' | 'desc';

function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  if (a < b) return dir === 'asc' ? -1 : 1;
  if (a > b) return dir === 'asc' ? 1 : -1;
  return 0;
}

function sortValue(c: HiringCandidate, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return c.name.toLowerCase();
    case 'llmScore':
      return c.llmScore ?? -1;
    case 'yearsOfExperience':
      return c.yearsOfExperience;
    case 'status':
      return c.status;
    default:
      return '';
  }
}

function flagSummary(c: HiringCandidate): string {
  const parts: string[] = [];
  if (c.flags.seenBefore) parts.push('Seen before');
  if (c.flags.interviewedBefore) parts.push('Interviewed');
  if (c.flags.otherBatch) parts.push('Other batch');
  return parts.length ? parts.join(' · ') : '—';
}

/** YoE defaults to 0 before LLM extraction — show dash when still unknown. */
function displayYearsOfExperience(c: HiringCandidate): string {
  if (c.yearsOfExperience > 0) return String(c.yearsOfExperience);
  if (c.school?.trim() || c.degree?.trim()) return String(c.yearsOfExperience);
  return '—';
}

function displaySchoolCell(school: string): string {
  return school?.trim() || '—';
}

export function BatchDetail() {
  const { canManageBatches, canEditInterview } = useAuth();
  const { batchId = '' } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const drawerCandidateId = searchParams.get('c');

  const [sortKey, setSortKey] = useState<SortKey>('llmScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [promptDraft, setPromptDraft] = useState('');
  const [batch, setBatch] = useState<HiringBatch | null>(null);
  const [candidates, setCandidates] = useState<HiringCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scoringError, setScoringError] = useState<string | null>(null);
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);

  const llmConfig = getLlmConfig();
  const azureReady = isAzureOpenAiReady(llmConfig);
  const openaiReady = isOpenAiReady(llmConfig);
  const scoringAvailable = isResumeScoringAvailable(llmConfig);
  const usePythonApi = usePythonBackendForScoring();

  const previewCandidate = previewCandidateId
    ? candidates.find((c) => c.id === previewCandidateId) ?? null
    : null;

  useEffect(() => {
    if (!batchId || !hiringApiConfigured()) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    void getBatchDetail(batchId)
      .then((d) => {
        if (cancelled) return;
        setBatch(d.batch);
        setCandidates(d.candidates);
        setPromptDraft(d.batch.llmPrompt ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
          setBatch(null);
          setCandidates([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  useEffect(() => {
    if (!canManageBatches) return;
    if (!batchId || !batch) return;
    const t = setTimeout(() => {
      const next = promptDraft.trim();
      if (next === (batch.llmPrompt ?? '').trim()) return;
      void patchBatch(batchId, { llmPrompt: next || null }).then((b) => setBatch(b));
    }, 800);
    return () => clearTimeout(t);
  }, [promptDraft, batchId, batch, canManageBatches]);

  const shortlistedLive = useMemo(
    () => candidates.filter((c) => c.status === 'shortlisted').length,
    [candidates],
  );
  const interviewLive = useMemo(
    () => candidates.filter((c) => c.status === 'interviewing').length,
    [candidates],
  );

  const sortedCandidates = useMemo(() => {
    const list = [...candidates];
    list.sort((a, b) => compareValues(sortValue(a, sortKey), sortValue(b, sortKey), sortDir));
    return list;
  }, [candidates, sortKey, sortDir]);

  const drawerCandidate = drawerCandidateId
    ? candidates.find((c) => c.id === drawerCandidateId) ?? null
    : null;

  const openDrawer = (id: string) => {
    setSearchParams({ c: id });
  };

  const closeDrawer = () => {
    setSearchParams({});
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const scoringDisabled = scoring || candidates.length === 0 || !scoringAvailable;

  const persistStatus = async (candidateId: string, status: HiringCandidate['status']) => {
    const updated = await patchCandidate(candidateId, { status });
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? updated : c)));
  };

  const handleBundleImportComplete = useCallback(
    (result: BundleImportResult) => {
      const { added, errors } = result;
      if (added.length) {
        setCandidates((prev) => [...prev, ...added]);
        void patchBatch(batchId, { uploadComplete: true }).then((b) => setBatch(b));
      }
      if (errors.length) {
        const head = errors.slice(0, 8).join('\n');
        const more = errors.length > 8 ? `\n… and ${errors.length - 8} more` : '';
        window.alert(
          added.length
            ? `Imported ${added.length} resume(s). Some files failed:\n\n${head}${more}`
            : `Could not import resumes:\n\n${head}${more}`,
        );
      }
    },
    [batchId],
  );

  const handleRerunScoring = async () => {
    setScoringError(null);
    setScoring(true);
    try {
      const prompt = promptDraft.trim() || 'Evaluate this candidate for the role.';
      for (const c of candidates) {
        const { score, rationale } = await scoreResumeWithLlm(
          {
            candidateName: c.name,
            batchPrompt: prompt,
            resumeText: c.resumeText,
          },
          llmConfig,
        );
        const updated = await patchCandidate(c.id, {
          llmScore: score,
          llmRationale: rationale ?? null,
        });
        setCandidates((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      }
    } catch (e) {
      setScoringError(e instanceof Error ? e.message : 'Scoring failed');
    } finally {
      setScoring(false);
    }
  };

  if (!hiringApiConfigured()) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">Configure VITE_API_BASE_URL to load batch data from the database.</p>
        <Button variant="outline" type="button" onClick={() => navigate('/')}>
          Back to batches
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading batch…
      </div>
    );
  }

  if (notFound || !batch) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">Batch not found.</p>
        <Button variant="outline" type="button" onClick={() => navigate('/')}>
          Back to batches
        </Button>
      </div>
    );
  }

  const SortHead = ({ col, label }: { col: SortKey; label: string }) => (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => toggleSort(col)}
      >
        {label}
        {sortKey === col ? (
          sortDir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to your batches
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{batch.tag}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {batch.createdDate} · {candidates.length} candidates · {shortlistedLive} shortlisted ·{' '}
              {interviewLive} in interview
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">
              {batch.status.replace('-', ' ')}
            </Badge>
            {!batch.uploadComplete && (
              <Badge variant="outline" className="border-amber-300 text-amber-800">
                Upload incomplete
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 border-b border-border px-4 pb-4 pt-0">
              <ResumeBundleDropZone
                batchId={batchId}
                disabled={scoring || !canManageBatches}
                onComplete={handleBundleImportComplete}
              />
            </CardContent>
            <CardContent className="overflow-x-auto p-0">
              {sortedCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-muted-foreground">
                  <User className="h-8 w-8 opacity-50" />
                  <p>No candidates in this batch yet.</p>
                  <p className="max-w-sm text-xs">
                    Drop PDFs onto the box above or click Choose PDFs to import your first resumes.
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <SortHead col="name" label="Name" />
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                      <SortHead col="yearsOfExperience" label="YoE" />
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">School</th>
                      <SortHead col="llmScore" label="LLM" />
                      <SortHead col="status" label="Status" />
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Flags</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Resume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCandidates.map((c) => (
                      <tr
                        key={c.id}
                        className={`cursor-pointer border-b border-border transition-colors hover:bg-muted/50 ${
                          drawerCandidateId === c.id ? 'bg-muted/60' : ''
                        }`}
                        onClick={() => openDrawer(c.id)}
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">{c.name}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{c.email}</td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                          {displayYearsOfExperience(c)}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2.5 text-muted-foreground">
                          {displaySchoolCell(c.school)}
                        </td>
                        <td
                          className="max-w-[200px] px-3 py-2.5 tabular-nums text-muted-foreground"
                          title={c.llmRationale?.trim() || undefined}
                        >
                          {c.llmScore != null ? Math.round(c.llmScore) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{formatStatusLabel(c.status)}</td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                          {flagSummary(c)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewCandidateId(c.id);
                            }}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Preview
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="w-full shrink-0 lg:w-80 xl:w-96 lg:sticky lg:top-4 lg:self-start">
          <Card className="border-border">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                LLM scoring prompt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Provider:</span>
                <Badge variant="outline" className="text-xs">
                  {usePythonApi
                    ? 'Python API'
                    : llmConfig.provider === 'azure-openai'
                      ? 'Azure OpenAI'
                      : llmConfig.provider === 'openai'
                        ? 'OpenAI'
                        : 'Mock (offline)'}
                </Badge>
                {llmConfig.provider === 'azure-openai' && llmConfig.azure.useProxy && !usePythonApi && (
                  <Badge variant="outline" className="text-xs">
                    Dev proxy
                  </Badge>
                )}
                {llmConfig.provider === 'openai' && llmConfig.openai.useProxy && !usePythonApi && (
                  <Badge variant="outline" className="text-xs">
                    Dev proxy
                  </Badge>
                )}
              </div>
              {usePythonApi ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  OpenAI vs Azure is configured on the server. Call{' '}
                  <code className="rounded bg-muted px-0.5">GET /health</code> and read the{' '}
                  <code className="rounded bg-muted px-0.5">llm</code> field (<code className="rounded bg-muted px-0.5">openai</code>,{' '}
                  <code className="rounded bg-muted px-0.5">azure-openai</code>, or <code className="rounded bg-muted px-0.5">mock</code>
                  ).
                </p>
              ) : null}
              {llmConfig.provider === 'azure-openai' && !usePythonApi && !azureReady && (
                <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-[11px] leading-snug text-amber-950">
                  {import.meta.env.PROD && llmConfig.azure.useProxy ? (
                    <p>
                      Azure via Vite proxy is unavailable in production. Use{' '}
                      <code className="rounded bg-amber-100/80 px-0.5">VITE_AZURE_OPENAI_USE_PROXY=false</code> or the
                      Python API.
                    </p>
                  ) : (
                    <p>
                      Set Azure in <code className="rounded bg-amber-100/80 px-0.5">.env.local</code> or use{' '}
                      <code className="rounded bg-amber-100/80 px-0.5">VITE_API_BASE_URL</code>.
                    </p>
                  )}
                </div>
              )}
              {llmConfig.provider === 'openai' && !usePythonApi && !openaiReady && (
                <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-[11px] leading-snug text-amber-950">
                  {import.meta.env.PROD && llmConfig.openai.useProxy ? (
                    <p>
                      OpenAI via Vite proxy is unavailable in production. Set{' '}
                      <code className="rounded bg-amber-100/80 px-0.5">VITE_OPENAI_USE_PROXY=false</code> (not recommended
                      for secrets) or use <code className="rounded bg-amber-100/80 px-0.5">VITE_API_BASE_URL</code>.
                    </p>
                  ) : (
                    <p>
                      Set OpenAI in <code className="rounded bg-amber-100/80 px-0.5">.env.local</code> or use{' '}
                      <code className="rounded bg-amber-100/80 px-0.5">VITE_API_BASE_URL</code> with{' '}
                      <code className="rounded bg-amber-100/80 px-0.5">OPENAI_API_KEY</code> in backend{' '}
                      <code className="rounded bg-amber-100/80 px-0.5">.env</code>.
                    </p>
                  )}
                </div>
              )}
              <Textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                className="min-h-[12rem] max-h-[40vh] w-full resize-y text-sm leading-relaxed"
                placeholder="Describe how candidates should be evaluated..."
                spellCheck
                readOnly={!canManageBatches}
              />
              {scoringError && (
                <p className="text-xs text-destructive" role="alert">
                  {scoringError}
                </p>
              )}
              <Button
                variant="secondary"
                className="w-full"
                type="button"
                disabled={scoringDisabled || !canManageBatches}
                onClick={() => void handleRerunScoring()}
              >
                {scoring ? 'Scoring…' : 'Re-run LLM scoring'}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <CandidateDrawer
        batchId={batchId}
        candidate={drawerCandidate}
        open={Boolean(drawerCandidateId && drawerCandidate)}
        canUploadResume={canManageBatches}
        showFinalRecommendation={canManageBatches}
        onClose={closeDrawer}
        onCandidateUpdated={(c) =>
          setCandidates((prev) => prev.map((x) => (x.id === c.id ? c : x)))
        }
        onAddToShortlist={
          drawerCandidate?.status === 'new' && canEditInterview
            ? () => void persistStatus(drawerCandidate.id, 'shortlisted')
            : undefined
        }
      />

      <ResumePreviewModal
        candidateId={previewCandidate?.id ?? ''}
        candidateName={previewCandidate?.name ?? ''}
        hasResumePdf={Boolean(previewCandidate?.hasResumePdf)}
        resumeText={previewCandidate?.resumeText ?? ''}
        open={Boolean(previewCandidateId && previewCandidate)}
        onClose={() => setPreviewCandidateId(null)}
      />
    </div>
  );
}
