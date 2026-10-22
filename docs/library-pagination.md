# Paginação da biblioteca

Catálogo, exemplares, empréstimos, multas, reservas e membros usam `page`
(início em 1) e `pageSize` (padrão 20, máximo 100). A API devolve
`{ items, total, page, pageSize }`; a seleção da página ocorre no banco.

Os filtros e os seletores dos formulários consultam a API apenas quando o
dropdown abre. A pesquisa tem um intervalo de 250 ms após a digitação e cada
pedido traz até 20 opções. Percorrer o dropdown até ao fim pede a página
seguinte. Uma nova pesquisa começa na página 1. Não há um ciclo a descarregar
todas as páginas.

- Livros: `GET /api/v1/library/books?search=ponte&page=1&pageSize=20`.
- Exemplares: `GET /api/v1/library/copies?search=EX-01&page=1&pageSize=20`.
- Membros: `GET /api/v1/library/members?search=ana&page=1&pageSize=20`.
- Autores: `GET /api/v1/library/book-options/authors?search=ana&page=1&pageSize=20`.
- Categorias: `GET /api/v1/library/book-options/categories?search=hist&page=1&pageSize=20`.

Autores e categorias são valores distintos, pesquisados sem distinguir
maiúsculas de minúsculas e ordenados no banco. As opções têm `{ id, name }`,
ambos com o valor do filtro. Estes dois endpoints exigem `LIBRARY_BOOK_READ`.
Status e disponibilidade são opções fixas, sem consulta a listas de entidades.

`GET /api/v1/library/members/:id/history` e
`GET /api/v1/library/copies/:id/history` também aceitam `page` e `pageSize`.
Preservam os arrays `loans` e `reservations`, mas limitam cada array à página
pedida. Devolvem `totalLoans`, `totalReservations`, `page` e `pageSize`.
O histórico do exemplar inclui ainda `events` paginado e `totalEvents`.
O controlo de paginação avança as listas em conjunto, até à última página
da maior lista. A ordenação usa data e id para desempatar.

`GET /api/v1/library/dashboard` pagina `mostBorrowed` com os mesmos parâmetros
e devolve `totalMostBorrowed`, `page` e `pageSize`. O painel pede 10 por página.
Os totais e saldos continuam a representar todo o acervo.

As permissões dos históricos e das listas existentes mantêm-se. Não são
necessárias alterações ao esquema ou migrações.

## Histórico de circulação no catálogo

`GET /api/v1/library/books/:id/history` exige `LIBRARY_BOOK_READ` e aceita
`page` e `pageSize` (padrão 20, máximo 100). Responde com
`{ items, total, page, pageSize }`. Cada item contém apenas `id`, `borrowedAt`,
`dueAt`, `returnedAt`, `status` e `renewedCount`. Inclui todos os exemplares do
livro, ordenados por empréstimo mais recente e id decrescente para desempate.
Não inclui membros, operadores, observações, multas ou identificadores de leitores.
Livro inexistente retorna 404; UUID ou paginação inválidos retornam 400.
Os detalhes bibliográficos usam o endpoint existente `GET /api/v1/library/books/:id`.

## Categorias estruturadas e inventário

`GET /api/v1/library/categories` usa LIBRARY_BOOK_READ e devolve o índice paginado,
com id igual ao código textual, name como código e nome, code e parentCode.
Inclui categorias ainda não usadas. O endpoint de opções de categorias combina
esse índice com as categorias livres já utilizadas, sem duplicar rótulos.
O filtro category aceita código, nome ou rótulo e encontra também temas secundários.
A pesquisa inclui número de registo, coleção e nome dos temas associados.

Livros mantêm os campos existentes e acrescentam registrationNumber, collection,
catalogueNotes, primaryCategoryCode, secondaryCategoryCodes e classificationReviewed.
O retorno inclui categories com reviewedAt e o tema correspondente, pendingInventory
e shelfmarks. Autor pode ser nulo; und significa idioma não informado.
Criar ou editar permite selecionar tema principal, temas secundários e indicar
explicitamente se a classificação foi revista. Categorias inexistentes ou repetidas
são rejeitadas. Existe apenas um tema principal por livro.

Exemplares acrescentam shelfmark (cota) e o estado PENDING_INVENTORY, apresentado
como Por conferir. Só AVAILABLE e RESERVED podem ser emprestados pelas regras
existentes; o novo estado não é contado como disponível nem alocado a reservas.
