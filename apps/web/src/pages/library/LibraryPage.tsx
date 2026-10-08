import { EntitySelect } from '../../components/EntitySelect';
import { STATUS_LABELS } from '../../lib/status-labels';
import { LibraryDashboardPanel } from './LibraryDashboardPanel';
import { useSearchParams } from 'react-router-dom';
import { StatusChip } from '../../components/DataPresentation';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../../auth/auth-context';
import { Can } from '../../auth/guards';
import { PageHeader, QueryError } from '../../components/PageParts';
import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import * as api from '../../lib/library-api';
import { HistoryContent, MemberLibraryHistory } from './LibraryHistory';

interface Field {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  endpoint?: string;
  query?: Record<string, string>;
  options?: readonly string[];
}
interface Action {
  title: string;
  fields: Field[];
  values?: Record<string, string>;
  run: (values: Record<string, string>) => Promise<unknown>;
}
const memberField: Field = {
  name: 'memberId',
  label: 'Membro',
  endpoint: '/library/members',
  required: true,
};
const copyFields: Field[] = [
  { name: 'assetCode', label: 'Código patrimonial', required: true },
  { name: 'barcode', label: 'Código de barras' },
  { name: 'qrCode', label: 'QR code' },
  { name: 'condition', label: 'Condição' },
  { name: 'location', label: 'Localização', required: true },
  { name: 'acquiredAt', label: 'Data de aquisição', type: 'date' },
  { name: 'notes', label: 'Observações', multiline: true },
];
const bookFields: Field[] = [
  { name: 'title', label: 'Título', required: true },
  { name: 'subtitle', label: 'Subtítulo' },
  { name: 'author', label: 'Autor', required: true },
  { name: 'isbn', label: 'ISBN' },
  { name: 'publisher', label: 'Editora' },
  { name: 'edition', label: 'Edição' },
  { name: 'year', label: 'Ano', type: 'number' },
  { name: 'language', label: 'Idioma' },
  { name: 'description', label: 'Descrição', multiline: true },
  { name: 'pages', label: 'Páginas', type: 'number' },
  { name: 'cover', label: 'Capa (URL HTTPS)', type: 'url' },
  { name: 'category', label: 'Categoria' },
  { name: 'keywords', label: 'Palavras-chave (separadas por vírgulas)' },
];
const justification: Field = {
  name: 'justification',
  label: 'Justificativa',
  required: true,
  multiline: true,
};
function bookInput(v: Record<string, string>, clearing = false): api.BookInput {
  const blank = clearing ? null : undefined;
  return {
    title: v.title ?? '',
    author: v.author ?? '',
    subtitle: v.subtitle || blank,
    isbn: v.isbn || blank,
    publisher: v.publisher || blank,
    edition: v.edition || blank,
    year: v.year ? Number(v.year) : blank,
    language: v.language || undefined,
    description: v.description || blank,
    pages: v.pages ? Number(v.pages) : blank,
    cover: v.cover || blank,
    category: v.category || blank,
    keywords: (v.keywords ?? '')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean),
  };
}
function copyInput(v: Record<string, string>, clearing = false): api.CopyInput {
  const blank = clearing ? null : undefined;
  return {
    assetCode: v.assetCode ?? '',
    location: v.location ?? '',
    barcode: v.barcode || blank,
    qrCode: v.qrCode || blank,
    condition: v.condition || undefined,
    acquiredAt: v.acquiredAt ? new Date(v.acquiredAt).toISOString() : blank,
    notes: v.notes || blank,
  };
}
function valuesOf(value: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      Array.isArray(val)
        ? val.join(', ')
        : val === null || val === undefined
          ? ''
          : String(val),
    ]),
  );
}

function ActionDialog({
  action,
  close,
  onSaved,
}: {
  action: Action;
  close: () => void;
  onSaved: () => void;
}) {
  const { control, handleSubmit } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      action.fields.map((field) => [
        field.name,
        action.values?.[field.name] ?? '',
      ]),
    ),
  });
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => action.run(values),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['library'] });
      await client.invalidateQueries({ queryKey: ['entity-options'] });
      onSaved();
      close();
    },
  });
  return (
    <Dialog
      open
      onClose={() => {
        if (!mutation.isPending) close();
      }}
      fullWidth
      maxWidth="sm"
    >
      <Box
        component="form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <DialogTitle>{action.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {mutation.isError && (
              <Alert severity="error">{errorMessage(mutation.error)}</Alert>
            )}
            {!action.fields.length && (
              <Typography>Confirma esta operação?</Typography>
            )}
            {action.fields.map((field) => (
              <Controller
                key={field.name}
                name={field.name}
                control={control}
                rules={{
                  required: field.required ? 'Campo obrigatório' : false,
                }}
                render={({ field: input, fieldState }) =>
                  field.endpoint ? (
                    <EntitySelect
                      {...input}
                      inputRef={input.ref}
                      endpoint={field.endpoint}
                      query={field.query}
                      label={field.label}
                      required={field.required}
                      disabled={mutation.isPending}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                    />
                  ) : (
                    <TextField
                      {...input}
                      inputRef={input.ref}
                      label={field.label}
                      required={field.required}
                      type={field.type ?? 'text'}
                      multiline={field.multiline}
                      minRows={field.multiline ? 2 : undefined}
                      select={Boolean(field.options)}
                      disabled={mutation.isPending}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                      slotProps={
                        field.type === 'date'
                          ? { inputLabel: { shrink: true } }
                          : undefined
                      }
                    >
                      {field.options?.map((option) => (
                        <MenuItem key={option} value={option}>
                          {STATUS_LABELS[option] ?? option}
                        </MenuItem>
                      ))}
                    </TextField>
                  )
                }
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={mutation.isPending} onClick={close}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function Paged({
  total,
  page,
  setPage,
  children,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
  children: ReactNode;
}) {
  return (
    <Stack spacing={2}>
      {children}
      {!total && <Alert severity="info">Nenhum registro encontrado.</Alert>}
      <Stack direction="row" spacing={2} alignItems="center">
        <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Typography>
          Página {page} · {total} registros
        </Typography>
        <Button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
          Próxima
        </Button>
      </Stack>
    </Stack>
  );
}

function CopyHistoryDialog({ id, close }: { id: string; close: () => void }) {
  const history = useQuery({
    queryKey: ['library', 'copy-history', id],
    queryFn: () => api.getCopyHistory(id),
  });
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Histórico completo do exemplar</DialogTitle>
      <DialogContent>
        {history.isPending && <CircularProgress />}
        {history.isError && (
          <QueryError
            error={history.error}
            onRetry={() => void history.refetch()}
          />
        )}
        {history.data && (
          <Stack spacing={2}>
            <Typography>
              {history.data.copy.assetCode} · {history.data.copy.status} ·{' '}
              {history.data.copy.condition} · {history.data.copy.location}
            </Typography>
            <HistoryContent history={history.data} />
            <Typography variant="h6">
              Auditoria / manutenção / mudanças de status
            </Typography>
            {history.data.events.map((event) => (
              <Typography key={event.id} variant="body2">
                {formatDate(event.createdAt)} · {event.action} ·{' '}
                {event.actorId ?? 'automático'} ·{' '}
                {JSON.stringify(event.metadata)}
              </Typography>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

export function LibraryPage() {
  const { hasPermission } = useAuth();
  const tabs = [
    ['catalog', 'Catálogo', 'LIBRARY_BOOK_READ'],
    ['copies', 'Exemplares', 'LIBRARY_COPY_READ'],
    ['loans', 'Empréstimos', 'LIBRARY_LOAN_READ'],
    ['fines', 'Multas', 'LIBRARY_FINE_READ'],
    ['reservations', 'Reservas', 'LIBRARY_RESERVATION_READ'],
    ['settings', 'Configurações', 'LIBRARY_SETTINGS_READ'],
    ['members', 'Membros / histórico', 'LIBRARY_HISTORY_READ'],
  ] as const;
  const allowed = tabs.filter((tab) => hasPermission(tab[2]));
  const [params, setParams] = useSearchParams();
  const [chosenTab, setTab] = useState<string>(params.get('tab') ?? '');
  const tab = allowed.some(
    (entry) => entry[0] === (params.get('tab') ?? chosenTab),
  )
    ? (params.get('tab') ?? chosenTab)
    : allowed[0]?.[0];
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('');
  const [available, setAvailable] = useState('');
  const [memberId, setMemberId] = useState('');
  const [bookId, setBookId] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  useEffect(() => {
    setSearch(params.get('search') ?? '');
    setStatus(params.get('status') ?? '');
    setPage(1);
  }, [params]);
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action>();
  const [copyHistory, setCopyHistory] = useState<string>();
  const [historyMember, setHistoryMember] = useState<string>();
  const books = useQuery({
    queryKey: ['library', 'books', page, search, author, category, available],
    queryFn: () => api.listBooks({ page, search, author, category, available }),
    enabled: tab === 'catalog',
  });
  const copies = useQuery({
    queryKey: ['library', 'copies', page, search, bookId, status],
    queryFn: () => api.listCopies({ page, search, bookId, status }),
    enabled: tab === 'copies',
  });
  const loans = useQuery({
    queryKey: ['library', 'loans', page, memberId, bookId, status],
    queryFn: () => api.listLoans({ page, memberId, bookId, status }),
    enabled: tab === 'loans',
  });
  const fines = useQuery({
    queryKey: ['library', 'fines', page, memberId, bookId],
    queryFn: () => api.listFines({ page, memberId, bookId }),
    enabled: tab === 'fines',
  });
  const reservations = useQuery({
    queryKey: ['library', 'reservations', page, memberId, bookId],
    queryFn: () => api.listReservations({ page, memberId, bookId }),
    enabled: tab === 'reservations',
  });
  const settings = useQuery({
    queryKey: ['library', 'settings'],
    queryFn: api.getLibrarySettings,
    enabled: tab === 'settings',
  });
  const members = useQuery({
    queryKey: ['library', 'members', page, search],
    queryFn: () => api.listLibraryMembers({ page, search }),
    enabled: tab === 'members',
  });
  const current =
    tab === 'catalog'
      ? books
      : tab === 'copies'
        ? copies
        : tab === 'loans'
          ? loans
          : tab === 'fines'
            ? fines
            : tab === 'reservations'
              ? reservations
              : tab === 'members'
                ? members
                : settings;
  const open = (
    title: string,
    run: Action['run'],
    fields: Field[] = [],
    values?: Record<string, string>,
  ) => setAction({ title, run, fields, values });
  const filter = (setter: (v: string) => void, v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <Stack spacing={3}>
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <PageHeader
        title="Biblioteca"
        subtitle="Catálogo, circulação, reservas e multas"
      />
      <Can permission="LIBRARY_DASHBOARD_READ">
        <LibraryDashboardPanel />
      </Can>
      {!allowed.length ? (
        <Alert severity="warning">
          Você não tem permissão para consultar a biblioteca.
        </Alert>
      ) : (
        <>
          <Tabs
            value={tab}
            variant="scrollable"
            onChange={(_, value: string) => {
              setTab(value);
              setParams({ tab: value });
              setPage(1);
              setStatus('');
            }}
          >
            {allowed.map(([key, label]) => (
              <Tab key={key} label={label} value={key} />
            ))}
          </Tabs>
          {tab !== 'settings' && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              {(tab === 'catalog' || tab === 'copies' || tab === 'members') && (
                <TextField
                  label="Pesquisa"
                  value={search}
                  onChange={(e) => filter(setSearch, e.target.value)}
                />
              )}
              {tab === 'catalog' ? (
                <>
                  <TextField
                    label="Autor"
                    value={author}
                    onChange={(e) => filter(setAuthor, e.target.value)}
                  />
                  <TextField
                    label="Categoria"
                    value={category}
                    onChange={(e) => filter(setCategory, e.target.value)}
                  />
                  <TextField
                    select
                    label="Disponibilidade"
                    value={available}
                    onChange={(e) => filter(setAvailable, e.target.value)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="">Todos</MenuItem>
                    <MenuItem value="true">Disponível</MenuItem>
                    <MenuItem value="false">Indisponível</MenuItem>
                  </TextField>
                </>
              ) : (
                tab !== 'members' && (
                  <>
                    {hasPermission('LIBRARY_BOOK_READ') && (
                      <EntitySelect
                        endpoint="/library/books"
                        label="Livro (filtro)"
                        value={bookId}
                        onChange={(e) => filter(setBookId, e.target.value)}
                      />
                    )}
                    {tab !== 'copies' &&
                      hasPermission('LIBRARY_HISTORY_READ') && (
                        <EntitySelect
                          endpoint="/library/members"
                          label="Membro (filtro)"
                          value={memberId}
                          onChange={(e) => filter(setMemberId, e.target.value)}
                        />
                      )}
                    {(tab === 'copies' || tab === 'loans') && (
                      <TextField
                        select
                        label="Status"
                        value={status}
                        onChange={(e) => filter(setStatus, e.target.value)}
                        sx={{ minWidth: 180 }}
                      >
                        <MenuItem value="">Todos</MenuItem>
                        {(tab === 'copies'
                          ? [
                            'AVAILABLE',
                            'LOANED',
                            'RESERVED',
                            'MAINTENANCE',
                            'LOST',
                            'DISPOSED',
                          ]
                          : [
                            'ACTIVE',
                            'OVERDUE',
                            'RETURNED',
                            'LOST',
                            'CANCELLED',
                          ]
                        ).map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  </>
                )
              )}
            </Stack>
          )}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {tab === 'catalog' && (
              <Can permission="LIBRARY_BOOK_CREATE">
                <Button
                  variant="contained"
                  onClick={() =>
                    open(
                      'Novo livro',
                      (v) => api.createBook(bookInput(v)),
                      bookFields,
                    )
                  }
                >
                  Novo livro
                </Button>
              </Can>
            )}
            {(tab === 'copies' || tab === 'loans') && (
              <Can permission="LIBRARY_LOAN_CREATE">
                <Button
                  variant="contained"
                  onClick={() =>
                    open(
                      'Emprestar exemplar',
                      (v) =>
                        api.borrow({
                          memberId: v.memberId ?? '',
                          bookCopyId: v.bookCopyId ?? '',
                          observations: v.observations || undefined,
                        }),
                      [
                        memberField,
                        {
                          name: 'bookCopyId',
                          label: 'Exemplar',
                          endpoint: '/library/copies',
                          query: { status: 'AVAILABLE' },
                          required: true,
                        },
                        { name: 'observations', label: 'Observações' },
                      ],
                    )
                  }
                >
                  Emprestar
                </Button>
              </Can>
            )}
            {tab === 'reservations' && (
              <Can permission="LIBRARY_RESERVATION_CREATE">
                <Button
                  variant="contained"
                  onClick={() =>
                    open(
                      'Reservar livro',
                      (v) =>
                        api.reserve({
                          memberId: v.memberId ?? '',
                          bookId: v.bookId ?? '',
                        }),
                      [
                        memberField,
                        {
                          name: 'bookId',
                          label: 'Livro',
                          endpoint: '/library/books',
                          required: true,
                        },
                      ],
                    )
                  }
                >
                  Reservar
                </Button>
              </Can>
            )}
          </Stack>
          {current.isPending && (
            <CircularProgress aria-label="Carregando biblioteca" />
          )}
          {current.isError && (
            <QueryError
              error={current.error}
              onRetry={() => void current.refetch()}
            />
          )}
          {tab === 'members' && members.data && (
            <Paged total={members.data.total} page={page} setPage={setPage}>
              {members.data.items.map((member) => (
                <Card key={member.id} variant="outlined">
                  <CardContent>
                    <Typography>
                      {member.name} · {member.status}
                    </Typography>
                    <Typography variant="caption">
                      ID do membro: {member.id}
                    </Typography>
                    <Button onClick={() => setHistoryMember(member.id)}>
                      Histórico da biblioteca
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </Paged>
          )}
          {tab === 'catalog' && books.data && (
            <Paged total={books.data.total} page={page} setPage={setPage}>
              <Box className="detail-grid">
                {books.data.items.map((book) => (
                  <Card key={book.id} variant="outlined">
                    <CardContent>
                      <Stack direction="row">

                        <Stack spacing={1} >
                          <Typography variant="h6">{book.title}</Typography>
                          <Typography>
                            {book.subtitle} · {book.author} ·{' '}
                            {book.category ?? 'Sem categoria'}
                          </Typography>
                          <Typography>
                            {book.publisher} · {book.edition} · {book.year} ·{' '}
                            {book.language} · {book.pages} páginas
                          </Typography>
                          <Typography>{book.description}</Typography>
                          <Typography>{book.keywords?.join(', ')}</Typography>
                          <Typography>
                            Exemplares: {book.quantity} · Disponíveis:{' '}
                            {book.available}
                          </Typography>
                          <Typography variant="caption">
                            ID: {book.id} · ISBN: {book.isbn}
                          </Typography>
                          <Stack direction="row" flexWrap="wrap">
                            <Can permission="LIBRARY_BOOK_UPDATE">
                              <Button
                                onClick={() =>
                                  open(
                                    'Editar livro',
                                    (v) =>
                                      api.updateBook(book.id, bookInput(v, true)),
                                    bookFields,
                                    valuesOf(book),
                                  )
                                }
                              >
                                Editar
                              </Button>
                            </Can>
                            <Can permission="LIBRARY_BOOK_DELETE">
                              <Button
                                color="error"
                                onClick={() =>
                                  open('Excluir livro sem histórico', () =>
                                    api.deleteBook(book.id),
                                  )
                                }
                              >
                                Excluir
                              </Button>
                            </Can>
                            <Can permission="LIBRARY_COPY_CREATE">
                              <Button
                                onClick={() =>
                                  open(
                                    'Novo exemplar',
                                    (v) => api.createCopy(book.id, copyInput(v)),
                                    copyFields,
                                  )
                                }
                              >
                                Novo exemplar
                              </Button>
                            </Can>
                            <Can permission="LIBRARY_RESERVATION_CREATE">
                              <Button
                                onClick={() =>
                                  open(
                                    `Reservar ${book.title}`,
                                    (v) =>
                                      api.reserve({
                                        bookId: book.id,
                                        memberId: v.memberId ?? '',
                                      }),
                                    [memberField],
                                  )
                                }
                              >
                                Reservar
                              </Button>
                            </Can>
                          </Stack>
                        </Stack>
                        <Stack>
                          {book.cover && (
                            <Box
                              component="img"
                              src={book.cover}
                              alt={`Capa de ${book.title}`}
                              sx={{
                                width: 100,
                                height: 140,
                                objectFit: 'contain',
                              }}
                            />
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Paged>
          )}
          {tab === 'copies' && copies.data && (
            <Paged total={copies.data.total} page={page} setPage={setPage}>
              {copies.data.items.map((copy) => (
                <Card key={copy.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6">
                        {copy.book.title} · {copy.assetCode}
                      </Typography>
                      <Typography>
                        {<StatusChip status={copy.status} />} · {copy.condition}{' '}
                        · {copy.location} · {copy.notes}
                      </Typography>
                      <Typography variant="caption">
                        ID: {copy.id} · Livro: {copy.bookId} · Barcode:{' '}
                        {copy.barcode} · QR: {copy.qrCode} · Aquisição:{' '}
                        {copy.acquiredAt ? formatDate(copy.acquiredAt) : '—'}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap">
                        <Can permission="LIBRARY_HISTORY_READ">
                          <Button onClick={() => setCopyHistory(copy.id)}>
                            Histórico
                          </Button>
                        </Can>
                        <Can permission="LIBRARY_COPY_UPDATE">
                          <Button
                            onClick={() =>
                              open(
                                'Editar exemplar / manutenção',
                                (v) =>
                                  api.updateCopy(copy.id, {
                                    ...copyInput(v, true),
                                    ...(v.status === 'AVAILABLE' ||
                                      v.status === 'MAINTENANCE' ||
                                      v.status === 'LOST' ||
                                      v.status === 'DISPOSED'
                                      ? { status: v.status }
                                      : {}),
                                    justification: v.justification ?? '',
                                  }),
                                [
                                  ...copyFields,
                                  {
                                    name: 'status',
                                    label: 'Status (vazio mantém atual)',
                                    options: [
                                      '',
                                      'AVAILABLE',
                                      'MAINTENANCE',
                                      'LOST',
                                      'DISPOSED',
                                    ],
                                  },
                                  justification,
                                ],
                                {
                                  ...valuesOf(copy),
                                  acquiredAt:
                                    copy.acquiredAt?.slice(0, 10) ?? '',
                                  status: '',
                                },
                              )
                            }
                          >
                            Editar / status
                          </Button>
                        </Can>
                        {(copy.status === 'AVAILABLE' ||
                          copy.status === 'RESERVED') && (
                            <Can permission="LIBRARY_LOAN_CREATE">
                              <Button
                                onClick={() =>
                                  open(
                                    `Emprestar ${copy.assetCode}`,
                                    (v) =>
                                      api.borrow({
                                        memberId: v.memberId ?? '',
                                        bookCopyId: copy.id,
                                        observations: v.observations || undefined,
                                      }),
                                    [
                                      memberField,
                                      {
                                        name: 'observations',
                                        label: 'Observações',
                                      },
                                    ],
                                  )
                                }
                              >
                                Emprestar
                              </Button>
                            </Can>
                          )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Paged>
          )}
          {tab === 'loans' && loans.data && (
            <Paged total={loans.data.total} page={page} setPage={setPage}>
              {loans.data.items.map((loan) => (
                <Card key={loan.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6">
                        {loan.bookCopy.book.title} · {loan.bookCopy.assetCode} ·{' '}
                        {loan.member.name}
                      </Typography>
                      <Typography>
                        {<StatusChip status={loan.status} />} · Emprestado{' '}
                        {formatDate(loan.borrowedAt)} · Vence{' '}
                        {formatDate(loan.dueAt)} · Devolvido{' '}
                        {loan.returnedAt ? formatDate(loan.returnedAt) : '—'} ·
                        Renovações {loan.renewedCount}
                      </Typography>
                      <Typography variant="caption">
                        ID: {loan.id} · Membro: {loan.memberId} ·{' '}
                        {loan.observations}
                      </Typography>
                      {['ACTIVE', 'OVERDUE'].includes(loan.status) && (
                        <Stack direction="row">
                          <Can permission="LIBRARY_LOAN_RETURN">
                            <Button
                              onClick={() =>
                                open('Devolver exemplar', () =>
                                  api.returnLoan(loan.id),
                                )
                              }
                            >
                              Devolver
                            </Button>
                            <Button
                              color="error"
                              onClick={() =>
                                open(
                                  'Encerrar empréstimo',
                                  (v) =>
                                    api.closeLoan(loan.id, {
                                      status:
                                        v.status === 'LOST'
                                          ? 'LOST'
                                          : 'CANCELLED',
                                      justification: v.justification ?? '',
                                    }),
                                  [
                                    {
                                      name: 'status',
                                      label: 'Motivo',
                                      required: true,
                                      options: ['LOST', 'CANCELLED'],
                                    },
                                    justification,
                                  ],
                                )
                              }
                            >
                              Perda / cancelamento
                            </Button>
                          </Can>
                          {loan.status === 'ACTIVE' && (
                            <Can permission="LIBRARY_LOAN_RENEW">
                              <Button
                                onClick={() =>
                                  open('Renovar empréstimo', () =>
                                    api.renewLoan(loan.id),
                                  )
                                }
                              >
                                Renovar
                              </Button>
                            </Can>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Paged>
          )}
          {tab === 'fines' && fines.data && (
            <Paged total={fines.data.total} page={page} setPage={setPage}>
              {fines.data.items.map((fine) => (
                <Card key={fine.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6">
                        {fine.loan?.member.name} ·{' '}
                        {fine.loan?.bookCopy.book.title}
                      </Typography>
                      <Typography>
                        {<StatusChip status={fine.status} />} · Total{' '}
                        {fine.amount} · Pago {fine.paidAmount} · Ajustado{' '}
                        {fine.discount} · Saldo {api.fineBalance(fine)}
                      </Typography>
                      {fine.payments.map((p) => (
                        <Typography key={p.id} variant="body2">
                          Pagamento {p.amount} · {formatDate(p.createdAt)} ·{' '}
                          {p.createdBy}
                        </Typography>
                      ))}
                      {fine.adjustments.map((a) => (
                        <Typography key={a.id} variant="body2">
                          {a.kind} {a.amount} · {a.justification} ·{' '}
                          {formatDate(a.createdAt)} · {a.createdBy}
                        </Typography>
                      ))}
                      {fine.status === 'OPEN' && (
                        <Stack direction="row">
                          <Can permission="LIBRARY_FINE_PAY">
                            <Button
                              onClick={() => {
                                const idempotencyKey = crypto.randomUUID();
                                open(
                                  'Pagamento (total ou parcial)',
                                  (v) =>
                                    api.payFine(fine.id, {
                                      amount: v.amount ?? '',
                                      idempotencyKey,
                                    }),
                                  [
                                    {
                                      name: 'amount',
                                      label: 'Valor decimal (ex.: 1.50)',
                                      required: true,
                                    },
                                  ],
                                );
                              }}
                            >
                              Pagar
                            </Button>
                          </Can>
                          <Can permission="LIBRARY_FINE_ADJUST">
                            <Button
                              onClick={() =>
                                open(
                                  'Desconto',
                                  (v) =>
                                    api.adjustFine(fine.id, {
                                      kind: 'DISCOUNT',
                                      amount: v.amount ?? '',
                                      justification: v.justification ?? '',
                                    }),
                                  [
                                    {
                                      name: 'amount',
                                      label: 'Valor do desconto',
                                      required: true,
                                    },
                                    justification,
                                  ],
                                )
                              }
                            >
                              Desconto
                            </Button>
                            <Button
                              onClick={() =>
                                open(
                                  'Perdoar saldo da multa',
                                  (v) =>
                                    api.adjustFine(fine.id, {
                                      kind: 'FORGIVE',
                                      justification: v.justification ?? '',
                                    }),
                                  [justification],
                                )
                              }
                            >
                              Perdoar
                            </Button>
                            <Button
                              color="error"
                              onClick={() =>
                                open(
                                  'Cancelar saldo da multa',
                                  (v) =>
                                    api.adjustFine(fine.id, {
                                      kind: 'CANCEL',
                                      justification: v.justification ?? '',
                                    }),
                                  [justification],
                                )
                              }
                            >
                              Cancelar multa
                            </Button>
                          </Can>
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Paged>
          )}
          {tab === 'reservations' && reservations.data && (
            <Paged
              total={reservations.data.total}
              page={page}
              setPage={setPage}
            >
              {reservations.data.items.map((r) => (
                <Card key={r.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="h6">
                        {r.book.title} · {r.member.name} ·{' '}
                        <StatusChip status={r.status} />
                      </Typography>
                      <Typography>
                        Fila criada {formatDate(r.createdAt)} · Expira{' '}
                        {formatDate(r.holdUntil ?? r.expiresAt)} · Exemplar{' '}
                        {r.bookCopy?.assetCode ?? 'aguardando'}
                      </Typography>
                      {['WAITING', 'READY'].includes(r.status) && (
                        <Can permission="LIBRARY_RESERVATION_CANCEL">
                          <Button
                            onClick={() =>
                              open(
                                'Cancelar reserva e promover próximo membro',
                                () => api.cancelReservation(r.id),
                              )
                            }
                          >
                            Cancelar reserva
                          </Button>
                        </Can>
                      )}
                      {r.status === 'READY' && r.bookCopyId && (
                        <Can permission="LIBRARY_LOAN_CREATE">
                          <Button
                            onClick={() =>
                              open('Emprestar exemplar reservado', () =>
                                api.borrow({
                                  memberId: r.memberId,
                                  bookCopyId: r.bookCopyId!,
                                }),
                              )
                            }
                          >
                            Emprestar reserva
                          </Button>
                        </Can>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Paged>
          )}
          {tab === 'settings' && settings.data && (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Typography>
                    Prazo: {settings.data.defaultLoanDays} dias · Limite:{' '}
                    {settings.data.maxBooks} livros · Renovações:{' '}
                    {settings.data.maxRenewals}
                  </Typography>
                  <Typography>
                    Carência: {settings.data.graceDays} dias · Multa diária:{' '}
                    {settings.data.dailyFine} · Bloquear atrasados:{' '}
                    {settings.data.blockOverdue ? 'Sim' : 'Não'}
                  </Typography>
                  <Typography>
                    Retirada reservada: {settings.data.holdDays} dias · Validade
                    da fila: {settings.data.reservationDays} dias · Calendário
                    UTC
                  </Typography>
                  <Can permission="LIBRARY_SETTINGS_UPDATE">
                    <Button
                      onClick={() =>
                        open(
                          'Configurações da biblioteca',
                          (v) =>
                            api.updateLibrarySettings({
                              defaultLoanDays: Number(v.defaultLoanDays),
                              maxBooks: Number(v.maxBooks),
                              maxRenewals: Number(v.maxRenewals),
                              graceDays: Number(v.graceDays),
                              dailyFine: v.dailyFine ?? '',
                              blockOverdue: v.blockOverdue === 'true',
                              holdDays: Number(v.holdDays),
                              reservationDays: Number(v.reservationDays),
                            }),
                          [
                            {
                              name: 'defaultLoanDays',
                              label: 'Prazo de empréstimo (dias)',
                              type: 'number',
                              required: true,
                            },
                            {
                              name: 'maxBooks',
                              label: 'Limite de livros por membro',
                              type: 'number',
                              required: true,
                            },
                            {
                              name: 'maxRenewals',
                              label: 'Limite de renovações',
                              type: 'number',
                              required: true,
                            },
                            {
                              name: 'graceDays',
                              label: 'Carência (dias)',
                              type: 'number',
                              required: true,
                            },
                            {
                              name: 'dailyFine',
                              label: 'Multa diária decimal',
                              required: true,
                            },
                            {
                              name: 'blockOverdue',
                              label: 'Bloquear atrasados',
                              options: ['true', 'false'],
                              required: true,
                            },
                            {
                              name: 'holdDays',
                              label: 'Prazo de retirada (dias)',
                              type: 'number',
                              required: true,
                            },
                            {
                              name: 'reservationDays',
                              label: 'Validade da fila (dias)',
                              type: 'number',
                              required: true,
                            },
                          ],
                          valuesOf(settings.data!),
                        )
                      }
                    >
                      Editar configurações
                    </Button>
                  </Can>
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {action && (
        <ActionDialog
          onSaved={() => setNotice('Operação concluída com sucesso.')}
          action={action}
          close={() => setAction(undefined)}
        />
      )}
      {copyHistory && (
        <CopyHistoryDialog
          id={copyHistory}
          close={() => setCopyHistory(undefined)}
        />
      )}
      {historyMember && (
        <Dialog
          open
          fullWidth
          maxWidth="md"
          onClose={() => setHistoryMember(undefined)}
        >
          <DialogTitle>Histórico da biblioteca do membro</DialogTitle>
          <DialogContent>
            <MemberLibraryHistory memberId={historyMember} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHistoryMember(undefined)}>Fechar</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}
