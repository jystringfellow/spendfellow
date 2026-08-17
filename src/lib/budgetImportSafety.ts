const DUPLICATE_DOWNLOAD_SUFFIX = / \(\d+\)$/;

export function normalizeBudgetImportSource(value: string | null | undefined, fileName: string): string {
  const requestedSource = value?.trim();
  if (requestedSource) {
    return requestedSource;
  }

  return fileName.replace(/\.xlsx$/i, '').trim() || 'google_sheets_budget_import';
}

export function getPotentialOriginalSource(source: string): string | null {
  if (!DUPLICATE_DOWNLOAD_SUFFIX.test(source)) {
    return null;
  }

  const originalSource = source.replace(DUPLICATE_DOWNLOAD_SUFFIX, '').trim();
  return originalSource && originalSource !== source ? originalSource : null;
}

export function getDuplicateSourceSuggestion(
  source: string,
  existingSources: Iterable<string>
): string | null {
  const sourceSet = new Set(existingSources);
  if (sourceSet.has(source)) {
    return null;
  }

  const potentialOriginal = getPotentialOriginalSource(source);
  return potentialOriginal && sourceSet.has(potentialOriginal) ? potentialOriginal : null;
}
