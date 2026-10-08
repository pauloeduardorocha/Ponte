import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Page } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest, getAccessToken } from '../lib/api';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { MovementInvoices, type Invoice } from './BankInvoices';
import { EfaturaFetch } from './EfaturaFetch';
import { LinkBankMovement } from './LinkBankMovement';
type Lookup = { id: string; name: string; kind?: string; currency?: string };
type Import = {
  summary?: { registered: number; ignored: number; pending: number };
  period?: { start: string | null; end: string | null };
  id: string;
  filename: string;
  status: string;
  error?: string | null;
  accountId: string;
  account?: { name: string };
  createdAt?: string;
  _count: { transactions: number };
};
type Ledger = {
  id: string;
  amount: string;
  status: string;
  contribution?: { id: string; type: string } | null;
};
type Movement = {
  invoices?: Invoice[];
  id: string;
  date: string;
  amount: string;
  direction: string;
  description: string;
  reference: string;
  status: string;
  classification?: string | null;
  memberId?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  supplierId?: string | null;
  contributionType?: string | null;
  duplicateReason?: string | null;
  rowNumber: number;
  import: {
    accountId?: string;
    id: string;
    filename: string;
    status: string;
    account: { currency: string };
  };
  reconciliations: {
    id: string;
    active: boolean;
    income: Ledger | null;
    expense: Ledger | null;
    reconciledBy: string;
    undoneBy?: string | null;
    undoReason?: string | null;
  }[];
};
const statusNames: Record<string, string> = {
  UPLOADED: 'Enviado',
  PROCESSING: 'Processando',
  READY_FOR_REVIEW: 'Pronto para revisão',
  CONFIRMED: 'Importado',
  FAILED: 'Falhou',
  PENDING_REVIEW: 'Pendente de revisão',
  CLASSIFIED: 'Classificado',
  RECONCILED: 'Cadastrado',
  REJECTED: 'Ignorado',
  POSSIBLE_DUPLICATE: 'Possível duplicidade',
};
async function bankFile(path: string, options?: RequestInit) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? '/api/v1'}/finance/banking${path}`,
    { ...options, headers: { Authorization: `Bearer ${getAccessToken()}` } },
  );
  if (!response.ok) {
    let message = 'Não foi possível processar o arquivo. Verifique sua sessão.';
    try {
      const data = (await response.json()) as { message: string | string[] };
      message = Array.isArray(data.message)
        ? data.message.join(', ')
        : data.message;
    } catch {
      /* response may not be JSON */
    }
    throw new Error(message);
  }
  return response;
}
export function BankingPage() {
  const [params] = useSearchParams();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const authorized =
    hasPermission('FINANCE_BANK_IMPORT') &&
    hasPermission('FINANCE_CONTRIBUTION_READ');
  const [accountId, setAccountId] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [importId, setImportId] = useState(params.get('importId') ?? ''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebouncedValue(search);
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [classificationTargets, setClassificationTargets] = useState<string[]>(
    [],
  );
  const [classificationOpen, setClassificationOpen] = useState(false),
    [classification, setClassification] = useState('INCOME'),
    [categoryId, setCategoryId] = useState(''),
    [memberId, setMemberId] = useState(''),
    [supplierId, setSupplierId] = useState(''),
    [contributionType, setContributionType] = useState(''),
    [acceptDuplicate, setAcceptDuplicate] = useState(false),
    [memberSearch, setMemberSearch] = useState('');
  const debouncedMemberSearch = useDebouncedValue(memberSearch);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fetchInvoicesOpen, setFetchInvoicesOpen] = useState(false);
  const [notice, setNotice] = useState(''),
    [fileError, setFileError] = useState('');
  const imports = useQuery({
    queryKey: ['finance', 'banking', 'imports'],
    queryFn: () =>
      apiRequest<Page<Import>>('/finance/banking/imports', {
        query: { pageSize: 100 },
      }),
    enabled: authorized && historyOpen,
  });
  const detail = useQuery({
    queryKey: ['finance', 'banking', 'import', importId],
    queryFn: () => apiRequest<Import>(`/finance/banking/imports/${importId}`),
    enabled: authorized && Boolean(importId),
  });
  const movements = useQuery({
    queryKey: [
      'finance',
      'banking',
      'movements',
      importId,
      page,
      filterStatus,
      debouncedSearch,
      direction,
      pageSize,
      params.get('transactionId'),
    ],
    queryFn: () =>
      apiRequest<Page<Movement>>('/finance/banking/transactions', {
        query: {
          transactionId: params.get('transactionId'),
          importId: importId || undefined,
          page,
          pageSize,
          search: debouncedSearch || undefined,
          direction: direction || undefined,
          transactionStatus: filterStatus || undefined,
        },
      }),
    enabled: authorized,
  });
  const accounts = useQuery({
    queryKey: ['finance', 'banking', 'accounts'],
    queryFn: () =>
      apiRequest<Page<Lookup>>('/finance/accounts', {
        query: { pageSize: 100 },
      }),
    enabled: authorized && hasPermission('FINANCE_ACCOUNT_READ'),
  });
  const categories = useQuery({
    queryKey: ['finance', 'banking', 'categories'],
    queryFn: () =>
      apiRequest<Page<Lookup>>('/finance/categories', {
        query: { pageSize: 100 },
      }),
    enabled: authorized && hasPermission('FINANCE_CATEGORY_READ'),
  });
  const members = useQuery({
    queryKey: ['finance', 'banking', 'members', debouncedMemberSearch],
    queryFn: () =>
      apiRequest<Page<Lookup>>('/finance/banking/members', {
        query: { search: debouncedMemberSearch, pageSize: 100 },
      }),
    enabled: authorized && classificationOpen && classification === 'INCOME',
  });
  const suppliers = useQuery({
    queryKey: ['finance', 'banking', 'suppliers'],
    queryFn: () =>
      apiRequest<Page<Lookup>>('/finance/suppliers', {
        query: { pageSize: 100 },
      }),
    enabled:
      authorized &&
      classificationOpen &&
      classification === 'EXPENSE' &&
      hasPermission('FINANCE_SUPPLIER_READ'),
  });
  const suggestions = useQuery({
    queryKey: ['finance', 'banking', 'suggestions', classificationTargets[0]],
    queryFn: () =>
      apiRequest<(Lookup & { confidence: number })[]>(
        `/finance/banking/transactions/${classificationTargets[0]}/suggestions`,
      ),
    enabled:
      authorized &&
      classificationOpen &&
      classification === 'INCOME' &&
      classificationTargets.length === 1,
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['finance'] });
    setSelected([]);
  };
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !accountId) throw new Error('Escolha a conta e o arquivo');
      const form = new FormData();
      form.append('accountId', accountId);
      form.append('file', file);
      return (await (
        await bankFile('/imports', { method: 'POST', body: form })
      ).json()) as Import;
    },
    onSuccess: (i) => {
      setImportId(i.id);
      setPage(1);
      setFile(null);
      setSelected([]);
      setFilterStatus('');
      setSearch('');
      setDirection('');
      if (i.status !== 'FAILED') setFetchInvoicesOpen(true);
      invalidate();
      setNotice(
        i.status === 'FAILED'
          ? 'Importação falhou. Consulte o motivo abaixo.'
          : i.summary
            ? `${i.summary.registered} registros cadastrados; ${i.summary.ignored} ignorados; ${i.summary.pending} aguardando revisão. Você pode categorizar agora ou depois.`
            : 'Receitas e despesas cadastradas. Você pode categorizá-las agora ou depois. Possíveis duplicados aguardam revisão.',
      );
    },
  });
  const classify = useMutation({
    mutationFn: () =>
      apiRequest('/finance/banking/classify', {
        method: 'POST',
        body: {
          ids: classificationTargets,
          classification,
          ...(classification !== 'IGNORE' && categoryId ? { categoryId } : {}),
          ...(classification === 'INCOME' && memberId
            ? { memberId, ...(contributionType ? { contributionType } : {}) }
            : {}),
          ...(classification === 'EXPENSE' && supplierId ? { supplierId } : {}),
          acceptDuplicate,
        },
      }),
    onSuccess: () => {
      setClassificationOpen(false);
      setInlineId(null);
      setNotice('Categoria e associações salvas no registro financeiro.');
      invalidate();
    },
  });
  const quickClassify = useMutation({
    mutationFn: ({ row, category }: { row: Movement; category: string }) =>
      apiRequest('/finance/banking/classify', {
        method: 'POST',
        body: {
          ids: [row.id],
          classification: row.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
          categoryId: category,
          ...(row.memberId
            ? {
                memberId: row.memberId,
                contributionType: row.contributionType || undefined,
              }
            : {}),
          ...(row.supplierId ? { supplierId: row.supplierId } : {}),
          acceptDuplicate: false,
        },
      }),
    onSuccess: () => {
      setNotice('Categoria salva. Continue com o próximo movimento.');
      void client.invalidateQueries({ queryKey: ['finance'] });
    },
  });
  function openClassify(row?: Movement, choice?: string) {
    classify.reset();
    setClassificationOpen(true);
    setInlineId(row?.id ?? null);
    setClassificationTargets(row ? [row.id] : [...selected]);
    row ??= movements.data?.items.find((r) => r.id === selected[0]);
    setClassification(
      choice ??
        row?.classification ??
        (row?.direction === 'DEBIT' ? 'EXPENSE' : 'INCOME'),
    );
    setCategoryId(row?.categoryId ?? '');
    setMemberId(row?.memberId ?? '');
    setSupplierId(row?.supplierId ?? '');
    setContributionType(row?.contributionType ?? '');
    setAcceptDuplicate(false);
  }
  const classificationForm = (
    <Stack spacing={2} sx={{ mt: 1 }}>
      {classify.error && (
        <Alert severity="error">{classify.error.message}</Alert>
      )}
      <TextField
        select
        label="Tipo de registro"
        value={classification}
        onChange={(e) => {
          setClassification(e.target.value);
          setCategoryId('');
          setMemberId('');
          setSupplierId('');
          setContributionType('');
        }}
      >
        {[
          ['INCOME', 'Receita'],
          ['EXPENSE', 'Despesa'],
          ['IGNORE', 'Ignorada'],
        ].map(([v, l]) => (
          <MenuItem
            key={v}
            value={v}
            disabled={
              v === 'IGNORE' &&
              Boolean(
                movements.data?.items.some(
                  (row) =>
                    classificationTargets.includes(row.id) &&
                    row.status === 'RECONCILED',
                ),
              )
            }
          >
            {l}
          </MenuItem>
        ))}
      </TextField>
      {classification !== 'IGNORE' && (
        <TextField
          select
          label="Categoria"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <MenuItem value="">Sem categoria</MenuItem>
          {categories.data?.items
            .filter((c) => c.kind === classification)
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
        </TextField>
      )}
      {classification === 'INCOME' && (
        <>
          <TextField
            label="Pesquisar membro"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
          />
          {suggestions.data?.map((s) => (
            <Stack key={s.id} direction="row" alignItems="center">
              <Typography>
                {s.name} · {s.confidence}% de correspondência
              </Typography>
              <Button
                disabled={!hasPermission('FINANCE_CONTRIBUTION_WRITE')}
                onClick={() => setMemberId(s.id)}
              >
                Associar
              </Button>
            </Stack>
          ))}
          <TextField
            select
            label="Membro (escolher outro ou ignorar associação)"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            disabled={!hasPermission('FINANCE_CONTRIBUTION_WRITE')}
          >
            <MenuItem value="">Ignorar associação</MenuItem>
            {members.data?.items.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
          {memberId && (
            <TextField
              select
              label="Tipo da contribuição"
              value={contributionType}
              onChange={(e) => setContributionType(e.target.value)}
            >
              <MenuItem value="">Receita sem contribuição</MenuItem>
              {[
                ['TITHE', 'Dízimo'],
                ['OFFERING', 'Oferta'],
                ['DONATION', 'Doação'],
                ['OTHER', 'Outra'],
              ].map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
          )}
        </>
      )}
      {classification === 'EXPENSE' && (
        <TextField
          select
          label="Fornecedor (opcional)"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <MenuItem value="">Sem fornecedor</MenuItem>
          {suppliers.data?.items.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {movements.data?.items.some(
        (row) =>
          classificationTargets.includes(row.id) &&
          row.status === 'POSSIBLE_DUPLICATE',
      ) && (
        <FormControlLabel
          label="Revisei e aceito importar as possíveis duplicidades selecionadas"
          control={
            <Checkbox
              checked={acceptDuplicate}
              onChange={(_, v) => setAcceptDuplicate(v)}
            />
          }
        />
      )}
    </Stack>
  );
  const classificationActions = (
    <Stack direction="row" gap={1}>
      <Button
        onClick={() => {
          setClassificationOpen(false);
          setInlineId(null);
        }}
      >
        Cancelar
      </Button>
      <Button disabled={classify.isPending} onClick={() => classify.mutate()}>
        Salvar
      </Button>
    </Stack>
  );
  const error =
    imports.error ?? detail.error ?? movements.error ?? upload.error;
  if (!authorized)
    return (
      <Alert severity="warning">
        Importação bancária exige acesso financeiro e permissão para visualizar
        contribuições.
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Importação bancária</Typography>
      <Typography>
        Importe o extrato para cadastrar receitas e despesas automaticamente.
        Categorize aqui ou depois nas listas de Receitas e Despesas.
      </Typography>
      {notice && <Alert severity="info">{notice}</Alert>}
      {error && <Alert severity="error">{error.message}</Alert>}
      {fileError && <Alert severity="error">{fileError}</Alert>}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Enviar CSV, XLSX ou OFX</Typography>
            <TextField
              select
              label="Conta bancária"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <MenuItem value="">Escolha a conta</MenuItem>
              {accounts.data?.items.map((a) => (
                <MenuItem value={a.id} key={a.id}>
                  {a.name} ({a.currency})
                </MenuItem>
              ))}
            </TextField>
            {accounts.error && (
              <Alert severity="error">{accounts.error.message}</Alert>
            )}
            <Button component="label">
              Escolher arquivo (até 10 MB)
              <input
                aria-label="Extrato bancário"
                type="file"
                hidden
                accept=".csv,.xlsx,.ofx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </Button>
            {file && <Typography>{file.name}</Typography>}
            <Button
              variant="contained"
              disabled={!file || !accountId || upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? 'Processando…' : 'Importar extrato'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack direction="row" gap={1}>
        <Button onClick={() => setHistoryOpen(true)}>
          Histórico de importações
        </Button>
        {importId && (
          <Button
            onClick={() => {
              setImportId('');
              setPage(1);
              setSelected([]);
            }}
          >
            Ver todos os movimentos
          </Button>
        )}
      </Stack>
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
      >
        <DialogTitle>Histórico de importações</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            {imports.isFetching && (
              <Typography>Carregando histórico…</Typography>
            )}
            {imports.data?.items.length === 0 && (
              <Typography>Nenhum arquivo importado.</Typography>
            )}
            {imports.data?.items.map((i) => (
              <Button
                key={i.id}
                onClick={() => {
                  setImportId(i.id);
                  setPage(1);
                  setSelected([]);
                  setFilterStatus('');
                  setSearch('');
                  setDirection('');
                  setHistoryOpen(false);
                }}
              >
                {i.filename} · {i.account?.name && `${i.account.name} · `}
                {i.createdAt && `${i.createdAt.slice(0, 10)} · `}
                {statusNames[i.status]} · {i._count.transactions} movimentos
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
      {importId && (
        <EfaturaFetch
          key={importId}
          importId={importId}
          period={detail.data?.period}
          open={fetchInvoicesOpen}
          onOpenChange={setFetchInvoicesOpen}
        />
      )}
      {detail.data && (
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Typography>
                {detail.data.filename} · {statusNames[detail.data.status]}
              </Typography>
              {detail.data.error && (
                <Alert severity="error">{detail.data.error}</Alert>
              )}
              <Stack direction="row" gap={1}>
                <Button
                  onClick={async () => {
                    try {
                      const response = await bankFile(
                        `/imports/${importId}/download`,
                      );
                      const url = URL.createObjectURL(await response.blob());
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = detail.data!.filename;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e) {
                      setFileError((e as Error).message);
                    }
                  }}
                >
                  Baixar arquivo original
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Stack direction="row" gap={2} flexWrap="wrap">
        <TextField
          label="Pesquisar movimentos"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            setSelected([]);
          }}
          helperText="Descrição ou referência"
          sx={{ flex: 1, minWidth: 200 }}
        />
        <TextField
          select
          label="Crédito / débito"
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value);
            setPage(1);
            setSelected([]);
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">Todos os movimentos</MenuItem>
          <MenuItem value="CREDIT">Créditos (receitas)</MenuItem>
          <MenuItem value="DEBIT">Débitos (despesas)</MenuItem>
        </TextField>
        <TextField
          select
          label="Itens por página"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
            setSelected([]);
          }}
        >
          {[20, 50, 100].map((n) => (
            <MenuItem key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Status do movimento"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
            setSelected([]);
          }}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Todos</MenuItem>
          {[
            'PENDING_REVIEW',
            'CLASSIFIED',
            'RECONCILED',
            'REJECTED',
            'POSSIBLE_DUPLICATE',
          ].map((s) => (
            <MenuItem key={s} value={s}>
              {statusNames[s]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack
        direction="row"
        gap={1}
        flexWrap="wrap"
        alignItems="center"
        sx={{
          position: { xs: 'static', md: 'sticky' },
          top: 64,
          zIndex: 2,
          bgcolor: 'background.paper',
          p: 1.5,
          borderRadius: 2,
          boxShadow: 1,
        }}
      >
        <Typography>{selected.length} selecionados</Typography>
        <Button
          onClick={() =>
            setSelected(
              movements.data?.items
                .filter((r) => r.status !== 'REJECTED')
                .map((r) => r.id) ?? [],
            )
          }
        >
          Selecionar página
        </Button>
        {['CREDIT', 'DEBIT'].map((d) => (
          <Button
            key={d}
            onClick={() =>
              setSelected(
                movements.data?.items
                  .filter((r) => r.direction === d && r.status !== 'REJECTED')
                  .map((r) => r.id) ?? [],
              )
            }
          >
            {d === 'CREDIT' ? 'Selecionar créditos' : 'Selecionar débitos'}
          </Button>
        ))}
        <Button onClick={() => setSelected([])}>Limpar</Button>
        <Button disabled={!selected.length} onClick={() => openClassify()}>
          Categorizar selecionados
        </Button>
      </Stack>
      {movements.isFetching && <Typography>Carregando movimentos…</Typography>}
      {quickClassify.error && (
        <Alert severity="error" onClose={() => quickClassify.reset()}>
          {quickClassify.error.message}
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary">
        Verde: créditos · Vermelho: débitos · Amarelo: pendências e
        duplicidades. A categoria rápida salva imediatamente; use a
        classificação detalhada para associar membros ou fornecedores.
        Duplicidades exigem revisão explícita.
      </Typography>
      {movements.data?.items.length === 0 && (
        <Alert severity="info">Nenhum movimento neste filtro.</Alert>
      )}
      {movements.data?.items.map((t) => (
        <Card
          key={t.id}
          sx={{
            borderLeft: 4,
            borderColor:
              t.direction === 'CREDIT' ? 'success.main' : 'error.main',
          }}
        >
          <CardContent>
            <Stack spacing={1}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                gap={2}
              >
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ overflowWrap: 'anywhere', minWidth: 0 }}
                >
                  {t.description}
                </Typography>
                <Chip
                  label={`${t.direction === 'CREDIT' ? 'Crédito +' : 'Débito −'}${t.amount} ${t.import.account.currency}`}
                  color={t.direction === 'CREDIT' ? 'success' : 'error'}
                  sx={{ flexShrink: 0 }}
                />
              </Stack>
              <Chip
                size="small"
                label={statusNames[t.status]}
                color={t.status === 'RECONCILED' ? 'success' : 'default'}
              />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Categoria:{' '}
                {t.status === 'REJECTED'
                  ? 'Não se aplica (movimento ignorado)'
                  : (t.category?.name ?? 'Ainda não classificado')}
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={t.status === 'REJECTED'}
                    slotProps={{
                      input: { 'aria-label': `Selecionar ${t.description}` },
                    }}
                    checked={selected.includes(t.id)}
                    onChange={(_, v) =>
                      setSelected((s) =>
                        v ? [...s, t.id] : s.filter((id) => id !== t.id),
                      )
                    }
                  />
                }
                label={`${t.date.slice(0, 10)} · ${statusNames[t.status]}`}
                slotProps={{ typography: { variant: 'body2' } }}
              />
              <Stack direction="row" gap={1} flexWrap="wrap">
                {hasPermission('FINANCE_CATEGORY_READ') &&
                  !['REJECTED', 'POSSIBLE_DUPLICATE'].includes(t.status) &&
                  !(
                    t.memberId && !hasPermission('FINANCE_CONTRIBUTION_WRITE')
                  ) && (
                    <TextField
                      select
                      size="small"
                      label={`Categoria rápida — ${t.description}`}
                      value={t.categoryId ?? ''}
                      disabled={quickClassify.isPending || classify.isPending}
                      sx={{ minWidth: 200, maxWidth: '100%' }}
                      onChange={(e) =>
                        quickClassify.mutate({
                          row: t,
                          category: e.target.value,
                        })
                      }
                    >
                      <MenuItem value="" disabled>
                        Escolher categoria
                      </MenuItem>
                      {categories.data?.items
                        .filter(
                          (c) =>
                            c.kind ===
                            (t.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE'),
                        )
                        .map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name}
                          </MenuItem>
                        ))}
                    </TextField>
                  )}
                <Button
                  color={t.direction === 'CREDIT' ? 'success' : 'error'}
                  disabled={t.status === 'REJECTED' || classify.isPending}
                  onClick={() =>
                    openClassify(
                      t,
                      t.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
                    )
                  }
                >
                  {t.direction === 'CREDIT'
                    ? 'Editar receita'
                    : 'Editar despesa'}
                </Button>
                <Button
                  disabled={t.status === 'RECONCILED' || classify.isPending}
                  onClick={() => openClassify(t, 'IGNORE')}
                >
                  Ignorar movimento
                </Button>
              </Stack>
              {classificationOpen && inlineId === t.id && (
                <Box aria-label="Classificação do movimento">
                  {classificationForm}
                  {classificationActions}
                </Box>
              )}
              <Typography variant="body2">
                Referência: {t.reference || 'Não informada'} · Linha{' '}
                {t.rowNumber}
              </Typography>
              {t.duplicateReason && (
                <Alert severity="warning">{t.duplicateReason}</Alert>
              )}
              {['PENDING_REVIEW', 'POSSIBLE_DUPLICATE', 'CLASSIFIED'].includes(
                t.status,
              ) && (
                <LinkBankMovement
                  id={t.id}
                  direction={t.direction}
                  accountId={t.import.accountId}
                  date={t.date}
                  amount={t.amount}
                />
              )}
              <MovementInvoices
                canAssociate={t.status !== 'REJECTED'}
                transactionId={t.id}
                invoices={t.invoices ?? []}
                description={t.description}
                amount={t.amount}
                currency={t.import.account.currency}
              />
              <Box component="details">
                <Typography
                  component="summary"
                  variant="body2"
                  sx={{ cursor: 'pointer', fontWeight: 600 }}
                >
                  Origem e registros financeiros
                </Typography>
                <Button
                  onClick={() => {
                    setImportId(t.import.id);
                    setPage(1);
                    setSelected([]);
                  }}
                >
                  Arquivo original: {t.import.filename}
                </Button>
                <Typography variant="caption">
                  Transação bancária {t.id}
                </Typography>
                {t.reconciliations.map((r) => (
                  <Box
                    key={r.id}
                    sx={{
                      pl: 2,
                      borderLeft: 2,
                      borderColor: r.active ? 'success.main' : 'grey.400',
                    }}
                  >
                    <Typography>
                      ↓ {r.active ? 'Registro vinculado' : 'Vínculo anterior'} ·
                      Operador {r.reconciledBy}
                    </Typography>
                    <Typography>
                      {r.income ? 'Receita' : 'Despesa'}{' '}
                      {r.income?.id ?? r.expense?.id} ·{' '}
                      {r.income?.amount ?? r.expense?.amount} ·{' '}
                      {r.income?.status ?? r.expense?.status}
                    </Typography>
                    {hasPermission('FINANCE_TRANSACTION_READ') && (
                      <Button
                        component={Link}
                        to={`?tab=${r.income ? 'incomes' : 'expenses'}&record=${r.income?.id ?? r.expense?.id}`}
                      >
                        Abrir lançamento financeiro
                      </Button>
                    )}
                    {r.income?.contribution && (
                      <Typography>
                        ↓ Contribuição {r.income.contribution.type} ·{' '}
                        {r.income.contribution.id}
                      </Typography>
                    )}
                    {r.income?.contribution && (
                      <Button
                        component={Link}
                        to={`?tab=contributions&record=${r.income.contribution.id}`}
                      >
                        Abrir contribuição
                      </Button>
                    )}
                    {r.undoReason && (
                      <Typography>
                        Desfeita por {r.undoneBy}: {r.undoReason}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ))}
      <Stack direction="row" gap={2}>
        <Button
          disabled={page === 1}
          onClick={() => {
            setPage((p) => p - 1);
            setSelected([]);
          }}
        >
          Anterior
        </Button>
        <Typography>
          Página {page} · {movements.data?.total ?? 0} movimentos
        </Typography>
        <Button
          disabled={
            !movements.data ||
            page * movements.data.pageSize >= movements.data.total
          }
          onClick={() => {
            setPage((p) => p + 1);
            setSelected([]);
          }}
        >
          Próxima
        </Button>
      </Stack>
      <Dialog
        open={classificationOpen && !inlineId}
        onClose={() => setClassificationOpen(false)}
        fullWidth
      >
        <DialogTitle>
          Categorizar {classificationTargets.length} movimento(s)
        </DialogTitle>
        <DialogContent>{classificationForm}</DialogContent>
        <DialogActions>{classificationActions}</DialogActions>
      </Dialog>
    </Stack>
  );
}
