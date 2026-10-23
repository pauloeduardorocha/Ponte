# Capas pela Open Library

Script independente `fetch_openlibrary_covers.py`, Python 3.10+, sem chave e sem
pacotes externos. O script Bing anterior e os resultados existentes são preservados.

```powershell
python fetch_openlibrary_covers.py "Cristianismo puro e simples" "C. S. Lewis"
python fetch_openlibrary_covers.py --input openlibrary-pilot-20.json --output capas-piloto.csv --cache respostas-openlibrary.json --limit 20
```

Execute na pasta do script ou ajuste os caminhos. O piloto tem 20 registos
dispersos pelo acervo, incluindo obras portuguesas e inglesas e autores ausentes;
não é uma amostra estatística. `inventory.json` também é aceite. O padrão é limitar
a 20 livros. CSV de entrada aceita `title,author,registrationNumber` (autor e
registo opcionais; `register` e `id` também são reconhecidos).

As consultas usam Search API em grupos de quatro títulos ligados por OR,
retornam apenas os campos necessários e respeitam intervalo mínimo de 1,1 s.
A cache facultativa evita repetir consultas idênticas. Respostas HTTP 429/403
interrompem; falhas transitórias têm até três tentativas. Cada consulta pagina
até 300 obras; acima disso interrompe sem confundir truncamento com ausência.

O filtro compara o título da **edição**, com semelhança mínima 0,88, e autor
retornado na obra com mínimo 0,8. Iniciais compatíveis são aceites. Quando há
subtítulo e autor, pesquisa e comparação usam o título principal; sem autor usa
o título integral para não ampliar excessivamente consultas genéricas.
Uma capa da obra não é usada como substituto da capa da edição, pois pode ser
noutra língua. As URLs usam apenas cover_i positivo da edição e a estrutura
oficial covers.openlibrary.org/b/id/ID-L.jpg?default=false.

`REVIEW_EDITION` significa candidato bibliográfico, não edição física confirmada;
`REVIEW_MISSING_AUTHOR` indica ausência de autor na entrada. Sem candidato,
`NO_CONFIDENT_EDITION_COVER` deixa a URL vazia. Isto pode significar falta de
registo, grafia divergente, outra tradução ou ausência de capa da edição retornada.
A Search API devolve só uma edição relevante por obra, pelo que o resultado
negativo não prova que a Open Library não possua outras edições com capa.

A seleção preserva registos com zeros, título e autor da fonte; não corrige nomes
silenciosamente. O CSV novo não sobrescreve ficheiros e é gravado após cada livro.
Não há escrita no banco nem descarga de imagens. As URLs são candidatas e precisam
de revisão; a disponibilidade da imagem pode mudar.

```powershell
python -B -m unittest discover -s . -p test_openlibrary_covers.py -v
```

Referências oficiais:
- https://openlibrary.org/dev/docs/api/search
- https://openlibrary.org/dev/docs/api/covers
- https://openlibrary.org/developers/api
