/**
 * Utility functions for working with money values
 * All monetary values are stored in cents to avoid floating-point precision issues
 */

/**
 * Convert dollars to cents
 * @param dollars - Amount in dollars
 * @returns Amount in cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as a currency string
 * @param cents - Amount in cents
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string (e.g., "$123.45")
 */
export function formatCurrency(cents: number, currency: string = 'USD'): string {
  const dollars = centsToDollars(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(dollars);
}

/**
 * Parse a currency string to cents
 * @param value - Currency string (e.g., "$123.45" or "123.45")
 * @returns Amount in cents
 */
export function parseCurrencyToCents(value: string): number {
  // Remove currency symbols, commas, and other non-numeric characters except decimal point
  const numericValue = value.replace(/[^0-9.-]/g, '');
  const dollars = parseFloat(numericValue);
  
  if (isNaN(dollars)) {
    throw new Error(`Invalid currency value: ${value}`);
  }
  
  return dollarsToCents(dollars);
}
