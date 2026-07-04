'use client';

import { useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Check as CheckIcon, Close as CloseIcon, Edit as EditIcon } from '@mui/icons-material';
import { monthOptions } from '@/lib/constantPeriods';
import { centsToDollars, formatCurrency } from '@/lib/money';

interface EditableMoneyFieldProps {
  amountCents: number;
  action: (formData: FormData) => void | Promise<void>;
  idFieldName: string;
  id: string;
  hiddenFields?: Record<string, string | number>;
  startMonth?: number;
  billingFrequency?: 'monthly' | 'yearly';
  showBillingFrequency?: boolean;
  disabled?: boolean;
}

export default function EditableMoneyField({
  amountCents,
  action,
  idFieldName,
  id,
  hiddenFields = {},
  startMonth = new Date().getMonth() + 1,
  billingFrequency = 'monthly',
  showBillingFrequency = false,
  disabled = false,
}: EditableMoneyFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [amount, setAmount] = useState(centsToDollars(amountCents).toFixed(2));
  const [selectedStartMonth, setSelectedStartMonth] = useState(startMonth);
  const [selectedBillingFrequency, setSelectedBillingFrequency] = useState(billingFrequency);

  if (!isEditing || disabled) {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
        <Typography component="span" variant="body2">
          {formatCurrency(amountCents)}
        </Typography>
        {!disabled && (
          <Tooltip title="Edit amount">
            <IconButton size="small" onClick={() => setIsEditing(true)} aria-label="Edit amount">
              <EditIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  }

  return (
    <Box
      component="form"
      action={action}
      sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}
    >
      <input type="hidden" name={idFieldName} value={id} />
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <TextField
        name="amount"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        size="small"
        inputProps={{ inputMode: 'decimal', 'aria-label': 'Amount' }}
        sx={{ width: 120 }}
      />
      <TextField
        select
        name="startMonth"
        value={selectedStartMonth}
        onChange={(event) => setSelectedStartMonth(Number(event.target.value))}
        size="small"
        label="From"
        sx={{ width: 96 }}
      >
        {monthOptions.map((month) => (
          <MenuItem key={month.value} value={month.value}>
            {month.label}
          </MenuItem>
        ))}
      </TextField>
      {showBillingFrequency && (
        <TextField
          select
          name="billingFrequency"
          value={selectedBillingFrequency}
          onChange={(event) => setSelectedBillingFrequency(event.target.value as 'monthly' | 'yearly')}
          size="small"
          label="Every"
          sx={{ width: 112 }}
        >
          <MenuItem value="monthly">Month</MenuItem>
          <MenuItem value="yearly">Year</MenuItem>
        </TextField>
      )}
      <Tooltip title="Save">
        <IconButton size="small" type="submit" aria-label="Save amount">
          <CheckIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Cancel">
        <IconButton
          size="small"
          type="button"
          aria-label="Cancel editing amount"
          onClick={() => {
            setAmount(centsToDollars(amountCents).toFixed(2));
            setSelectedStartMonth(startMonth);
            setSelectedBillingFrequency(billingFrequency);
            setIsEditing(false);
          }}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
      <Button type="submit" sx={{ display: 'none' }}>
        Save
      </Button>
    </Box>
  );
}
