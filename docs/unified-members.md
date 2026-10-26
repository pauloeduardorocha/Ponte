# Cadastro unificado de membros

Membros e contas mantêm seus IDs históricos para preservar referências de eventos, biblioteca, financeiro e auditoria. A relação passa a ser obrigatoriamente um para um no fluxo da aplicação e nos gatilhos de criação do banco. A gestão de conta, senha e roles fica no detalhe do membro. `/users` redireciona para `/members`.

Todo membro autenticado com conta aprovada (`ACTIVE`) recebe `COMMUNITY_READ`, `FINANCE_SUMMARY_READ`, `LIBRARY_BOOK_READ` e `LIBRARY_SELF_RESERVE`, independentemente de roles. Essas permissões não concedem acesso às APIs administrativas. Reservas usam o membro da sessão; o cliente não escolhe outra pessoa. O diretório expõe apenas nomes dos integrantes ativos. Endereço e horário dos grupos são consultados por um endpoint que exige vínculo ativo, liderança, coliderança ou função de anfitrião.

O resumo financeiro devolve somente totais por moeda e evolução mensal, sem categorias, movimentos, pessoas, contas ou importações. O servidor recusa filtro por conta nesse acesso básico.

## Migração

Aplicar `20261015120000_unified_member_accounts` com o fluxo habitual de migrations antes de disponibilizar a nova interface. A migração preserva hashes de senhas e cria contas sem roles para membros sem conta. E-mails ausentes recebem `sememail+<UUID>@aponte.pt`. Contas novas recebem uma senha aleatória desconhecida: um administrador autorizado define a senha no detalhe do membro. O envio de recuperação por e-mail continua dependendo da configuração do adaptador de entrega existente.

Se houver e-mails reais duplicados entre membros, a migração aborta atomicamente para permitir revisão das identidades, sem unir pessoas por suposição. Nenhum dado de produção foi alterado durante a implementação.

## Verificação

Testes de API cobrem o acesso sem roles, a projeção financeira, a restrição de detalhes de grupo e reservas com identidade da sessão. Testes da interface cobrem catálogo e inscrições, reserva de livros, grupos, financeiro agregado e gestão de acesso no membro. A migração foi executada em PostgreSQL temporário com PGlite, incluindo todo o histórico anterior de migrations.

Cadastros feitos em **Criar conta** ficam em `PENDING_APPROVAL`, sem essas permissões, até serem aprovados por um administrador ou pastor. Veja o [fluxo de aprovação e o contrato de cadastro](pending-approvals.md).
