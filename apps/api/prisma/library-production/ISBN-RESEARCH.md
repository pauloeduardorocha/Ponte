# Pesquisa bibliográfica do acervo

Executada em 22/10/2026 para os 384 registos de `inventory.json`, sem chave de API. A fonte original é preservada integralmente e identificada por SHA-256.

## Resultado

- 224 obras com ISBNs candidatos, incluindo 16 sem autor informado no acervo.
- 160 sem ISBN localizado. Destas, 8 têm outros metadados candidatos e 152 não têm correspondência suficiente.
- 817 fichas/fontes candidatas, com 504 ISBN-13 distintos. Fontes repetidas para uma mesma edição não representam novas obras.
- Editora para 184 obras, data de publicação para 159, idioma para 136, páginas para 162 e URL de capa para 62.
- Nenhuma edição física confirmada. A aplicação provisória posterior está descrita abaixo.

Os resultados completos estão em `outputs/isbn-acervo-20261022/`: planilha de revisão, `research.json`, `books.csv`, `edicoes-candidatas.csv` e `summary.json`. Os caches e a evidência web ficam em `pesquisa-isbn-acervo-20261022/`.

## Método e limites

1. Pesquisa de todas as obras na API pública da Open Library, em lotes de quatro títulos, com cache e intervalo mínimo de 1,1 segundo entre requisições. ISBNs são retirados das edições, nunca agregados indiscriminadamente da obra.
2. Pesquisa alargada por palavras do título e apelido do autor para os 307 registos sem ISBN na primeira etapa. Não usa tradução automática para associar uma edição noutro idioma.
3. Pesquisa web assistida dos mesmos 307 registos, em catálogos, editoras e livrarias. A evidência exportada contém metadados dos resultados indexados. As páginas não foram verificadas individualmente e exigem conferência antes da importação. Essa etapa foi executada com a ferramenta de pesquisa da sessão, não por scraping ou por uma API de pesquisa configurada no script.
4. Consulta da ficha JSON de uma edição candidata da Open Library por obra elegível para completar páginas, formato, edição, locais de publicação, identificadores, colaboradores e URL de capa quando disponíveis.
5. Validação do dígito verificador e conversão de ISBN-10 para ISBN-13. Isso confirma a validade matemática do identificador, não a correspondência com o exemplar.

Há 11 registos sinalizados porque um lote da Open Library ultrapassou o limite de 300 resultados. Todos tiveram pesquisa complementar web. “Pesquisado” significa que a consulta foi executada, não que o catálogo foi esgotado. Alguns livros antigos podem não ter ISBN, mas uma busca sem resultado não prova essa ausência.

Títulos genéricos sem autor, diferentes volumes, caixas/coleções, edições digitais e fontes com vários ISBNs exigem cuidado. As alternativas permanecem separadas. Não combinar o ISBN de uma linha com editora, idioma ou ano de outra. URLs de capa não foram verificadas visualmente. Nenhuma regra executa escrita SQL.

## Reexecutar

Na raiz do projeto:

```powershell
python -B apps/api/prisma/library-production/research_inventory.py --input apps/api/prisma/library-production/inventory.json --evidence apps/api/prisma/library-production/isbn-pilot-evidence.json --output pesquisa-isbn-acervo-20261022 --resume
python -B apps/api/prisma/library-production/consolidate_inventory_research.py --input pesquisa-isbn-acervo-20261022 --output outputs/isbn-acervo-20261022 --enrich
python -B -m unittest discover -s apps/api/prisma/library-production -p 'test_research_inventory.py'
```

Use outra pasta e omita `--resume` para uma pesquisa nova. A consolidação também requer `web-research.json`, exportado da pesquisa assistida. Ela não reexecuta a busca web. Os CSVs e JSON podem ser regenerados com Python padrão. A planilha Excel foi preparada com Artifact Tool.

Referências: [Search API](https://openlibrary.org/dev/docs/api/search), [Books API](https://openlibrary.org/dev/docs/api/books), [limites e utilização](https://openlibrary.org/developers/api).

## Aplicação em produção

Aplicada em 22/10/2026 por instrução expressa do utilizador, sem revisão prévia das edições. Migração `20261022213000_library_enrichment`, testada numa branch de produção. Foram verificados rollback integral e repetição sem alterações.

- 232 fichas enriquecidas. Campos principais: 221 ISBNs, 55 capas, 165 editoras, 136 contagens de páginas, 130 anos, 103 idiomas e 8 autores antes ausentes.
- 384 registos em `library_book_enrichments`, preservando as 817 fichas/fontes candidatas, a seleção provisória e os valores anteriores. `reviewedAt` permanece nulo.
- ISBNs dos registos `00150`, `00316` e `00376` já selecionados para outras fichas. Permanecem nas alternativas com `selection.isbnCollision`, sem violar a unicidade do ISBN.
- Os campos de uma ficha são preenchidos a partir de uma única fonte candidata. Não foram misturados ano, editora ou capa de outras edições para aumentar os totais. Valores existentes, títulos, coleções, observações e classificações foram preservados.
- Exemplares, empréstimos, reservas, multas, categorias e configurações foram comparados por contagem e hash antes/depois, sem alterações.
- Cópia de recuperação: branch `before-library-enrichment-20261022` (`br-small-fire-b2glfg6f`). Relatório e valores anteriores locais em `outputs/isbn-acervo-20261022/production-import/`.

O executor exige ligação e host explícitos, usa uma transação única e aborta se uma ficha for alterada entre a leitura e a escrita. Não elimina dados. O JSON completo também permanece no pacote local da pesquisa.

```powershell
python -B apps/api/prisma/library-production/prepare_enrichment.py --input outputs/isbn-acervo-20261022/research.json --output outputs/isbn-acervo-20261022/import-plan.json
# DATABASE_URL e LIBRARY_EXPECT_HOST explicitamente injetados no processo.
node apps/api/prisma/library-production/enrichment-database.cjs apply outputs/isbn-acervo-20261022/import-plan.json outputs/isbn-acervo-20261022/production-import
node --test apps/api/prisma/library-production/enrichment-database.test.cjs
```
