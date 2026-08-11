export interface AmazonPaymentIdentityFields {
  order_id: string;
  amount_cents: number;
  payment_method_hint: string | null;
  transaction_date: string | null;
  is_refund: boolean;
}

export function getAmazonPaymentIdentity(row: AmazonPaymentIdentityFields) {
  return JSON.stringify([
    row.order_id,
    row.amount_cents,
    row.payment_method_hint ?? null,
    row.transaction_date ?? null,
    row.is_refund,
  ]);
}
