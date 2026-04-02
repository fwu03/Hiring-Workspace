import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Loader2,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAuth } from '../../auth/AuthContext';
import type { HiringBatch } from '../data/hiringTypes';
import { createBatch, deleteBatch, hiringApiConfigured, listBatches } from '../services/hiringApi';

function statusIcon(status: HiringBatch['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'in-progress':
      return <Clock className="h-4 w-4 text-amber-600" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: HiringBatch['status']) {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in-progress':
      return 'In progress';
    default:
      return 'Pending';
  }
}

export function HiringBatches() {
  const navigate = useNavigate();
  const { canManageBatches } = useAuth();
  const [batches, setBatches] = useState<HiringBatch[]>([]);
  const [loading, setLoading] = useState(hiringApiConfigured());
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!hiringApiConfigured()) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const list = await listBatches();
      setBatches(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load batches');
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRemoveBatch = async (batch: HiringBatch, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `Remove batch "${batch.tag}" from the workspace?\n\nThis soft-deletes the batch in the database.`,
    );
    if (!ok) return;
    try {
      await deleteBatch(batch.id);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not remove batch');
    }
  };

  const handleCreateBatch = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    setCreating(true);
    try {
      const b = await createBatch({ tag, status: 'in-progress', uploadComplete: false });
      setNewOpen(false);
      setNewTag('');
      navigate(`/batches/${b.id}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not create batch');
    } finally {
      setCreating(false);
    }
  };

  if (!hiringApiConfigured()) {
    return (
      <div className="min-h-full bg-background p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10">
          <h1 className="text-lg font-semibold text-foreground">Almost there</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1">VITE_API_BASE_URL</code> (for example{' '}
            <code className="rounded bg-muted px-1">http://localhost:8000</code>) in{' '}
            <code className="rounded bg-muted px-1">.env.local</code>, run the API from{' '}
            <code className="rounded bg-muted px-1">backend/</code>, then reload this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your hiring batches</h1>
          </div>
          {canManageBatches ? (
            <Button type="button" className="gap-2" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              New batch
            </Button>
          ) : null}
        </div>

        {newOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
            <Card className="w-full max-w-md shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">Create a batch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="new-batch-tag" className="text-sm font-medium">
                    Batch name
                  </label>
                  <Input
                    id="new-batch-tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="e.g. Senior engineer — March"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreateBatch();
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={creating || !newTag.trim()} onClick={() => void handleCreateBatch()}>
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      'Create'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading batches…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-60" />
            <p className="text-sm font-medium text-foreground">No batches yet</p>
            {canManageBatches ? (
              <Button type="button" className="mt-4 gap-2" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />
                Create your first batch
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {batches.map((batch) => (
              <div key={batch.id} className="relative">
                <Link to={`/batches/${batch.id}`} className="block transition-opacity hover:opacity-95">
                  <Card className={`h-full cursor-pointer transition-shadow hover:shadow-md ${canManageBatches ? 'pr-12' : ''}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
                          <CardTitle className="text-base font-medium leading-snug">{batch.tag}</CardTitle>
                        </div>
                        <Badge variant="outline" className="shrink-0 gap-1">
                          {statusIcon(batch.status)}
                          {statusLabel(batch.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span>Created {batch.createdDate}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 shrink-0" />
                        <span>
                          {batch.candidateCount} candidates · {batch.shortlistedCount} shortlisted
                        </span>
                      </div>
                      {!batch.uploadComplete && (
                        <p className="text-xs text-amber-700">Upload not complete — finish adding resumes.</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
                {canManageBatches ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 z-10 h-9 w-9 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove batch ${batch.tag}`}
                    onClick={(e) => void handleRemoveBatch(batch, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
