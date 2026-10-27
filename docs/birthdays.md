# Aniversariantes

A página inicial consulta `GET /community/birthdays?period=week`: membros ativos, não anonimizados, da segunda-feira ao domingo atuais em Europe/Lisbon, ordenados por data e nome. Retorna `id`, `name` e `birthday` (DD/MM), sem revelar ano ou idade. Sem `period=week`, mantém o contrato anterior de aniversariantes do dia. O acesso continua disponível a contas autenticadas, incluindo as que aguardam aprovação.

`pushBirthdays` é uma preferência booleana por conta, ativa por padrão, retornada em `/auth/me` e lida/alterada em `PATCH /auth/preferences`. O toggle fica em Minha conta → Notificações push.

A API verifica os aniversários a cada minuto e envia uma vez por dia a partir das 09:00 de Lisboa (ou quando voltar a ficar disponível depois desse horário). Contas ativas, não excluídas, com a preferência ligada e dispositivos inscritos recebem os nomes dos aniversariantes do dia. Contas vinculadas a um membro aniversariante recebem apenas `Feliz aniversário! Deus abençoe seu dia! `.

Aplicar a migração `20261027120000_birthday_push` antes de iniciar a versão 1.1.10. O registro diário no banco impede duplicação entre instâncias e reinícios. O envio é best-effort: falhas após registrar o dia não são reenviadas automaticamente. Requer configuração Web Push existente; não força permissão do navegador nem inscreve dispositivos automaticamente.
