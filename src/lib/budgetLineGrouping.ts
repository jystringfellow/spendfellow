export interface GroupableBudgetLine {
  amount_cents: number;
  budget_group_id: string | null;
  budget_group_name: string | null;
  date: string;
  description: string;
  merchant_name: string | null;
}

export interface BudgetLineGroup<T extends GroupableBudgetLine> {
  key: string;
  label: string;
  amountCents: number;
  lines: T[];
}

export function groupBudgetLines<T extends GroupableBudgetLine>(lines: T[]): BudgetLineGroup<T>[] {
  const groups = new Map<string, BudgetLineGroup<T>>();

  lines.forEach((line, index) => {
    const fallbackLabel = line.merchant_name?.trim() || line.description.trim() || 'Transaction';
    const direction = line.amount_cents < 0 ? 'credit' : 'debit';
    const key = line.budget_group_id
      ? `group:${line.budget_group_id}:${direction}`
      : `line:${index}`;
    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.amountCents += line.amount_cents;
      existingGroup.lines.push(line);
      return;
    }

    groups.set(key, {
      key,
      label: line.budget_group_name?.trim() || fallbackLabel,
      amountCents: line.amount_cents,
      lines: [line],
    });
  });

  return Array.from(groups.values());
}
