/** Shared hiring workflow types. */

export interface HiringBatch {
  id: string;
  tag: string;
  createdDate: string;
  candidateCount: number;
  shortlistedCount: number;
  status: 'pending' | 'in-progress' | 'completed';
  uploadComplete: boolean;
  llmPrompt?: string;
}

export interface HiringCandidate {
  id: string;
  batchId: string;
  name: string;
  email: string;
  phone: string;
  yearsOfExperience: number;
  school: string;
  degree: string;
  flags: {
    seenBefore: boolean;
    interviewedBefore: boolean;
    otherBatch: boolean;
    otherBatchInfo?: string;
  };
  llmScore?: number;
  /** Short explanation from the last LLM scoring run. */
  llmRationale?: string | null;
  status: 'new' | 'shortlisted' | 'interviewing' | 'rejected' | 'offered';
  hmComment?: string;
  resumeText: string;
  /** Original resume PDF uploaded for this candidate (served by GET .../candidates/:id/resume). */
  hasResumePdf: boolean;
  history: ApplicationHistoryEntry[];
  interviewRounds: CandidateInterviewRound[];
  /** Persisted interview UI state (rounds, final summary, etc.) from the API. */
  interviewWorkspace?: Record<string, unknown> | null;
}

export interface ApplicationHistoryEntry {
  batchTag: string;
  date: string;
  status: string;
  outcome: string;
}

export interface CandidateInterviewRound {
  id: string;
  roundName: string;
  interviewer: string;
  date: string;
  notes: string;
  rating?: number;
}
