export type BudgetImportMode = 'replace' | 'merge';

export interface IncomingBudgetLineRef {
  source_sheet: string;
  source_cell: string;
  month: number;
}

export interface ExistingBudgetLineRef extends IncomingBudgetLineRef {
  id: string;
}

export interface BudgetLineImportPlan {
  insertCount: number;
  updateCount: number;
  deleteIds: string[];
}

function lineKey(line: Pick<IncomingBudgetLineRef, 'source_sheet' | 'source_cell'>): string {
  return `${line.source_sheet}\u0000${line.source_cell}`;
}

export function parseBudgetImportMode(value: unknown): BudgetImportMode | null {
  return value === 'replace' || value === 'merge' ? value : null;
}

export function planBudgetLineImport(
  incomingLines: IncomingBudgetLineRef[],
  existingLines: ExistingBudgetLineRef[],
  selectedMonths: number[],
  mode: BudgetImportMode
): BudgetLineImportPlan {
  const existingKeys = new Set(existingLines.map(lineKey));
  const incomingKeys = new Set(incomingLines.map(lineKey));
  const selectedMonthSet = new Set(selectedMonths);
  let updateCount = 0;
  let insertCount = 0;

  incomingKeys.forEach((key) => {
    if (existingKeys.has(key)) {
      updateCount += 1;
    } else {
      insertCount += 1;
    }
  });

  const deleteIds = mode === 'replace'
    ? existingLines
        .filter((line) => selectedMonthSet.has(line.month) && !incomingKeys.has(lineKey(line)))
        .map((line) => line.id)
    : [];

  return { insertCount, updateCount, deleteIds };
}
