# Captura de erros do frontend

## Versão da aplicação

A versão visível no rodapé de todas as páginas vem de `APP_VERSION` em `apps/web/src/lib/app-version.ts` (inicialmente `0.1.1`). O mesmo valor é enviado em `device.appVersion` em todos os relatórios de erro e persistido no campo JSON `device` de `frontend_error_reports`, sem migração de banco. A API aceita o campo opcional no formato `MAJOR.MINOR.PATCH`, com até 32 caracteres. Relatórios de clientes antigos continuam aceitos sem versão; não se infere uma versão para esses registros.

Para consultar: `SELECT created_at, device->>'appVersion' AS app_version, message FROM frontend_error_reports ORDER BY created_at DESC;`.

A versão é a do código carregado pelo navegador/PWA, não a versão mais recente disponível no servidor. Incrementar a constante em toda alteração da aplicação é obrigatório conforme `AGENTS.md`; rodapé e telemetria não devem ter versões duplicadas. Esta versão de produto é independente das versões internas dos pacotes npm do monorepo.

O frontend envia falhas não tratadas, rejeições não tratadas, erros de console e respostas HTTP malsucedidas para `POST /api/v1/client-errors`. A captura é inicializada no arranque da aplicação e inclui as falhas da API de reembolsos.

Desde a versão 1.3.3, respostas HTTP 401 e 403 não são consideradas erros de frontend: o cliente não as coloca na fila de relatórios. A API também ignora relatórios com `apiStatus` 401 ou 403 enviados por clientes antigos, devolvendo `{ accepted: true }` sem persistência. Os demais estados mantêm o comportamento existente. Esta exclusão não altera as respostas HTTP, a renovação da sessão nem os controlos de permissão.

O payload contém hora do dispositivo, rota sem query string, tipo e mensagem, stack quando disponível, identificador de pedido da API, método e status HTTP, user agent, sistema operativo e browser estimados, idioma, fuso horário, tamanho da janela, estado de rede, modo PWA e até 20 mensagens recentes de `console.warn`/`console.error`. Os logs só aceitam texto e objetos `Error`; objetos arbitrários são omitidos.

A API guarda os relatórios na tabela `frontend_error_reports`, usa a hora do servidor para `created_at` e remove relatórios com mais de 30 dias durante a ingestão. O endpoint é público para que falhas de sessão também possam ser recebidas, mas associa o utilizador apenas se o Bearer token for válido. O ID de utilizador enviado pelo cliente não é aceite. Há limite de 10 envios por minuto.

Mensagens, stack traces e logs passam por redação de tokens Bearer/JWT, emails, IBANs portugueses e parâmetros de query conhecidos como sensíveis. O frontend nunca inclui cookies, cabeçalhos, corpo de pedidos/respostas, campos de formulários ou conteúdo de ficheiros. A fila de tentativas fica em memória e volta a tentar quando a rede regressa; um encerramento da aplicação sem rede pode impedir o envio.

Para investigar um caso, correlacione `created_at`, `user_id`, `request_id` e `client_request_id`. O `request_id` identifica o pedido de ingestão; `client_request_id` referencia a falha original observada pelo browser.

## IP e localização aproximada

Novos relatórios incluem contexto obtido pela API em `device.network`:
`ipAddress`, `ipSource` (`vercel` ou `connection`) e, quando disponível,
`geo: { source: 'vercel', country, region, city, latitude, longitude }`.
Não há migração de schema: o contexto usa o JSON existente e acompanha a
retenção de 30 dias. A versão do cliente é preservada. O DTO público não aceita
`network` enviado pelo cliente. A captura acontece no recebimento do relatório;
se o erro ficou na fila offline, a rede pode ser diferente da rede da ocorrência.

Somente em runtime Vercel de produção/preview (`VERCEL=1` e `VERCEL_ENV` igual
a `production` ou `preview`) são usados `x-vercel-forwarded-for` e cabeçalhos
`x-vercel-ip-*`. Fora desse ambiente, só se usa o endereço da conexão TCP,
sem confiar em cabeçalhos de proxy. IPs, coordenadas e códigos são validados;
cidades passam por decodificação e limite de tamanho. A posição é estimada
por IP, não é GPS e pode refletir VPN, proxy ou rede da operadora. Não se faz
consulta de geocodificação externa nem se solicita permissão de localização.

A tabela exibe IP e cidade/região/país. Os detalhes mostram um mapa com marcador
quando existem coordenadas válidas. O contexto fica disponível no campo
`device` da auditoria. O envio de emails de erros está suspenso. Registros antigos não são
preenchidos retroativamente.

`GET /api/v1/audit/frontend-errors/map` exige as mesmas permissões da auditoria
e retorna `{ total, points: [{ id, createdAt, eventType, route, latitude, longitude }] }`,
no mesmo período UTC de 30 dias dos gráficos. `total` inclui erros sem localização;
`points` contém apenas coordenadas numéricas válidas, sem IPs, mensagens ou logs.
O mapa geral considera todas as páginas, agrupa coordenadas idênticas com contagem
e permite abrir cada erro pelo marcador ou pela lista de ocorrências localizadas.
O mapa usa Leaflet e tiles OpenStreetMap com atribuição; o navegador do auditor
carrega os tiles desse provedor. A falha do mapa não bloqueia a tabela de erros.

Referência dos cabeçalhos: https://vercel.com/docs/headers/request-headers.

## Envio de reembolsos e falhas de infraestrutura (2026-10-23)

Atualização de 29/10: a versão 1.3.2 passa a usar [envio em blocos com retoma e idempotência](reimbursement-resumable-uploads.md) no formulário de novos pedidos. As regras abaixo sobre ausência de repetição automática continuam aplicáveis ao endpoint multipart antigo. Os novos endpoints de sessão/blocos/finalização admitem repetição segura conforme o contrato documentado.

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

## Consulta na auditoria e alertas

A página Erros de frontend (`/audit/errors`), no grupo Auditoria do menu, inclui
tabela paginada no servidor (10, 25, 50 ou 100 itens),
com detalhes completos em um dialogo. Ambas as rotas exigem todas as permissoes
da auditoria:

- `GET /api/v1/audit/frontend-errors?page=1&pageSize=25`: retorna
  `{ items, total, page, pageSize }`, ordenado por `createdAt DESC, id DESC`.
  Stack e logs completos sao carregados apenas no detalhe.
- `GET /api/v1/audit/frontend-errors/:id`: registro completo; 404 se ausente.
  Pagina aceita 1 a 100000; pageSize aceita 1 a 100.

### Gráficos e indicadores

`GET /api/v1/audit/frontend-errors/stats` exige as mesmas permissões de auditoria
e retorna `{ rows: [{ kind, label, count }] }`. A agregação ocorre no Postgres,
sem carregar mensagens, stacks ou identificadores de utilizadores no navegador.
O período inclui hoje e os 29 dias anteriores, com limites de calendário em UTC,
usando `created_at` (hora de recebimento). A timeline inclui dias com zero erros.

A página apresenta pizza por tipo, evolução diária com valores consultáveis,
total do período, total de hoje, utilizadores identificados distintos (exclui
registros sem utilizador) e falhas HTTP 5xx. Rankings mostram até oito status
HTTP, rotas, versões, navegadores e sistemas operativos mais frequentes, com
categorias explícitas para dados ausentes. Os gráficos incluem 401 e 403,
mesmo sem alertas por email, e independem da paginação da tabela. Falhas no
carregamento das estatísticas não impedem a consulta da lista ou dos detalhes.

### Identificação do usuário e emails suspensos

`userId` é o ID da conta autenticada na requisição de ingestão, validada pelo
Bearer token no servidor. Não se aceita ID de usuário fornecido no corpo do
relatório. Sem sessão válida, o relatório permanece sem usuário identificado.
O ID da conta (`users.id`) é diferente do ID do cadastro (`members.id`).

Listagem e detalhes retornam também `user: { id, name, memberId } | null`,
selecionando apenas esses campos da conta relacionada. A UI mostra o nome
com link para `/members/:memberId`, a ficha unificada de cadastro e acesso.
Os detalhes preservam a apresentação do `userId`. Contas sem cadastro associado
mostram o nome sem link; registros anônimos aparecem como Não identificado.

O envio de emails de erros está suspenso para todos os tipos e status HTTP,
mesmo se `FRONTEND_ERROR_EMAIL_TO` e Bird estiverem configurados. O serviço
não depende do módulo de email e a ingestão não aguarda nem chama a Bird.
A persistência, a auditoria, os gráficos e a retenção de 30 dias continuam ativos.
Outros emails transacionais da aplicação não são alterados. A suspensão entra
em vigor quando a versão com esta alteração é implantada.

## Recuperação de rede e diagnóstico (1.3.0)

O transporte repete somente GET com falha de comunicação, até três tentativas,
com esperas de 500 ms e 1500 ms. Há limite de 15 segundos até os cabeçalhos por
tentativa e orçamento total de 30 segundos. Timeout e indicação offline não
disparam novas tentativas automáticas. POST/PATCH/DELETE não são repetidos por
falhas de rede; têm espera máxima de 90 segundos até os cabeçalhos (15 segundos
para renovação de sessão). A renovação única após 401 mantém o contrato existente.
Esses limites não abrangem a leitura posterior do corpo ou de downloads.

Ao esgotar tentativas, um único relatório inclui tipo (`network`, `offline` ou
`timeout`), nome limitado da exceção, duração, número de tentativas, indicação
`navigator.onLine` e visibilidade da aba. Não se capturam mensagens/stack da
exceção de fetch, URLs completas, corpos, tokens ou conteúdo dos documentos.
Falhas na serialização do pedido não são classificadas como falhas de rede.
Leituras recuperadas não geram erro: ficam nos últimos 20 breadcrumbs em memória,
sem query string, e aparecem no contexto de um relatório posterior se houver.
React Query não repete erros de transporte já esgotados nem HTTP 4xx. Consultas
HTTP 5xx mantêm até uma repetição nas configurações que já a permitiam.

Falhas transitórias em `/auth/refresh` preservam o token em memória; somente
401 confirmado encerra a sessão. Uma consulta posterior pode renovar novamente.
Se a restauração inicial falhar por rede/5xx, o evento `online` permite tentar
restaurá-la. Login/logout manuais cancelam essa recuperação inicial. Tentativas
GET pendentes não voltam a enviar tokens de uma sessão que tenha sido alterada.

O aviso offline orienta a manter a página aberta. Consultas pausadas retomam na
reconexão. Gravações offline falham imediatamente e não ficam numa fila para
ser enviadas automaticamente depois. Dados já carregados permanecem no cache
se uma atualização falhar, respeitando as permissões e os ciclos da sessão.

### Cache de consultas no cliente

O React Query mantém o cache em memória. Desde 1.3.1, o transporte também persiste respostas GET elegíveis em CacheStorage, seguindo o TTL HTTP e o isolamento por conta/permissões. A idade original da resposta persistida é preservada no React Query, sem reiniciar o TTL ao recarregar. Login/logout e expiração limpam consultas; logout/expiração removem também respostas persistidas. A restauração da mesma conta verificada online pode reutilizar respostas dentro do prazo. Veja [todas as políticas e exceções](http-cache-policy.md).

| Consultas | Validade antes de nova consulta | Retenção quando inativas |
| --- | --- | --- |
| Aniversariantes da semana | 1 dia | 25 horas |
| Financeiro, reembolsos e lookups financeiros | 1 hora | 65 minutos |
| Catálogo da biblioteca, livros no portal e outras consultas | 6 horas | 6 horas e 5 minutos |
| Disponibilidade, exemplares, empréstimos, reservas e painéis da biblioteca | Sem validade para reutilização | 6 horas e 5 minutos |

Consultas operacionais (saúde, auditoria, notificações e status de pagamentos)
mantêm verificação atualizada. Financeiro
e biblioteca revalidam consultas ao voltar à aba quando desatualizadas e sempre
na reconexão. Os filtros e páginas continuam nas chaves do cache. Gravações
financeiras invalidam `finance`; operações da biblioteca e reservas invalidam
também o portal. Alterar/excluir membros invalida aniversariantes. O resumo
financeiro, a biblioteca e os aniversariantes mostram a hora da última resposta
e permitem atualização manual. A resposta da API continua sendo a fonte dos
valores e da autorização das gravações; o cache não confirma disponibilidade
de um livro nem saldo para autorizar uma operação.

### Disponibilidade separada do catálogo

`GET /api/v1/library/books/availability?ids=<UUIDs separados por vírgula>`
exige `LIBRARY_BOOK_READ`, aceita 1 a 100 IDs únicos e retorna
`[{ bookId, quantity, available }]`. Consulta somente o ID e status dos
exemplares; `available` conta apenas status `AVAILABLE`. Livros inexistentes
não aparecem. Não altera o contrato da listagem do catálogo.

Os catálogos administrativo e do portal reutilizam os metadados por 6 horas,
mas buscam as quantidades separadamente, em lote, ao montar a tela, voltar à
aba, reconectar e a cada 30 segundos enquanto visíveis. Se a consulta falhar,
não exibem a disponibilidade antiga como atual. Filtros por disponibilidade,
listas de exemplares, empréstimos, reservas e painéis operacionais não usam
os tempos longos de cache. Os seletores de exemplares consultam dados atuais.

Essa atualização é por consulta, não por WebSocket: outro utilizador pode
alterar o estado entre duas consultas. As transações de reserva/empréstimo
continuam validando o estado atual no servidor. Reservar um livro sem exemplar
disponível continua permitindo entrar na fila, conforme a regra existente.

## Verificação de versão após erros

O build publica `/app-version.json` com a mesma `APP_VERSION` usada no rodapé
e nos relatórios. Esse arquivo não entra no precache do PWA. A consulta usa
`cache: no-store`, URL com timestamp e não depende da API nem da autenticação.

Após registrar falhas de rede ou HTTP 5xx, o cliente aguarda até 2,5 segundos
para consultar a versão antes de apresentar a mensagem. Se houver uma versão
semanticamente superior, apresenta um aviso com botão **Atualizar**. Erros de
validação, sessão e permissão (HTTP 4xx) mantêm suas mensagens e fluxos existentes.
Consultas simultâneas compartilham o mesmo pedido e há intervalo mínimo de
10 segundos entre verificações, evitando consultas em cascata.

Erros globais e de console também disparam a consulta. Uma barreira de erros
React registra falhas de renderização (incluindo carregamento de rotas) e mostra
uma mensagem de espera antes de escolher entre o aviso de atualização e a
mensagem normal de falha. Os controles de atualização ficam fora dessa barreira.
Falhas de rede, versão igual/antiga, resposta inválida ou timeout na consulta
preservam a mensagem original, sem gerar novos relatórios por causa da consulta.

A atualização só acontece depois do clique: o service worker verifica o novo
build e aguarda sua ativação antes de recarregar. Sem service worker, o botão
recarrega a página. Fechar o aviso mantém os dados em memória. Atualizar pode
descartar formulários e anexos ainda não guardados; o aviso pede para guardá-los.
Nenhuma operação de gravação é repetida por esse mecanismo. A renovação de
sessão em 401 continua com o comportamento anterior. Os relatórios mantêm a
versão do cliente que sofreu a falha, mesmo quando há atualização disponível.
