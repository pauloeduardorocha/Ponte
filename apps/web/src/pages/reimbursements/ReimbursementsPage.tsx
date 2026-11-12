import { t as translate, useLocale } from '../../i18n';
import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { formatDate } from '../../lib/format';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TablePagination,
  Typography,
} from '@mui/material';
import { Link, useSearchParams } from 'react-router-dom';
import type { Page } from '@church/shared';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
import { RecordRow, RecordTable } from '../../components/RecordTable';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { type Reimbursement, statuses, money } from './api';
import { ReimbursementForm } from './ReimbursementForm';
import { ReimbursementDocuments } from './ReimbursementDocuments';

export function ReimbursementRequestPage() {
  useLocale();
  const [receipt, setReceipt] = useState<string>();
  const { status } = useAuth();
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography variant="h4">
          {translate('Pedir reembolso · A Ponte')}
        </Typography>
        {status === 'loading' ? (
          <Typography>{translate('A carregar…')}</Typography>
        ) : receipt ? (
          <>
            <Alert severity="success">
              {translate(
                'Pedido guardado. A tesouraria irá verificar os documentos. Referência: ',
              )}
              {receipt}
            </Alert>
            <Button onClick={() => setReceipt(undefined)}>
              {translate('Enviar outro pedido')}
            </Button>
            {status === 'authenticated' && (
              <Button component={Link} to="/reimbursements">
                {translate('Ver os meus pedidos')}
              </Button>
            )}
          </>
        ) : (
          <>
            <ReimbursementForm onSaved={(result) => setReceipt(result.id)} />
          </>
        )}
      </Stack>
    </Container>
  );
}

export function ReimbursementsPage({
  management = false,
}: {
  management?: boolean;
}) {
  useLocale();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { hasPermission, user } = useAuth();
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    params.get('request'),
  );
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Reimbursement | null>(null);
  const canDelete = (row: Reimbursement) =>
    !row.deletedAt &&
    (row.submittedBy === user?.id ||
      (hasPermission('FINANCE_TRANSACTION_READ') &&
        hasPermission('FINANCE_TRANSACTION_UPDATE')));
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/reimbursements/${id}`, { method: 'DELETE' }),
    onSuccess: async (_, id) => {
      setDeleteTarget(null);
      if (selected === id) close();
      setPage(0);
      setNotice(translate('Pedido excluído.'));
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reimbursements'] }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
    },
  });
  function confirmDelete(row: Reimbursement) {
    remove.reset();
    setDeleteTarget(row);
  }
  const debounced = useDebouncedValue(search);
  const canLink = management && hasPermission('FINANCE_RECONCILE');
  const rows = useQuery({
    queryKey: ['reimbursements', management, page, status, debounced],
    queryFn: () =>
      apiRequest<Page<Reimbursement>>(
        management ? '/reimbursements' : '/reimbursements/mine',
        { query: { page: page + 1, pageSize: 20, status, search: debounced } },
      ),
  });
  const detail = useQuery({
    queryKey: ['reimbursements', selected],
    enabled: !!selected,
    queryFn: () => apiRequest<Reimbursement>(`/reimbursements/${selected}`),
  });
  function close() {
    setSelected(null);
    const next = new URLSearchParams(params);
    next.delete('request');
    setParams(next, { replace: true });
  }
  return (
    <Stack spacing={2}>
      <Typography variant={management ? 'h5' : 'h4'}>
        {management
          ? translate('Reembolsos')
          : translate('Os meus pedidos de reembolso')}
      </Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="contained" onClick={() => setCreate(true)}>
          {translate('Novo pedido')}
        </Button>
        {management && (
          <Button
            onClick={() => {
              void navigator.clipboard
                .writeText(`${window.location.origin}/pedir-reembolso`)
                .then(
                  () => setNotice(translate('Link para membros copiado.')),
                  () =>
                    setNotice(
                      translate('Link para membros: {0}/pedir-reembolso', [
                        window.location.origin,
                      ]),
                    ),
                );
            }}
          >
            {translate('Copiar link para membros')}
          </Button>
        )}
      </Stack>
      {notice && (
        <Alert onClose={() => setNotice('')}>{translate(notice ?? '')}</Alert>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
        <TextField
          label={translate('Pesquisar beneficiário ou finalidade')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          select
          label={translate('Estado')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">{translate('Todos')}</MenuItem>
          {Object.entries(statuses).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {rows.isPending && (
        <Typography>{translate('A carregar pedidos…')}</Typography>
      )}
      {rows.error && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void rows.refetch()}>
              {translate('Tentar novamente')}
            </Button>
          }
        >
          {rows.error.message}
        </Alert>
      )}
      {rows.data?.items.length === 0 && (
        <Alert severity="info">{translate('Nenhum pedido encontrado.')}</Alert>
      )}
      <RecordTable
        label={translate('Pedidos de reembolso')}
        primaryLabel={translate('Beneficiário')}
        summaryLabel={translate('Valor / estado')}
        detailsLabel={translate('Finalidade')}
      >
        {rows.data?.items.map((row) => (
          <RecordRow
            key={row.id}
            primary={
              row.beneficiaryName || translate('Beneficiário por preencher')
            }
            summary={
              <Stack spacing={1}>
                <Typography>{money(row.amount, row.currency)}</Typography>
                <Chip size="small" label={statuses[row.status]} />
              </Stack>
            }
            actions={
              <>
                <Button onClick={() => setSelected(row.id)}>
                  {translate('Abrir pedido')}
                </Button>
                {canDelete(row) && (
                  <Button color="error" onClick={() => confirmDelete(row)}>
                    {translate('Excluir pedido')}
                  </Button>
                )}
              </>
            }
          >
            <Typography>
              {row.purpose || translate('Finalidade por preencher')}
            </Typography>
            <Typography variant="caption">
              {translate('Recebido em ')}
              {formatDate(row.createdAt)} · {row.attachments.length}{' '}
              {translate('documento(s)')}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
      <TablePagination
        component="div"
        count={rows.data?.total ?? 0}
        page={page}
        rowsPerPage={20}
        rowsPerPageOptions={[20]}
        onPageChange={(_, value) => setPage(value)}
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
      />
      <Dialog
        open={create}
        onClose={() => setCreate(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="new-reimbursement"
      >
        <DialogTitle id="new-reimbursement">
          {translate('Novo pedido de reembolso')}
        </DialogTitle>
        <DialogContent>
          <ReimbursementForm
            onSaved={(result) => {
              setCreate(false);
              setSelected(result.id);
              setNotice(
                result.possibleDuplicate
                  ? translate(
                      'Pedido guardado. Atenção: um dos documentos já aparece noutro pedido; verifique possíveis duplicados.',
                    )
                  : translate('Pedido guardado.'),
              );
              void client.invalidateQueries({ queryKey: ['reimbursements'] });
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onClose={close}
        fullWidth
        maxWidth="md"
        aria-labelledby="reimbursement-detail"
      >
        <DialogTitle id="reimbursement-detail">
          {translate('Pedido de reembolso')}
          <Button onClick={close} sx={{ float: 'right' }}>
            {translate('Fechar')}
          </Button>
        </DialogTitle>
        <DialogContent>
          {detail.isPending && (
            <Typography>{translate('A carregar…')}</Typography>
          )}
          {detail.error && (
            <Alert severity="error">{detail.error.message}</Alert>
          )}
          {detail.data && (
            <ReimbursementDetail
              key={detail.data.id}
              row={detail.data}
              management={management}
              canLink={canLink}
              onDelete={
                canDelete(detail.data)
                  ? () => confirmDelete(detail.data!)
                  : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="delete-reimbursement-title"
      >
        <DialogTitle id="delete-reimbursement-title">
          {translate('Excluir pedido de reembolso?')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              {deleteTarget?.beneficiaryName ||
                translate('Beneficiário por preencher')}{' '}
              · {money(deleteTarget?.amount ?? null)}
            </Typography>
            <Typography>
              {translate(
                'O pedido deixará de aparecer nas listas. Pagamentos já efetuados não serão anulados, e documentos associados a movimentos bancários serão preservados.',
              )}
            </Typography>
            {remove.error && (
              <Alert severity="error">{remove.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={remove.isPending}
            onClick={() => setDeleteTarget(null)}
          >
            {translate('Cancelar')}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={() => {
              if (deleteTarget) remove.mutate(deleteTarget.id);
            }}
          >
            {remove.isPending
              ? translate('A excluir…')
              : translate('Confirmar exclusão')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function ReimbursementDetail({
  row,
  management,
  canLink,
  onDelete,
}: {
  row: Reimbursement;
  management: boolean;
  canLink: boolean;
  onDelete?: () => void;
}) {
  useLocale();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [paidAt, setPaidAt] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const suggestions = useQuery({
    queryKey: ['reimbursements', row.id, 'suggestions'],
    enabled: canLink && row.status === 'PAID' && !row.deletedAt,
    queryFn: () =>
      apiRequest<
        {
          id: string;
          date: string;
          amount: string;
          description: string;
          reference: string;
        }[]
      >(`/reimbursements/${row.id}/suggestions`),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: 'POST' | 'DELETE';
    }) => apiRequest(`/reimbursements/${row.id}/${path}`, { method, body }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reimbursements'] }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
    },
  });
  if (row.deletedAt)
    return (
      <Stack spacing={2}>
        <Alert severity="info">
          {translate(
            'Este pedido foi excluído. Os documentos foram preservados para consulta.',
          )}
        </Alert>
        <Typography>
          {row.beneficiaryName} · {money(row.amount, row.currency)}
        </Typography>
        <ReimbursementDocuments row={row} />
      </Stack>
    );
  if (editing)
    return (
      <Stack spacing={2}>
        <ReimbursementForm
          initial={row}
          onSaved={() => {
            setEditing(false);
            void client.invalidateQueries({ queryKey: ['reimbursements'] });
          }}
        />
        <Button onClick={() => setEditing(false)}>{translate('Voltar')}</Button>
      </Stack>
    );
  return (
    <Stack spacing={2}>
      <Chip label={statuses[row.status]} sx={{ alignSelf: 'flex-start' }} />
      <Typography variant="h6">
        {row.beneficiaryName || translate('Beneficiário por preencher')} ·{' '}
        {money(row.amount, row.currency)}
      </Typography>
      <Typography>
        {translate('Categoria: ')}
        {row.category?.name || translate('Por preencher')}
      </Typography>
      <Typography>IBAN: {row.iban || translate('Por preencher')}</Typography>
      <Typography>
        {row.purpose || translate('Finalidade por preencher')}
      </Typography>
      {!row.paidAt && (
        <Button onClick={() => setEditing(true)}>
          {translate('Completar / editar dados')}
        </Button>
      )}
      <ReimbursementDocuments
        row={row}
        manager={management}
        canWrite={management || !row.paidAt}
      />
      {management && row.status === 'READY' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
          <TextField
            type="date"
            label={translate('Data da transferência bancária')}
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button
            disabled={action.isPending || !paidAt}
            onClick={() => action.mutate({ path: 'payment', body: { paidAt } })}
          >
            {translate('Registar como pago')}
          </Button>
        </Stack>
      )}
      {row.paidAt && (
        <Typography>
          {translate('Pago em ')}
          {formatDate(row.paidAt)}
        </Typography>
      )}
      {management && row.status === 'PAID' && (
        <Button
          disabled={action.isPending}
          onClick={() => action.mutate({ path: 'payment', method: 'DELETE' })}
        >
          {translate('Corrigir registo de pagamento')}
        </Button>
      )}
      {canLink && row.status === 'PAID' && (
        <>
          <Typography variant="h6">
            {translate('Associar movimento bancário')}
          </Typography>
          <Typography variant="body2">
            {translate(
              'Saídas em EUR com o mesmo valor, entre 7 dias antes e 30 dias depois do pagamento. Confirme o destinatário antes de associar.',
            )}
          </Typography>
          {suggestions.isPending && (
            <Typography>{translate('A procurar movimentos…')}</Typography>
          )}
          {suggestions.error && (
            <Alert severity="error">{suggestions.error.message}</Alert>
          )}
          {suggestions.data?.length === 0 && (
            <Alert severity="info">
              {translate(
                'Nenhum movimento compatível encontrado. Importe o extrato bancário e volte a este pedido.',
              )}
            </Alert>
          )}
          {suggestions.data?.map((item) => (
            <Stack
              key={item.id}
              direction={{ xs: 'column', sm: 'row' }}
              gap={1}
              alignItems="center"
            >
              <Typography sx={{ flex: 1 }}>
                {formatDate(item.date)} · {money(item.amount)} ·{' '}
                {item.description || item.reference}
              </Typography>
              <Button
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    path: 'link',
                    body: { transactionId: item.id },
                  })
                }
              >
                {translate('Confirmar associação')}
              </Button>
            </Stack>
          ))}
        </>
      )}
      {row.bankTransactionId && (
        <Stack direction="row" gap={1}>
          <Button
            component={Link}
            to={`/finance/banking?transactionId=${row.bankTransactionId}`}
          >
            {translate('Ver movimento bancário')}
          </Button>
          {canLink && (
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate({ path: 'link', method: 'DELETE' })}
            >
              {translate('Desfazer associação')}
            </Button>
          )}
        </Stack>
      )}
      {action.error && <Alert severity="error">{action.error.message}</Alert>}
      {onDelete && (
        <Button color="error" onClick={onDelete}>
          {translate('Excluir pedido')}
        </Button>
      )}
    </Stack>
  );
}
