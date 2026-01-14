import TraceClient from './trace-client';

export default async function TracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TraceClient traceId={id} />;
}
