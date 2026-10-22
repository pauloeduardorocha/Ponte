# Estrutura e importação da biblioteca

O acervo contém 384 números de registo e 426 exemplares com quantidade conhecida.
O índice contém 102 categorias, incluindo os códigos `00`, `01` e `522`.
A estrutura atual guarda apenas uma categoria livre por livro e não tem campos
próprios para o número de registo, a coleção ou a cota.

## Extensão do modelo existente

| Entidade               | Campo ou relação                                             | Finalidade                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nova `LibraryCategory` | `code` como chave textual, `name`, `parentCode` opcional     | Guardar todo o índice, incluindo categorias ainda sem livros. Preservar zeros à esquerda e a hierarquia, como `52` → `522`.                      |
| Nova `BookCategory`    | `bookId`, `categoryCode`, `isPrimary`, `reviewedAt` opcional | Associar vários temas ao mesmo livro, distinguir o principal e separar propostas de classificações revistas.                                     |
| `Book`                 | `registrationNumber`, texto opcional e único                 | Preservar `00001` como identificador bibliográfico de origem. Não usar o UUID interno nem o código de exemplar para este efeito.                 |
| `Book`                 | `collection`, texto opcional                                 | Preservar a coluna Coleção sem a confundir com subtítulo ou descrição.                                                                           |
| `Book`                 | `catalogueNotes`, texto opcional                             | Preservar notas do registo, incluindo as edições diferentes de `00333` e `00334`.                                                                |
| `BookCopy`             | `shelfmark`, texto opcional                                  | Guardar a cota biblioteconómica, por exemplo `54 COR`, separadamente da sala/estante e do código patrimonial.                                    |
| `Book`                 | Permitir `author` nulo e usar `und` para idioma desconhecido | Há 29 autores ausentes e não existe uma coluna de idioma. Apresentar “Autor não informado” na interface, sem o guardar como identidade de autor. |
| `CopyStatus`           | Acrescentar `PENDING_INVENTORY`                              | A quantidade registada não comprova disponibilidade, localização ou condição física. Permitir conferir os exemplares antes de os disponibilizar. |

A tabela de associação tem unicidade composta `(bookId, categoryCode)` e um
índice único parcial para permitir no máximo um tema principal por livro.
`parentCode` deve referenciar uma categoria existente; a aplicação deve impedir
ciclos. As categorias com livros associados não devem ser apagadas em cascata.
O livro pode ficar temporariamente sem categoria durante a revisão.

Recomendo duas tabelas novas. Não é necessário criar já tabelas de autores,
editoras ou coleções: os ficheiros não fornecem os identificadores ou a
normalização necessários para isso. Também não é necessária uma tabela de
totais; o total e a disponibilidade continuam a ser calculados pelos exemplares.

## Compatibilidade com o sistema publicado

`Book.category` mantém as categorias livres e os filtros existentes. As novas
associações guardam o tema principal e os restantes temas; o rótulo do principal
é sincronizado no campo atual. O seletor reúne o índice estruturado e as categorias
livres existentes. Propostas não revistas aparecem com indicação de revisão
pendente. Nenhum campo atual foi removido.

Os campos novos entram primeiro como opcionais, para não quebrar a versão
publicada. O tratamento de autores nulos, de idioma desconhecido e do novo estado de exemplar
exige atualização conjunta de contratos, interface e regras de circulação.
`PENDING_INVENTORY` não pode ser emprestado nem alocado a reservas.

O número de registo identifica a ficha de origem e o código patrimonial
identifica cada unidade física: por exemplo, registo `00006`, exemplares
`BP-00006-01` e `BP-00006-02`. Uma reexecução deve reutilizar os identificadores.
Os registos `00333` e `00334` permanecem separados por indicação de edições
diferentes, mesmo tendo o mesmo título e autor. Não se devem juntar registos
apenas pela semelhança de títulos.

## Estado dos dados preparados

- [Inventário extraído](../apps/api/prisma/library-production/inventory.json):
  valores de origem, linha da folha e hashes SHA-256 dos dois ficheiros.
- [Propostas de categorias](../apps/api/prisma/library-production/category-proposals.json):
  379 temas principais propostos, todos pendentes de revisão.
- [Revisão legível](library-seed-review.md): ficha a ficha, com quantidades e pendências.
- [Preparador do seed](../apps/api/prisma/library-production/prepare-seed.cjs):
  valida os dados e gera um seed JSON para a estrutura proposta; não liga ao banco.

Sem proposta suficientemente clara: `00048`, `00158`, `00166`, `00191` e
`00384`. Os registos `00169`, `00383` e `00384` ficam sem exemplares até confirmar
a quantidade. Não se atribuem ISBN, capas, edição, ano ou editora por suposição.
As cotas não são calculadas automaticamente como definitivas: todas estão vazias
na fonte e o nome de autor nem sempre corresponde a uma pessoa identificada.

## Aplicação em produção

A limpeza total da biblioteca foi solicitada pelo utilizador. O utilizador confirmou a mescla da estrutura atual com os documentos e a limpeza dos dados antigos. As categorias inferidas entram como propostas, sem data de revisão.

1. Confirmar o projeto e a branch de produção por identificação explícita.
   O contexto `.neon` desta pasta aponta para desenvolvimento.
2. Criar uma cópia de recuperação e testar a migração e a carga numa branch
   isolada, conforme a skill Neon. Não reutilizar a branch de outro trabalho.
3. Atualizar e publicar os contratos e a interface compatíveis com o modelo.
4. Na mesma transação, obter o lock de circulação da biblioteca, bloquear as
   tabelas necessárias e eliminar pagamentos de multas, ajustes, multas,
   reservas, empréstimos, exemplares e livros, por esta ordem. Repor as
   configurações da biblioteca nos valores iniciais se o reset as abranger.
   A limpeza inclui o catálogo de categorias anterior quando este já existir.
5. Carregar categorias, livros, associações e os 426 exemplares. Verificar as
   contagens antes do commit. Qualquer falha reverte limpeza e carga juntas.
6. Conferir catálogo, filtros, reservas e empréstimos no sistema publicado.

Não eliminar membros, utilizadores, dados financeiros de outras áreas nem a
auditoria global imutável. A operação de reset deve ficar registada na auditoria.
Os empréstimos e restantes históricos operacionais da biblioteca são apagados;
isso não implica apagar os registos globais de auditoria.

A migração é aditiva: não remove os campos nem as funcionalidades atuais. O seed é autorizado para aplicação; isso não confirma as propostas de classificação. O executor em `apps/api/prisma/library-production/database.cjs` faz a limpeza e carga na mesma transação e guarda a operação na auditoria.

## Capas

O campo de capa existente foi preservado. As fichas públicas do Google Books
permitiram obter três links candidatos, guardados em
`apps/api/prisma/library-production/google-cover-candidates.json`, com título,
autor, origem e resultado da verificação HTTP. A API sem chave própria devolveu
limite diário excedido. As capas não foram associadas automaticamente porque a
edição física não está identificada nas fontes. Nenhuma imagem foi descarregada.
