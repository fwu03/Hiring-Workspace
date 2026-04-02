import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  User,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useAuth } from '../../auth/AuthContext';
import type { HiringCandidate } from '../data/hiringTypes';
import { formatStatusLabel } from '../state/batchSessionState';
import {
  getBatchDetail,
  getCandidate,
  hiringApiConfigured,
  patchCandidate,
} from '../services/hiringApi';

type Recommendation = 'hire' | 'no-hire' | 'unsure' | null;

interface InterviewerRow {
  id: string;
  /** Logged-in user id who owns this feedback row (for edit permissions). */
  ownerUserId?: string | null;
  interviewerName: string;
  strengths: string;
  concerns: string;
  recommendation: Recommendation;
}

interface RoundState {
  id: string;
  roundTitle: string;
  /** User who created the round (can edit round title when not hiring manager). */
  ownerUserId?: string | null;
  isExpanded: boolean;
  interviewers: InterviewerRow[];
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedRoundsFromCandidate(c: HiringCandidate, currentUserId: string | undefined): RoundState[] {
  if (c.interviewRounds.length === 0) {
    return [
      {
        id: newId('round'),
        roundTitle: 'Round 1',
        ownerUserId: currentUserId ?? null,
        isExpanded: true,
        interviewers: [],
      },
    ];
  }
  return c.interviewRounds.map((r) => ({
    id: r.id,
    roundTitle: r.roundName,
    ownerUserId: null,
    isExpanded: true,
    interviewers: [
      {
        id: `${r.id}-int`,
        ownerUserId: null,
        interviewerName: r.interviewer,
        strengths: '',
        concerns: r.notes,
        recommendation: null,
      },
    ],
  }));
}

function parseStoredWorkspace(
  raw: Record<string, unknown> | null | undefined,
): { rounds: RoundState[]; finalRecommendation: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const roundsRaw = raw.rounds;
  if (!Array.isArray(roundsRaw)) return null;
  const rounds: RoundState[] = [];
  for (const r of roundsRaw) {
    if (!r || typeof r !== 'object') continue;
    const ro = r as Record<string, unknown>;
    const interviewersRaw = ro.interviewers;
    if (!Array.isArray(interviewersRaw)) continue;
    const interviewers: InterviewerRow[] = [];
    for (const i of interviewersRaw) {
      if (!i || typeof i !== 'object') continue;
      const io = i as Record<string, unknown>;
      const rec = io.recommendation;
      let recommendation: Recommendation = null;
      if (rec === 'hire' || rec === 'no-hire' || rec === 'unsure') recommendation = rec;
      interviewers.push({
        id: String(io.id ?? newId('int')),
        ownerUserId: io.ownerUserId != null && io.ownerUserId !== '' ? String(io.ownerUserId) : null,
        interviewerName: String(io.interviewerName ?? ''),
        strengths: String(io.strengths ?? ''),
        concerns: String(io.concerns ?? ''),
        recommendation,
      });
    }
    rounds.push({
      id: String(ro.id ?? newId('round')),
      roundTitle: String(ro.roundTitle ?? ''),
      ownerUserId: ro.ownerUserId != null && ro.ownerUserId !== '' ? String(ro.ownerUserId) : null,
      isExpanded: ro.isExpanded !== false,
      interviewers,
    });
  }
  if (rounds.length === 0) return null;
  return {
    rounds,
    finalRecommendation: String(raw.finalRecommendation ?? ''),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const recButton = (active: boolean, base: string) =>
  `${base} ${active ? 'ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:opacity-100'}`;

function workspacePayload(rounds: RoundState[], finalRecommendation: string) {
  return {
    rounds: rounds.map((r) => ({
      id: r.id,
      roundTitle: r.roundTitle,
      ownerUserId: r.ownerUserId ?? null,
      isExpanded: r.isExpanded,
      interviewers: r.interviewers.map((i) => ({ ...i })),
    })),
    finalRecommendation,
  };
}

function displayUserLabel(name: string | undefined, email: string | undefined): string {
  const n = name?.trim();
  if (n) return n;
  return email?.trim() || '—';
}

/** Strengths / concerns / per-row recommendation: owner only (not hiring manager on others' rows). */
function canEditInterviewerRowContent(
  int: InterviewerRow,
  userId: string | undefined,
  displayLabel: string,
): boolean {
  if (!userId) return false;
  if (int.ownerUserId && int.ownerUserId === userId) return true;
  if (!int.ownerUserId && displayLabel.trim()) {
    const a = int.interviewerName.trim().toLowerCase().replace(/\s+/g, ' ');
    const b = displayLabel.trim().toLowerCase().replace(/\s+/g, ' ');
    return a.length > 0 && a === b;
  }
  return false;
}

function canRemoveInterviewerRow(
  int: InterviewerRow,
  userId: string | undefined,
  displayLabel: string,
  isHiringManager: boolean,
): boolean {
  if (isHiringManager) return true;
  return canEditInterviewerRowContent(int, userId, displayLabel);
}

function canEditRoundTitle(round: RoundState, userId: string | undefined, isHiringManager: boolean): boolean {
  if (isHiringManager) return true;
  return Boolean(userId && round.ownerUserId && round.ownerUserId === userId);
}

export function HiringInterviewWorkspace() {
  const { user, canEditInterview, isHiringManager } = useAuth();
  const { batchId = '', candidateId = '' } = useParams<{ batchId: string; candidateId: string }>();
  const navigate = useNavigate();

  const [candidate, setCandidate] = useState<HiringCandidate | null>(null);
  const [batchLabel, setBatchLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessTick, setSaveSuccessTick] = useState(0);
  const [canAutosave, setCanAutosave] = useState(false);

  const [rounds, setRounds] = useState<RoundState[]>([]);
  const [finalRecommendation, setFinalRecommendation] = useState('');

  /** Latest auth for fetch callback without re-running the candidate load effect. */
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;
  const isHiringManagerRef = useRef(false);
  isHiringManagerRef.current = isHiringManager;

  useEffect(() => {
    if (!batchId || !hiringApiConfigured()) return;
    void getBatchDetail(batchId)
      .then((d) => setBatchLabel(d.batch.tag))
      .catch(() => setBatchLabel(batchId));
  }, [batchId]);

  useEffect(() => {
    if (!candidateId || !hiringApiConfigured()) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setCanAutosave(false);
    void getCandidate(candidateId)
      .then((c) => {
        if (cancelled) return;
        if (c.batchId !== batchId) {
          setNotFound(true);
          setCandidate(null);
          return;
        }
        setCandidate(c);
        const stored = parseStoredWorkspace(c.interviewWorkspace ?? null);
        if (stored) {
          setRounds(stored.rounds);
          setFinalRecommendation(isHiringManagerRef.current ? stored.finalRecommendation : '');
        } else {
          setRounds(seedRoundsFromCandidate(c, userIdRef.current));
          setFinalRecommendation('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
          setCandidate(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId, candidateId, user?.id, isHiringManager]);

  const persistWorkspace = useCallback(
    async (nextRounds: RoundState[], finalRec: string) => {
      if (!candidateId) return;
      setSaveError(null);
      setSaving(true);
      try {
        const updated = await patchCandidate(candidateId, {
          interviewWorkspace: workspacePayload(nextRounds, finalRec),
        });
        setCandidate(updated);
        const stored = parseStoredWorkspace(updated.interviewWorkspace ?? null);
        if (stored) {
          setRounds(stored.rounds);
          setFinalRecommendation(isHiringManagerRef.current ? stored.finalRecommendation : '');
        }
        setSaveSuccessTick(Date.now());
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [candidateId],
  );

  useEffect(() => {
    if (!candidate || loading) return;
    const t = setTimeout(() => setCanAutosave(true), 100);
    return () => clearTimeout(t);
  }, [candidate, loading]);

  useEffect(() => {
    if (!canAutosave || !canEditInterview) return;
    const t = setTimeout(() => {
      void persistWorkspace(rounds, finalRecommendation);
    }, 1500);
    return () => clearTimeout(t);
  }, [rounds, finalRecommendation, canAutosave, canEditInterview, persistWorkspace]);

  const pipelineStatus = useMemo(() => candidate?.status ?? 'new', [candidate]);

  const toggleRound = (roundId: string) => {
    setRounds((prev) =>
      prev.map((r) => (r.id === roundId ? { ...r, isExpanded: !r.isExpanded } : r)),
    );
  };

  const addRound = () => {
    if (!user?.id) return;
    setRounds((prev) => [
      ...prev,
      {
        id: newId('round'),
        roundTitle: `Round ${prev.length + 1}`,
        ownerUserId: user.id,
        isExpanded: true,
        interviewers: [],
      },
    ]);
  };

  const addInterviewer = (roundId: string) => {
    if (!user?.id) return;
    const uid = user.id;
    const label = displayUserLabel(user.name, user.email);
    setRounds((prev) =>
      prev.map((r) => {
        if (r.id !== roundId) return r;
        if (r.interviewers.some((i) => i.ownerUserId === uid)) {
          window.alert('You already have feedback in this round.');
          return r;
        }
        return {
          ...r,
          interviewers: [
            ...r.interviewers,
            {
              id: newId('int'),
              ownerUserId: uid,
              interviewerName: label,
              strengths: '',
              concerns: '',
              recommendation: null,
            },
          ],
        };
      }),
    );
  };

  const updateInterviewer = (
    roundId: string,
    intId: string,
    patch: Partial<Pick<InterviewerRow, 'interviewerName' | 'strengths' | 'concerns' | 'recommendation'>>,
  ) => {
    const me = displayUserLabel(user?.name, user?.email);
    setRounds((prev) =>
      prev.map((r) => {
        if (r.id !== roundId) return r;
        const int = r.interviewers.find((i) => i.id === intId);
        if (!int) return r;
        if (patch.interviewerName !== undefined && !isHiringManager) return r;
        if (
          (patch.strengths !== undefined ||
            patch.concerns !== undefined ||
            patch.recommendation !== undefined) &&
          !canEditInterviewerRowContent(int, user?.id, me)
        ) {
          return r;
        }
        return {
          ...r,
          interviewers: r.interviewers.map((i) => (i.id === intId ? { ...i, ...patch } : i)),
        };
      }),
    );
  };

  const updateRoundTitle = (roundId: string, roundTitle: string) => {
    setRounds((prev) =>
      prev.map((r) => {
        if (r.id !== roundId) return r;
        if (!canEditRoundTitle(r, user?.id, isHiringManager)) return r;
        return { ...r, roundTitle };
      }),
    );
  };

  const removeInterviewer = (roundId: string, intId: string) => {
    const me = displayUserLabel(user?.name, user?.email);
    setRounds((prev) =>
      prev.map((r) => {
        if (r.id !== roundId) return r;
        const int = r.interviewers.find((i) => i.id === intId);
        if (!int) return r;
        if (!canRemoveInterviewerRow(int, user?.id, me, isHiringManager)) return r;
        return { ...r, interviewers: r.interviewers.filter((i) => i.id !== intId) };
      }),
    );
  };

  const handleSaveSummary = async () => {
    await persistWorkspace(rounds, finalRecommendation);
    navigate(`/batches/${batchId}`);
  };

  if (!hiringApiConfigured()) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">Configure VITE_API_BASE_URL to load and save interview data.</p>
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
        Loading…
      </div>
    );
  }

  if (notFound || !candidate) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">Candidate not found in this batch.</p>
        <Button variant="outline" type="button" onClick={() => navigate('/')}>
          Back to batches
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <Link
          to={`/batches/${batchId}`}
          className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to this batch
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {initials(candidate.name)}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{candidate.name}</h1>
              <p className="text-sm text-muted-foreground">{batchLabel || batchId}</p>
            </div>
          </div>
          <Badge variant="outline">{formatStatusLabel(pipelineStatus)}</Badge>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-foreground">Interview notes</h2>
            {saving && canEditInterview && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving…
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="gap-1"
            disabled={!canEditInterview || !user?.id}
            onClick={addRound}
          >
            <Plus className="h-4 w-4" />
            Add round
          </Button>
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        {rounds.map((round) => (
          <Card key={round.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left hover:bg-muted/40"
              onClick={() => toggleRound(round.id)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {round.isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Input
                  value={round.roundTitle}
                  readOnly={!canEditRoundTitle(round, user?.id, isHiringManager)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateRoundTitle(round.id, e.target.value)}
                  className="h-8 max-w-md border-transparent bg-transparent px-0 font-medium focus-visible:ring-1"
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {round.interviewers.length} interviewer{round.interviewers.length !== 1 ? 's' : ''}
              </span>
            </button>

            {round.isExpanded && (
              <CardContent className="space-y-6 p-4 pt-4">
                {round.interviewers.map((int) => {
                  const meLabel = displayUserLabel(user?.name, user?.email);
                  const canEditContent = canEditInterviewerRowContent(int, user?.id, meLabel);
                  const canRemoveRow = canRemoveInterviewerRow(int, user?.id, meLabel, isHiringManager);
                  return (
                  <div
                    key={int.id}
                    className="rounded-lg border border-border bg-muted/20 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{int.interviewerName.trim() || 'Interviewer'}</span>
                      </div>
                      {canRemoveRow ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 gap-1 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (window.confirm('Remove this interviewer’s notes from this round?')) {
                              removeInterviewer(round.id, int.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Name</label>
                        {isHiringManager ? (
                          <Input
                            placeholder="Interviewer name"
                            value={int.interviewerName}
                            onChange={(e) =>
                              updateInterviewer(round.id, int.id, { interviewerName: e.target.value })
                            }
                          />
                        ) : (
                          <p className="text-sm font-medium text-foreground">
                            {int.interviewerName.trim() || '—'}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Strengths</label>
                        <Textarea
                          placeholder="What went well..."
                          className="min-h-[72px]"
                          value={int.strengths}
                          readOnly={!canEditContent}
                          onChange={(e) => updateInterviewer(round.id, int.id, { strengths: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Concerns</label>
                        <Textarea
                          placeholder="Risks or gaps..."
                          className="min-h-[72px]"
                          value={int.concerns}
                          readOnly={!canEditContent}
                          onChange={(e) => updateInterviewer(round.id, int.id, { concerns: e.target.value })}
                        />
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Recommendation</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canEditContent}
                            variant={int.recommendation === 'hire' ? 'default' : 'outline'}
                            className={recButton(int.recommendation === 'hire', 'gap-1')}
                            onClick={() =>
                              updateInterviewer(round.id, int.id, {
                                recommendation: int.recommendation === 'hire' ? null : 'hire',
                              })
                            }
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            Hire
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canEditContent}
                            variant={int.recommendation === 'no-hire' ? 'destructive' : 'outline'}
                            className={recButton(int.recommendation === 'no-hire', 'gap-1')}
                            onClick={() =>
                              updateInterviewer(round.id, int.id, {
                                recommendation: int.recommendation === 'no-hire' ? null : 'no-hire',
                              })
                            }
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                            No hire
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canEditContent}
                            variant={int.recommendation === 'unsure' ? 'secondary' : 'outline'}
                            className={recButton(int.recommendation === 'unsure', 'gap-1')}
                            onClick={() =>
                              updateInterviewer(round.id, int.id, {
                                recommendation: int.recommendation === 'unsure' ? null : 'unsure',
                              })
                            }
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                            Unsure
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="gap-1 text-muted-foreground"
                  disabled={!canEditInterview || !user?.id}
                  onClick={() => addInterviewer(round.id)}
                >
                  <Plus className="h-4 w-4" />
                  Add interviewer
                </Button>
              </CardContent>
            )}
          </Card>
        ))}

        {isHiringManager ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Final recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                className="min-h-[120px]"
                placeholder="Summary, level, and next steps..."
                value={finalRecommendation}
                onChange={(e) => setFinalRecommendation(e.target.value)}
              />
              <Button type="button" disabled={saving} onClick={() => void handleSaveSummary()}>
                Save now
              </Button>
              {saveSuccessTick > 0 && !saving && !saveError ? (
                <p className="text-xs text-muted-foreground">Saved.</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
