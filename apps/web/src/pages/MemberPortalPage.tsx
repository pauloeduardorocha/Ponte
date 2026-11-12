import { t as translate, useLocale } from '../i18n';
import { BookCatalogDetails, BookCover } from './library/BookCatalogDetails';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../auth/auth-context';
import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';

import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api';

import { errorMessage } from '../lib/errors';

import { RecordTable, RecordRow } from '../components/RecordTable';

import { PageHeader, QueryError } from '../components/PageParts';

import { useDebouncedValue } from '../lib/use-debounced-value';
import { useBookAvailability } from '../lib/use-book-availability';

type Resource = 'events' | 'small-groups' | 'ministries' | 'books';

type Entry = {
  id: string;
  name?: string;
  title?: string;
  author?: string | null;
  registrationNumber?: string | null;
  collection?: string | null;
  pendingInventory?: number;
  category?: string | null;
  primaryCategoryCode?: string | null;
  classificationReviewed?: boolean;
  cover?: string | null;
  quantity?: number;
  available?: number;
  description?: string;
  location?: string;
  startsAt?: string;
  canViewDetails?: boolean;
  leader?: { name: string };
  members?: { member: { id: string; name: string } }[];
  address?: string;
  meetingDay?: number;
  meetingTime?: string;
};

const titles = {
  get events() {
    return translate('Agenda de eventos');
  },
  get 'small-groups'() {
    return translate('Grupos familiares');
  },
  get ministries() {
    return translate('Ministérios');
  },
  get books() {
    return translate('Biblioteca');
  },
};

export function MemberPortalPage({ resource }: { resource: Resource }) {
  useLocale();
  const client = useQueryClient();
  const { hasPermission } = useAuth();
  const managePermission = {
    events: 'EVENT_READ',
    'small-groups': 'SMALL_GROUP_READ',
    ministries: 'MINISTRY_READ',
    books: 'LIBRARY_LOAN_READ',
  } as const;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(resource === 'books' ? 10 : 25);

  const [search, setSearch] = useState('');

  const debounced = useDebouncedValue(search);

  const [selectedBook, setSelectedBook] = useState<{
    id: string;
    historyOnly: boolean;
  }>();

  const [groupId, setGroupId] = useState<string>();

  const data = useQuery({
    queryKey: ['member-portal', resource, page, pageSize, debounced],
    queryFn: () =>
      apiRequest<{ items: Entry[]; total: number }>(
        resource === 'books' ? '/library/books' : `/member-portal/${resource}`,
        { query: { page: page + 1, pageSize, search: debounced } },
      ),
  });

  const detail = useQuery({
    queryKey: ['member-portal', 'group', groupId],
    queryFn: () => apiRequest<Entry>(`/member-portal/small-groups/${groupId}`),
    enabled: !!groupId,
  });
  const availability = useBookAvailability(
    data.data?.items.map((entry) => entry.id) ?? [],
    resource === 'books',
  );

  const reserve = useMutation({
    mutationFn: (bookId: string) =>
      apiRequest('/member-portal/reservations', {
        method: 'POST',
        body: { bookId },
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['library'] }),
        client.invalidateQueries({ queryKey: ['member-portal'] }),
      ]),
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title={titles[resource]}
        actions={
          resource !== 'books' &&
          (resource === 'ministries' ||
            hasPermission(managePermission[resource])) ? (
            <Button component={Link} to={`/${resource}`}>
              {translate('Gerenciar')}
            </Button>
          ) : undefined
        }
      />

      <TextField
        label={translate('Pesquisar por nome')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />

      {data.isPending && (
        <Typography role="status">{translate('Carregando...')}</Typography>
      )}

      {data.isError && (
        <QueryError error={data.error} onRetry={() => void data.refetch()} />
      )}

      {reserve.isError && (
        <Alert severity="error">{errorMessage(reserve.error)}</Alert>
      )}

      {reserve.isSuccess && (
        <Alert severity="success">{translate('Reserva realizada.')}</Alert>
      )}

      {data.data && (
        <>
          {data.data.items.length === 0 && (
            <Typography>{translate('Nenhum registro encontrado.')}</Typography>
          )}

          <RecordTable
            imageLabel={resource === 'books' ? translate('Capa') : undefined}
          >
            {data.data.items.map((entry) => (
              <RecordRow
                key={entry.id}
                image={
                  resource === 'books' ? (
                    <BookCover
                      key={entry.cover}
                      title={entry.title ?? ''}
                      cover={entry.cover}
                    />
                  ) : undefined
                }
                primary={
                  <Typography fontWeight={600}>
                    {entry.name ?? entry.title}
                  </Typography>
                }
                actions={
                  <>
                    {resource === 'ministries' && (
                      <Button
                        component={Link}
                        to={`/schedules?ministryId=${entry.id}`}
                      >
                        {translate('Ver escalas')}
                      </Button>
                    )}
                    {resource === 'events' && (
                      <Button
                        component={Link}
                        to={`/events/${entry.id}/register`}
                      >
                        {translate('Ver evento e inscrever-se')}
                      </Button>
                    )}

                    {resource === 'books' && (
                      <>
                        <Button
                          onClick={() =>
                            setSelectedBook({
                              id: entry.id,
                              historyOnly: false,
                            })
                          }
                        >
                          {translate('Ver detalhes')}
                        </Button>
                        <Button
                          onClick={() =>
                            setSelectedBook({ id: entry.id, historyOnly: true })
                          }
                        >
                          {translate('Histórico de empréstimos')}
                        </Button>
                      </>
                    )}
                    {resource === 'books' &&
                      hasPermission('LIBRARY_SELF_RESERVE') && (
                        <Button
                          disabled={reserve.isPending}
                          onClick={() => reserve.mutate(entry.id)}
                        >
                          {translate('Reservar')}
                        </Button>
                      )}

                    {entry.canViewDetails && (
                      <Button onClick={() => setGroupId(entry.id)}>
                        {translate('Detalhes do meu grupo')}
                      </Button>
                    )}
                  </>
                }
              >
                {resource === 'books' && (
                  <Typography>
                    {translate('Exemplares:')}{' '}
                    {availability.isError
                      ? '—'
                      : (availability.values.get(entry.id)?.quantity ??
                        '—')}{' '}
                    {translate('· Disponíveis:')}{' '}
                    {availability.isFetching
                      ? translate('Verificando…')
                      : availability.isError
                        ? translate('Indisponível para consulta')
                        : (availability.values.get(entry.id)?.available ??
                          translate('Não informado'))}
                  </Typography>
                )}
                {resource === 'books' && (
                  <>
                    <Typography>
                      {entry.author ?? translate('Autor não informado')}
                    </Typography>
                    {entry.category && (
                      <Typography>
                        {entry.category}
                        {entry.primaryCategoryCode &&
                        !entry.classificationReviewed
                          ? ' · Proposta por rever'
                          : ''}
                      </Typography>
                    )}
                    {entry.registrationNumber && (
                      <Typography>
                        {translate('Registo: ')}
                        {entry.registrationNumber}
                      </Typography>
                    )}
                    {entry.collection && (
                      <Typography>
                        {translate('Coleção: ')}
                        {entry.collection}
                      </Typography>
                    )}
                    {Boolean(entry.pendingInventory) && (
                      <Typography>
                        {translate('Por conferir: ')}
                        {entry.pendingInventory}
                      </Typography>
                    )}
                  </>
                )}
                {resource !== 'books' && entry.author && (
                  <Typography>{entry.author}</Typography>
                )}

                {entry.startsAt && (
                  <Typography>
                    {formatDateTime(entry.startsAt)} · {entry.location}
                  </Typography>
                )}

                {entry.description && (
                  <Typography>{entry.description}</Typography>
                )}

                {entry.leader && (
                  <Typography>
                    {translate('Líder: ')}
                    {entry.leader.name}
                  </Typography>
                )}

                {entry.members && (
                  <Typography>
                    {translate('Integrantes:')}{' '}
                    {entry.members.map((m) => m.member.name).join(', ') ||
                      translate('Nenhum integrante')}
                  </Typography>
                )}
              </RecordRow>
            ))}
          </RecordTable>

          <TablePagination
            component="div"
            count={data.data.total}
            page={page}
            rowsPerPage={pageSize}
            rowsPerPageOptions={resource === 'books' ? [10, 20, 50, 100] : [25]}
            onRowsPerPageChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
            onPageChange={(_, next) => setPage(next)}
            labelRowsPerPage={translate('Por página')}
          />
        </>
      )}

      {selectedBook && (
        <BookCatalogDetails
          key={selectedBook.id}
          {...selectedBook}
          close={() => setSelectedBook(undefined)}
        />
      )}
      <Dialog open={!!groupId} onClose={() => setGroupId(undefined)} fullWidth>
        <DialogTitle>
          {detail.data?.name ?? translate('Meu grupo familiar')}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {detail.isPending && (
              <Typography role="status">
                {translate('Carregando...')}
              </Typography>
            )}

            {detail.isError && (
              <QueryError
                error={detail.error}
                onRetry={() => void detail.refetch()}
              />
            )}

            {detail.data && (
              <>
                <Typography>{detail.data.description}</Typography>
                <Typography>
                  {translate('Endereço: ')}
                  {detail.data.address}
                </Typography>
                <Typography>
                  {translate('Encontro:')}{' '}
                  {
                    [
                      translate('Domingo'),
                      translate('Segunda-feira'),
                      translate('Terça-feira'),
                      translate('Quarta-feira'),
                      translate('Quinta-feira'),
                      translate('Sexta-feira'),
                      translate('Sábado'),
                    ][detail.data.meetingDay ?? 0]
                  }{' '}
                  {translate('às ')}
                  {detail.data.meetingTime}
                </Typography>
                <Typography>
                  {translate('Integrantes:')}{' '}
                  {detail.data.members?.map((m) => m.member.name).join(', ')}
                </Typography>
              </>
            )}

            <Button onClick={() => setGroupId(undefined)}>
              {translate('Fechar')}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
