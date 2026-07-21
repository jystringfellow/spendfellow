import { allocateAmazonSplitAmounts } from './amazonSplitAllocation';

export interface AmazonRefundItemCandidate {
  id: string;
  amountCents: number;
}

interface SubsetMatch {
  ids: string[];
  ways: number;
}

/**
 * Finds a unique set of order items whose proportionally allocated post-tax
 * amounts reconcile to an Amazon refund. Ambiguous or weak matches return null
 * so the UI can show the whole order instead of guessing.
 */
export function findUniqueAmazonRefundItemIds(
  items: AmazonRefundItemCandidate[],
  refundAmountCents: number,
  orderTotalCents: number | null
): string[] | null {
  const validItems = items.filter(
    (item) => item.id && Number.isSafeInteger(item.amountCents) && item.amountCents > 0
  );
  const targetCents = Math.abs(refundAmountCents);
  if (validItems.length === 0 || validItems.length > 24 || !Number.isSafeInteger(targetCents) || targetCents <= 0) {
    return null;
  }

  const rawItemTotalCents = validItems.reduce((total, item) => total + item.amountCents, 0);
  const usableOrderTotalCents =
    orderTotalCents !== null && Number.isSafeInteger(orderTotalCents) && orderTotalCents > 0
      ? orderTotalCents
      : rawItemTotalCents;
  const allocation = allocateAmazonSplitAmounts(validItems, usableOrderTotalCents, usableOrderTotalCents);
  if (!allocation) {
    return null;
  }

  const matchesBySum = new Map<number, SubsetMatch>([[0, { ids: [], ways: 1 }]]);
  allocation.itemAmounts.forEach((item) => {
    const existingMatches = Array.from(matchesBySum.entries());
    existingMatches.forEach(([sum, match]) => {
      const nextSum = sum + item.amountCents;
      if (nextSum > targetCents + 1) {
        return;
      }

      const existing = matchesBySum.get(nextSum);
      if (existing) {
        existing.ways = Math.min(2, existing.ways + match.ways);
        return;
      }

      matchesBySum.set(nextSum, { ids: [...match.ids, item.id], ways: match.ways });
    });
  });

  const exact = matchesBySum.get(targetCents);
  if (exact?.ways === 1) {
    return exact.ids;
  }
  if (exact && exact.ways > 1) {
    return null;
  }

  const nearby = [targetCents - 1, targetCents + 1]
    .map((sum) => matchesBySum.get(sum))
    .filter((match): match is SubsetMatch => Boolean(match?.ways === 1));
  if (nearby.length === 1) {
    return nearby[0].ids;
  }

  const allocatedByItemId = new Map(allocation.itemAmounts.map((item) => [item.id, item.amountCents]));
  const rankedSingleItems = validItems
    .map((item) => ({
      id: item.id,
      differenceCents: Math.min(
        Math.abs(targetCents - item.amountCents),
        Math.abs(targetCents - (allocatedByItemId.get(item.id) ?? item.amountCents))
      ),
    }))
    .sort((left, right) => left.differenceCents - right.differenceCents);
  const best = rankedSingleItems[0];
  const secondBest = rankedSingleItems[1];
  const maximumDifferenceCents = Math.max(15, Math.round(targetCents * 0.1));
  const requiredLeadCents = Math.max(5, Math.round(targetCents * 0.01));

  if (
    best &&
    best.differenceCents <= maximumDifferenceCents &&
    (!secondBest || secondBest.differenceCents - best.differenceCents >= requiredLeadCents)
  ) {
    return [best.id];
  }

  return null;
}
