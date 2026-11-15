import { useEffect, useState } from 'react';

export type ImageStatus = 'loading' | 'ok' | 'missing';

/** Vérifie dans le navigateur si une image existe vraiment (les PNG de Duo 1 ne sont pas tous là).
 *  Ne plante jamais : image absente = 'missing'. */
export function useImageStatus(url: string | null | undefined): ImageStatus {
  const [state, setState] = useState<{ url: string; status: ImageStatus } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setState({ url, status: 'ok' });
    img.onerror = () => !cancelled && setState({ url, status: 'missing' });
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!url) return 'missing';
  return state?.url === url ? state.status : 'loading';
}
