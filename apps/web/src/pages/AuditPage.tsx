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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
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
        Você não tem permissão para consultar a auditoria.
      </Alert>
    );
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Auditoria</Typography>
        <Typography color="text.secondary">
          Histórico de operações, acessos e alterações. Os registros são
          preservados e não podem ser editados.
        </Typography>
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label="Ação exata"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          label="Entidade"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          label="Desde (UTC)"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          label="Até (UTC)"
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
          Não foi possível carregar os registros de auditoria.
        </Alert>
      )}
      <Card sx={{ overflowX: 'auto' }}>
        <Table aria-label="Registros de auditoria">
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Usuário</TableCell>
              <TableCell>Ação</TableCell>
              <TableCell>Entidade</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>Detalhes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.data?.items.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  {new Date(log.createdAt).toLocaleString('pt-PT')}
                </TableCell>
                <TableCell>{log.userId ?? 'Sistema'}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entity}</TableCell>
                <TableCell>{log.ip ?? '—'}</TableCell>
                <TableCell>
                  <Button onClick={() => setSelected(log)}>
                    Ver alteração
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!logs.isLoading && logs.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>Nenhum registro encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
        <DialogTitle>Detalhes da operação</DialogTitle>
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
