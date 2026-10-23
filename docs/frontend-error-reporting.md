# Captura de erros do frontend

O frontend envia falhas não tratadas, rejeições não tratadas, erros de console e respostas HTTP malsucedidas para `POST /api/v1/client-errors`. A captura é inicializada no arranque da aplicação e inclui as falhas da API de reembolsos.

O payload contém hora do dispositivo, rota sem query string, tipo e mensagem, stack quando disponível, identificador de pedido da API, método e status HTTP, user agent, sistema operativo e browser estimados, idioma, fuso horário, tamanho da janela, estado de rede, modo PWA e até 20 mensagens recentes de `console.warn`/`console.error`. Os logs só aceitam texto e objetos `Error`; objetos arbitrários são omitidos.

A API guarda os relatórios na tabela `frontend_error_reports`, usa a hora do servidor para `created_at` e remove relatórios com mais de 30 dias durante a ingestão. O endpoint é público para que falhas de sessão também possam ser recebidas, mas associa o utilizador apenas se o Bearer token for válido. O ID de utilizador enviado pelo cliente não é aceite. Há limite de 10 envios por minuto.

Mensagens, stack traces e logs passam por redação de tokens Bearer/JWT, emails, IBANs portugueses e parâmetros de query conhecidos como sensíveis. O frontend nunca inclui cookies, cabeçalhos, corpo de pedidos/respostas, campos de formulários ou conteúdo de ficheiros. A fila de tentativas fica em memória e volta a tentar quando a rede regressa; um encerramento da aplicação sem rede pode impedir o envio.

Para investigar um caso, correlacione `created_at`, `user_id`, `request_id` e `client_request_id`. O `request_id` identifica o pedido de ingestão; `client_request_id` referencia a falha original observada pelo browser.

## Envio de reembolsos e falhas de infraestrutura (2026-10-23)

O envio multipart e o download de reembolsos usam o mesmo transporte autenticado das chamadas JSON. Uma resposta 401 renova a sessão uma vez e repete o envio com os mesmos documentos; uma resposta 503 ou uma falha de rede não repete automaticamente a gravação. A interface distingue falha de rede, excesso de tamanho (413), indisponibilidade (502/503) e demora do servidor (504), quando a resposta não contém uma mensagem própria. Antes de repetir um envio de resultado incerto, o utilizador deve conferir os pedidos guardados.

Os relatórios HTTP incluem duração, indicação de redirecionamento e total de bytes dos anexos na mensagem técnica. Na ausência de `x-request-id`, o transporte usa `x-vercel-id` para permitir correlação de falhas anteriores à API. Não são incluídos nomes, conteúdo dos documentos nem campos do formulário.

Investigação de 23/10: os dois relatórios existentes correspondiam a HTTP 503 no envio de reembolsos em Android/Chrome em modo PWA, às 15:58 e 16:01 UTC. Os registros CDN correspondentes indicavam GET, enquanto o cliente registrava POST, e não apresentavam a rota de função normal. A consulta de runtime para a rota e intervalo não retornou registros. Perfil, categorias e ingestão do relatório funcionaram no mesmo intervalo. Isso sugere uma falha anterior ao processamento normal da API, mas não demonstra a causa nem que ocorreu conversão real de método.

Sondas multipart sem autenticação, de 100 e 2.100.000 bytes, receberam 401 no domínio com www e 308 para o domínio com www quando chamadas sem www. Não criaram reembolsos. Não reproduziram o 503 e não validam um envio autenticado no dispositivo afetado. A correção de sessão resolve um defeito independente de 401; não deve ser apresentada como prova de resolução da origem dos 503.

Validação local: 25 testes de transporte, renovação de sessão, formulário, compressão e relatórios passaram; TypeScript e ESLint dos arquivos alterados passaram.

### Fotos capturadas no Android

Nova ocorrência às 16:18 UTC: 503 em 2185 ms, sem redirecionamento, com 1.600.365 bytes de anexos. O utilizador informou captura pela câmera e falha tanto em Wi-Fi quanto em dados móveis. Esses dados não confirmam a causa, mas não indicam excesso de tamanho do upload.

O caminho de preparação anteriormente devolvia o objeto File original quando abaixo do limite de compressão e limpava imediatamente o seletor. Agora lê os bytes e cria uma cópia em memória antes de limpar o seletor, inclusive para PDFs. Falhas de leitura são apresentadas antes do envio. Fotos comprimidas já eram materializadas pelo canvas. Trata-se de proteção contra ficheiros temporários de provedores de conteúdo; a resolução do incidente depende de nova validação no dispositivo real. Nenhum anexo é persistido em armazenamento local do navegador.

Relatórios HTTP também incluem o código do cabeçalho `x-vercel-error`, limitado a letras maiúsculas, números e sublinhado (até 100 caracteres), sem copiar o corpo da resposta. Validação: 26 testes passaram, incluindo falha de leitura e preservação dos bytes de PDF; TypeScript e lint passaram.
