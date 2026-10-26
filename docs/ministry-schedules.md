# Ministérios e escalas

Administradores criam ministérios e definem o líder principal. Em Detalhes, podem adicionar participantes como Membro ou Líder; todos os líderes ativos podem gerir participantes e escalas do seu ministério. O líder principal também é integrante; a sua alteração é feita na edição do ministério pelo administrador.

Toda nova escala exige um ministério; o evento é opcional. O cadastro e a gestão exigem liderança no ministério escolhido. Administradores com acesso global (`OPERATION_SCOPE_ALL`) mantêm acesso a todos os ministérios. Permissões gerais de escalas ou gestão de eventos não substituem a liderança local.

As escalas incluem título, data e hora, participantes, função e observações. Apenas integrantes ativos do ministério podem ser escalados. A consulta de escalas, convocações, anexos e o painel pessoal exigem participação ativa no respectivo ministério (incluindo o líder principal), exceto para administradores nos endpoints de gestão. Convocações antigas não concedem acesso após sair do ministério. Um membro de outro ministério não pode consultar esses dados, mesmo conhecendo os IDs.

`GET /operations/schedules` inclui `canCreate`, calculado pela existência de ministérios que a conta pode gerir, independentemente da página e dos filtros. A interface só oferece cadastro quando esse valor é verdadeiro. `POST /operations/schedules` exige `ministryId`; `PATCH` não permite removê-lo e exige defini-lo para escalas antigas sem ministério. Escalas antigas vinculadas apenas a eventos ficam acessíveis aos administradores até serem associadas a um ministério. Conflitos de horários continuam bloqueados sem revelar detalhes de escalas de outros ministérios.

Arquivos de 1 byte a 5 MiB são armazenados no banco de dados, associados à escala. PDFs e imagens JPEG/PNG possuem miniaturas e visualização; outros formatos possuem miniatura genérica e download. Os endpoints autenticados verificam o acesso à escala; a resposta de arquivos utiliza no-store e nosniff. A exclusão da escala remove participantes e anexos. A interface pede confirmação para excluir.

Migração: `20261016120000_ministry_schedules`. Aplicar pelo fluxo normal de migrations do Prisma, testando primeiro num banco/branch isolado. Não é necessário alterar os papéis globais dos membros para reconhecer lideranças locais.

Na Vercel, arquivos maiores que 2 MiB usam envio e leitura em partes autenticadas de até 2 MiB. Arquivos incompletos não aparecem na galeria. A migração adicional `20261016123000_schedule_chunk_uploads` adiciona o estado de conclusão.
