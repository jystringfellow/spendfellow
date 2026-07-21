export interface AmazonSplitAllocationItem {
  id: string;
  amountCents: number;
}

export interface AmazonSplitAllocation {
  itemAmounts: Array<{
    id: string;
    amountCents: number;
  }>;
  creditCents: number;
  fullOrderTotalCents: number;
}

/**
 * Allocates the full Amazon order total across its items using their pre-tax
 * prices as weights. Any part of the order not charged to the matched bank
 * transaction is returned as a positive credit magnitude; callers can add it
 * as a negative split so the transaction still reconciles.
 */
export function allocateAmazonSplitAmounts(
  items: AmazonSplitAllocationItem[],
  transactionAmountCents: number,
  orderTotalCents: number | null
): AmazonSplitAllocation | null {
  const validItems = items.filter(
    (item) => Number.isSafeInteger(item.amountCents) && item.amountCents > 0
  );
  const itemTotalCents = validItems.reduce((total, item) => total + item.amountCents, 0);

  if (
    validItems.length === 0 ||
    !Number.isSafeInteger(transactionAmountCents) ||
    transactionAmountCents <= 0 ||
    !Number.isSafeInteger(itemTotalCents)
  ) {
    return null;
  }

  const usableOrderTotalCents =
    orderTotalCents !== null && Number.isSafeInteger(orderTotalCents) && orderTotalCents > 0
      ? orderTotalCents
      : transactionAmountCents;
  const fullOrderTotalCents = Math.max(transactionAmountCents, usableOrderTotalCents);
  const denominator = BigInt(itemTotalCents);
  const targetTotal = BigInt(fullOrderTotalCents);
  const allocations = validItems.map((item, index) => {
    const numerator = BigInt(item.amountCents) * targetTotal;
    return {
      id: item.id,
      index,
      amountCents: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let centsLeft =
    fullOrderTotalCents - allocations.reduce((total, allocation) => total + allocation.amountCents, 0);

  [...allocations]
    .sort((left, right) => {
      if (left.remainder === right.remainder) {
        return left.index - right.index;
      }

      return left.remainder > right.remainder ? -1 : 1;
    })
    .forEach((allocation) => {
      if (centsLeft <= 0) {
        return;
      }

      allocation.amountCents += 1;
      centsLeft -= 1;
    });

  return {
    itemAmounts: allocations
      .sort((left, right) => left.index - right.index)
      .map(({ id, amountCents }) => ({ id, amountCents })),
    creditCents: fullOrderTotalCents - transactionAmountCents,
    fullOrderTotalCents,
  };
}
