'use client';

import * as React from 'react';
import { Button } from '@ai-infra-studio/ui';

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const details = formatErrorDetails(error);

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-6">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">
        The UI can recover from transient failures. Try again — chaos mode may intentionally inject
        errors.
      </div>
      <div className="mt-4 flex items-center gap-2">
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>

      {details ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">Error details</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-background/40 p-3 text-xs text-foreground">
            {details}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function formatErrorDetails(error: unknown) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const obj = { name: error.name, message: error.message, stack: error.stack };
    return safeStringify(obj);
  }
  return safeStringify(error);
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

