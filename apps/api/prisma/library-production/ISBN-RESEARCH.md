# Pesquisa e enriquecimento bibliográfico

As ferramentas desta pasta pesquisam candidatos de ISBN, editora, edição e capa a partir de `inventory.json`. A fonte original é preservada e identificada por SHA-256. Os resultados são propostas de curadoria; não confirmam a edição física do exemplar.

## Pesquisa e consolidação

Execute na raiz do projeto, com Python 3.10 ou superior:

```powershell
python -B apps/api/prisma/library-production/research_inventory.py --input apps/api/prisma/library-production/inventory.json --evidence apps/api/prisma/library-production/isbn-pilot-evidence.json --output pesquisa-isbn
python -B apps/api/prisma/library-production/consolidate_inventory_research.py --input pesquisa-isbn --output outputs/isbn-acervo --enrich
python -B -m unittest discover -s apps/api/prisma/library-production -p 'test_research_inventory.py'
```

A pesquisa usa a Open Library, com cache, intervalo entre pedidos e limites de paginação. `--resume` retoma uma pasta de pesquisa existente; para pesquisa nova, use outro destino. A consolidação também requer `web-research.json`, exportado da pesquisa assistida, e não executa essa busca web automaticamente. Diretórios de resultados e caches são locais e precisam ser preparados antes do uso.

ISBNs são obtidos de edições e validados pelo dígito verificador; ISBN-10 pode ser convertido para ISBN-13. A validade matemática não comprova a correspondência ao exemplar. Consultas sem resultado não provam inexistência de ISBN ou capa. Títulos genéricos, autores ausentes, volumes, caixas, traduções e formatos diferentes exigem conferência.

Mantenha alternativas separadas e confira as fontes. Não combine ISBN, ano, editora e capa de edições diferentes. URLs candidatas não garantem disponibilidade ou correspondência visual. Pesquisa e consolidação não escrevem no banco.

## Preparação e aplicação de enriquecimento

```powershell
python -B apps/api/prisma/library-production/prepare_enrichment.py --input outputs/isbn-acervo/research.json --output outputs/isbn-acervo/import-plan.json
# DATABASE_URL e LIBRARY_EXPECT_HOST injetados explicitamente no processo.
node apps/api/prisma/library-production/enrichment-database.cjs apply outputs/isbn-acervo/import-plan.json outputs/isbn-acervo/importacao
node --test apps/api/prisma/library-production/enrichment-database.test.cjs
```

A aplicação é administrativa: confirme destino, plano e recuperação antes de executar. O executor exige conexão e host explícitos, usa transação única e aborta se uma ficha mudar entre leitura e escrita. Não elimina dados operacionais.

`library_book_enrichments` mantém pesquisa, seleção, hash, valores anteriores e revisão. Campos selecionados provêm de uma única fonte candidata; dados já existentes e a identidade das fichas são preservados. Colisões de ISBN permanecem nas alternativas com `selection.isbnCollision`, respeitando a unicidade. Uma seleção provisória com `reviewedAt: null` continua pendente de conferência física.

Consulte o [modelo da biblioteca](../../../../docs/library-data-model.md) e o [guia de inventário](README.md).

Referências: [Search API](https://openlibrary.org/dev/docs/api/search), [Books API](https://openlibrary.org/dev/docs/api/books), [limites e utilização](https://openlibrary.org/developers/api).
