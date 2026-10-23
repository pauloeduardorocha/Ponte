# Captura de erros do frontend

## Versão da aplicação

A versão visível no rodapé de todas as páginas vem de `APP_VERSION` em `apps/web/src/lib/app-version.ts` (inicialmente `0.1.1`). O mesmo valor é enviado em `device.appVersion` em todos os relatórios de erro e persistido no campo JSON `device` de `frontend_error_reports`, sem migração de banco. A API aceita o campo opcional no formato `MAJOR.MINOR.PATCH`, com até 32 caracteres. Relatórios de clientes antigos continuam aceitos sem versão; não se infere uma versão para esses registros.

Para consultar: `SELECT created_at, device->>'appVersion' AS app_version, message FROM frontend_error_reports ORDER BY created_at DESC;`.

A versão é a do código carregado pelo navegador/PWA, não a versão mais recente disponível no servidor. Incrementar a constante em toda alteração da aplicação é obrigatório conforme `AGENTS.md`; rodapé e telemetria não devem ter versões duplicadas. Esta versão de produto é independente das versões internas dos pacotes npm do monorepo.

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

### Normalização de captura direta

A ocorrência seguinte (16:24 UTC) apresentou `SERVICE_UNAVAILABLE` da Vercel, 2.435 ms e 1.972.808 bytes. Às 16:25 UTC, o mesmo dispositivo enviou uma imagem diferente da galeria: POST 201, anexo JPEG de 523.015 bytes. Logo, a cópia em memória não resolveu o incidente e a comparação ainda não isola origem, tamanho e conteúdo da imagem.

Como mitigação, o botão Tirar fotografia agora sempre decodifica e reencoda a captura em JPEG, mesmo abaixo de 2 MB. Mantém proporções, sem recortes, limita a maior dimensão a 2560 pixels e reduz a qualidade até caber em 768 KiB. Se não conseguir, informa a falha antes de enviar. A imagem passa pela pré-visualização para conferência da legibilidade. Galeria e PDFs mantêm o fluxo anterior. Não há repetição automática de gravações.

Os testes cobrem capturas de 523.015 e 1.972.808 bytes, limite de saída, falha de otimização e bloqueio do formulário durante a preparação. São testes locais com canvas simulado; não comprovam resolução no dispositivo real. Validação acumulada: 30 testes de frontend, TypeScript e lint. O diagnóstico permanece aberto até uma captura real ser enviada com sucesso.

### Mesmo limite em todos os seletores

O utilizador confirmou que abria a câmera por Carregar documentos, não pelo botão Tirar fotografia. Esse caminho ainda usava o alvo antigo de 2 MiB. Os relatórios às 18:06–18:07 UTC confirmaram anexos únicos de 1.557.107, 1.576.060 e 1.825.221 bytes, com 503 SERVICE_UNAVAILABLE.

O alvo de 768 KiB agora é comum a todas as imagens preparadas, incluindo galeria, seletor comum, arrastar/soltar e botão de câmera. Imagens já menores continuam preservadas; imagens maiores são reencodadas em JPEG com maior dimensão até 2560 pixels. Os PDFs mantêm seu limite existente. O limite do lote não foi alterado: esta mitigação por imagem não comprova um limite agregado inferior da infraestrutura.

Dois testes de formulário percorrem os seletores com e sem capture e inspecionam o ficheiro efetivamente enviado no FormData, verificando JPEG abaixo de 768 KiB para uma origem de 1.576.060 bytes. A documentação oficial da Vercel descreve limite de 4,5 MB com 413 FUNCTION_PAYLOAD_TOO_LARGE (https://vercel.com/docs/errors/function_payload_too_large); portanto, os 503 observados abaixo desse tamanho não comprovam esse limite padrão. Não foi encontrado limite menor explícito no vercel.json. A causa na infraestrutura continua não demonstrada.
