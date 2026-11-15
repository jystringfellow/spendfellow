'use client';

import { useMemo } from 'react';
import { styled, alpha } from '@mui/material/styles';
import { createComboboxController } from '@ui-sdk/core/combobox';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxLabel,
  ComboboxTrigger,
} from '@ui-sdk/react/combobox';

interface CategoryPickerProps {
  categories: { id: string; name: string }[];
  value: string;
  onChange: (categoryId: string) => void;
  label: string;
  emptyLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

const Picker = styled('div')(({ theme }) => ({
  width: '100%',
  minWidth: 0,
  fontSize: theme.typography.pxToRem(14),
  color: theme.palette.text.primary,
  '& .category-picker-label': { position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  '& .category-picker-field': {
    display: 'flex',
    alignItems: 'center',
    minHeight: 40,
    border: `1px solid ${theme.palette.text.secondary}`,
    borderRadius: 12,
    '&:focus-within': {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
    },
    '&:has(input:disabled)': { opacity: 0.5 },
  },
  '& [data-slot="combobox-input"]': {
    width: '100%', minWidth: 0, padding: '9px 12px',
    border: 0, outline: 'none', background: 'transparent',
    color: 'inherit', font: 'inherit',
    '&::placeholder': { color: theme.palette.text.secondary, opacity: 1 },
  },
  '& [data-slot="combobox-trigger"]': {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, width: 36, height: 38, border: 0, borderRadius: 10,
    background: 'transparent', color: theme.palette.text.secondary, cursor: 'pointer',
    '&:disabled': { cursor: 'default' },
  },
  '& [data-slot="combobox-content"]': {
    margin: 0, padding: 4,
    width: 'var(--anchor-width)',
    minWidth: 'min(240px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'min(320px, var(--available-height))',
    overflowY: 'auto', overscrollBehavior: 'contain',
    border: `1px solid ${theme.palette.divider}`, borderRadius: 12,
    background: theme.palette.background.paper, color: theme.palette.text.primary,
    boxShadow: theme.shadows[8], font: 'inherit',
  },
  '& [data-slot="combobox-item"]': {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    minHeight: 40, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    overflowWrap: 'anywhere',
    '&[data-highlighted]': { background: alpha(theme.palette.secondary.main, 0.16) },
    '&[data-selected]': { color: theme.palette.mode === 'light' ? theme.palette.primary.dark : theme.palette.primary.main, fontWeight: 650 },
  },
  '& [data-slot="combobox-item-indicator"]': { display: 'flex', color: theme.palette.primary.main },
  '& [data-slot="combobox-empty"]': { padding: '16px 12px', color: theme.palette.text.secondary },
}));

export default function CategoryPicker({
  categories, value, onChange, label, emptyLabel = 'Uncategorized', disabled = false, autoFocus = false,
}: CategoryPickerProps) {
  const controller = useMemo(() => createComboboxController<string>(), []);
  const options = useMemo(() => [
    { value: '', label: emptyLabel },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ], [categories, emptyLabel]);

  return (
    <Picker onKeyDownCapture={(event) => {
      // Escape dismisses the picker before an enclosing Material UI dialog.
      if (event.key === 'Escape' && controller.isOpen()) {
        event.stopPropagation();
        controller.close({ reason: 'escape-key', event: event.nativeEvent });
      }
    }}>
      <Combobox<string>
        value={value}
        controller={controller}
        items={options}
        onValueChange={(nextValue, details) => {
          if (nextValue === null || !options.some((option) => option.value === nextValue)) {
            details.cancel();
            return;
          }
          onChange(nextValue);
        }}
        itemToLabel={(id) => id === '' ? emptyLabel : categories.find((category) => category.id === id)?.name ?? id}
        disabled={disabled}
        autoHighlight
      >
        <ComboboxLabel className="category-picker-label">{label}</ComboboxLabel>
        <div className="category-picker-field">
          <ComboboxInput autoFocus={autoFocus} aria-label={label} placeholder="Search categories…" />
          <ComboboxTrigger aria-label={`Show options for ${label}`}>
            <ExpandMoreIcon fontSize="small" aria-hidden="true" />
          </ComboboxTrigger>
        </div>
        <ComboboxContent sideOffset={6} align="start" collisionPadding={16}>
          <ComboboxEmpty>No matching categories.</ComboboxEmpty>
          <ComboboxList>
            {(state) => (state.items as { value: string; label: string }[]).map((option) => (
              <ComboboxItem key={option.value} value={option.value} label={option.label}>
                <span>{option.label}</span>
                <ComboboxItemIndicator><CheckIcon fontSize="small" aria-hidden="true" /></ComboboxItemIndicator>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Picker>
  );
}
