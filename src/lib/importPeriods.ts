export interface CalendarMonth {
  year: number;
  month: number;
}

function monthIndex(period: CalendarMonth): number {
  return period.year * 12 + period.month - 1;
}

function fromMonthIndex(index: number): CalendarMonth {
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

export function getImportRestorationMonths(selectedMonths: CalendarMonth[]): CalendarMonth[] {
  const selectedIndexes = new Set(selectedMonths.map(monthIndex));

  return Array.from(selectedIndexes)
    .sort((first, second) => first - second)
    .filter((index) => !selectedIndexes.has(index + 1))
    .map((index) => fromMonthIndex(index + 1))
    .filter((period) => period.year <= 2100);
}
