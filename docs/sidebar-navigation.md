# Menu lateral

O grupo Auditoria contém duas páginas independentes: Registros de auditoria
(`/audit`) e Erros de frontend (`/audit/errors`). O grupo abre ao acessar qualquer
uma delas e apenas o item da página atual fica selecionado. Ambas preservam as
permissões cumulativas de auditoria. Cada página consulta somente seus próprios
registros; os erros mantêm a paginação no backend e o diálogo de detalhes.

Escalas (`/schedules`) fica no grupo Grupos e ministérios, junto de Grupos familiares e Ministérios, mantendo as permissões existentes.

Todos os itens sem menu pai aparecem antes dos grupos recolhíveis, conforme as permissões da conta. Atualmente são Visão geral e Biblioteca; depois vêm Datas e os demais grupos. A ordenação usa a mesma configuração que define quais itens não têm menu pai, preservando a ordem relativa dentro de cada conjunto.

O grupo Financeiro contém Tesouraria (`/finance`) e Meus reembolsos (`/reimbursements`). Tesouraria mantém as permissões da antiga opção Financeiro; Meus reembolsos mantém o acesso pessoal existente. As funcionalidades internas da tesouraria continuam na própria página.

O grupo Datas contém Calendário (`/calendar`), Gestão de eventos e Agenda de eventos. O grupo abre ao acessar uma dessas rotas. O calendário está disponível para contas aprovadas autenticadas; os itens de eventos preservam suas permissões.

A tela Calendário incorpora o Google Calendar da igreja e oferece o link compartilhado para adicionar à conta Google, além de assinatura `webcal` para aplicativos compatíveis. A incorporação e o feed de assinatura dependem do compartilhamento público configurado pelo proprietário no Google Calendar. Os eventos continuam mantidos no Google, sem cópia no banco do Ponte.
