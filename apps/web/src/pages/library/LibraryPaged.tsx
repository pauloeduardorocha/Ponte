import { t as translate, useLocale } from '../../i18n';
import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { type ReactNode } from 'react';
import { Alert, Button, MenuItem, Stack, Typography } from '@mui/material';
export function Paged({
  total,
  page,
  setPage,
  pageSize,
  setPageSize,
  children,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  children: ReactNode;
}) {
  useLocale();
  return (
    <Stack spacing={2}>
      {children}
      {!total && (
        <Alert severity="info">
          {translate('Nenhum registro encontrado.')}
        </Alert>
      )}
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          select
          label={translate('Registos por página')}
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          sx={{ minWidth: 110 }}
        >
          {[10, 20, 50, 100].map((size) => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </TextField>
        <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {translate('Anterior')}
        </Button>
        <Typography>
          {translate('Página ')}
          {page} · {total} {translate(' registros')}
        </Typography>
        <Button
          disabled={page * pageSize >= total}
          onClick={() => setPage(page + 1)}
        >
          {translate('Próxima')}
        </Button>
      </Stack>
    </Stack>
  );
}
