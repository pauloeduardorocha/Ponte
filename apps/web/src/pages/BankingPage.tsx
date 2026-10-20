import { RecordTable, RecordRow } from '../components/RecordTable';
import { EntitySelect } from '../components/EntitySelect';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
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
  LinearProgress,
  Slide,
  useMediaQuery,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Page } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest, getAccessToken } from '../lib/api';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { MovementAttachments } from './MovementAttachments';
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
  id: string;
  date: string;
  amount: string;
  direction: string;
  description: string;
  customDescription?: string | null;
  reference: string;
  status: string;
  classification?: string | null;
  memberId?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  costCenterRecord?: { name: string } | null;
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
const uncategorizedIds = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
];
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
      const data = (await response.json()) as {
        message: string | string[];
        requestId?: string;
      };
      message = Array.isArray(data.message)
        ? data.message.join(', ')
        : data.message;
      if (data.requestId && /^[0-9a-f-]{36}$/i.test(data.requestId))
        message += ` Referência: ${data.requestId}`;
    } catch {
      /* response may not be JSON */
    }
    throw new Error(message);
  }
  return response;
}
export function BankingPage({
  pendingOnly = false,
}: {
  pendingOnly?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const viewedTransactionId = params.get('transactionId');
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const authorized =
    hasPermission('FINANCE_BANK_IMPORT') &&
    hasPermission('FINANCE_CONTRIBUTION_READ');
  const [accountId, setAccountId] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [importId, setImportId] = useState(params.get('importId') ?? ''),
    [reviewRows, setReviewRows] = useState<Movement[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [sliding, setSliding] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const currentMovement = reviewRows[reviewIndex];
  const classificationTargets = currentMovement ? [currentMovement.id] : [];
  const [classificationOpen, setClassificationOpen] = useState(false),
    [classification, setClassification] = useState('INCOME'),
    [categoryId, setCategoryId] = useState(''),
    [costCenterId, setCostCenterId] = useState(''),
    [movementDescription, setMovementDescription] = useState(''),
    [memberId, setMemberId] = useState(''),
    [supplierId, setSupplierId] = useState(''),
    [contributionType, setContributionType] = useState(''),
    [acceptDuplicate, setAcceptDuplicate] = useState(false),
    [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<Lookup | null>(null);
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
  const coverage = useQuery({
    queryKey: ['finance', 'banking', 'coverage', accountId],
    queryFn: () =>
      apiRequest<{ start: string | null; end: string | null }>(
        '/finance/banking/coverage',
        { query: { accountId } },
      ),
    enabled: authorized && !pendingOnly && Boolean(accountId),
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const suggestedEnd = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const detail = useQuery({
    queryKey: ['finance', 'banking', 'import', importId],
    queryFn: () => apiRequest<Import>(`/finance/banking/imports/${importId}`),
    enabled: authorized && !pendingOnly && Boolean(importId),
  });
  const pendingSummary = useQuery({
    queryKey: ['finance', 'banking', 'pending-classification'],
    queryFn: () =>
      apiRequest<{ total: number }>('/finance/banking/pending-classification'),
    enabled: authorized && pendingOnly,
  });
  const accounts = useQuery({
    queryKey: ['finance', 'banking', 'accounts'],
    queryFn: () =>
      apiRequest<Page<Lookup>>('/finance/accounts', {
        query: { pageSize: 100 },
      }),
    enabled:
      authorized && !pendingOnly && hasPermission('FINANCE_ACCOUNT_READ'),
  });
  const categories = useQuery({
    queryKey: ['finance', 'banking', 'categories'],
    queryFn: () =>
      apiRequest<Page<Lookup>>('/finance/categories', {
        query: { pageSize: 100 },
      }),
    enabled:
      authorized &&
      (!pendingOnly || classificationOpen) &&
      hasPermission('FINANCE_CATEGORY_READ'),
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

      setFile(null);

      if (i.status !== 'FAILED') {
        if (
          hasPermission('FINANCE_INVOICE_READ') &&
          hasPermission('FINANCE_INVOICE_IMPORT')
        )
          setFetchInvoicesOpen(true);
        else startReview.mutate(i.id);
      }
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
    mutationFn: (choice?: 'IGNORE') => {
      const kind = choice ?? classification;
      return apiRequest('/finance/banking/classify', {
        method: 'POST',
        body: {
          ids: classificationTargets,
          classification: kind,
          customDescription: movementDescription.trim() || null,
          ...(kind !== 'IGNORE' ? { costCenterId: costCenterId || null } : {}),
          ...(kind !== 'IGNORE' && categoryId ? { categoryId } : {}),
          ...(kind === 'INCOME' && memberId
            ? { memberId, ...(contributionType ? { contributionType } : {}) }
            : {}),
          ...(kind === 'EXPENSE' && supplierId ? { supplierId } : {}),
          acceptDuplicate: kind === 'IGNORE' ? false : acceptDuplicate,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      setSliding(true);
    },
  });
  function prepareMovement(row: Movement) {
    classify.reset();
    setClassification(
      row.classification ?? (row.direction === 'DEBIT' ? 'EXPENSE' : 'INCOME'),
    );
    setCategoryId(
      row.categoryId && !uncategorizedIds.includes(row.categoryId)
        ? row.categoryId
        : '',
    );
    setCostCenterId(row.costCenterId ?? '');
    setMovementDescription(row.customDescription ?? row.description);
    setMemberId(row.memberId ?? '');
    setSelectedMember(null);
    setSupplierId(row.supplierId ?? '');
    setContributionType(row.contributionType ?? '');
    setMemberSearch('');
    setAcceptDuplicate(false);
  }
  const startReview = useMutation({
    mutationFn: async (id?: string) => {
      const rows: Movement[] = [];
      let page = 1;
      while (true) {
        const result = await apiRequest<Page<Movement>>(
          '/finance/banking/transactions',
          {
            query: {
              importId: id,
              page,
              pageSize: 100,
              pendingClassification: pendingOnly ? 'true' : undefined,
            },
          },
        );
        rows.push(...result.items);
        if (!result.items.length || rows.length >= result.total) break;
        page++;
      }
      return rows.filter(
        (row) =>
          row.status !== 'REJECTED' &&
          (!row.categoryId ||
            uncategorizedIds.includes(row.categoryId) ||
            !row.costCenterId ||
            row.status === 'POSSIBLE_DUPLICATE'),
      );
    },
    onSuccess: (rows) => {
      setReviewRows(rows);
      setReviewIndex(0);
      setSliding(false);
      if (rows.length) {
        prepareMovement(rows[0]!);
        setClassificationOpen(true);
      } else setNotice('Todos os movimentos já foram categorizados.');
    },
  });
  function stopReview() {
    if (classify.isPending || sliding) return;
    setClassificationOpen(false);
    setNotice(
      'Progresso salvo. Continue pelo menu Receitas ou Despesas, editando os itens normalmente.',
    );
  }
  function advanceReview() {
    const next = reviewIndex + 1;
    if (next < reviewRows.length) {
      setReviewIndex(next);
      prepareMovement(reviewRows[next]!);
    } else {
      setClassificationOpen(false);
      setNotice(
        'Revisão concluída. Todas as movimentações foram percorridas. Os movimentos pulados continuam pendentes de categorização.',
      );
    }
    setSliding(false);
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
          setSelectedMember(null);
          setMemberSearch('');
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
              Boolean(currentMovement?.status === 'RECONCILED')
            }
          >
            {l}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Descrição"
        multiline
        minRows={2}
        value={movementDescription}
        onChange={(e) => setMovementDescription(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        helperText="Descrição usada na receita ou despesa. A descrição original do extrato é preservada."
      />
      {classification !== 'IGNORE' && (
        <TextField
          select
          label="Categoria"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <MenuItem value="">Sem categoria</MenuItem>
          {categories.data?.items
            .filter(
              (c) =>
                c.kind === classification && !uncategorizedIds.includes(c.id),
            )
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
        </TextField>
      )}
      {classification !== 'IGNORE' && (
        <EntitySelect
          endpoint="/finance/cost-centers"
          label="Centro de custo"
          required
          value={costCenterId}
          onChange={(e) => setCostCenterId(e.target.value)}
        />
      )}
      {classification === 'INCOME' && (
        <>
          {!memberId &&
            suggestions.data?.map((s) => (
              <Stack key={s.id} direction="row" alignItems="center">
                <Typography>
                  {s.name} · {s.confidence}% de correspondência
                </Typography>
                <Button
                  disabled={!hasPermission('FINANCE_CONTRIBUTION_WRITE')}
                  onClick={() => {
                    setMemberId(s.id);
                    setSelectedMember(s);
                    setMemberSearch('');
                  }}
                >
                  Associar
                </Button>
              </Stack>
            ))}
          <Autocomplete
            options={members.data?.items ?? []}
            value={
              memberId
                ? (selectedMember ??
                  members.data?.items.find(
                    (member) => member.id === memberId,
                  ) ??
                  suggestions.data?.find(
                    (member) => member.id === memberId,
                  ) ?? { id: memberId, name: 'Membro associado' })
                : null
            }
            getOptionLabel={(member) => member.name}
            getOptionKey={(member) => member.id}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(options) => options}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') setMemberSearch(value);
              else setMemberSearch('');
            }}
            onChange={(_, member) => {
              setMemberId(member?.id ?? '');
              setSelectedMember(member);
              setMemberSearch('');
              if (!member) setContributionType('');
            }}
            disabled={!hasPermission('FINANCE_CONTRIBUTION_WRITE')}
            loading={members.isFetching}
            loadingText="Buscando membros..."
            noOptionsText="Nenhum membro encontrado"
            clearText="Ignorar associação"
            openText="Mostrar membros"
            closeText="Fechar lista"
            renderInput={(params) => (
              <TextField
                {...params}
                label="Membro"
                placeholder="Digite para buscar um membro"
                helperText={
                  members.error?.message ??
                  'Opcional. Limpe o campo para ignorar a associação.'
                }
                error={Boolean(members.error)}
              />
            )}
          />
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
      {currentMovement?.status === 'POSSIBLE_DUPLICATE' && (
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
  const reviewDialog = (
    <Dialog
      open={classificationOpen}
      onClose={stopReview}
      fullWidth
      maxWidth="sm"
      aria-labelledby="movement-review-title"
    >
      <DialogTitle id="movement-review-title">
        Categorizar movimentação
      </DialogTitle>
      <DialogContent sx={{ overflowX: 'hidden' }}>
        <Stack spacing={2}>
          <Typography aria-live="polite">
            Movimento {reviewIndex + 1} de {reviewRows.length}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={
              reviewRows.length ? (reviewIndex / reviewRows.length) * 100 : 0
            }
            aria-label="Progresso da classificação"
          />
          <Typography variant="body2" color="text.secondary">
            Cada etapa é salva. Você pode parar e continuar depois em Receitas
            ou Despesas.
          </Typography>
          {currentMovement && (
            <Slide
              key={currentMovement.id}
              direction={sliding ? 'right' : 'left'}
              in={!sliding}
              timeout={reducedMotion ? 0 : 240}
              onExited={advanceReview}
              mountOnEnter
              unmountOnExit
            >
              <Box>
                <Stack spacing={1} sx={{ mb: 2 }}>
                  <Chip
                    label={
                      currentMovement.direction === 'CREDIT'
                        ? 'Receita'
                        : 'Despesa'
                    }
                    color={
                      currentMovement.direction === 'CREDIT'
                        ? 'success'
                        : 'error'
                    }
                    sx={{ alignSelf: 'flex-start' }}
                  />
                  <Typography variant="h5" component="h3">
                    {currentMovement.description}
                  </Typography>
                  <Typography variant="h4">
                    {currentMovement.direction === 'CREDIT' ? '+' : '−'}
                    {currentMovement.amount}{' '}
                    {currentMovement.import.account.currency}
                  </Typography>
                  <Typography variant="body2">
                    {currentMovement.date.slice(0, 10)} · Referência:{' '}
                    {currentMovement.reference || 'Não informada'}
                  </Typography>
                  {currentMovement.status === 'POSSIBLE_DUPLICATE' && (
                    <Alert severity="warning">
                      <Typography sx={{ fontWeight: 600 }}>
                        Possível réplica
                      </Typography>
                      Este movimento pode já ter sido importado. Confira os
                      dados e descarte-o se for duplicado.
                      {currentMovement.duplicateReason && (
                        <Typography variant="body2">
                          {currentMovement.duplicateReason}
                        </Typography>
                      )}
                    </Alert>
                  )}
                </Stack>
                <Box
                  component="fieldset"
                  disabled={classify.isPending || sliding}
                  sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
                >
                  {classificationForm}
                </Box>
                <MovementAttachments
                  key={currentMovement.id}
                  transactionId={currentMovement.id}
                />
                {[
                  'PENDING_REVIEW',
                  'POSSIBLE_DUPLICATE',
                  'CLASSIFIED',
                ].includes(currentMovement.status) && (
                  <LinkBankMovement
                    onLinked={() => setSliding(true)}
                    id={currentMovement.id}
                    direction={currentMovement.direction}
                    accountId={currentMovement.import.accountId}
                    date={currentMovement.date}
                    amount={currentMovement.amount}
                  />
                )}
              </Box>
            </Slide>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {currentMovement?.status === 'POSSIBLE_DUPLICATE' && (
          <Button
            color="warning"
            disabled={classify.isPending || sliding}
            onClick={() => classify.mutate('IGNORE')}
          >
            Descartar movimento
          </Button>
        )}
        <Button disabled={classify.isPending || sliding} onClick={stopReview}>
          Continuar depois
        </Button>
        <Button
          disabled={!currentMovement || classify.isPending || sliding}
          onClick={() => setSliding(true)}
        >
          Pular
        </Button>
        <Button
          variant="contained"
          disabled={
            !currentMovement ||
            classify.isPending ||
            sliding ||
            (classification !== 'IGNORE' && (!categoryId || !costCenterId)) ||
            (classification !== 'IGNORE' &&
              currentMovement.status === 'POSSIBLE_DUPLICATE' &&
              !acceptDuplicate)
          }
          onClick={() => classify.mutate()}
        >
          {classify.isPending ? 'Salvando…' : 'Próxima'}
        </Button>
      </DialogActions>
    </Dialog>
  );
  const attachmentDialog = (
    <Dialog
      open={!pendingOnly && Boolean(viewedTransactionId)}
      onClose={() => {
        const next = new URLSearchParams(params);
        next.delete('transactionId');
        setParams(next);
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Anexos do movimento bancário</DialogTitle>
      <DialogContent>
        {viewedTransactionId && (
          <MovementAttachments
            key={viewedTransactionId}
            transactionId={viewedTransactionId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
  if (pendingOnly) {
    if (!authorized) return null;
    const total = pendingSummary.data?.total ?? 0;
    return (
      <>
        {total > 0 && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                disabled={startReview.isPending || classificationOpen}
                onClick={() => startReview.mutate()}
              >
                {startReview.isPending
                  ? 'Carregando…'
                  : 'Categorizar movimentos'}
              </Button>
            }
          >
            <Typography sx={{ fontWeight: 600 }}>
              {total === 1
                ? '1 movimento aguarda categorização'
                : `${total} movimentos aguardam categorização`}
            </Typography>
            Defina a categoria e o centro de custo. Possíveis réplicas também
            precisam de revisão.
          </Alert>
        )}
        {pendingSummary.error && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void pendingSummary.refetch()}>
                Tentar novamente
              </Button>
            }
          >
            Não foi possível consultar os movimentos pendentes.
          </Alert>
        )}
        {startReview.error && (
          <Alert severity="error">{startReview.error.message}</Alert>
        )}
        {notice && (
          <Alert severity="info" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        )}
        {startReview.isPending && (
          <LinearProgress aria-label="Carregando movimentos" />
        )}
        {reviewDialog}
      </>
    );
  }
  const error =
    imports.error ?? detail.error ?? upload.error ?? startReview.error;
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
            {accountId && coverage.isPending && (
              <Typography>Consultando período importado…</Typography>
            )}
            {accountId && coverage.error && (
              <Alert
                severity="error"
                action={
                  <Button onClick={() => void coverage.refetch()}>
                    Tentar novamente
                  </Button>
                }
              >
                Não foi possível consultar o período importado.
              </Alert>
            )}
            {accountId && coverage.data && (
              <Alert severity="info">
                {coverage.data.end ? (
                  <>
                    <Typography>
                      Movimentos importados: {coverage.data.start} a{' '}
                      {coverage.data.end}.
                    </Typography>
                    <Typography>
                      Última data importada: {coverage.data.end}.
                    </Typography>
                    <Typography>
                      {coverage.data.end <= suggestedEnd
                        ? `Próximo período sugerido: ${coverage.data.end} a ${suggestedEnd} (ontem).`
                        : `Não há novo período até ${suggestedEnd} (ontem).`}
                    </Typography>
                    <Typography variant="body2">
                      A sugestão inclui o último dia para conferir movimentos
                      adicionais. As datas dos movimentos não garantem cobertura
                      contínua do extrato.
                    </Typography>
                  </>
                ) : (
                  <Typography>
                    Nenhum movimento importado nesta conta. Escolha a data
                    inicial do primeiro extrato e exporte até {suggestedEnd}{' '}
                    (ontem).
                  </Typography>
                )}
              </Alert>
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
            <RecordTable
              label="Histórico de importações"
              primaryLabel="Arquivo"
            >
              {imports.data?.items.map((i) => (
                <RecordRow
                  key={i.id}
                  primary={<Typography>{i.filename}</Typography>}
                  actions={
                    <Button
                      onClick={() => {
                        setImportId(i.id);
                        setHistoryOpen(false);
                      }}
                    >
                      Abrir importação
                    </Button>
                  }
                >
                  <Typography>
                    {i.account?.name} · {i.createdAt?.slice(0, 10)} ·{' '}
                    {statusNames[i.status]} · {i._count.transactions} movimentos
                  </Typography>
                  <Typography>
                    {i.period?.start && i.period.end
                      ? `Datas dos movimentos: ${i.period.start} a ${i.period.end}`
                      : 'Sem período de movimentos disponível'}
                  </Typography>
                </RecordRow>
              ))}
            </RecordTable>
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
          onOpenChange={(open) => {
            setFetchInvoicesOpen(open);
            if (!open) startReview.mutate(importId);
          }}
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
              <Stack direction="row" gap={1} flexWrap="wrap">
                {detail.data.status !== 'FAILED' && (
                  <Button
                    disabled={startReview.isPending}
                    onClick={() => startReview.mutate(importId)}
                  >
                    {startReview.isPending
                      ? 'Carregando…'
                      : 'Categorizar movimentos'}
                  </Button>
                )}
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
      <Stack direction="row" gap={1}>
        <Button component={Link} to="?tab=incomes">
          Ir para Receitas
        </Button>
        <Button component={Link} to="?tab=expenses">
          Ir para Despesas
        </Button>
      </Stack>
      {startReview.isPending && (
        <LinearProgress aria-label="Carregando movimentos" />
      )}
      {reviewDialog}
      {attachmentDialog}
    </Stack>
  );
}
