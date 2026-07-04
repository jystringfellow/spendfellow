/**
 * Utility functions for date operations
 */

/**
 * Get the first day of a month
 * @param year - Year
 * @param month - Month (1-12)
 * @returns ISO date string for the first day
 */
export function getFirstDayOfMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString().split('T')[0];
}

/**
 * Get the last day of a month
 * @param year - Year
 * @param month - Month (1-12)
 * @returns ISO date string for the last day
 */
export function getLastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().split('T')[0];
}

/**
 * Get the current month and year
 * @returns Object with current year and month
 */
export function getCurrentMonthYear(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1, // JavaScript months are 0-indexed
  };
}

/**
 * Format a date for display
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "Jan 15, 2026")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Get month name from month number
 * @param month - Month number (1-12)
 * @returns Month name (e.g., "January")
 */
export function getMonthName(month: number): string {
  const date = new Date(2000, month - 1, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
}

/**
 * Get short month name from month number
 * @param month - Month number (1-12)
 * @returns Short month name (e.g., "Jan")
 */
export function getShortMonthName(month: number): string {
  const date = new Date(2000, month - 1, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
}
