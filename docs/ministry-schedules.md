# Ministérios e escalas

Administradores criam ministérios e definem o líder principal. Em Detalhes, podem adicionar participantes como Membro ou Líder; todos os líderes ativos podem gerir participantes e escalas do seu ministério. O líder principal também é integrante; a sua alteração é feita na edição do ministério pelo administrador.

As escalas podem pertencer diretamente a um ministério, sem evento associado. Incluem título, data e hora, participantes, função e observações. Apenas integrantes do ministério podem ser escalados. Todos os integrantes ativos podem consultar as escalas e os anexos.

Arquivos de 1 byte a 5 MiB são armazenados no banco de dados, associados à escala. PDFs e imagens JPEG/PNG possuem miniaturas e visualização; outros formatos possuem miniatura genérica e download. Os endpoints autenticados verificam o acesso à escala; a resposta de arquivos utiliza no-store e nosniff. A exclusão da escala remove participantes e anexos. A interface pede confirmação para excluir.

Migração: `20261016120000_ministry_schedules`. Aplicar pelo fluxo normal de migrations do Prisma, testando primeiro num banco/branch isolado. Não é necessário alterar os papéis globais dos membros para reconhecer lideranças locais.

Na Vercel, arquivos maiores que 2 MiB usam envio e leitura em partes autenticadas de até 2 MiB. Arquivos incompletos não aparecem na galeria. A migração adicional `20261016123000_schedule_chunk_uploads` adiciona o estado de conclusão.
