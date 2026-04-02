/** Shape stored in `HiringCandidate.interviewWorkspace` (see HiringInterviewWorkspace). */

export type InterviewRecommendation = 'hire' | 'no-hire' | 'unsure' | null;

export interface InterviewerFeedbackRow {
  id: string;
  interviewerName: string;
  strengths: string;
  concerns: string;
  recommendation: InterviewRecommendation;
}

export interface InterviewRoundFeedback {
  id: string;
  roundTitle: string;
  interviewers: InterviewerFeedbackRow[];
}

export interface ParsedInterviewWorkspace {
  rounds: InterviewRoundFeedback[];
  finalRecommendation: string;
}

/** Parse persisted interview workspace JSON for read-only display (e.g. candidate profile). */
export function parseInterviewWorkspace(
  raw: Record<string, unknown> | null | undefined,
): ParsedInterviewWorkspace | null {
  if (!raw || typeof raw !== 'object') return null;
  const roundsRaw = raw.rounds;
  if (!Array.isArray(roundsRaw)) return null;
  const rounds: InterviewRoundFeedback[] = [];
  for (const r of roundsRaw) {
    if (!r || typeof r !== 'object') continue;
    const ro = r as Record<string, unknown>;
    const interviewersRaw = ro.interviewers;
    if (!Array.isArray(interviewersRaw)) continue;
    const interviewers: InterviewerFeedbackRow[] = [];
    for (const i of interviewersRaw) {
      if (!i || typeof i !== 'object') continue;
      const io = i as Record<string, unknown>;
      const rec = io.recommendation;
      let recommendation: InterviewRecommendation = null;
      if (rec === 'hire' || rec === 'no-hire' || rec === 'unsure') recommendation = rec;
      interviewers.push({
        id: String(io.id ?? ''),
        interviewerName: String(io.interviewerName ?? ''),
        strengths: String(io.strengths ?? ''),
        concerns: String(io.concerns ?? ''),
        recommendation,
      });
    }
    rounds.push({
      id: String(ro.id ?? ''),
      roundTitle: String(ro.roundTitle ?? ''),
      interviewers,
    });
  }
  const finalRecommendation = String(raw.finalRecommendation ?? '');
  if (rounds.length === 0 && !finalRecommendation.trim()) return null;
  return { rounds, finalRecommendation };
}

export function recommendationLabel(r: InterviewRecommendation): string {
  if (r === 'hire') return 'Hire';
  if (r === 'no-hire') return 'No hire';
  if (r === 'unsure') return 'Unsure';
  return '—';
}
