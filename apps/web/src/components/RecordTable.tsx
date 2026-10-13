import type { ReactNode } from 'react';
import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';

export function RecordTable({
  children,
  label = 'Registos',
  primaryLabel = 'Registo',
  detailsLabel = 'Detalhes',
  summaryLabel,
  hasActions = true,
}: {
  children: ReactNode;
  label?: string;
  primaryLabel?: string;
  detailsLabel?: string;
  summaryLabel?: string;
  hasActions?: boolean;
}) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ width: '100%', overflowX: 'auto' }}
    >
      <Table
        size="small"
        aria-label={label}
        sx={{
          minWidth: 640,
          '& thead th': { bgcolor: 'action.hover', fontWeight: 700 },
          '& .MuiTypography-h6': { fontSize: '1rem' },
          '& td, & th': { verticalAlign: 'top' },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>{primaryLabel}</TableCell>
            {summaryLabel && <TableCell>{summaryLabel}</TableCell>}
            <TableCell>{detailsLabel}</TableCell>
            {hasActions && <TableCell align="right">Ações</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}

export function RecordRow({
  primary,
  children,
  actions,
  summary,
  hasActions = true,
}: {
  primary: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
  hasActions?: boolean;
}) {
  return (
    <TableRow hover>
      <TableCell
        component="th"
        scope="row"
        sx={{ width: '25%', overflowWrap: 'anywhere' }}
      >
        {primary}
      </TableCell>
      {summary !== undefined && (
        <TableCell sx={{ minWidth: 160 }}>{summary}</TableCell>
      )}
      <TableCell
        sx={{
          overflowWrap: 'anywhere',
          '& .MuiTypography-h6': { fontSize: '1rem' },
        }}
      >
        <Stack spacing={0.5}>{children ?? '—'}</Stack>
      </TableCell>
      {hasActions && (
        <TableCell align="right" sx={{ width: '25%' }}>
          <Stack
            direction="row"
            useFlexGap
            flexWrap="wrap"
            gap={0.5}
            justifyContent="flex-end"
            sx={{ '& .MuiButton-root': { fontSize: '0.8125rem' } }}
          >
            {actions}
          </Stack>
        </TableCell>
      )}
    </TableRow>
  );
}
