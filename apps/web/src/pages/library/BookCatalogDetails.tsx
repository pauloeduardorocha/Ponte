import { t as translate, useLocale } from '../../i18n';
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
  useLocale();
  const [failed, setFailed] = useState(false);
  return cover && !failed ? (
    <Box
      component="img"
      src={cover}
      alt={translate('Capa de {0}', [title])}
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
        {translate('Sem capa')}
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
  useLocale();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const book = useQuery({
    queryKey: ['library', 'book', id],
    queryFn: () => getBook(id),
  });
  const history = useQuery({
    queryKey: ['library', 'book-history', id, page, pageSize],
    queryFn: () => getBookHistory(id, { page: page + 1, pageSize }),
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
        {historyOnly
          ? translate('Histórico de empréstimos')
          : translate('Detalhes do livro')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {book.isPending && (
            <Typography role="status">
              {translate('Carregando livro...')}
            </Typography>
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
                  <Typography>
                    {book.data.author ?? translate('Autor não informado')}
                  </Typography>
                </Box>
              </Stack>
              {!historyOnly && book.data.categories?.length ? (
                <Stack spacing={0.5}>
                  {book.data.categories.map((item) => (
                    <Typography key={item.categoryCode} variant="body2">
                      {item.categoryCode} — {item.category.name} ·{' '}
                      {item.isPrimary
                        ? translate('Tema principal')
                        : translate('Outro tema')}
                      {item.reviewedAt ? ' · Revisto' : ' · Proposta por rever'}
                    </Typography>
                  ))}
                </Stack>
              ) : null}
              {Boolean(book.data.pendingInventory) && (
                <Typography>
                  {translate('Exemplares por conferir: ')}
                  {book.data.pendingInventory}
                </Typography>
              )}
              {!historyOnly && (
                <>
                  <Typography
                    sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {book.data.description || translate('Sem descrição.')}
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
                      [
                        translate('Número de registo'),
                        book.data.registrationNumber,
                      ],
                      [translate('Coleção'), book.data.collection],
                      [translate('Cotas'), book.data.shelfmarks?.join(', ')],
                      ['ISBN', book.data.isbn],
                      [translate('Editora'), book.data.publisher],
                      [translate('Edição'), book.data.edition],
                      [translate('Ano'), book.data.year],
                      [
                        translate('Idioma'),
                        book.data.language === 'und'
                          ? translate('Não informado')
                          : book.data.language,
                      ],
                      [translate('Páginas'), book.data.pages],
                      [translate('Categoria'), book.data.category],
                      [
                        translate('Palavras-chave'),
                        book.data.keywords?.join(', '),
                      ],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ display: 'contents' }}>
                        <Typography component="dt">{label}</Typography>
                        <Typography component="dd">
                          {value === '' || value == null
                            ? translate('Não informado')
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
            {translate('Histórico de empréstimos do livro')}
          </Typography>
          {history.isPending && (
            <Typography role="status">
              {translate('Carregando histórico...')}
            </Typography>
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
                  {translate('Este livro ainda não possui empréstimos.')}
                </Typography>
              ) : (
                <RecordTable
                  label={translate('Histórico de empréstimos do livro')}
                  primaryLabel={translate('Empréstimo')}
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
                        {translate('Prazo de devolução: ')}
                        {formatDate(loan.dueAt)}
                      </Typography>
                      <Typography>
                        {translate('Devolução:')}{' '}
                        {loan.returnedAt
                          ? formatDate(loan.returnedAt)
                          : translate('Não devolvido')}
                      </Typography>
                      <Typography>
                        {translate('Renovações: ')}
                        {loan.renewedCount}
                      </Typography>
                    </RecordRow>
                  ))}
                </RecordTable>
              )}
              <TablePagination
                component="div"
                count={history.data.total}
                page={page}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[10, 20, 50, 100]}
                onRowsPerPageChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
                labelRowsPerPage={translate('Por página')}
                onPageChange={(_, next) => setPage(next)}
                getItemAriaLabel={(type) =>
                  type === 'next'
                    ? translate('Próxima página do histórico')
                    : translate('Página anterior do histórico')
                }
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{translate('Fechar')}</Button>
      </DialogActions>
    </Dialog>
  );
}
