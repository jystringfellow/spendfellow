'use client';

import { Typography } from '@mui/material';
import { formatCurrency } from '@/lib/money';

interface MoneyDisplayProps {
  cents: number;
  currency?: string;
  showSign?: boolean;
  colorize?: boolean;
}

/**
 * Display monetary values with proper formatting
 * Optionally colorize positive/negative values
 */
export default function MoneyDisplay({
  cents,
  currency = 'USD',
  showSign = false,
  colorize = false,
}: MoneyDisplayProps) {
  const formatted = formatCurrency(cents, currency);
  const isNegative = cents < 0;
  const isPositive = cents > 0;

  let displayValue = formatted;
  if (showSign && isPositive) {
    displayValue = `+${formatted}`;
  }

  let color: string | undefined;
  if (colorize) {
    if (isNegative) {
      color = 'success.main'; // Negative = income = good
    } else if (isPositive) {
      color = 'error.main'; // Positive = expense = bad
    }
  }

  return (
    <Typography component="span" sx={{ color }}>
      {displayValue}
    </Typography>
  );
}
