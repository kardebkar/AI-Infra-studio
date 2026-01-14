import '@/styles/globals.css';
import '@ai-infra-studio/ui/styles.css';

import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'AI Infra Studio',
  description: 'Portfolio-grade demo for dense AI infra tooling UX',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
