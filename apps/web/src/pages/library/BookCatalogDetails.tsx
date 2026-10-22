import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TablePagination,
  Typography,
} from '@mui/material';
import { QueryError } from '../../components/PageParts';
import { RecordRow, RecordTable } from '../../components/RecordTable';
import { StatusChip } from '../../components/DataPresentation';
import { formatDate } from '../../lib/format';
import { getBook, getBookHistory } from '../../lib/library-api';

export function BookCover({
  title,
  cover,
}: {
  title: string;
  cover?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  return cover && !failed ? (
    <Box
      component="img"
      src={cover}
      alt={`Capa de ${title}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      sx={{ width: 88, height: 128, objectFit: 'contain', borderRadius: 1 }}
    />
  ) : (
    <Box
      sx={{
        width: 88,
        height: 128,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'action.hover',
        borderRadius: 1,
        p: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary" textAlign="center">
        Sem capa
      </Typography>
    </Box>
  );
}

export function BookCatalogDetails({
  id,
  historyOnly = false,
  close,
}: {
  id: string;
  historyOnly?: boolean;
  close: () => void;
}) {
  const [page, setPage] = useState(0);
  const book = useQuery({
    queryKey: ['library', 'book', id],
    queryFn: () => getBook(id),
  });
  const history = useQuery({
    queryKey: ['library', 'book-history', id, page],
    queryFn: () => getBookHistory(id, { page: page + 1, pageSize: 20 }),
  });
  return (
    <Dialog
      open
      onClose={close}
      fullWidth
      maxWidth="md"
      aria-labelledby="catalog-book-title"
    >
      <DialogTitle id="catalog-book-title">
        {historyOnly ? 'Histórico de empréstimos' : 'Detalhes do livro'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {book.isPending && (
            <Typography role="status">Carregando livro...</Typography>
          )}
          {book.isError && (
            <QueryError
              error={book.error}
              onRetry={() => void book.refetch()}
            />
          )}
          {book.data && (
            <>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <BookCover
                  key={book.data.cover}
                  title={book.data.title}
                  cover={book.data.cover}
                />
                <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Typography variant="h6">{book.data.title}</Typography>
                  <Typography>{book.data.subtitle}</Typography>
                  <Typography>{book.data.author}</Typography>
                </Box>
              </Stack>
              {!historyOnly && (
                <>
                  <Typography
                    sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {book.data.description || 'Sem descrição.'}
                  </Typography>
                  <Box
                    component="dl"
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
                      gap: 1,
                      '& dt': { fontWeight: 600 },
                      '& dd': { m: 0, overflowWrap: 'anywhere' },
                    }}
                  >
                    {[
                      ['ISBN', book.data.isbn],
                      ['Editora', book.data.publisher],
                      ['Edição', book.data.edition],
                      ['Ano', book.data.year],
                      ['Idioma', book.data.language],
                      ['Páginas', book.data.pages],
                      ['Categoria', book.data.category],
                      ['Palavras-chave', book.data.keywords?.join(', ')],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ display: 'contents' }}>
                        <Typography component="dt">{label}</Typography>
                        <Typography component="dd">
                          {value === '' || value == null
                            ? 'Não informado'
                            : value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </>
          )}
          <Typography variant="h6">
            Histórico de empréstimos do livro
          </Typography>
          {history.isPending && (
            <Typography role="status">Carregando histórico...</Typography>
          )}
          {history.isError && (
            <QueryError
              error={history.error}
              onRetry={() => void history.refetch()}
            />
          )}
          {history.data && (
            <>
              {history.data.total === 0 ? (
                <Typography>
                  Este livro ainda não possui empréstimos.
                </Typography>
              ) : (
                <RecordTable
                  label="Histórico de empréstimos do livro"
                  primaryLabel="Empréstimo"
                  hasActions={false}
                >
                  {history.data.items.map((loan) => (
                    <RecordRow
                      key={loan.id}
                      hasActions={false}
                      primary={
                        <Typography>{formatDate(loan.borrowedAt)}</Typography>
                      }
                    >
                      <StatusChip status={loan.status} />
                      <Typography>
                        Prazo de devolução: {formatDate(loan.dueAt)}
                      </Typography>
                      <Typography>
                        Devolução:{' '}
                        {loan.returnedAt
                          ? formatDate(loan.returnedAt)
                          : 'Não devolvido'}
                      </Typography>
                      <Typography>Renovações: {loan.renewedCount}</Typography>
                    </RecordRow>
                  ))}
                </RecordTable>
              )}
              <TablePagination
                component="div"
                count={history.data.total}
                page={page}
                rowsPerPage={20}
                rowsPerPageOptions={[20]}
                labelRowsPerPage="Por página"
                onPageChange={(_, next) => setPage(next)}
                getItemAriaLabel={(type) =>
                  type === 'next'
                    ? 'Próxima página do histórico'
                    : 'Página anterior do histórico'
                }
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
