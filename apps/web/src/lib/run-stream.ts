'use client';

import * as React from 'react';

import type { LogLine, MetricPoint, TimelineEvent, WsRunEvent } from '@ai-infra-studio/types';

import { getApiBaseUrl } from './env';

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type StreamState = {
  status: StreamStatus;
  logs: LogLine[];
  timeline: TimelineEvent[];
  metrics: Record<'loss' | 'accuracy' | 'throughput' | 'gpu_util', MetricPoint[]>;
};

function isWsRunEvent(value: unknown): value is WsRunEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === 'string' && typeof v.runId === 'string';
}

function toWsUrl(path: string) {
  const api = new URL(getApiBaseUrl());
  api.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
  api.pathname = path;
  api.search = '';
  return api.toString();
}

export function useRunStream(runId: string): StreamState {
  const [status, setStatus] = React.useState<StreamStatus>('idle');
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [timeline, setTimeline] = React.useState<TimelineEvent[]>([]);
  const [metrics, setMetrics] = React.useState<StreamState['metrics']>({
    loss: [],
    accuracy: [],
    throughput: [],
    gpu_util: [],
  });

  React.useEffect(() => {
    if (!runId) return;

    setLogs([]);
    setTimeline([]);
    setMetrics({ loss: [], accuracy: [], throughput: [], gpu_util: [] });

    let socket: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      attempt += 1;
      setStatus(attempt === 1 ? 'connecting' : 'reconnecting');

      const url = toWsUrl(`/ws/runs/${runId}`);
      socket = new WebSocket(url);

      socket.addEventListener('open', () => {
        if (disposed) return;
        attempt = 0;
        setStatus('connected');
      });

      socket.addEventListener('message', (msg) => {
        if (disposed) return;
        const text = typeof msg.data === 'string' ? msg.data : '';
        if (!text) return;
        try {
          const parsed = JSON.parse(text) as unknown;
          if (!isWsRunEvent(parsed)) return;
          if (parsed.type === 'log_line') {
            setLogs((prev) => [...prev, parsed.line].slice(-5000));
          } else if (parsed.type === 'timeline_event') {
            setTimeline((prev) => [...prev, parsed.event].slice(-500));
          } else if (parsed.type === 'metric_point') {
            const name = parsed.point.name as keyof StreamState['metrics'];
            if (name === 'loss' || name === 'accuracy' || name === 'throughput' || name === 'gpu_util') {
              setMetrics((prev) => ({
                ...prev,
                [name]: [...prev[name], parsed.point].slice(-4000),
              }));
            }
          }
        } catch {
          // ignore malformed messages
        }
      });

      socket.addEventListener('close', () => {
        if (disposed) return;
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        if (disposed) return;
        setStatus('error');
        try {
          socket?.close();
        } catch {
          // ignore
        }
      });
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      setStatus('reconnecting');
      const base = 450;
      const max = 8000;
      const exp = Math.min(max, base * Math.pow(2, Math.min(5, attempt)));
      const jitter = Math.random() * 250;
      const wait = Math.floor(exp + jitter);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => connect(), wait);
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        socket?.close();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return { status, logs, timeline, metrics };
}
