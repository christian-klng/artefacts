// Shared EUR display formatting (client + server): per-turn agent costs are
// often sub-cent, so small non-zero amounts get 4 decimals instead of 2.
export function formatEur(n: number): string {
  return `€${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`;
}
