import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  EditRounded,
  SearchRounded,
  VisibilityRounded,
} from '@mui/icons-material';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { Can } from '../../auth/guards';
import { PageHeader, QueryError } from '../../components/PageParts';
import { formatDate } from '../../lib/format';
import { listMembers } from '../../lib/members-api';
import type {
  MemberListParams,
  MemberSortBy,
  MemberStatus,
  SortOrder,
} from '../../lib/types';
import { MemberStatusChip } from './MemberStatusChip';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;
const SORTABLE: MemberSortBy[] = ['name', 'email', 'createdAt'];
const STATUSES: MemberStatus[] = ['ACTIVE', 'INACTIVE'];

function readParams(params: URLSearchParams): MemberListParams {
  const status = params.get('status') as MemberStatus | null;
  const sortBy = params.get('sortBy') as MemberSortBy | null;
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));

  return {
    search: params.get('search') ?? '',
    status: status && STATUSES.includes(status) ? status : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
    sortBy: sortBy && SORTABLE.includes(sortBy) ? sortBy : 'name',
    sortOrder: params.get('sortOrder') === 'desc' ? 'desc' : 'asc',
  };
}

export function MembersListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => readParams(searchParams), [searchParams]);
  const [searchInput, setSearchInput] = useState(query.search ?? '');

  function updateParams(changes: Record<string, string | number | undefined>) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined || value === '') {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
        }
        return next;
      },
      { replace: true, state: location.state },
    );
  }

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === (query.search ?? '')) {
      return;
    }
    const timer = setTimeout(
      () => updateParams({ search: trimmed, page: undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
    // updateParams is recreated each render; the debounce depends on values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, query.search]);

  const members = useQuery({
    queryKey: ['members', query],
    queryFn: () => listMembers(query),
    placeholderData: keepPreviousData,
  });

  function toggleSort(column: MemberSortBy) {
    const sortOrder: SortOrder =
      query.sortBy === column && query.sortOrder === 'asc' ? 'desc' : 'asc';
    updateParams({ sortBy: column, sortOrder, page: undefined });
  }

  function sortableHeader(column: MemberSortBy, label: string) {
    return (
      <TableCell
        sortDirection={query.sortBy === column ? query.sortOrder : false}
      >
        <TableSortLabel
          active={query.sortBy === column}
          direction={query.sortBy === column ? query.sortOrder : 'asc'}
          onClick={() => toggleSort(column)}
        >
          {label}
        </TableSortLabel>
      </TableCell>
    );
  }

  const items = members.data?.items ?? [];

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Membros"
        subtitle="Consulte e mantenha o cadastro de membros da igreja."
        actions={
          <Can permission="MEMBER_CREATE">
            <Button
              component={RouterLink}
              to="/members/new"
              variant="contained"
              startIcon={<AddRounded />}
            >
              Novo membro
            </Button>
          </Can>
        }
      />

      {notice && <Alert severity="success">{notice}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Buscar"
          placeholder="Nome, e-mail ou telefone"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ flexGrow: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          label="Status"
          value={query.status ?? ''}
          onChange={(event) =>
            updateParams({ status: event.target.value, page: undefined })
          }
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="ACTIVE">Ativos</MenuItem>
          <MenuItem value="INACTIVE">Inativos</MenuItem>
        </TextField>
      </Stack>

      {members.isError && (
        <QueryError
          error={members.error}
          onRetry={() => void members.refetch()}
        />
      )}

      <Card variant="outlined">
        <TableContainer>
          <Table aria-label="Lista de membros">
            <TableHead>
              <TableRow>
                {sortableHeader('name', 'Nome')}
                {sortableHeader('email', 'E-mail')}
                <TableCell>Telefone</TableCell>
                <TableCell>Status</TableCell>
                {sortableHeader('createdAt', 'Cadastrado em')}
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.isPending && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress size={24} aria-label="Carregando" />
                  </TableCell>
                </TableRow>
              )}
              {members.isSuccess && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Box className="empty-state">
                      <Typography fontWeight={600}>
                        Nenhum membro encontrado
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ajuste os filtros ou cadastre um novo membro.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
              {items.map((member) => (
                <TableRow
                  key={member.id}
                  hover
                  className="clickable-row"
                  onClick={() => navigate(`/members/${member.id}`)}
                >
                  <TableCell>{member.name}</TableCell>
                  <TableCell>{member.email ?? '—'}</TableCell>
                  <TableCell>{member.phone ?? '—'}</TableCell>
                  <TableCell>
                    <MemberStatusChip status={member.status} />
                  </TableCell>
                  <TableCell>{formatDate(member.createdAt)}</TableCell>
                  <TableCell
                    align="right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Tooltip title="Ver detalhes">
                      <IconButton
                        component={RouterLink}
                        to={`/members/${member.id}`}
                        aria-label={`Ver ${member.name}`}
                        size="small"
                      >
                        <VisibilityRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Can permission="MEMBER_UPDATE">
                      <Tooltip title="Editar">
                        <IconButton
                          component={RouterLink}
                          to={`/members/${member.id}/edit`}
                          aria-label={`Editar ${member.name}`}
                          size="small"
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={members.data?.total ?? 0}
          page={query.page - 1}
          rowsPerPage={query.pageSize}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(_, next) => updateParams({ page: next + 1 })}
          onRowsPerPageChange={(event) =>
            updateParams({ pageSize: event.target.value, page: undefined })
          }
          labelRowsPerPage="Itens por página"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count}`
          }
        />
      </Card>
    </Stack>
  );
}
