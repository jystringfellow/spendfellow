'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';

interface PreviewSheet {
  name: string;
  month: number | null;
  importable: boolean;
  lineCount: number;
  commentedLineCount: number;
  categories: string[];
  sampleLines: Array<{
    cell: string;
    categoryName: string;
    amountCents: number;
    comment: string | null;
  }>;
}

interface PreviewResponse {
  fileName: string;
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
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const importableSheets = useMemo(() => preview?.sheets.filter((sheet) => sheet.importable) ?? [], [preview]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setSelectedSheets([]);
    setMessage(null);
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
    formData.append('selectedSheets', JSON.stringify(selectedSheets));

    const response = await fetch('/api/imports/google-sheets-budget/import', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    setIsImporting(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to import workbook.');
      return;
    }

    setMessage(`Imported ${data.importedCount} budget lines from ${data.selectedSheets.join(', ')}.`);
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
          onChange={(event) => setYear(event.target.value)}
          sx={{ width: { xs: '100%', sm: 120 } }}
          inputProps={{ min: 2000, max: 2100 }}
        />
        <TextField
          label="Source"
          size="small"
          value={source}
          onChange={(event) => setSource(event.target.value)}
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

      {preview ? (
        <Stack spacing={1.25}>
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
                        <Chip size="small" label={`${sheet.commentedLineCount} notes`} />
                      </Stack>
                    }
                  />
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
            onClick={importWorkbook}
            disabled={selectedSheets.length === 0 || isImporting || isPreviewing}
            startIcon={isImporting ? <CircularProgress size={16} color="inherit" /> : <FileUploadIcon />}
            sx={{ alignSelf: 'flex-start' }}
          >
            Import Selected
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
