import { BookCatalogDetails, BookCover } from './library/BookCatalogDetails';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../auth/auth-context';
import { useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';

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
  events: 'Agenda de eventos',
  'small-groups': 'Grupos familiares',
  ministries: 'Ministérios',
  books: 'Biblioteca',
};

export function MemberPortalPage({ resource }: { resource: Resource }) {
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

  const reserve = useMutation({
    mutationFn: (bookId: string) =>
      apiRequest('/member-portal/reservations', {
        method: 'POST',
        body: { bookId },
      }),
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
              Gerenciar
            </Button>
          ) : undefined
        }
      />

      <TextField
        label="Pesquisar por nome"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />

      {data.isPending && <Typography role="status">Carregando...</Typography>}

      {data.isError && (
        <QueryError error={data.error} onRetry={() => void data.refetch()} />
      )}

      {reserve.isError && (
        <Alert severity="error">{errorMessage(reserve.error)}</Alert>
      )}

      {reserve.isSuccess && (
        <Alert severity="success">Reserva realizada.</Alert>
      )}

      {data.data && (
        <>
          {data.data.items.length === 0 && (
            <Typography>Nenhum registro encontrado.</Typography>
          )}

          <RecordTable imageLabel={resource === 'books' ? 'Capa' : undefined}>
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
                        Ver escalas
                      </Button>
                    )}
                    {resource === 'events' && (
                      <Button
                        component={Link}
                        to={`/events/${entry.id}/register`}
                      >
                        Ver evento e inscrever-se
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
                          Ver detalhes
                        </Button>
                        <Button
                          onClick={() =>
                            setSelectedBook({ id: entry.id, historyOnly: true })
                          }
                        >
                          Histórico de empréstimos
                        </Button>
                      </>
                    )}
                    {resource === 'books' &&
                      hasPermission('LIBRARY_SELF_RESERVE') && (
                        <Button
                          disabled={reserve.isPending}
                          onClick={() => reserve.mutate(entry.id)}
                        >
                          Reservar
                        </Button>
                      )}

                    {entry.canViewDetails && (
                      <Button onClick={() => setGroupId(entry.id)}>
                        Detalhes do meu grupo
                      </Button>
                    )}
                  </>
                }
              >
                {resource === 'books' && (
                  <Typography>
                    Exemplares: {entry.quantity ?? 0} · Disponíveis:{' '}
                    {entry.available ?? 0}
                  </Typography>
                )}
                {resource === 'books' && (
                  <>
                    <Typography>
                      {entry.author ?? 'Autor não informado'}
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
                        Registo: {entry.registrationNumber}
                      </Typography>
                    )}
                    {entry.collection && (
                      <Typography>Coleção: {entry.collection}</Typography>
                    )}
                    {Boolean(entry.pendingInventory) && (
                      <Typography>
                        Por conferir: {entry.pendingInventory}
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
                  <Typography>Líder: {entry.leader.name}</Typography>
                )}

                {entry.members && (
                  <Typography>
                    Integrantes:{' '}
                    {entry.members.map((m) => m.member.name).join(', ') ||
                      'Nenhum integrante'}
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
            labelRowsPerPage="Por página"
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
        <DialogTitle>{detail.data?.name ?? 'Meu grupo familiar'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            {detail.isPending && (
              <Typography role="status">Carregando...</Typography>
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
                <Typography>Endereço: {detail.data.address}</Typography>
                <Typography>
                  Encontro:{' '}
                  {
                    [
                      'Domingo',
                      'Segunda-feira',
                      'Terça-feira',
                      'Quarta-feira',
                      'Quinta-feira',
                      'Sexta-feira',
                      'Sábado',
                    ][detail.data.meetingDay ?? 0]
                  }{' '}
                  às {detail.data.meetingTime}
                </Typography>
                <Typography>
                  Integrantes:{' '}
                  {detail.data.members?.map((m) => m.member.name).join(', ')}
                </Typography>
              </>
            )}

            <Button onClick={() => setGroupId(undefined)}>Fechar</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
