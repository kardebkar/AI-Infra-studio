import type { LogLevel } from '@ai-infra-studio/types';

export function fingerprintLogMessage(message: string) {
  return message
    .replaceAll(/[0-9]+/g, '#')
    .replaceAll(/\b0x[0-9a-fA-F]+\b/g, '0x#')
    .replaceAll(/\b[a-f0-9]{7,40}\b/g, '<hash>')
    .trim();
}

export function levelWeight(level: LogLevel) {
  switch (level) {
    case 'ERROR':
      return 4;
    case 'WARN':
      return 3;
    case 'INFO':
      return 2;
    case 'DEBUG':
      return 1;
  }
}

