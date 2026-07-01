// Deterministic brutalist accent color for a channel avatar tile, derived from
// its id so the same channel always gets the same color (UI-only, not from the
// API).
const BAIT_PALETTE = [
  "var(--color-bait-blue)",
  "var(--color-bait-green)",
  "var(--color-bait-pink)",
  "var(--color-bait-purple)",
  "var(--color-bait-orange)",
  "var(--color-bait-yellow)",
] as const

export function baitAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return BAIT_PALETTE[Math.abs(hash) % BAIT_PALETTE.length]
}

// Color for a 0..100 clickbait score, matching the likelihood bands (green =
// Least/Less, yellow = Normal, orange = Highly, red = Most) so a dial and its
// likelihood badge always agree.
export function baitScoreColor(pct: number): string {
  if (pct >= 80) return "var(--color-bait-red)"
  if (pct >= 60) return "var(--color-bait-orange)"
  if (pct >= 40) return "var(--color-bait-yellow)"
  return "var(--color-bait-green)"
}
