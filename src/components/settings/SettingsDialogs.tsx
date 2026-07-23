'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { centsToDollars } from '@/lib/money';
import { monthOptions } from '@/lib/constantPeriods';
import type { Category, RecurringValue, Tag } from '@/types/database';

type ServerAction = (formData: FormData) => void | Promise<void>;
type CategoryOption = Pick<Category, 'id' | 'name'>;
type GroupOption = Pick<Category, 'id' | 'name' | 'target_percent'>;
type FixedOption = Pick<RecurringValue, 'id' | 'name'>;
type DialogRenderer = (closeDialog: () => void) => ReactNode;

const dialogContentSx = { display: 'grid', gap: 2, pt: '20px !important' };

function closeAfterSubmit(closeDialog: () => void) {
  window.setTimeout(closeDialog, 0);
}

interface DialogButtonProps {
  mode: 'add';
  label: string;
  children: DialogRenderer;
}

function SettingsDialogButton({ mode, label, children }: DialogButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {mode === 'add' ? (
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          {label}
        </Button>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        {children(() => setOpen(false))}
      </Dialog>
    </>
  );
}

interface RowActionsMenuProps {
  label: string;
  editDialog: DialogRenderer;
  deleteDialog?: DialogRenderer;
}

function RowActionsMenu({ label, editDialog, deleteDialog }: RowActionsMenuProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function closeMenu() {
    setMenuAnchor(null);
  }

  return (
    <>
      <IconButton size="small" aria-label={label} onClick={(event) => setMenuAnchor(event.currentTarget)}>
        <MoreVertIcon fontSize="inherit" />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            closeMenu();
            setEditOpen(true);
          }}
        >
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        {deleteDialog ? (
          <MenuItem
            onClick={() => {
              closeMenu();
              setDeleteOpen(true);
            }}
          >
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        ) : null}
      </Menu>
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        {editDialog(() => setEditOpen(false))}
      </Dialog>
      {deleteDialog ? (
        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
          {deleteDialog(() => setDeleteOpen(false))}
        </Dialog>
      ) : null}
    </>
  );
}

interface DeleteConfirmationDialogProps {
  action: ServerAction;
  closeDialog: () => void;
  title: string;
  itemName: string;
  hiddenFields: Record<string, string>;
}

function DeleteConfirmationDialog({ action, closeDialog, title, itemName, hiddenFields }: DeleteConfirmationDialogProps) {
  return (
    <Box component="form" action={action} onSubmit={() => closeAfterSubmit(closeDialog)}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>
          Delete <strong>{itemName}</strong>? This cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Box>
  );
}

interface GroupTargetDialogButtonProps {
  action: ServerAction;
  householdId: string;
  group: GroupOption;
}

export function GroupTargetDialogButton({ action, householdId, group }: GroupTargetDialogButtonProps) {
  const renderForm = (closeDialog: () => void) => (
    <Box component="form" action={action} onSubmit={() => closeAfterSubmit(closeDialog)}>
      <DialogTitle>Edit Group Target</DialogTitle>
      <DialogContent sx={dialogContentSx}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="categoryId" value={group.id} />
        <TextField value={group.name} label="Group" size="small" disabled />
        <TextField
          name="targetPercent"
          label="Target percent of income"
          size="small"
          type="number"
          defaultValue={group.target_percent ?? ''}
          inputProps={{ min: 0, max: 100, step: 0.01 }}
        />
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </DialogActions>
    </Box>
  );

  return <RowActionsMenu label={`Actions for ${group.name}`} editDialog={renderForm} />;
}

interface CategoryDialogButtonProps {
  mode: 'add' | 'edit';
  action: ServerAction;
  deleteAction?: ServerAction;
  householdId: string;
  year: number;
  startMonth: number;
  groups: GroupOption[];
  category?: Pick<
    Category,
    'id' | 'name' | 'parent_category_id' | 'rollover_enabled' | 'rollover_start_date'
  > & { amount_cents: number };
}

export function CategoryDialogButton({
  mode,
  action,
  deleteAction,
  householdId,
  year,
  startMonth,
  groups,
  category,
}: CategoryDialogButtonProps) {
  const renderForm = (closeDialog: () => void) => (
    <Box component="form" action={action} onSubmit={() => closeAfterSubmit(closeDialog)}>
      <DialogTitle>{mode === 'edit' ? 'Edit Category' : 'Add Category'}</DialogTitle>
      <DialogContent sx={dialogContentSx}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="year" value={year} />
        {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
        <TextField name="name" label="Name" size="small" defaultValue={category?.name ?? ''} required />
        <TextField
          select
          name="parentCategoryId"
          label="Group"
          size="small"
          defaultValue={category?.parent_category_id ?? groups[0]?.id ?? ''}
          required
        >
          {groups.map((group) => (
            <MenuItem key={group.id} value={group.id}>
              {group.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          name="amount"
          label="Monthly budget"
          size="small"
          defaultValue={centsToDollars(category?.amount_cents ?? 0).toFixed(2)}
          inputProps={{ inputMode: 'decimal' }}
          required
        />
        <FormControlLabel
          control={
            <Checkbox
              name="rolloverEnabled"
              size="small"
              defaultChecked={category?.rollover_enabled ?? false}
            />
          }
          label="Carry unused balance forward month to month"
        />
        <TextField
          name="rolloverStartDate"
          label="Rollover starts"
          type="date"
          size="small"
          defaultValue={
            category?.rollover_start_date ??
            `${year}-${String(startMonth).padStart(2, '0')}-01`
          }
          InputLabelProps={{ shrink: true }}
        />
        <TextField select name="startMonth" label="Effective from" size="small" defaultValue={startMonth}>
          {monthOptions.map((month) => (
            <MenuItem key={month.value} value={month.value}>
              {month.label}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </DialogActions>
    </Box>
  );

  if (mode === 'edit' && category && deleteAction) {
    return (
      <RowActionsMenu
        label={`Actions for ${category.name}`}
        editDialog={renderForm}
        deleteDialog={(closeDialog) => (
          <DeleteConfirmationDialog
            action={deleteAction}
            closeDialog={closeDialog}
            title="Delete Category"
            itemName={category.name}
            hiddenFields={{ householdId, categoryId: category.id }}
          />
        )}
      />
    );
  }

  return (
    <SettingsDialogButton mode="add" label="Add category">
      {renderForm}
    </SettingsDialogButton>
  );
}

interface RecurringValueDialogButtonProps {
  mode: 'add' | 'edit';
  action: ServerAction;
  deleteAction?: ServerAction;
  householdId: string;
  year: number;
  startMonth: number;
  categories: CategoryOption[];
  value?: Pick<RecurringValue, 'id' | 'name' | 'category_id' | 'billing_frequency'> & {
    effective_bill_amount_cents: number;
  };
}

export function RecurringValueDialogButton({
  mode,
  action,
  deleteAction,
  householdId,
  year,
  startMonth,
  categories,
  value,
}: RecurringValueDialogButtonProps) {
  const renderForm = (closeDialog: () => void) => (
    <Box component="form" action={action} onSubmit={() => closeAfterSubmit(closeDialog)}>
      <DialogTitle>{mode === 'edit' ? 'Edit Recurring Item' : 'Add Recurring Item'}</DialogTitle>
      <DialogContent sx={dialogContentSx}>
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="year" value={year} />
        {value ? <input type="hidden" name="recurringValueId" value={value.id} /> : null}
        <TextField name="name" label="Name" size="small" defaultValue={value?.name ?? ''} required />
        <TextField
          select
          name="categoryId"
          label="Category"
          size="small"
          defaultValue={value?.category_id ?? categories[0]?.id ?? ''}
          required
        >
          {categories.map((category) => (
            <MenuItem key={category.id} value={category.id}>
              {category.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select name="billingFrequency" label="Billing" size="small" defaultValue={value?.billing_frequency ?? 'monthly'}>
          <MenuItem value="monthly">Monthly</MenuItem>
          <MenuItem value="yearly">Yearly</MenuItem>
        </TextField>
        <TextField
          name="amount"
          label="Bill amount"
          size="small"
          defaultValue={centsToDollars(value?.effective_bill_amount_cents ?? 0).toFixed(2)}
          inputProps={{ inputMode: 'decimal' }}
          required
        />
        <TextField select name="startMonth" label="Effective from" size="small" defaultValue={startMonth}>
          {monthOptions.map((month) => (
            <MenuItem key={month.value} value={month.value}>
              {month.label}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </DialogActions>
    </Box>
  );

  if (mode === 'edit' && value && deleteAction) {
    return (
      <RowActionsMenu
        label={`Actions for ${value.name}`}
        editDialog={renderForm}
        deleteDialog={(closeDialog) => (
          <DeleteConfirmationDialog
            action={deleteAction}
            closeDialog={closeDialog}
            title="Delete Recurring Item"
            itemName={value.name}
            hiddenFields={{ householdId, recurringValueId: value.id }}
          />
        )}
      />
    );
  }

  return (
    <SettingsDialogButton mode="add" label="Add recurring">
      {renderForm}
    </SettingsDialogButton>
  );
}

interface FormulaDialogButtonProps {
  mode: 'add' | 'edit';
  action: ServerAction;
  deleteAction?: ServerAction;
  householdId: string;
  categories: CategoryOption[];
  fixedOptions: FixedOption[];
  value?: Pick<RecurringValue, 'id' | 'name' | 'category_id' | 'formula_operator'> & {
    dependencies: FixedOption[];
  };
}

export function FormulaDialogButton({
  mode,
  action,
  deleteAction,
  householdId,
  categories,
  fixedOptions,
  value,
}: FormulaDialogButtonProps) {
  const dependencyIds = new Set(value?.dependencies.map((dependency) => dependency.id) ?? []);
  const renderForm = (closeDialog: () => void) => (
    <Box component="form" action={action} onSubmit={() => closeAfterSubmit(closeDialog)}>
      <DialogTitle>{mode === 'edit' ? 'Edit Formula' : 'Add Formula'}</DialogTitle>
      <DialogContent sx={dialogContentSx}>
        <input type="hidden" name="householdId" value={householdId} />
        {value ? <input type="hidden" name="recurringValueId" value={value.id} /> : null}
        <TextField name="name" label="Name" size="small" defaultValue={value?.name ?? ''} required />
        <TextField
          select
          name="categoryId"
          label="Category"
          size="small"
          defaultValue={value?.category_id ?? categories[0]?.id ?? ''}
          required
        >
          {categories.map((category) => (
            <MenuItem key={category.id} value={category.id}>
              {category.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select name="formulaOperator" label="Operator" size="small" defaultValue={value?.formula_operator ?? 'negative_sum'}>
          <MenuItem value="sum">Sum</MenuItem>
          <MenuItem value="negative_sum">Negative sum</MenuItem>
        </TextField>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
          {fixedOptions.map((option) => (
            <FormControlLabel
              key={option.id}
              control={<Checkbox name="dependencyIds" value={option.id} size="small" defaultChecked={dependencyIds.has(option.id)} />}
              label={option.name}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </DialogActions>
    </Box>
  );

  if (mode === 'edit' && value && deleteAction) {
    return (
      <RowActionsMenu
        label={`Actions for ${value.name}`}
        editDialog={renderForm}
        deleteDialog={(closeDialog) => (
          <DeleteConfirmationDialog
            action={deleteAction}
            closeDialog={closeDialog}
            title="Delete Formula"
            itemName={value.name}
            hiddenFields={{ householdId, recurringValueId: value.id }}
          />
        )}
      />
    );
  }

  return (
    <SettingsDialogButton mode="add" label="Add formula">
      {renderForm}
    </SettingsDialogButton>
  );
}

interface TagDialogButtonProps {
  mode: 'add' | 'edit';
  action: ServerAction;
  deleteAction?: ServerAction;
  householdId: string;
  tag?: Pick<Tag, 'id' | 'name' | 'color'>;
}

function parseRgbToHex(color: string): string | null {
  const match = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);

  if (!match) {
    return null;
  }

  const values = match.slice(1).map((value) => Number(value));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function getPickerColor(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return parseRgbToHex(color) ?? '#9900ff';
}

function TagColorPicker({ color }: { color: string | null | undefined }) {
  const [useColor, setUseColor] = useState(Boolean(color));
  const [selectedColor, setSelectedColor] = useState(color ?? '#9900ff');

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <FormControlLabel
        control={<Checkbox checked={useColor} onChange={(event) => setUseColor(event.target.checked)} size="small" />}
        label="Use font color override"
      />
      {useColor ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '120px 1fr' }, gap: 1.5, alignItems: 'center' }}>
          <TextField
            label="Pick color"
            type="color"
            size="small"
            value={getPickerColor(selectedColor)}
            onChange={(event) => setSelectedColor(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            name="color"
            label="Hex or RGB"
            size="small"
            value={selectedColor}
            onChange={(event) => setSelectedColor(event.target.value)}
            placeholder="#9900ff or rgb(153, 0, 255)"
            inputProps={{
              pattern: '#[0-9a-fA-F]{6}|rgb\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*\\)',
            }}
            helperText="Use #9900ff or rgb(153, 0, 255)."
          />
        </Box>
      ) : null}
    </Box>
  );
}

export function TagDialogButton({ mode, action, deleteAction, householdId, tag }: TagDialogButtonProps) {
  const renderForm = (closeDialog: () => void) => (
    <Box component="form" action={action} onSubmit={() => closeAfterSubmit(closeDialog)}>
      <DialogTitle>{mode === 'edit' ? 'Edit Tag' : 'Add Tag'}</DialogTitle>
      <DialogContent sx={dialogContentSx}>
        <input type="hidden" name="householdId" value={householdId} />
        {tag ? <input type="hidden" name="tagId" value={tag.id} /> : null}
        <TextField name="name" label="Name" size="small" defaultValue={tag?.name ?? ''} required />
        <TagColorPicker color={tag?.color} />
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained">
          Save
        </Button>
      </DialogActions>
    </Box>
  );

  if (mode === 'edit' && tag && deleteAction) {
    return (
      <RowActionsMenu
        label={`Actions for ${tag.name}`}
        editDialog={renderForm}
        deleteDialog={(closeDialog) => (
          <DeleteConfirmationDialog
            action={deleteAction}
            closeDialog={closeDialog}
            title="Delete Tag"
            itemName={tag.name}
            hiddenFields={{ householdId, tagId: tag.id }}
          />
        )}
      />
    );
  }

  return (
    <SettingsDialogButton mode="add" label="Add tag">
      {renderForm}
    </SettingsDialogButton>
  );
}
