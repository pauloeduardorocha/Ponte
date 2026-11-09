# Cadastro unificado de membros

Membros e contas mantêm seus IDs históricos para preservar referências de eventos, biblioteca, financeiro e auditoria. Cada conta possui um membro, e cada membro pode ter no máximo uma conta. Familiares podem ser cadastrados sem conta, conforme o fluxo abaixo. A gestão de conta, senha e roles fica no detalhe do membro. `/users` redireciona para `/members`.

Todo membro autenticado com conta aprovada (`ACTIVE`) recebe `COMMUNITY_READ`, `FINANCE_SUMMARY_READ`, `LIBRARY_BOOK_READ` e `LIBRARY_SELF_RESERVE`, independentemente de roles. Essas permissões não concedem acesso às APIs administrativas. Reservas usam o membro da sessão; o cliente não escolhe outra pessoa. O diretório expõe apenas nomes dos integrantes ativos. Endereço e horário dos grupos são consultados por um endpoint que exige vínculo ativo, liderança, coliderança ou função de anfitrião.

O resumo financeiro devolve somente totais por moeda e evolução mensal, sem categorias, movimentos, pessoas, contas ou importações. O servidor recusa filtro por conta nesse acesso básico.

## Migração

Aplicar `20261015120000_unified_member_accounts` com o fluxo habitual de migrations antes de disponibilizar a nova interface. A migração preserva hashes de senhas e cria contas sem roles para membros sem conta. E-mails ausentes recebem `sememail+<UUID>@aponte.pt`. Contas novas recebem uma senha aleatória desconhecida: um administrador autorizado define a senha no detalhe do membro. O envio de recuperação por e-mail continua dependendo da configuração do adaptador de entrega existente.

Se houver e-mails reais duplicados entre membros, a migração aborta atomicamente para permitir revisão das identidades, sem unir pessoas por suposição. Esse teste de implementação não comprova o estado atual da produção.

## Verificação

Testes de API cobrem o acesso sem roles, a projeção financeira, a restrição de detalhes de grupo e reservas com identidade da sessão. Testes da interface cobrem catálogo e inscrições, reserva de livros, grupos, financeiro agregado e gestão de acesso no membro. A migração foi executada em PostgreSQL temporário com PGlite, incluindo todo o histórico anterior de migrations.

Cadastros feitos em **Criar conta** ficam em `PENDING_APPROVAL`, sem essas permissões, até serem aprovados por um administrador ou pastor. Veja o [fluxo de aprovação e o contrato de cadastro](pending-approvals.md).

## Família

Disponível em **Minha conta → Família** para contas ativas e no detalhe administrativo de um membro. Permite adicionar, editar o parentesco e remover vínculos de pai, mãe, filho(a) ou cônjuge. Ao selecionar filho(a), informe se o membro principal é pai ou mãe. Um único registro armazena os papéis das duas pessoas; todas as alterações são recíprocas e remover o vínculo preserva os cadastros e acessos.

É possível buscar um membro existente pelo nome (mínimo de dois caracteres, até 20 resultados, somente ID e nome) ou cadastrar um familiar com nome e data de nascimento obrigatórios. Não são permitidos vínculos consigo mesmo, pares duplicados, datas futuras ou membros anonimizados. A busca apresenta membros ativos sem conta ou com acesso aprovado. Vínculos existentes podem ser editados mesmo quando a conta do familiar ainda aguarda aprovação.

O checkbox **Criar acesso ao sistema para o familiar** torna telefone, e-mail e senha obrigatórios (senha de 12 a 128 caracteres). O cadastro, a conta e o vínculo são gravados na mesma transação. A conta recebe `PENDING_APPROVAL`, sem roles, inclusive quando cadastrada pela administração neste formulário, e aparece na mesma fila do autocadastro. Sem marcar o checkbox, contatos são opcionais e nenhuma conta é criada.

API autenticada:

- `GET /member-family/:id`: vínculos com parentesco, papel inverso, ID/nome/nascimento do familiar e estado de acesso.
- `GET /member-family/:id/search?search=...`: busca de membros para vincular.
- `POST /member-family/:id`: cria ou atualiza o vínculo do par; retorna `{ success: true }`. Corpo: `relation` (`FATHER`, `MOTHER`, `CHILD`, `SPOUSE`), `parentRole` (`FATHER`/`MOTHER`, obrigatório para `CHILD`) e `memberId` para pessoa existente; para novo familiar, `name`, `birthDate`, `createAccount` e contatos/senha conforme o checkbox.
- `DELETE /member-family/:id/:linkId`: remove o vínculo nos dois sentidos, retornando 204.

`:id` aceita UUID ou `me`. O membro pode operar apenas seus próprios vínculos. Para outro membro, a API exige `MEMBER_READ` para consultar e `MEMBER_UPDATE` para buscar, adicionar, alterar ou remover. Contas pendentes continuam bloqueadas pelo guard de autenticação. Vínculos são auditados e removidos durante a anonimização.

Aplicar `20261104120000_member_family` antes de disponibilizar a interface. O indicador `members.without_account`, usado para novos familiares sem acesso, permite e-mail ausente e impede a criação automática de conta pelos gatilhos. Cadastros existentes mantêm seus acessos e o comportamento anterior. Aplique as migrations pendentes pelo fluxo administrativo; esta documentação não confirma o estado de produção.
