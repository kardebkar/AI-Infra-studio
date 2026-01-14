import { describe, expect, it } from 'vitest';

import { fingerprintLogMessage, formatBytes } from './format';

describe('formatBytes', () => {
  it('formats bytes with units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('fingerprintLogMessage', () => {
  it('normalizes hashes and numbers for grouping', () => {
    expect(
      fingerprintLogMessage('[trainer] step=000123 loss=0.4321 commit=abcdef1234567890'),
    ).toContain('<hash>');
    expect(fingerprintLogMessage('CUDA out of memory: tried to allocate 512MB')).toContain('#');
    expect(fingerprintLogMessage('ptr=0xDEADBEEF')).toContain('0x#');
  });
});

