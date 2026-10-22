export function normalizeOrderId(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b(?:\d{3}-\d{7}-\d{7}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\b/i);
  return match?.[0] ?? null;
}
