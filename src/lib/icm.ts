/* Malmuth-Harville ICM: convert stacks into shares of the prize pool.
   Standard tournament-equity model — P(player finishes next) is
   proportional to stack, applied recursively down the payout places. */

export function icmShares(stacks: number[], payouts: number[]): number[] {
  const n = stacks.length;
  const shares = new Array(n).fill(0);
  const rec = (remaining: number[], place: number, prob: number) => {
    if (prob < 1e-12 || place >= payouts.length) return;
    const total = remaining.reduce((a, i) => a + stacks[i], 0);
    if (total <= 0) return;
    for (const i of remaining) {
      if (stacks[i] <= 0) continue;
      const p = prob * (stacks[i] / total);
      shares[i] += p * payouts[place];
      rec(remaining.filter((x) => x !== i), place + 1, p);
    }
  };
  rec(
    stacks.map((_, i) => i).filter((i) => stacks[i] > 0),
    0,
    1,
  );
  return shares;
}
