# Captura de erros do frontend

O frontend envia falhas não tratadas, rejeições não tratadas, erros de console e respostas HTTP malsucedidas para `POST /api/v1/client-errors`. A captura é inicializada no arranque da aplicação e inclui as falhas da API de reembolsos.

O payload contém hora do dispositivo, rota sem query string, tipo e mensagem, stack quando disponível, identificador de pedido da API, método e status HTTP, user agent, sistema operativo e browser estimados, idioma, fuso horário, tamanho da janela, estado de rede, modo PWA e até 20 mensagens recentes de `console.warn`/`console.error`. Os logs só aceitam texto e objetos `Error`; objetos arbitrários são omitidos.

A API guarda os relatórios na tabela `frontend_error_reports`, usa a hora do servidor para `created_at` e remove relatórios com mais de 30 dias durante a ingestão. O endpoint é público para que falhas de sessão também possam ser recebidas, mas associa o utilizador apenas se o Bearer token for válido. O ID de utilizador enviado pelo cliente não é aceite. Há limite de 10 envios por minuto.

Mensagens, stack traces e logs passam por redação de tokens Bearer/JWT, emails, IBANs portugueses e parâmetros de query conhecidos como sensíveis. O frontend nunca inclui cookies, cabeçalhos, corpo de pedidos/respostas, campos de formulários ou conteúdo de ficheiros. A fila de tentativas fica em memória e volta a tentar quando a rede regressa; um encerramento da aplicação sem rede pode impedir o envio.

Para investigar um caso, correlacione `created_at`, `user_id`, `request_id` e `client_request_id`. O `request_id` identifica o pedido de ingestão; `client_request_id` referencia a falha original observada pelo browser.
