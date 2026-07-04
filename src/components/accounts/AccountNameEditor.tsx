'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';

interface AccountNameEditorProps {
  accountId: string;
  name: string;
  officialName: string | null;
}

export default function AccountNameEditor({ accountId, name, officialName }: AccountNameEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName() {
    const normalizedName = draftName.replace(/\s+/g, ' ').trim();
    if (!normalizedName) {
      setError('Enter an account name.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalizedName }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    setIsSaving(false);

    if (!response.ok) {
      setError(data.error ?? 'Unable to rename account.');
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  if (isEditing) {
    return (
      <Stack spacing={1}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <TextField
            size="small"
            label="Account name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveName();
              }
              if (event.key === 'Escape') {
                setDraftName(name);
                setError(null);
                setIsEditing(false);
              }
            }}
            inputProps={{ maxLength: 120 }}
            disabled={isSaving}
          />
          <Tooltip title="Save name">
            <span>
              <IconButton size="small" color="primary" onClick={() => void saveName()} disabled={isSaving}>
                <CheckIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Cancel">
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setDraftName(name);
                  setError(null);
                  setIsEditing(false);
                }}
                disabled={isSaving}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        {officialName ? (
          <Typography variant="body2" color="text.secondary">
            {officialName}
          </Typography>
        ) : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    );
  }

  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={600}>{name}</Typography>
        </Box>
        <Tooltip title="Rename account">
          <IconButton
            size="small"
            onClick={() => {
              setDraftName(name);
              setError(null);
              setIsEditing(true);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {officialName ? (
        <Typography variant="body2" color="text.secondary">
          {officialName}
        </Typography>
      ) : null}
    </Stack>
  );
}
