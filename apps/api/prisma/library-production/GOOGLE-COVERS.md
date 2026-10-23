# Capas pelo Google Imagens, sem chave

`fetch_covers.py` pesquisa título + autor + “capa livro” no Google Imagens com
um navegador Playwright. Não usa Google Books nem pede chave. Python 3.10+.

## Instalação

```powershell
python -m pip install playwright
python -m playwright install chromium
```

Execute os comandos seguintes na pasta deste script.

```powershell
python fetch_covers.py "Cristianismo puro e simples" "C. S. Lewis"
python fetch_covers.py "Cristianismo puro e simples" "C. S. Lewis" --json
```

O primeiro devolve apenas a primeira URL candidata. `--json` inclui as URLs
candidatas, legenda do resultado, página de origem quando disponível e link da
pesquisa. A pesquisa não confirma autor, título ou edição da imagem: todos os
resultados têm `REVIEW_IMAGE_SEARCH` e precisam de conferência. Não atribui
pontuações de correspondência bibliográfica nem inventa ISBN ou editora.

## Acervo em lote

```powershell
python fetch_covers.py --input inventory.json --output capas-para-revisao.csv
```

Também aceita CSV UTF-8 com `title,author,registrationNumber` (os dois últimos
opcionais). Preserva os zeros do registo e aceita `register` ou `id` como alias.
`cover_url` é candidata ao campo `Book.cover`; relacione os livros pelo registo.
O banco não é alterado. Cada linha é gravada imediatamente; a saída não é
sobrescrita. `--delay 2` define o intervalo entre pesquisas em segundos.

Pode usar o navegador já instalado com `--browser chrome` ou `--browser msedge`
e mostrar a janela com `--headed`. O modo padrão é Chromium sem janela.
`--candidates 3` limita os candidatos exportados (entre 1 e 10); a quantidade
real pode ser menor conforme o layout do Google e o preview disponibilizado.

A extração lê links `imgurl`/`imgrefurl` e, se necessário, abre um preview para
ler URLs de imagens visíveis. Não inventa URLs, não descarrega ficheiros de
imagem e exclui miniaturas gstatic e imagens inline. Não valida disponibilidade
futura da imagem, permissões de uso ou correspondência à edição física.

Google pode bloquear automação com CAPTCHA/HTTP 403/429 ou pedir consentimento.
O script interrompe nesses casos, sem resolver desafios ou contornar bloqueios;
as linhas concluídas ficam no CSV. Para continuar depois, use uma entrada com
os registos restantes e uma saída nova. Alterações no layout também podem
impedir a extração; nesse caso a URL fica vazia e o estado é
`NO_IMAGE_EXTRACTED`, com `search_url` para consulta manual.

Códigos de saída: 0 execução concluída; 1 nenhuma URL no modo individual;
2 erro/bloqueio. Uma execução em lote concluída pode conter linhas sem imagem.

## Verificação

```powershell
python -B -m unittest discover -s . -p test_fetch_covers.py -v
```

Os testes usam fixtures e respostas simuladas. O teste real nesta rede chegou
à página de CAPTCHA do Google; a extração de resultados reais não foi validada
neste ambiente. Não foi executado o lote de 384 livros.

Documentação do navegador: https://playwright.dev/python/docs/library.
