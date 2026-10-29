# Envio de reembolsos em blocos

A partir da versão 1.3.2, o formulário envia os documentos em blocos de 256 KiB. Os ficheiros continuam privados, no armazenamento já configurado (banco em produção); não há dependência de Blob ou S3. A API ainda recebe cada bloco pela Vercel, mas cada transferência é menor. Isso reduz a exposição a interrupções de uploads grandes; não garante que todas as falhas de rede desapareçam.

## Contrato

Todos os endpoints exigem autenticação, conta aprovada e vínculo de membro. Apenas a conta que iniciou a sessão pode enviar blocos ou finalizá-la; permissões financeiras não permitem assumir a sessão de outra pessoa.

1. `POST /api/v1/reimbursements/submissions`: JSON com `id` UUID gerado pelo cliente, os campos existentes `iban`, `categoryId`, `amount`, `purpose` e `files: [{ name, type, size, sha256 }]`. SHA-256 hexadecimal minúsculo sobre todos os bytes do ficheiro preparado. Aceita 1–3 documentos, até 2 MiB cada e 4 MiB no total. Retorna `{ id, chunkSize: 262144 }`. O mesmo UUID e dados retomam a sessão; mudar os dados com o mesmo UUID retorna 409. Não cria um reembolso nem envia notificações.
2. `POST /api/v1/reimbursements/submissions/:id/files/:fileIndex/chunks/:offset`: multipart com um único campo `file`. Índice começa em zero, offset em bytes múltiplo de 262144. Cada bloco tem exatamente 256 KiB ou os bytes restantes no último bloco. Retorna `{ received: true }`. Repetir o bloco é seguro; trocar os bytes já guardados retorna 409.
3. `POST /api/v1/reimbursements/submissions/:id/complete`: sem documentos no corpo. Confere continuidade, tamanho e SHA-256, além da validação existente de MIME, extensão e assinatura. Só cria o pedido quando todos os documentos estiverem completos. Documento incompleto ou inválido retorna 400. O vínculo entre sessão e reembolso é gravado na mesma transação que o pedido e a auditoria. Um bloqueio transacional por sessão serializa finalizações concorrentes. Repetições retornam o mesmo pedido sem repetir notificações nem auditoria.

O antigo `POST /reimbursements` multipart permanece compatível com clientes antigos e não recebe repetição automática. Anexar documentos a pedidos existentes mantém o fluxo anterior.

## Retoma e limites

O cliente repete apenas as novas operações idempotentes em falhas de transporte (status 0) e HTTP 502/503/504: até três tentativas por operação, com esperas exponenciais de 500 e 1000 ms mais jitter de até 250 ms. Erros de validação, autorização e limite de pedidos não são repetidos automaticamente. Não há repetição global de escritas da aplicação.

O formulário conserva em memória a chave, os ficheiros e os blocos confirmados. A tentativa manual com os mesmos dados retoma os blocos pendentes. Alterar campos ou ficheiros cria outra sessão. Fechar ou recarregar a página perde esse estado; não se promete retoma entre sessões do navegador. Antes de reenviar após uma recarga, consultar os pedidos existentes. Não há persistência de documentos no browser.

Sessões expiram em 24 horas e há no máximo três sessões incompletas ativas por conta. A expiração bloqueia novas operações. A remoção física é oportunista: cada início de envio remove até 100 sessões expiradas, com cascade dos seus blocos. Sem novos envios, dados expirados podem permanecer no banco até à próxima limpeza. Depois da criação, os blocos temporários são removidos na própria transação; os anexos definitivos seguem a retenção normal dos reembolsos. A referência de idempotência é mantida até à limpeza da sessão.

## Publicação e verificação

É necessário aplicar a migração `20261029150000_reimbursement_chunk_uploads` e reaplicar `runtime-privileges.sql` pelo procedimento normal de deploy antes de servir o novo frontend. Não há alteração de credenciais nem novo serviço externo. A versão cliente deve continuar a ser registada como enviada pelo navegador.

Os testes verificam integridade dos bytes, retoma, repetição de blocos, falhas transitórias, resposta final perdida, isolamento entre contas, blocos inválidos, expiração e limites. O teste HTTP com PostgreSQL em `operations.e2e-spec.ts` verifica duas finalizações concorrentes e os documentos efetivamente persistidos. Testes locais não reproduzem a rede móvel afetada: validar posteriormente no Android da utilizadora.
