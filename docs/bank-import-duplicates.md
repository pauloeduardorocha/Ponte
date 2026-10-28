# Duplicidade na importação bancária

O período sugerido para exportar o próximo extrato termina em ontem, conforme
o calendário de Lisboa. O início continua sendo o último dia com movimentos
importados para cobrir exportações parciais, inclusive quando esse dia é ontem.
Sem histórico, ou com último movimento de hoje ou posterior, não é sugerido
um intervalo adicional. Os avisos de lacunas históricas permanecem separados.

A importação preserva todas as linhas de um extrato. Sem identificador bancário
único, duas linhas do mesmo arquivo são operações distintas, mesmo com data,
valor, direção e descrição iguais. Isso inclui comissões repetidas e pagamentos
do mesmo valor para destinatários diferentes.

Entre arquivos, uma possível correspondência exige a mesma conta, data, valor,
direção e descrição bancária normalizada (acentos, espaços, pontuação e caixa
não distinguem descrições). Se ambos os movimentos têm referência, ela também
deve coincidir. A descrição usada é a original do banco, não a descrição editada
pelo usuário. Cada ocorrência histórica corresponde a apenas uma linha nova;
arquivos históricos sobrepostos não multiplicam a quantidade disponível de
correspondências. Esses casos continuam exigindo revisão explícita antes de
criar receitas/despesas, sem rejeição automática.
Linhas já rejeitadas não aumentam o número de ocorrências históricas disponíveis.

Um identificador bancário coincidente confirma a duplicidade e impede novo
lançamento, inclusive dentro do mesmo arquivo e se a descrição mudou. Dois
identificadores bancários diferentes distinguem operações. O reenvio do mesmo
arquivo, identificado pelo hash, continua sem criar lançamentos novamente.

Fingerprints novos incluem a descrição normalizada quando falta identificador
bancário. Hashes históricos permanecem intactos e não são usados isoladamente
para decidir duplicidade: as comparações usam os campos originais, evitando
colisões da regra antiga que ignorava descrições. Não é necessária migração.

A possível correspondência com lançamentos manuais concluídos mantém a revisão
por data, valor e direção; a associação deve evitar contabilizar o mesmo pagamento
duas vezes. Permissões, aceitação explícita, auditoria e vínculos contábeis
permanecem no fluxo existente. Alterar a regra não reclassifica registros antigos.
