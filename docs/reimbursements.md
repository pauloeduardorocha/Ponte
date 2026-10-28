# Reembolsos

Cada pedido representa um pagamento integral em EUR e pode ser associado a um único movimento bancário. Um movimento só pode estar associado a um pedido, garantido também por um índice único na base de dados.

## Utilização

- `/pedir-reembolso`: formulário exclusivo para membros com sessão iniciada. Valor positivo, IBAN e categoria de despesa são obrigatórios. Guarda os documentos com IBAN e categoria, permitindo completar os restantes dados depois. O beneficiário é sempre o membro autenticado e é definido pela API. Não são aceites novos pedidos para terceiros.
- `/reimbursements`: os pedidos submetidos pelo utilizador autenticado.
- `/finance?tab=reimbursements`: gestão pela tesouraria, com pesquisa, filtros, edição, documentos, registo de pagamento por transferência bancária e associação ao banco.
- No painel de anexos do movimento bancário aparecem os documentos do pedido associado. Para movimentos compatíveis, a tesouraria também pode confirmar a associação nesse painel.

Estados: **Por completar**, **Pronto para pagamento**, **Pago · a aguardar movimento**, **Associado ao banco**. Para registar o pagamento é necessário beneficiário, IBAN, categoria de despesa, finalidade, valor positivo e pelo menos um documento da despesa. O comprovativo de transferência bancária é um anexo distinto e pode ser adicionado antes ou depois do registo do pagamento.

O autor autenticado e a tesouraria podem excluir um pedido mediante confirmação. Pedidos enviados sem login só podem ser excluídos pela tesouraria. A exclusão é lógica e auditada: retira o pedido das listas e das sugestões, impede novas alterações ou pagamentos e preserva os documentos e a associação bancária existentes. Pagamentos efetuados não são anulados. Os documentos continuam acessíveis pelo movimento bancário associado.

A associação exige saída bancária, mesmo valor e moeda, importação pronta/confirmada e movimento que não esteja rejeitado, marcado como duplicado ou ignorado. As sugestões usam uma janela entre 7 dias antes e 30 dias depois do pagamento; a associação é sempre confirmada por uma pessoa. Associar preenche a categoria e a classificação de despesa no movimento ainda não conciliado. Um movimento já conciliado com categoria diferente bloqueia a associação; não se cria outra despesa. É possível desfazer a associação e corrigir um registo de pagamento ainda não associado.

## Documentos e acesso

Os documentos são apresentados em galeria, com miniaturas das fotos e da primeira página dos PDFs, tanto antes do envio como nos pedidos guardados e movimentos associados. Ao clicar abre uma visualização em ecrã inteiro com zoom, navegação entre anexos e páginas de PDF, e opção de descarregar. A galeria usa os endpoints privados existentes; as miniaturas não são guardadas como novas cópias no servidor e os URLs temporários são libertados ao sair.

Fotos JPEG/PNG até 10 MB, comprimidas no navegador para no máximo cerca de 2 MB sem recortes, mantendo a proporção e a imagem inteira. A compressão ajusta a qualidade JPEG e, em fotos grandes, reduz proporcionalmente a resolução para até 4096 píxeis no lado maior. Fotos já abaixo do objetivo são preservadas. PDFs até 1 MB. Até três documentos no envio inicial e dez no total. O conjunto inicial é ajustado até 4 MB para respeitar o limite do alojamento, podendo comprimir mais quando há várias fotos. A API recebe ficheiros preparados até 2 MB. Usa o armazenamento privado existente e valida MIME, extensão e assinatura. O envio inicial é atómico: os ficheiros são removidos se a persistência do pedido falhar. O formulário permite arrastar e largar, escolher ficheiros ou usar a câmara.

O envio exige autenticação e vínculo a membro; a rota pública da API foi removida. O utilizador autenticado consulta e edita os seus pedidos ainda não pagos. A tesouraria utiliza as permissões existentes `FINANCE_TRANSACTION_READ` e `FINANCE_TRANSACTION_UPDATE`; a associação exige também `FINANCE_RECONCILE`. Os leitores de movimentos bancários podem consultar os documentos de um pedido associado ao movimento, com as permissões bancárias existentes. Operações e downloads são auditados.

O envio usa o throttling global. O cadastro pela tesouraria avisa se o conteúdo de um documento já tiver sido submetido noutro pedido, através de hash SHA-256. A pesquisa de duplicados não é exposta a visitantes.

## Ativação

A migração `20261015160000_reimbursements` cria as duas tabelas e a relação com movimentos bancários. Aplicar pelo processo habitual de deployment após verificar as outras migrações pendentes no projeto. Não é necessário configurar uma integração por transferência bancária: os pagamentos são feitos pela tesoureira e o comprovativo é anexado manualmente.

Esta versão não inclui OCR, receção automática de WhatsApp/email ou execução automática de pagamentos por transferência bancária.

## Validação

Um movimento bancário pode não ter qualquer pedido de reembolso associado.
A consulta opcional `GET /reimbursements/movement/:id` aceita `null` ou uma
resposta HTTP bem-sucedida sem corpo como ausência de vínculo. O frontend
normaliza esse resultado para `null`, sem erro de consulta e sem criar ou associar
um pedido. Essa interpretação também se aplica ao perfil de reembolso ausente.
Erros de rede, permissões e servidor continuam a ser apresentados. A associação
de um pedido sugerido continua dependendo de confirmação explícita do usuário.

Os testes da API cobrem privacidade, rejeição de novos pedidos anónimos, beneficiário definido pela sessão e bloqueio de alterações, integridade do pagamento, correspondência de valor/moeda, exclusividade da associação, auditoria e limpeza em falhas. Os testes web cobrem redirecionamento para login, envio autenticado, nova tentativa após erro, bloqueio de pedidos para terceiros, lista pessoal e confirmação da associação pela tesouraria.

## Contrato IBAN

`POST /members` e `PATCH /members/:id` aceitam `iban` opcional (ou `null` para limpar). A API normaliza os valores e valida o IBAN, incluindo o checksum.

Os pedidos de reembolso usam `iban` em vez de `contact`, tanto em multipart no envio como em JSON ao editar. O valor (`amount`) é obrigatório, positivo e com até duas casas decimais. O IBAN é obrigatório e validado em cada criação e edição, assim como `categoryId`, que deve identificar uma categoria de despesas existente. `GET /reimbursements/categories` lista essas categorias para membros autenticados. `GET /reimbursements/profile` exige login e devolve apenas `{ name, iban }` do membro autenticado, ou `null` quando a conta estiver sem membro associado. O campo no novo pedido recebe esse IBAN sem substituir valores editados ou guardados no pedido.

Ao criar ou editar um pedido do membro autenticado com o seu nome como beneficiário, o IBAN fica guardado no membro se estiver vazio, na mesma transação. Pedidos legados para terceiros e pedidos de outros autores editados pela tesouraria preservam o IBAN do cadastro. Um IBAN existente nunca é substituído automaticamente.

Aplicar a migração `20261020180000_reimbursement_member_iban`. Os contactos antigos ficam preservados como dados legados; pedidos ainda por pagar precisam de IBAN para ficarem prontos para pagamento.

Aplicar a migração `20261022120000_reimbursement_category`. A categoria permanece nula nos registos legados até serem completados; novos pedidos exigem categoria e IBAN pela API.

O nome do beneficiário é apresentado apenas para leitura. A API preenche-o a partir do membro associado à sessão e preserva-o nas edições, incluindo pela tesouraria. Pedidos antigos mantêm os dados históricos; não há alteração retroativa dos beneficiários. O campo opcional `beneficiaryName` é aceite por compatibilidade apenas quando coincide com o nome definido pelo servidor.
