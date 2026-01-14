export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fingerprintLogMessage(message: string) {
  const HEX = '__AIS_HEX__';
  return message
    .replaceAll(/\b0x[0-9a-fA-F]+\b/g, HEX)
    .replaceAll(/\b[a-f0-9]{7,40}\b/g, '<hash>')
    .replaceAll(/[0-9]+/g, '#')
    .replaceAll(HEX, '0x#')
    .trim();
}
