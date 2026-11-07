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
correspondências. Ocorrências já presentes em outro arquivo são preservadas no
histórico como `REJECTED`, com motivo `Duplicado ignorado` e vínculo textual ao
movimento anterior. Não criam receitas/despesas e não podem ser aceitas pela
classificação, nem com `acceptDuplicate`. A associação a lançamentos existentes
também não admite movimentos rejeitados. O bloqueio consultivo transacional já
existente na rotina bancária serializa a persistência das importações antes de
consultar o histórico, protegendo também contra envios simultâneos.
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

## Cruzamento dos extratos de produção em 07/11/2026

Os três XLSX originais foram recuperados de `private_files`, pelas chaves dos
registros de `bank_imports`, sem modificar os arquivos ou a base. Os períodos
declarados nos documentos são 01/01–12/10, 12/10–27/10 e 27/10–04/11/2026.
O extrato intermédio não contém a coluna Saldo Contabilistico; por isso não se
deve alegar comparação de saldos nas duas fronteiras.

Foram confirmadas sete ocorrências reapresentadas na mesma sequência entre
arquivos: quatro saídas de 12/10 (34,40; 60,00; 68,00; 132,60 EUR), nas linhas
9–12 do primeiro e 33–36 do segundo; três saídas de 27/10 (0,10; 0,01; 0,20 EUR),
nas linhas 9–11 do segundo e 29–31 do terceiro. As quatro primeiras estão sem
lançamento adicional; as três últimas foram aceitas em 07/11 e possuem duas
despesas COMPLETED e conciliações ativas por ocorrência (excesso de 0,31 EUR).
A correção desse histórico exige operação separada e auditada.

Os cinco grupos com descrições e valores repetidos dentro do primeiro arquivo
representam linhas bancárias distintas, não reimportação: em fevereiro, março
e nas três saídas de 55 EUR os saldos evoluem entre ocorrências. Em 07/08 as
duas saídas de 189,47 EUR têm datas-valor diferentes e uma devolução de igual
valor entre elas (linhas 84–86), justificando até o saldo repetido. Essas linhas
devem ser preservadas. Não incluir os documentos bancários no Git.
