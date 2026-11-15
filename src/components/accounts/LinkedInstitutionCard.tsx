'use client';

import { createContext, ReactNode, useContext, useId, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface CollapseContextValue {
  expandSignal: number;
  collapseSignal: number;
}

const CollapseContext = createContext<CollapseContextValue | null>(null);

export function LinkedInstitutionCollapseProvider({ children }: { children: ReactNode }) {
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const value = useMemo(() => ({ expandSignal, collapseSignal }), [expandSignal, collapseSignal]);

  return (
    <CollapseContext.Provider value={value}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" variant="text" onClick={() => setExpandSignal((signal) => signal + 1)}>
            Expand all
          </Button>
          <Button size="small" variant="text" onClick={() => setCollapseSignal((signal) => signal + 1)}>
            Collapse all
          </Button>
        </Stack>
        {children}
      </Stack>
    </CollapseContext.Provider>
  );
}

interface LinkedInstitutionCardProps {
  orderId?: string;
  title: string;
  info: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  summary?: string;
  status?: string;
  lastSynced?: string;
}

export function LinkedInstitutionCard({
  title,
  info,
  actions,
  children,
  defaultOpen = true,
  summary,
  status,
  lastSynced,
}: LinkedInstitutionCardProps) {
  const contentId = useId();
  const collapseContext = useContext(CollapseContext);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (collapseContext?.expandSignal) {
      setIsOpen(true);
    }
  }, [collapseContext?.expandSignal]);

  useEffect(() => {
    if (collapseContext?.collapseSignal) {
      setIsOpen(false);
    }
  }, [collapseContext?.collapseSignal]);

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
            <IconButton
              size="small"
              aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
              aria-expanded={isOpen}
              aria-controls={contentId}
              onClick={() => setIsOpen((open) => !open)}
            >
              {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
            <Box sx={{ minWidth: 0 }}>
              <Button color="inherit" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-controls={contentId}
                sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left' }}>
                <Typography variant="h6" component="span">{title}</Typography>
              </Button>
              {summary ? <Typography variant="body2" color="text.secondary">{summary}</Typography> : null}
              {lastSynced ? <Typography variant="caption" color="text.secondary">Last synced: {lastSynced}</Typography> : null}
            </Box>
            {status ? <Chip size="small" variant="outlined" color={status === 'Connected' ? 'success' : status === 'Needs attention' ? 'warning' : 'default'} label={status} /> : null}
            <Tooltip title={info}>
              <IconButton size="small" aria-label={`${title} sync details`}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          {actions ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              {actions}
            </Stack>
          ) : null}
        </Stack>
      </Box>
      <Collapse id={contentId} in={isOpen} timeout="auto" unmountOnExit>
        <Divider />
        {children}
      </Collapse>
    </Paper>
  );
}

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ title, description, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            size="small"
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Box>
            <Button color="inherit" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-controls={contentId}
              sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start' }}>
              <Typography variant="h6" component="span">{title}</Typography>
            </Button>
            {description ? (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Box>
      <Collapse id={contentId} in={isOpen} timeout="auto" unmountOnExit>
        <Divider />
        {children}
      </Collapse>
    </Paper>
  );
}
