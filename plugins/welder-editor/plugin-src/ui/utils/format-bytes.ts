// ============================================================
// format-bytes.ts — small label helper for image size readouts.
// ============================================================

/**
 * Format a byte count for display: "742 KB", "1.2 MB". Sub-1 KB
 * rounds to bytes. Returns an empty string for negative / non-finite
 * input (callers should treat empty as "no size known yet").
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
