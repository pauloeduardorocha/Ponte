# Modelo e inventário da biblioteca

## Modelo implementado

A extensão de catálogo já faz parte do Prisma, contratos e interface. As migrations `20261022120000_library_catalogue` e `20261022213000_library_enrichment` registram a evolução; não se trata de uma proposta de schema pendente.

| Entidade/campo                      | Finalidade                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `LibraryCategory`                   | UUID interno, código textual único, nome e `parentCode`; preserva zeros à esquerda     |
| `BookCategory`                      | Associação livro/tema, principal e data de revisão; par único e no máximo um principal |
| `Book.registrationNumber`           | Identificador de origem opcional e único, independente do UUID                         |
| `Book.collection`, `catalogueNotes` | Coleção e notas da ficha                                                               |
| `Book.author`                       | Pode ser nulo; a UI apresenta ausência sem inventar identidade                         |
| `Book.category`                     | Campo livre mantido para compatibilidade, sincronizado com o rótulo principal          |
| `BookCopy.shelfmark`                | Cota separada da localização física e código patrimonial                               |
| `CopyStatus.PENDING_INVENTORY`      | Exemplar por conferir, indisponível para empréstimo ou alocação de reserva             |
| `BookEnrichment`                    | Pesquisa, seleção provisória, valores anteriores, hash e revisão por livro             |

A fonte canônica é `apps/api/prisma/schema.prisma`, com constraints adicionais nas migrations. As categorias referenciadas têm exclusão restrita. Não há tabelas próprias de autores/editoras/coleções. O preparador usa `und` quando a fonte não informa idioma; o modelo geral conserva o default `pt`.

O número de registo identifica a ficha; o código patrimonial identifica a unidade física. Por exemplo, `00006` pode ter `BP-00006-01` e `BP-00006-02`. Fichas `00333` e `00334` permanecem separadas por indicação de edições diferentes; semelhança de título não autoriza mescla.

## Dados de origem e curadoria

O pacote versionado contém 384 fichas, 426 exemplares com quantidade conhecida e 102 categorias. Estes são totais do **inventário de origem**, não uma leitura atual da produção. Há 379 propostas de tema principal e cinco fichas sem proposta segura (`00048`, `00158`, `00166`, `00191`, `00384`). Quantidades desconhecidas em `00169`, `00383` e `00384` não geram exemplares.

- [Inventário normalizado](../apps/api/prisma/library-production/inventory.json): dados de origem, linhas e hashes dos documentos.
- [Propostas](../apps/api/prisma/library-production/category-proposals.json): classificações ainda sujeitas a revisão.
- [Relatório gerado](library-seed-review.md): reprodução do inventário, não catálogo de produção nem estado atual do enriquecimento.
- [Preparador](../apps/api/prisma/library-production/prepare-seed.cjs): gera seed e relatório sem conectar ao banco.
- [Ferramentas e execução](../apps/api/prisma/library-production/README.md): comandos, proteções e testes.

A pesquisa de ISBN, editoras e capas pode fornecer candidatos; dígito verificador correto ou URL acessível não confirma a edição física. O [registro de enriquecimento](../apps/api/prisma/library-production/ISBN-RESEARCH.md) documenta a importação provisória de outubro e sua proveniência. Arquivos de `outputs/` e caches citados nesse histórico são locais e podem não existir num clone novo.

## Operações administrativas

Instalação normal aplica migrations pelo [fluxo de segurança do banco](database-security.md). O executor especializado `database.cjs` existe para a carga de inventário e exige conexão, host e banco explícitos; não é um sincronizador geral de produção.

`seed` e `reset-seed` têm efeitos diferentes. `reset-seed` apaga livros, exemplares e históricos operacionais de circulação na mesma transação da carga, preservando auditoria global e outras áreas. Uma autorização registrada numa tarefa antiga não autoriza um novo reset. Antes de qualquer nova limpeza, definir escopo e destino, obter autorização específica e preparar recuperação testada. Reimportações normais não devem executar reset.

## Contrato e interface

[Paginação e catálogo](library-pagination.md) descreve filtros, categorias, históricos, revisão e disponibilidade. Metadados usam cache; disponibilidade é consultada separadamente e continua validada dentro das transações de empréstimo e reserva. O catálogo não presume que quantidade de origem significa disponibilidade física.
