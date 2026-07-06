'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Collapse,
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
  title: string;
  info: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function LinkedInstitutionCard({
  title,
  info,
  actions,
  children,
  defaultOpen = true,
}: LinkedInstitutionCardProps) {
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
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              size="small"
              aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
              onClick={() => setIsOpen((open) => !open)}
            >
              {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
            <Typography variant="h6">{title}</Typography>
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
      <Collapse in={isOpen} timeout="auto" unmountOnExit>
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

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            size="small"
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Box>
            <Typography variant="h6">{title}</Typography>
            {description ? (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Box>
      <Collapse in={isOpen} timeout="auto" unmountOnExit>
        <Divider />
        {children}
      </Collapse>
    </Paper>
  );
}
