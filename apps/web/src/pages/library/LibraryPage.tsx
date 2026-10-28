import { LocalizedTextField as TextField } from '../../components/LocalizedTextField';
import { BookCatalogDetails } from './BookCatalogDetails';
import { MemberPortalPage } from '../MemberPortalPage';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { EntitySelect } from '../../components/EntitySelect';
import { LibraryDashboardPanel } from './LibraryDashboardPanel';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useAuth } from '../../auth/auth-context';
import { Can } from '../../auth/guards';
import { PageHeader, QueryError } from '../../components/PageParts';
import * as api from '../../lib/library-api';
import { MemberLibraryHistory } from './LibraryHistory';
import {
  type Field,
  type Action,
  memberField,
  bookFields,
  bookInput,
} from './library-actions';
import { Paged } from './LibraryPaged';
import { CatalogPanel } from './CatalogPanel';
import { CopiesPanel } from './CopiesPanel';
import { LoansPanel } from './LoansPanel';
import { FinesPanel } from './FinesPanel';
import { ReservationsPanel } from './ReservationsPanel';
import { SettingsPanel } from './SettingsPanel';
import { ActionDialog } from './LibraryActionDialog';
import { CopyHistoryDialog } from './CopyHistoryDialog';

export function LibraryPage() {
  const { user } = useAuth();
  if (!user?.permissions.some((p) => p.startsWith('LIBRARY_')))
    return (
      <Alert severity="warning">
        Você não tem permissão para consultar a biblioteca.
      </Alert>
    );
  const managesLibrary = user?.permissions.some(
    (p) =>
      p.startsWith('LIBRARY_') &&
      p !== 'LIBRARY_BOOK_READ' &&
      p !== 'LIBRARY_SELF_RESERVE',
  );
  return managesLibrary ? (
    <LibraryManagementPage />
  ) : (
    <MemberPortalPage resource="books" />
  );
}
function LibraryManagementPage() {
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
  const [pageSize, setPageSize] = useState(10);
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
  const [detailBook, setDetailBook] = useState<api.Book>();
  const [historyMember, setHistoryMember] = useState<string>();
  const books = useQuery({
    queryKey: [
      'library',
      'books',
      page,
      pageSize,
      search,
      author,
      category,
      available,
    ],
    queryFn: () =>
      api.listBooks({ page, pageSize, search, author, category, available }),
    enabled: tab === 'catalog',
  });
  const copies = useQuery({
    queryKey: ['library', 'copies', page, pageSize, search, bookId, status],
    queryFn: () => api.listCopies({ page, pageSize, search, bookId, status }),
    enabled: tab === 'copies',
  });
  const loans = useQuery({
    queryKey: ['library', 'loans', page, pageSize, memberId, bookId, status],
    queryFn: () => api.listLoans({ page, pageSize, memberId, bookId, status }),
    enabled: tab === 'loans',
  });
  const fines = useQuery({
    queryKey: ['library', 'fines', page, pageSize, memberId, bookId],
    queryFn: () => api.listFines({ page, pageSize, memberId, bookId }),
    enabled: tab === 'fines',
  });
  const reservations = useQuery({
    queryKey: ['library', 'reservations', page, pageSize, memberId, bookId],
    queryFn: () => api.listReservations({ page, pageSize, memberId, bookId }),
    enabled: tab === 'reservations',
  });
  const settings = useQuery({
    queryKey: ['library', 'settings'],
    queryFn: api.getLibrarySettings,
    enabled: tab === 'settings',
  });
  const members = useQuery({
    queryKey: ['library', 'members', page, pageSize, search],
    queryFn: () => api.listLibraryMembers({ page, pageSize, search }),
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
                  <EntitySelect
                    endpoint="/library/book-options/authors"
                    label="Autor"
                    value={author}
                    onChange={(e) => filter(setAuthor, e.target.value)}
                  />
                  <EntitySelect
                    endpoint="/library/book-options/categories"
                    label="Categoria"
                    value={category}
                    onChange={(e) => filter(setCategory, e.target.value)}
                  />
                  <Autocomplete
                    options={['true', 'false']}
                    getOptionLabel={(value) =>
                      value === 'true' ? 'Disponível' : 'Indisponível'
                    }
                    value={available || null}
                    onChange={(_, value) => filter(setAvailable, value ?? '')}
                    sx={{ minWidth: 180 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Disponibilidade"
                        placeholder="Todos"
                      />
                    )}
                  />
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
                      <Autocomplete
                        value={status || null}
                        onChange={(_, value) => filter(setStatus, value ?? '')}
                        sx={{ minWidth: 180 }}
                        options={
                          tab === 'copies'
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
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Status"
                            placeholder="Todos"
                          />
                        )}
                      />
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
            <Paged
              total={members.data.total}
              page={page}
              setPage={setPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
            >
              <RecordTable
                primaryLabel="Membro"
                label={'Membros da biblioteca'}
              >
                {members.data.items.map((member) => (
                  <RecordRow
                    key={member.id}
                    primary={
                      <>
                        <Typography>
                          {member.name} · {member.status}
                        </Typography>
                      </>
                    }
                    actions={
                      <>
                        <Button onClick={() => setHistoryMember(member.id)}>
                          Histórico da biblioteca
                        </Button>
                      </>
                    }
                  >
                    <Typography variant="caption">
                      ID do membro: {member.id}
                    </Typography>
                  </RecordRow>
                ))}
              </RecordTable>
            </Paged>
          )}
          {tab === 'catalog' && books.data && (
            <CatalogPanel
              books={books.data}
              page={page}
              pageSize={pageSize}
              setPage={setPage}
              setPageSize={setPageSize}
              open={open}
              setDetailBook={setDetailBook}
            />
          )}
          {tab === 'copies' && copies.data && (
            <CopiesPanel
              copies={copies.data}
              page={page}
              pageSize={pageSize}
              setPage={setPage}
              setPageSize={setPageSize}
              open={open}
              setCopyHistory={setCopyHistory}
            />
          )}
          {tab === 'loans' && loans.data && (
            <LoansPanel
              loans={loans.data}
              page={page}
              pageSize={pageSize}
              setPage={setPage}
              setPageSize={setPageSize}
              open={open}
            />
          )}
          {tab === 'fines' && fines.data && (
            <FinesPanel
              fines={fines.data}
              page={page}
              pageSize={pageSize}
              setPage={setPage}
              setPageSize={setPageSize}
              open={open}
            />
          )}
          {tab === 'reservations' && reservations.data && (
            <ReservationsPanel
              reservations={reservations.data}
              page={page}
              pageSize={pageSize}
              setPage={setPage}
              setPageSize={setPageSize}
              open={open}
            />
          )}
          {tab === 'settings' && settings.data && (
            <SettingsPanel settings={settings.data} open={open} />
          )}
        </>
      )}
      {detailBook && (
        <BookCatalogDetails
          id={detailBook.id}
          close={() => setDetailBook(undefined)}
        />
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
