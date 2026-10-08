# Revisão de segurança e auditoria — 7 de outubro de 2026

## Escopo e resultado

Revisão do código da API, frontend, autenticação, RBAC, consultas de membros,
biblioteca, financeiro, importação, conciliação, relatórios, uploads e migrações.
Os testes de integração usam schemas PostgreSQL exclusivos e dados sintéticos.
Esta revisão não constitui certificação de segurança ou de conformidade legal.

Validação final: 137 testes da API em 16 suítes e 55 testes do frontend em 9
arquivos, todos aprovados. `npm run lint` sem erros ou avisos, `npm run build`
concluído e `npm audit`/`npm audit --omit=dev` com zero vulnerabilidades
conhecidas. As onze migrações estão aplicadas no banco local e o diff entre
banco e schema Prisma está vazio. Os testes incluem falhas deliberadas da
auditoria para verificar rollback de operações financeiras.

## Problemas corrigidos

| Encontrado                                                                   | Correção                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alterações de membros, usuários e permissões sem histórico completo          | Auditoria transacional por triggers nas tabelas críticas, com ator e snapshots reais anteriores/posteriores.                                                                                                       |
| Auditoria sem IP e navegador                                                 | Contexto por requisição com AsyncLocalStorage, propagado por parâmetros locais à transação PostgreSQL. Cabeçalhos de IP enviados por clientes não são tratados como confiáveis.                                    |
| Logs financeiros sem todos os valores anteriores                             | Snapshots no banco; eventos semânticos herdam snapshots da mesma entidade e transação. Valores monetários permanecem strings decimais.                                                                             |
| Possibilidade de modificar logs via acesso comum ao banco                    | Trigger rejeita UPDATE/DELETE; API e tela oferecem somente consulta. Script de privilégios separa o usuário de execução do dono das migrações.                                                                     |
| Descrições de receitas sem membro associado poderiam revelar nomes bancários | Receitas, referências e origens são ocultadas sem FINANCE_CONTRIBUTION_READ, inclusive em relatórios e exportações gerais.                                                                                         |
| Bloqueio de login somente por IP                                             | Contador persistente por conta: dez falhas em quinze minutos bloqueiam por quinze minutos; mensagens genéricas e identificação por HMAC.                                                                           |
| Rate limiting isolado por processo                                           | Contadores atômicos PostgreSQL compartilhados entre instâncias e reinicializações; autenticação mantém limite de dez requisições/minuto e limite geral de cem/minuto.                                              |
| Ausência de fluxo seguro para delegar permissões                             | Alteração de perfis exige PERMISSION_MANAGE, impede elevar acima das permissões do operador, impede alterações próprias e preserva o último SUPER_ADMIN ativo. Sessões são revogadas.                              |
| Ausência de vínculo verificado entre usuário e membro                        | Vínculo único, explícito e administrado com permissão; nenhuma associação automática por e-mail. Trocas de vínculo revogam sessões.                                                                                |
| Referências bancárias e responsáveis sem algumas foreign keys                | FKs com RESTRICT, índices de consulta e validações de conciliação diferidas até o commit.                                                                                                                          |
| Integridade bancária dependia apenas do serviço                              | Banco impede alterar o arquivo original/movimento, apagar origens e histórico de conciliação, excluir lançamentos conciliados e gravar conciliações com valor, data, conta, categoria ou identidade incompatíveis. |
| Desfazer conciliação manual conflitou com proteção da origem                 | Desfazimento registra responsável, data e motivo antes de liberar o lançamento manual; histórico de conciliação permanece. Lançamentos criados pela importação preservam sua origem.                               |
| ZIP XLSX poderia declarar expansão menor que a real                          | Diretório ZIP validado, formatos e criptografia restritos, inflação limitada e comparação entre expansão declarada e real antes do ExcelJS.                                                                        |
| Nomes de uploads com caminhos/caracteres de controle                         | Rejeição de separadores, dois-pontos e controles; extensão, MIME, assinatura e tamanho validados. Arquivos usam chave UUID e armazenamento privado.                                                                |
| Exceções poderiam imprimir dados pessoais/financeiros e parâmetros SQL       | Filtro global registra apenas referência de erro; respostas inesperadas são genéricas. Manutenção e health check não imprimem exceções completas.                                                                  |
| Dependências com avisos de segurança                                         | UUID do ExcelJS atualizado; cadeia de ferramentas de testes deixou de carregar sprintf-js por atualização compatível de js-yaml. npm audit passou a zero vulnerabilidades conhecidas.                              |

## Auditoria e acesso

AuditLog expõe `id`, `userId`, `action`, `entity`, `entityId`, `oldValues`,
`newValues`, `ip`, `userAgent`, `createdAt`; também mantém metadata e identificador
da transação para correlação. As colunas antigas de ator/entidade preservam os
nomes físicos para compatibilidade com histórico existente.

Triggers registram membros, usuários, papéis, permissões e vínculos, categorias,
contas, fornecedores, receitas, despesas, contribuições, anexos, importações,
transações bancárias, conciliações, biblioteca, multas, pagamentos, ajustes e
perdões, solicitações de privacidade, consentimentos e políticas de retenção.
Eventos de autenticação incluem sucesso/falha/bloqueio, logout, refresh,
reutilização de refresh e alterações/recuperação de senha. Downloads e exportações
registram responsável; exportações financeiras registram relatório, filtros e
quantidade. Senhas, hashes, tokens e chaves privadas de armazenamento são
removidos dos snapshots e metadados.

O menu **Auditoria** e `GET /api/v1/audit` permitem filtros por período, ator,
ação, entidade e entidadeId, com paginação. A consulta exige conjuntamente
AUDIT_READ, MEMBER_READ, USER_READ, FINANCE_CONTRIBUTION_READ e
LIBRARY_HISTORY_READ, VISITOR_READ, EVENT_READ, OPERATION_SCOPE_ALL e leitura de FOLLOWUP, SMALL_GROUP, MINISTRY, SCHEDULE, ATTENDANCE e NOTIFICATION, evitando usar auditoria como uma rota alternativa para
dados protegidos. SUPER_ADMIN possui essas permissões. Não existe endpoint de
exclusão ou edição. Eventos antigos sem snapshots completos não podem ter seu
estado anterior reconstruído retroativamente.

Membros comuns não consultam cadastros alheios. A biblioteca retorna somente a
identificação necessária aos operadores autorizados. Receitas/contribuições,
anexos, arquivos bancários e relatórios verificam permissões no servidor;
conhecer ou alterar um UUID não concede acesso. O sistema atual possui uma
única igreja; estes controles não implementam isolamento entre múltiplas igrejas.

## Arquitetura de privacidade

Todas as rotas abaixo ficam sob `/api/v1/privacy` e exigem autenticação:

| Rota                         | Finalidade                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| GET me                       | Perfil do membro explicitamente vinculado ao usuário atual.                                  |
| GET me/export                | Exportação JSON do perfil, consentimentos, solicitações e histórico de empréstimos próprios. |
| GET members/:id/export       | Exportação assistida, com PRIVACY_EXPORT e MEMBER_READ.                                      |
| POST me/requests             | Solicitação de exportação, retificação ou anonimização; membro é derivado da sessão.         |
| GET me/requests              | Consulta das próprias solicitações.                                                          |
| POST me/consents             | Registro de finalidade, versão da política, concessão ou retirada e responsável.             |
| GET/PATCH requests           | Triagem e resolução administrativa, com permissões de privacidade e membros.                 |
| GET/POST retention           | Configuração explícita de prazo mínimo por classe e sua justificativa/base.                  |
| PATCH members/:id/legal-hold | Bloqueio de anonimização por retenção legal.                                                 |
| POST members/:id/anonymize   | Anonimização transacional de perfil elegível, vinculada a solicitação pendente.              |

Incluir contribuições em qualquer exportação pessoal exige simultaneamente
FINANCE_CONTRIBUTION_READ e FINANCE_CONTRIBUTION_EXPORT, mesmo para exportação
própria. Os downloads usam no-store e não retornam chaves de armazenamento.

Retificação usa MEMBER_UPDATE e preserva antes/depois. Anonimização remove os
contatos, nascimento e notas do perfil, pseudonimiza nomes e conta vinculada,
desativa acesso e revoga sessões e recuperações de senha. Perfis anonimizados
não podem ser reidentificados por edição comum. Ela bloqueia histórico
financeiro/bancário, obrigações da biblioteca, contas administrativas, bloqueio
legal e retenção ainda vigente. Registros de auditoria e evidências retidos
permanecem sob acesso restrito. Não há apagamento automático de documentos,
auditoria ou evidências financeiras.

Prazos e bases não foram presumidos: devem ser configurados pelo responsável.
Pedidos envolvendo histórico retido exigem avaliação e tratamento assistido.
Textos de consentimento, obrigações legais, política de backups e descarte devem
ser definidos pela igreja. As APIs preparam esses fluxos; não foi criada uma
tela de autosserviço de privacidade nesta revisão.

## Operação

Em produção, execute migrações com o dono administrativo do schema. Depois,
aplique `apps/api/prisma/runtime-privileges.sql`, configure login e senha desse
papel por canal administrativo e use suas credenciais em DATABASE_URL da API.
Reaplique os grants após migrações que criem tabelas. O papel de execução não
deve possuir o schema, pertencer ao papel proprietário ou poder administrar
papéis/triggers. O ambiente local permanece com credenciais de desenvolvimento.

Use HTTPS em produção para cookies Secure; mantenha CORS_ORIGIN limitado às
origens da igreja e segredos JWT distintos e aleatórios. O servidor não confia
automaticamente em X-Forwarded-For; configuração de proxy deve ocorrer somente
para proxies efetivamente controlados. Arquivos privados precisam de ACLs do
sistema operacional e backups protegidos. Não publique private-storage nem
volumes bancários no servidor estático.

Contadores de rate limit e login são dados operacionais. Remova periodicamente
somente buckets expirados e bloqueios vencidos, usando uma rotina administrativa;
isso não autoriza remover AuditLog. Política aprovada de retenção e descarte de
auditoria requer manutenção administrativa separada.

Fontes dos avisos de dependências: [UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
e [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
