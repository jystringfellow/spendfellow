interface SyncDateOptions { mode?: 'latest' | 'last_30_days' | 'custom'; start_date?: string }

/** Use the oldest selected account's history so a partial sync cannot advance its siblings. */
export function getSelectedAccountsSyncStartDate(lastSyncDates: (string | null)[], options: SyncDateOptions, now = new Date()): string {
  if (options.mode === 'custom' && options.start_date) return options.start_date;
  const dateForAccount = (lastSync: string | null) => {
    const date = options.mode === 'last_30_days' || !lastSync ? new Date(now) : new Date(lastSync);
    date.setUTCDate(date.getUTCDate() - (options.mode === 'last_30_days' || !lastSync ? 30 : 3));
    return date.toISOString().slice(0, 10);
  };
  return (lastSyncDates.length ? lastSyncDates : [null]).map(dateForAccount).sort()[0];
}
