'use client';

import * as React from 'react';
import { diffLines } from 'diff';
import { cn } from '@ai-infra-studio/ui';

export function TextDiff({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  const hunks = React.useMemo(() => diffLines(before, after), [before, after]);

  return (
    <pre
      className={cn(
        'max-h-[420px] overflow-auto rounded-xl border border-border bg-background/40 p-3 font-mono text-xs leading-5',
        className,
      )}
      aria-label="Config diff"
    >
      {hunks.map((h, i) => {
        const lines = h.value.split('\n');
        const isAdded = h.added;
        const isRemoved = h.removed;
        const prefix = isAdded ? '+' : isRemoved ? '-' : ' ';
        const color = isAdded
          ? 'text-emerald-200'
          : isRemoved
            ? 'text-red-200'
            : 'text-foreground/80';
        const bg = isAdded ? 'bg-emerald-950/30' : isRemoved ? 'bg-red-950/30' : 'bg-transparent';

        return (
          <React.Fragment key={i}>
            {lines.map((line, li) => {
              if (li === lines.length - 1 && line === '') return null;
              return (
                <div key={`${i}_${li}`} className={cn('whitespace-pre', color, bg)}>
                  <span className="select-none pr-2 text-muted-foreground">{prefix}</span>
                  {line}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </pre>
  );
}

