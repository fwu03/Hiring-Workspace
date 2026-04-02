import { useEffect, useState } from 'react';
import { fetchResumePdfObjectUrl } from '../../auth/resumePdf';

/** Loads resume PDF with Bearer auth; returns a blob: URL for iframes (revoked on unmount or when id changes). */
export function useResumePdfBlobUrl(candidateId: string | null, enabled: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !candidateId) {
      setBlobUrl(null);
      setError(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchResumePdfObjectUrl(candidateId)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setBlobUrl(u);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load PDF');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl(null);
    };
  }, [candidateId, enabled]);

  return { blobUrl, loading, error };
}
