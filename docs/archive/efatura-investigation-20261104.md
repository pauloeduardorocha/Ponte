# Recuperação e diagnóstico e-Fatura — 04/11/2026

> Registro histórico. Descreve a data da intervenção, não o estado atual da produção.
> Comandos e autorizações desta intervenção não se aplicam a novas operações.
> Consulte o [índice atual](../README.md) antes de executar procedimentos.

## Recuperação em produção

Consulta local com login manual, Chrome com interface e os módulos existentes de
filtros, normalização e paginação. Período inclusivo: 09/10 a 03/11/2026;
09/10 era a última data registrada. Foram extraídas 13 faturas, com datas entre
09/10 e 31/10, todas dentro do período e sem identidades repetidas no arquivo.

O JSON foi importado usando `InvoicesService.upload` e `StorageService` com
armazenamento em banco, reutilizando o usuário ativo da importação anterior e
verificando sua permissão de importação. O contexto de auditoria identifica a
recuperação local autorizada; não simula uma requisição remota.

Resultado: 12 inserções, 1 duplicada preservada na origem anterior, 44 faturas
no total. Confirmados o registro da importação, as 12 faturas vinculadas,
o arquivo privado e o evento de auditoria. O JSON arquivado foi comparado
byte a byte com o exportado. Nenhuma associação bancária foi criada.
Os dados das faturas e os arquivos temporários não integram este documento.

## Evidências do 429 remoto

- Log de produção em 04/11/2026 às 15:49:15 UTC: `efatura.consultation.failed`,
  `stage=filters`, `operation=apply_filters`, `failureCode=PORTAL_RATE_LIMITED`.
- Request ID: `d48d14a2-c5d1-4c87-a6dc-386d8a18d6ab`. A API respondeu 503 após
  17.344 ms; o HTTP 429 foi recebido do portal, não do limitador da API.
- O monitor reconhece esse código exclusivamente na resposta de
  `faturas.portaldasfinancas.gov.pt/json/obterDocumentosAdquirente.action`.
  O login avançou até a etapa de filtros, sem resultado extraído.
- Deployment `dpl_7PrHNr8nwjYmPkrCb2GGLZWKo6sN`, commit
  `aab97464c36fa2be29562d8dbbfa2ab17ea54720`, região efetiva `iad1`.
  O `fra1` de `apps/api/vercel.json` não corresponde à região deste deployment
  do projeto com serviços definido na raiz.
- A consulta local posterior teve sucesso. Não é uma comparação controlada:
  horário, IP, navegador, modo de execução e login diferem.

## Causas possíveis e limites do diagnóstico

O worker publicado abre o portal pelo redirecionamento de login, aguarda a rede
e navega novamente para a página de consulta. A página inicia uma pesquisa AJAX
automaticamente; essa recarga pode acrescentar uma pesquisa antes da pesquisa
com as datas solicitadas. A execução local bem-sucedida omitiu essa segunda
navegação e utilizou o restante da extração do worker.

Essa sequência é um fator plausível de pressão sobre o limite. A origem de
datacenter/IP compartilhado, a sessão/conta e o modo headless também são
hipóteses; nenhuma está demonstrada pelos logs disponíveis. O monitor retém
erros desde a abertura da página, portanto `stage=filters` não distingue um 429
da pesquisa automática de um 429 após o clique de pesquisa.

Não há registro de `Retry-After`, contagem de pesquisas nem distinção dessas
fases. Duas consultas históricas de sete dias aos logs expiraram; não permitem
inferir a frequência histórica. O relatório de publicação de 28/10 já registra
429 reproduzido localmente, por isso o problema não pode ser atribuído
exclusivamente à Vercel com a evidência atual.

## Próxima correção recomendada

Evitar a segunda navegação quando a tabela já estiver acessível após o login;
manter fallback para o redirecionamento que não chegue à consulta. Registrar
somente fase, quantidade/status das pesquisas e `Retry-After` validado, sem
URLs de sessão, corpos, cookies ou dados de faturas. Em uma próxima execução
autorizada, essas medidas permitem distinguir o limite inicial do limite na
pesquisa filtrada e comparar o mesmo fluxo entre local e remoto.

Não foram feitas novas tentativas de login remoto, alterações no scraper,
mudanças de região ou publicação durante esta investigação. Não foi comprovado
que remover a recarga, aguardar ou mudar de região elimine o bloqueio.
