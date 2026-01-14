'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import YAML from 'yaml';

import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import { AuthoringConfigSchema, type ConfigLanguage } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@ai-infra-studio/ui';

import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { useAuthoringTemplate, useAuthoringTemplates, useCreateRun } from '@/lib/queries';

const MonacoEditor = dynamic(async () => (await import('@monaco-editor/react')).default, { ssr: false });
const MonacoDiffEditor = dynamic(async () => (await import('@monaco-editor/react')).DiffEditor, { ssr: false });

type EditorMarker = MonacoEditorNS.IMarkerData;

export default function AuthoringPage() {
  const router = useRouter();
  const templates = useAuthoringTemplates(false);
  const [templateId, setTemplateId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!templateId && templates.data?.[0]?.id) setTemplateId(templates.data[0].id);
  }, [templateId, templates.data]);

  const template = useAuthoringTemplate(templateId ?? '', false);
  const createRun = useCreateRun();

  const versions = template.data?.versions ?? [];
  const latest = versions.at(-1);
  const previous = latest?.parentId ? versions.find((v) => v.id === latest.parentId) : versions.at(-2);

  const [content, setContent] = React.useState<string>('');
  const [language, setLanguage] = React.useState<ConfigLanguage>('json');

  React.useEffect(() => {
    if (!latest) return;
    setContent(latest.content);
    setLanguage(latest.language);
  }, [latest?.id]);

  const monacoRef = React.useRef<Monaco | null>(null);
  const modelRef = React.useRef<MonacoEditorNS.ITextModel | null>(null);

  const validation = React.useMemo(() => validateConfig({ content, language }), [content, language]);

  React.useEffect(() => {
    // Apply markers into Monaco if mounted.
    const monaco = monacoRef.current;
    const model = modelRef.current;
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'authoring', validation.markers);
  }, [validation]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Model Authoring</h1>
          <p className="text-sm text-muted-foreground">
            Edit YAML/JSON configs, validate schema, diff versions, and create a synthetic run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{language.toUpperCase()}</Badge>
          <Button
            size="sm"
            disabled={!validation.ok || createRun.isPending}
            onClick={async () => {
              const res = await createRun.mutateAsync({ language, content });
              router.push(`/runs/${res.run.id}`);
            }}
            aria-disabled={!validation.ok || createRun.isPending}
            aria-label="Create run from this config"
            data-testid="create-run"
          >
            {createRun.isPending ? 'Creating…' : 'Create run'}
          </Button>
        </div>
      </div>

      {templates.isError ? (
        <ErrorState title="Templates failed to load" error={templates.error} onRetry={() => templates.refetch()} />
      ) : null}
      {template.isError ? (
        <ErrorState title="Template failed to load" error={template.error} onRetry={() => template.refetch()} />
      ) : null}
      {createRun.isError ? <ErrorState title="Create run failed" error={createRun.error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Templates</CardTitle>
            {templates.isLoading ? <Skeleton className="h-5 w-10" /> : <Badge variant="outline">{templates.data?.length ?? 0}</Badge>}
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (templates.data?.length ?? 0) === 0 ? (
              <EmptyState title="No templates" description="The API returned no templates. Check the server logs." />
            ) : (
              templates.data?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={[
                    'w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    t.id === templateId ? 'bg-muted/20' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-foreground">{t.title}</div>
                    <Badge variant="outline">{t.language.toUpperCase()}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{template.data?.title ?? 'Config'}</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">{template.data?.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={validation.ok ? 'success' : 'critical'}>
                  {validation.ok ? 'Valid' : `${validation.errors.length} issues`}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">Editor</TabsTrigger>
                <TabsTrigger value="diff" disabled={!previous}>
                  Diff
                </TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <div className="rounded-xl border border-border">
                  <MonacoEditor
                    height="520px"
                    language={language}
                    value={content}
                    onChange={(v) => setContent(v ?? '')}
                    onMount={(editor, monaco) => {
                      monacoRef.current = monaco;
                      const model = editor.getModel();
                      if (!model) return;
                      modelRef.current = model;
                      monaco.editor.setModelMarkers(model, 'authoring', validation.markers);
                    }}
                    options={{
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                      wordWrap: 'on',
                      renderLineHighlight: 'all',
                      automaticLayout: true,
                    }}
                  />
                </div>
              </TabsContent>
              <TabsContent value="diff">
                {previous ? (
                  <div className="rounded-xl border border-border">
                    <MonacoDiffEditor
                      height="520px"
                      language={language}
                      original={previous.content}
                      modified={content}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        renderSideBySide: true,
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        wordWrap: 'on',
                        automaticLayout: true,
                      }}
                    />
                  </div>
                ) : (
                  <EmptyState title="No previous version" description="This template only has a single version." />
                )}
              </TabsContent>
            </Tabs>

            {!validation.ok ? (
              <div className="rounded-xl border border-border bg-muted/10 p-3">
                <div className="text-sm font-medium text-foreground">Validation</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Fix schema issues before creating a run.
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {validation.errors.slice(0, 8).map((e, idx) => (
                    <li key={idx} className="text-red-200">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function validateConfig(input: { content: string; language: ConfigLanguage }) {
  const markers: EditorMarker[] = [];
  const errors: string[] = [];

  const parsed = parseConfigText(input);
  if (!parsed.ok) {
    errors.push(parsed.error);
    markers.push({
      startLineNumber: parsed.marker?.line ?? 1,
      startColumn: parsed.marker?.col ?? 1,
      endLineNumber: parsed.marker?.line ?? 1,
      endColumn: (parsed.marker?.col ?? 1) + 1,
      message: parsed.error,
      severity: 8,
    });
    return { ok: false as const, markers, errors };
  }

  const validated = AuthoringConfigSchema.safeParse(parsed.value);
  if (!validated.success) {
    const issues = validated.error.issues;
    for (const issue of issues) {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      errors.push(`${path}: ${issue.message}`);
    }
    markers.push({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      message: 'Schema validation failed. See Validation panel for details.',
      severity: 8,
    });
    return { ok: false as const, markers, errors };
  }

  return { ok: true as const, markers, errors };
}

function parseConfigText(input: { content: string; language: ConfigLanguage }):
  | { ok: true; value: unknown }
  | { ok: false; error: string; marker?: { line: number; col: number } } {
  try {
    if (input.language === 'json') return { ok: true, value: JSON.parse(input.content) as unknown };
    return { ok: true, value: YAML.parse(input.content) as unknown };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse config.';
    const marker = tryExtractMarker(err, input.content);
    return { ok: false, error: msg, marker };
  }
}

function tryExtractMarker(err: unknown, content: string): { line: number; col: number } | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;

  // YAML errors often include linePos: [{ line, col }...]
  const linePos = e.linePos;
  if (Array.isArray(linePos) && linePos[0] && typeof linePos[0] === 'object') {
    const lp = linePos[0] as Record<string, unknown>;
    const line = typeof lp.line === 'number' ? lp.line + 1 : undefined;
    const col = typeof lp.col === 'number' ? lp.col + 1 : undefined;
    if (line && col) return { line, col };
  }

  // JSON.parse SyntaxError sometimes includes “position N”.
  if (err instanceof SyntaxError) {
    const m = err.message.match(/position\s+(\d+)/i);
    const pos = m ? Number(m[1]) : null;
    if (pos !== null && Number.isFinite(pos)) {
      return posToLineCol(content, pos);
    }
  }
  return undefined;
}

function posToLineCol(text: string, pos: number) {
  const clamped = Math.max(0, Math.min(text.length, pos));
  const slice = text.slice(0, clamped);
  const lines = slice.split('\n');
  const line = lines.length;
  const col = lines.at(-1)?.length ? (lines.at(-1)!.length + 1) : 1;
  return { line, col };
}
