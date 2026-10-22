# Seed da Biblioteca A Ponte

Preparação e aplicação da extensão do modelo descrita em
[library-data-model.md](../../../../docs/library-data-model.md).
O preparador funciona sem ligação ao banco. O executor `database.cjs` exige ligação e host explícitos; `reset-seed` elimina os dados operacionais da biblioteca e carrega o inventário atomicamente.

```powershell
node apps/api/prisma/library-production/prepare-seed.cjs
node --test apps/api/prisma/library-production/prepare-seed.test.cjs
```

O primeiro comando valida as fontes normalizadas e escreve `seed.json` e o
[relatório de revisão](../../../../docs/library-seed-review.md).
Os hashes dos ficheiros originais e as linhas da folha ficam em `inventory.json`.
Títulos e autores foram preservados; apenas se normalizaram espaços e Unicode.
A folha Folha2 está vazia. A coluna J contém apenas o total de exemplares,
não um livro adicional. As linhas vazias no final não são registos.

`category-proposals.json` mantém um registo de revisão para cada obra, mesmo
quando não há categoria proposta. As propostas ainda não foram confirmadas.
`seed.json` destina-se à biblioteca; não deve ser entregue ao seed de demonstração. As associações propostas têm `reviewedAt: null`.

O resultado tem 384 fichas, 426 exemplares, 102 categorias e 379 associações
propostas. As três quantidades desconhecidas não criam exemplares. Os autores ausentes ficam nulos; o código de idioma `und` indica que não foi informado. A condição e localização
não verificadas são indicadas como tal; a disponibilidade aguarda conferência.

O utilizador autorizou a limpeza dos dados atuais e a mescla do modelo existente
com os documentos. A classificação continua por rever. O executor preserva a
auditoria global e não altera dados das outras áreas.

```powershell
# DATABASE_URL e LIBRARY_EXPECT_HOST são injetados no processo, sem credenciais no Git.
node apps/api/prisma/library-production/database.cjs inspect
node apps/api/prisma/library-production/database.cjs migrate
# Apenas para a limpeza expressamente solicitada; não executar em reimportações normais.
node apps/api/prisma/library-production/database.cjs reset-seed
# Reexecução sem eliminar dados ou alterar empréstimos posteriores.
node apps/api/prisma/library-production/database.cjs seed
```

A migração tem checksum e registo em `_prisma_migrations` e reaplica os privilégios
de runtime. O transporte HTTPS é usado apenas nos comandos de administração,
porque a ligação TCP local não completou TLS; a aplicação mantém Prisma.
Criar uma branch de recuperação antes da migração/reset de produção. Testar com:

```powershell
# Ligação da branch isolada, LIBRARY_EXPECT_HOST correspondente e LIBRARY_TEST_DATABASE=1.
node --test apps/api/prisma/library-production/database.integration.test.cjs
```
