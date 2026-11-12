import { t as translate, useLocale } from '../../i18n';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { Box, Button, Typography } from '@mui/material';
import { Can } from '../../auth/guards';
import * as api from '../../lib/library-api';
import {
  memberField,
  copyFields,
  bookFields,
  bookInput,
  copyInput,
  valuesOf,
  type OpenLibraryAction,
} from './library-actions';
import { Paged } from './LibraryPaged';
import type { Page } from '@church/shared';
import { useBookAvailability } from '../../lib/use-book-availability';
export function CatalogPanel({
  books,
  page,
  pageSize,
  setPage,
  setPageSize,
  open,
  setDetailBook,
}: {
  books: Page<api.Book>;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  open: OpenLibraryAction;
  setDetailBook: (book: api.Book) => void;
}) {
  useLocale();
  const availability = useBookAvailability(books.items.map((book) => book.id));
  return (
    <Paged
      total={books.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <Box>
        <RecordTable
          primaryLabel={translate('Livro')}
          imageLabel={translate('Capa')}
          label={translate('Catálogo da biblioteca')}
          summaryLabel={translate('Autor / Categoria')}
        >
          {books.items.map((book) => (
            <RecordRow
              key={book.id}
              image={
                book.cover ? (
                  <Box
                    component="img"
                    src={book.cover}
                    alt={translate('Capa de {0}', [book.title])}
                    loading="lazy"
                    sx={{
                      width: 80,
                      height: 112,
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <Typography variant="caption">
                    {translate('Sem capa')}
                  </Typography>
                )
              }
              primary={
                <>
                  <Typography variant="h6">{book.title}</Typography>
                </>
              }
              actions={
                <>
                  <Button onClick={() => setDetailBook(book)}>
                    {translate('Ver detalhes')}
                  </Button>
                  <Can permission="LIBRARY_BOOK_UPDATE">
                    <Button
                      onClick={() =>
                        open(
                          translate('Editar livro'),
                          (v) => api.updateBook(book.id, bookInput(v, true)),
                          bookFields,
                          valuesOf({
                            ...book,
                            categoryCodes: [
                              ...(book.primaryCategoryCode
                                ? [book.primaryCategoryCode]
                                : []),
                              ...(book.secondaryCategoryCodes ?? []),
                            ],
                          }),
                        )
                      }
                    >
                      {translate('Editar')}
                    </Button>
                  </Can>
                  <Can permission="LIBRARY_BOOK_DELETE">
                    <Button
                      color="error"
                      onClick={() =>
                        open(translate('Excluir livro sem histórico'), () =>
                          api.deleteBook(book.id),
                        )
                      }
                    >
                      {translate('Excluir')}
                    </Button>
                  </Can>
                  <Can permission="LIBRARY_COPY_CREATE">
                    <Button
                      onClick={() =>
                        open(
                          translate('Novo exemplar'),
                          (v) => api.createCopy(book.id, copyInput(v)),
                          copyFields,
                        )
                      }
                    >
                      {translate('Novo exemplar')}
                    </Button>
                  </Can>
                  <Can permission="LIBRARY_RESERVATION_CREATE">
                    <Button
                      onClick={() =>
                        open(
                          translate('Reservar {0}', [book.title]),
                          (v) =>
                            api.reserve({
                              bookId: book.id,
                              memberId: v.memberId ?? '',
                            }),
                          [memberField],
                        )
                      }
                    >
                      {translate('Reservar')}
                    </Button>
                  </Can>
                </>
              }
              summary={
                <>
                  <Box>
                    {book.subtitle} ·{' '}
                    {book.author ?? translate('Autor não informado')} ·{' '}
                    {book.category ?? translate('Sem categoria')}
                    {book.registrationNumber && (
                      <Typography variant="body2">
                        {translate('Registo: ')}
                        {book.registrationNumber}
                      </Typography>
                    )}
                    {book.collection && (
                      <Typography variant="body2">
                        {translate('Coleção: ')}
                        {book.collection}
                      </Typography>
                    )}
                    {book.primaryCategoryCode &&
                      !book.classificationReviewed && (
                        <Typography variant="body2">
                          {translate('Classificação proposta · por rever')}
                        </Typography>
                      )}
                    {Boolean(book.pendingInventory) && (
                      <Typography variant="body2">
                        {translate('Por conferir: ')}
                        {book.pendingInventory}
                      </Typography>
                    )}
                  </Box>
                </>
              }
            >
              <Typography>
                {book.publisher} · {book.edition} · {book.year} ·{' '}
                {book.language === 'und'
                  ? translate('Idioma não informado')
                  : book.language}{' '}
                · {book.pages ?? '—'} {translate(' páginas')}
              </Typography>
              <Typography>{book.keywords?.join(', ')}</Typography>
              <Typography>
                {translate('Exemplares:')}{' '}
                {availability.isError
                  ? '—'
                  : (availability.values.get(book.id)?.quantity ?? '—')}{' '}
                {translate('· Disponíveis:')}{' '}
                {availability.isFetching
                  ? translate('Verificando…')
                  : availability.isError
                    ? translate('Indisponível para consulta')
                    : (availability.values.get(book.id)?.available ??
                      translate('Não informado'))}
              </Typography>
              <Typography variant="caption">
                ID: {book.id} {translate(' · ISBN: ')}
                {book.isbn}
              </Typography>
            </RecordRow>
          ))}
        </RecordTable>
      </Box>
    </Paged>
  );
}
