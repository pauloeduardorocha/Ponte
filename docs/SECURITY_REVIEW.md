# Autenticação, auditoria e privacidade

Referência do código atual; não é uma certificação de segurança ou de conformidade. A [revisão de 07/10/2026](archive/security-review-20261007.md) foi preservada como histórico. Resultados de auditoria de dependências e testes daquela data não descrevem a árvore atual.

## Autenticação e autorização

Senhas usam Argon2id. Access JWT tem prazo de 15 minutos e fica em memória no frontend; refresh opaco fica em cookie HttpOnly, SameSite=Strict e Secure em produção, com hash no banco. Rotação, detecção de reutilização e revogação são controladas por sessão/família. Trocar ou recuperar senha revoga sessões; alterar senha não remove passkeys.

`AuthGuard` e `PermissionGuard` são globais. Permissões atuais são consultadas no servidor; decorar uma rota com várias permissões exige todas, salvo alternativas explícitas. Escopos de liderança e atribuição são conferidos pelos serviços. Ocultar menu não substitui autorização. A aplicação atende uma igreja, sem isolamento multi-tenant.

Cadastro público cria conta pendente; conteúdo e operações ficam sujeitos à [aprovação](pending-approvals.md). Contas ativas recebem o acesso básico descrito no [cadastro unificado](unified-members.md). O sistema atual vincula conta e membro; não há associação por simples coincidência de e-mail em uma requisição.

Recuperação usa token de uso único de 30 minutos e resposta pública genérica; entrega depende da [Bird](email.md). [Passkeys](passkeys.md) usam desafios e validação WebAuthn no servidor. Use HTTPS, origens exatas e proxy na mesma origem para cookies.

Rate limit global: 100 pedidos/minuto/IP, com limites menores nos endpoints específicos. Buckets são compartilhados no PostgreSQL. A expiração lógica não equivale a limpeza física periódica. DTOs rejeitam campos desconhecidos e validam filtros, IDs e limites.

## Auditoria

Triggers e contexto transacional registram alterações nos domínios auditados. Operações de autenticação, downloads e exportações também possuem eventos explícitos. Dados sensíveis de credenciais são removidos dos snapshots. Eventos antigos sem snapshots completos não podem ser reconstruídos retroativamente.

`GET /api/v1/audit` oferece paginação e filtros. O controlador exige cumulativamente leitura de auditoria, identidade, membros, contribuições, histórico de biblioteca e domínios operacionais, além de `OPERATION_SCOPE_ALL`; confira a lista em `apps/api/src/modules/audit/audit.controller.ts`. A mesma proteção vale para [erros de frontend](frontend-error-reporting.md). Não há endpoint comum de edição/exclusão da auditoria; o [runtime do banco](database-security.md) também impede essas alterações.

## Privacidade

Rotas sob `/api/v1/privacy`, sempre autenticadas:

| Caminho e método                       | Finalidade                                                 |
| -------------------------------------- | ---------------------------------------------------------- |
| `GET /me`, `GET /me/export`            | Perfil vinculado e exportação própria                      |
| `GET /members/:id/export`              | Exportação assistida com permissões de privacidade/membros |
| `GET/POST /me/requests`                | Consulta/criação de solicitações próprias                  |
| `POST /me/consents`                    | Finalidade, versão da política, concessão/retirada         |
| `GET /requests`, `PATCH /requests/:id` | Triagem e resolução administrativa                         |
| `GET/POST /retention`                  | Política explícita de retenção                             |
| `PATCH /members/:id/legal-hold`        | Bloqueio legal                                             |
| `POST /members/:id/anonymize`          | Anonimização transacional de perfil elegível               |

Incluir contribuições na exportação exige conjuntamente `FINANCE_CONTRIBUTION_READ` e `FINANCE_CONTRIBUTION_EXPORT`, inclusive na exportação própria. Downloads usam `no-store` e não revelam chaves de armazenamento.

Anonimização depende de solicitação e validações de retenção, bloqueio legal, vínculos financeiros e obrigações da biblioteca. Limpa dados pessoais, desativa acesso e revoga sessões, preservando evidências retidas e auditoria. Perfis anonimizados não podem ser reidentificados por edição comum. Prazos, bases e tratamento de pedidos envolvendo histórico retido dependem do responsável da igreja; não há descarte automático universal.

## Arquivos e operação

Uploads e downloads passam por autorização, validação de nome, extensão, MIME, assinatura e limites próprios. UUID conhecido não concede acesso. Em Vercel, binários ficam no PostgreSQL; filesystem requer diretório privado e backup coordenado. Não publique `private-storage` como conteúdo estático.

Segredos, MFA, retenção e recuperação precisam de acompanhamento operacional. Consulte [segurança do banco](database-security.md), [backup](backup-recovery.md), [CI](ci.md) e [contratos](api-contracts.md) para procedimentos reproduzíveis. Testes locais não demonstram a configuração atual dos provedores.
