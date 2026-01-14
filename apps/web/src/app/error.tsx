'use client';

import { ErrorState } from '@/components/error-state';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState title="App error" error={error} onRetry={reset} />;
}

