import { t as translate, useLocale } from '../i18n';
import { LocalizedTextField as TextField } from '../components/LocalizedTextField';
import { formatDateTime } from '../lib/format';
import { SortableTable } from '../components/SortableTable';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { AUDIT_PERMISSIONS } from '../lib/audit-permissions';
interface AuditRecord {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}
export function AuditPage() {
  useLocale();
  const { hasPermission } = useAuth();
  const allowed = AUDIT_PERMISSIONS.every(hasPermission);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const logs = useQuery({
    queryKey: ['audit', page, action, entity, start, end],
    queryFn: () =>
      apiRequest<{ items: AuditRecord[]; total: number }>('/audit', {
        query: {
          page: page + 1,
          pageSize: 25,
          action,
          entity,
          start: start ? start + 'T00:00:00.000Z' : undefined,
          end: end ? end + 'T23:59:59.999Z' : undefined,
        },
      }),
    enabled: allowed,
  });
  if (!allowed)
    return (
      <Alert severity="warning">
        {translate('Você não tem permissão para consultar a auditoria.')}
      </Alert>
    );
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">{translate('Auditoria')}</Typography>
        <Typography color="text.secondary">
          {translate(
            'Histórico de operações, acessos e alterações. Os registros são preservados e não podem ser editados.',
          )}
        </Typography>
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label={translate('Ação exata')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          label={translate('Entidade')}
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          label={translate('Desde (UTC)')}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          label={translate('Até (UTC)')}
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            setPage(0);
          }}
        />
      </Stack>
      {logs.isError && (
        <Alert severity="error">
          {translate('Não foi possível carregar os registros de auditoria.')}
        </Alert>
      )}
      <Card sx={{ overflowX: 'auto' }}>
        <SortableTable
          nonSortableColumns={[5]}
          aria-label={translate('Registros de auditoria')}
        >
          <TableHead>
            <TableRow>
              <TableCell>{translate('Data')}</TableCell>
              <TableCell>{translate('Usuário')}</TableCell>
              <TableCell>{translate('Ação')}</TableCell>
              <TableCell>{translate('Entidade')}</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>{translate('Detalhes')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.data?.items.map((log) => (
              <TableRow key={log.id}>
                <TableCell data-sort-value={log.createdAt}>
                  {formatDateTime(log.createdAt)}
                </TableCell>
                <TableCell>{log.userId ?? translate('Sistema')}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entity}</TableCell>
                <TableCell>{log.ip ?? '—'}</TableCell>
                <TableCell>
                  <Button onClick={() => setSelected(log)}>
                    {translate('Ver alteração')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!logs.isLoading && logs.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  {translate('Nenhum registro encontrado.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </SortableTable>
        <TablePagination
          component="div"
          count={logs.data?.total ?? 0}
          page={page}
          rowsPerPage={25}
          rowsPerPageOptions={[25]}
          onPageChange={(_, next) => setPage(next)}
        />
      </Card>
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{translate('Detalhes da operação')}</DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {JSON.stringify(selected, null, 2)}
          </Box>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
