import type { HiringCandidate } from '../data/hiringTypes';

export type PipelineStatus = HiringCandidate['status'];

export function formatStatusLabel(status: PipelineStatus): string {
  if (status === 'interviewing') return 'Interview';
  const s = status.replace('-', ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
