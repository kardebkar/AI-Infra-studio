import Link from 'next/link';
import { Button } from '@ai-infra-studio/ui';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This page doesn’t exist in the demo. Use the left navigation to explore core workflows.
      </p>
      <Button asChild>
        <Link href="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}

