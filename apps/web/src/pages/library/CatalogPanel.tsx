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
          primaryLabel="Livro"
          imageLabel="Capa"
          label={'Catálogo da biblioteca'}
          summaryLabel="Autor / Categoria"
        >
          {books.items.map((book) => (
            <RecordRow
              key={book.id}
              image={
                book.cover ? (
                  <Box
                    component="img"
                    src={book.cover}
                    alt={`Capa de ${book.title}`}
                    loading="lazy"
                    sx={{
                      width: 80,
                      height: 112,
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <Typography variant="caption">Sem capa</Typography>
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
                    Ver detalhes
                  </Button>
                  <Can permission="LIBRARY_BOOK_UPDATE">
                    <Button
                      onClick={() =>
                        open(
                          'Editar livro',
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
                </>
              }
              summary={
                <>
                  <Box>
                    {book.subtitle} · {book.author ?? 'Autor não informado'} ·{' '}
                    {book.category ?? 'Sem categoria'}
                    {book.registrationNumber && (
                      <Typography variant="body2">
                        Registo: {book.registrationNumber}
                      </Typography>
                    )}
                    {book.collection && (
                      <Typography variant="body2">
                        Coleção: {book.collection}
                      </Typography>
                    )}
                    {book.primaryCategoryCode &&
                      !book.classificationReviewed && (
                        <Typography variant="body2">
                          Classificação proposta · por rever
                        </Typography>
                      )}
                    {Boolean(book.pendingInventory) && (
                      <Typography variant="body2">
                        Por conferir: {book.pendingInventory}
                      </Typography>
                    )}
                  </Box>
                </>
              }
            >
              <Typography>
                {book.publisher} · {book.edition} · {book.year} ·{' '}
                {book.language === 'und'
                  ? 'Idioma não informado'
                  : book.language}{' '}
                · {book.pages ?? '—'} páginas
              </Typography>
              <Typography>{book.keywords?.join(', ')}</Typography>
              <Typography>
                Exemplares:{' '}
                {availability.isError
                  ? '—'
                  : (availability.values.get(book.id)?.quantity ?? '—')}{' '}
                · Disponíveis:{' '}
                {availability.isFetching
                  ? 'Verificando…'
                  : availability.isError
                    ? 'Indisponível para consulta'
                    : (availability.values.get(book.id)?.available ??
                      'Não informado')}
              </Typography>
              <Typography variant="caption">
                ID: {book.id} · ISBN: {book.isbn}
              </Typography>
            </RecordRow>
          ))}
        </RecordTable>
      </Box>
    </Paged>
  );
}
