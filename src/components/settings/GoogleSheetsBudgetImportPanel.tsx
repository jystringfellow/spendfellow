'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import type { BudgetImportMode } from '@/lib/budgetImportLines';
import { getImportRestorationMonths } from '@/lib/importPeriods';

interface PreviewSheet {
  name: string;
  month: number | null;
  importable: boolean;
  lineCount: number;
  commentedLineCount: number;
  categories: string[];
  categoryBudgets: Array<{
    categoryName: string;
    groupName: string;
    amountCents: number;
  }>;
  insertLineCount: number;
  updateLineCount: number;
  deleteLineCount: number;
  sampleLines: Array<{
    cell: string;
    categoryName: string;
    amountCents: number;
    comment: string | null;
  }>;
}

interface PreviewResponse {
  fileName: string;
  source: string;
  importMode: BudgetImportMode;
  suggestedSource: string | null;
  existingCategoryCount: number;
  sheets: PreviewSheet[];
}

function getDefaultYear(): number {
  return new Date().getFullYear();
}

function getDefaultSource(fileName: string): string {
  return fileName.replace(/\.xlsx$/i, '').trim() || 'google_sheets_budget_import';
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function GoogleSheetsBudgetImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(String(getDefaultYear()));
  const [source, setSource] = useState('');
  const [importMode, setImportMode] = useState<BudgetImportMode>('replace');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const importableSheets = useMemo(() => preview?.sheets.filter((sheet) => sheet.importable) ?? [], [preview]);
  const selectedPreviewSheets = useMemo(
    () => preview?.sheets.filter((sheet) => selectedSheets.includes(sheet.name)) ?? [],
    [preview, selectedSheets]
  );
  const selectedInsertCount = selectedPreviewSheets.reduce((total, sheet) => total + sheet.insertLineCount, 0);
  const selectedUpdateCount = selectedPreviewSheets.reduce((total, sheet) => total + sheet.updateLineCount, 0);
  const selectedDeleteCount = selectedPreviewSheets.reduce((total, sheet) => total + sheet.deleteLineCount, 0);
  const selectedBudgetCount = selectedPreviewSheets.reduce((total, sheet) => total + sheet.categoryBudgets.length, 0);
  const restorationMonths = useMemo(
    () =>
      getImportRestorationMonths(
        selectedPreviewSheets.flatMap((sheet) =>
          sheet.month ? [{ year: Number(year), month: sheet.month }] : []
        )
      ),
    [selectedPreviewSheets, year]
  );
  const selectedLayoutSnapshotCount = preview
    ? (selectedPreviewSheets.length + restorationMonths.length) * preview.existingCategoryCount
    : 0;

  function invalidatePreview() {
    setPreview(null);
    setSelectedSheets([]);
    setReviewOpen(false);
    setMessage(null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    invalidatePreview();
    setError(null);
    if (nextFile) {
      setSource(getDefaultSource(nextFile.name));
    }
  }

  function toggleSheet(sheetName: string) {
    setSelectedSheets((current) =>
      current.includes(sheetName) ? current.filter((name) => name !== sheetName) : [...current, sheetName]
    );
  }

  async function previewWorkbook() {
    if (!file) {
      setError('Choose an .xlsx file.');
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('year', year);
    formData.append('source', source);
    formData.append('importMode', importMode);

    const response = await fetch('/api/imports/google-sheets-budget/preview', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    setIsPreviewing(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to preview workbook.');
      return;
    }

    const nextPreview = data as PreviewResponse;
    setPreview(nextPreview);
    setSelectedSheets(nextPreview.sheets.filter((sheet) => sheet.importable).map((sheet) => sheet.name));
  }

  async function importWorkbook() {
    if (!file) {
      setError('Choose an .xlsx file.');
      return;
    }

    if (selectedSheets.length === 0) {
      setError('Select at least one sheet.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('year', year);
    formData.append('source', source);
    formData.append('importMode', importMode);
    formData.append('selectedSheets', JSON.stringify(selectedSheets));

    const response = await fetch('/api/imports/google-sheets-budget/import', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    setIsImporting(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to import workbook.');
      if (typeof data.suggestedSource === 'string') {
        setSource(data.suggestedSource);
        invalidatePreview();
      }
      return;
    }

    setReviewOpen(false);
    setPreview(null);
    setSelectedSheets([]);
    setMessage(
      `${data.importMode === 'replace' ? 'Replaced' : 'Merged'} ${data.selectedSheets.join(', ')}: ` +
      `${data.insertedCount} added, ${data.updatedCount} updated, ${data.deletedCount} removed.`
    );
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>
          Google Sheets Budget History
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Import selected workbook tabs into budget history.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {message ? <Alert severity="success">{message}</Alert> : null}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Button component="label" variant="outlined" startIcon={<FileUploadIcon />}>
          Choose XLSX
          <input hidden type="file" accept=".xlsx" onChange={onFileChange} />
        </Button>
        <TextField
          label="Year"
          type="number"
          size="small"
          value={year}
          onChange={(event) => {
            setYear(event.target.value);
            invalidatePreview();
          }}
          sx={{ width: { xs: '100%', sm: 120 } }}
          inputProps={{ min: 2000, max: 2100 }}
        />
        <TextField
          label="Source"
          size="small"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            invalidatePreview();
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Button
          variant="contained"
          onClick={previewWorkbook}
          disabled={!file || isPreviewing || isImporting}
          startIcon={isPreviewing ? <CircularProgress size={16} color="inherit" /> : <PlaylistAddCheckIcon />}
        >
          Preview
        </Button>
      </Stack>

      {file ? (
        <Typography variant="body2" color="text.secondary">
          {file.name}
        </Typography>
      ) : null}

      <Box>
        <Typography variant="body2" fontWeight={700}>
          Import mode
        </Typography>
        <RadioGroup
          row
          value={importMode}
          onChange={(event) => {
            setImportMode(event.target.value as BudgetImportMode);
            invalidatePreview();
          }}
        >
          <FormControlLabel value="replace" control={<Radio size="small" />} label="Replace selected months" />
          <FormControlLabel value="merge" control={<Radio size="small" />} label="Merge" />
        </RadioGroup>
        <Typography variant="caption" color="text.secondary">
          {importMode === 'replace'
            ? 'Selected workbook months are authoritative. Imported lines missing from the workbook will be removed.'
            : 'Adds and updates matching imported lines without removing lines missing from the workbook.'}
        </Typography>
      </Box>

      {preview ? (
        <Stack spacing={1.25}>
          {preview.suggestedSource ? (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setSource(preview.suggestedSource ?? source);
                    invalidatePreview();
                  }}
                >
                  Use existing source
                </Button>
              }
            >
              Source “{preview.source}” looks like another download of existing source “{preview.suggestedSource}”.
              Using it would create duplicate budget lines. Switch to the existing source and preview again.
            </Alert>
          ) : null}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${importableSheets.length} importable sheets`} />
            <Chip size="small" label={`${importableSheets.reduce((total, sheet) => total + sheet.lineCount, 0)} lines`} />
          </Stack>

          <Stack spacing={1}>
            {preview.sheets.map((sheet) => (
              <Box
                key={sheet.name}
                sx={{
                  border: '1px solid',
                  borderColor: selectedSheets.includes(sheet.name) ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  p: 1.25,
                  opacity: sheet.importable ? 1 : 0.55,
                }}
              >
                <Stack spacing={0.5}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedSheets.includes(sheet.name)}
                        onChange={() => toggleSheet(sheet.name)}
                        disabled={!sheet.importable || isImporting}
                      />
                    }
                    label={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={700}>{sheet.name}</Typography>
                        <Chip size="small" label={`${sheet.lineCount} lines`} />
                        <Chip size="small" color="success" variant="outlined" label={`${sheet.insertLineCount} new`} />
                        <Chip size="small" color="info" variant="outlined" label={`${sheet.updateLineCount} updates`} />
                        {sheet.deleteLineCount > 0 ? (
                          <Chip size="small" color="warning" variant="outlined" label={`${sheet.deleteLineCount} removals`} />
                        ) : null}
                        <Chip size="small" label={`${sheet.commentedLineCount} notes`} />
                      </Stack>
                    }
                  />
                  {sheet.categoryBudgets.length > 0 ? (
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                        gap: 0.5,
                        pl: { xs: 0, sm: 4 },
                      }}
                    >
                      {sheet.categoryBudgets.map((category) => (
                        <Stack
                          key={`${category.groupName}:${category.categoryName}`}
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                          sx={{ px: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: 0.5 }}
                        >
                          <Typography variant="caption" noWrap>
                            {category.groupName} · {category.categoryName}
                          </Typography>
                          <Typography variant="caption" fontWeight={700}>
                            {formatCurrency(category.amountCents)}
                          </Typography>
                        </Stack>
                      ))}
                    </Box>
                  ) : null}
                  {sheet.sampleLines.length > 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {sheet.sampleLines
                        .slice(0, 3)
                        .map(
                          (line) =>
                            `${line.cell} ${line.categoryName} ${formatCurrency(line.amountCents)}${
                              line.comment ? `: ${line.comment}` : ''
                            }`
                        )
                        .join(' | ')}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>
            ))}
          </Stack>

          <Button
            variant="contained"
            color="primary"
            onClick={() => setReviewOpen(true)}
            disabled={
              selectedSheets.length === 0 ||
              isImporting ||
              isPreviewing ||
              Boolean(preview.suggestedSource)
            }
            startIcon={<PlaylistAddCheckIcon />}
            sx={{ alignSelf: 'flex-start' }}
          >
            Review Selected Changes
          </Button>
        </Stack>
      ) : null}

      <Dialog open={reviewOpen} onClose={() => !isImporting && setReviewOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Confirm budget import</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              Nothing has been written yet. Confirm the source, sheets, category budgets, and line changes below.
            </Alert>
            <Stack spacing={0.5}>
              <Typography><strong>Source:</strong> {source}</Typography>
              <Typography><strong>Year:</strong> {year}</Typography>
              <Typography><strong>Sheets:</strong> {selectedSheets.join(', ')}</Typography>
              <Typography><strong>Mode:</strong> {importMode === 'replace' ? 'Replace selected months' : 'Merge'}</Typography>
            </Stack>
            <Divider />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`${selectedInsertCount} new budget lines`} color="success" variant="outlined" />
              <Chip label={`${selectedUpdateCount} updated budget lines`} color="info" variant="outlined" />
              {selectedDeleteCount > 0 ? (
                <Chip label={`${selectedDeleteCount} removed budget lines`} color="warning" variant="outlined" />
              ) : null}
              <Chip label={`${selectedBudgetCount} category-budget snapshots`} variant="outlined" />
              <Chip label={`${selectedLayoutSnapshotCount} existing-category layout rows`} variant="outlined" />
            </Stack>
            {importMode === 'replace' && selectedDeleteCount > 0 ? (
              <Alert severity="warning">
                Replace will remove {selectedDeleteCount} previously imported budget lines that are absent from the selected workbook months. Other months are untouched.
              </Alert>
            ) : null}
            {restorationMonths.length > 0 ? (
              <Alert severity="info">
                To keep later budget columns stable, the import will restore a complete prior-layout snapshot in{' '}
                {restorationMonths
                  .map((period) =>
                    new Date(period.year, period.month - 1, 1).toLocaleString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })
                  )
                  .join(', ')}.
              </Alert>
            ) : null}
            <Stack spacing={1}>
              {selectedPreviewSheets.map((sheet) => (
                <Box key={sheet.name} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                  <Typography fontWeight={700}>{sheet.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {sheet.insertLineCount} new lines, {sheet.updateLineCount} updates, {sheet.deleteLineCount} removals, {sheet.categoryBudgets.length} category budgets
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)} disabled={isImporting}>Back</Button>
          <Button
            variant="contained"
            onClick={() => void importWorkbook()}
            disabled={isImporting}
            startIcon={isImporting ? <CircularProgress size={16} color="inherit" /> : <FileUploadIcon />}
          >
            {isImporting ? 'Importing…' : 'Confirm Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
