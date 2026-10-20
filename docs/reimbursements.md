# Reembolsos

Cada pedido representa um pagamento integral em EUR e pode ser associado a um único movimento bancário. Um movimento só pode estar associado a um pedido, garantido também por um índice único na base de dados.

## Utilização

- `/pedir-reembolso`: formulário público, sem conta. Guarda os documentos mesmo quando os restantes dados ainda estão em falta. Com sessão iniciada, identifica o autor do pedido; o beneficiário pode ser outra pessoa.
- `/reimbursements`: os pedidos submetidos pelo utilizador autenticado.
- `/finance?tab=reimbursements`: gestão pela tesouraria, com pesquisa, filtros, edição, documentos, registo de pagamento MB WAY e associação ao banco.
- No painel de anexos do movimento bancário aparecem os documentos do pedido associado. Para movimentos compatíveis, a tesouraria também pode confirmar a associação nesse painel.

Estados: **Por completar**, **Pronto para pagamento**, **Pago · a aguardar movimento**, **Associado ao banco**. Para registar o pagamento é necessário beneficiário, contacto, finalidade, valor positivo e pelo menos um documento da despesa. O comprovativo MB WAY é um anexo distinto e pode ser adicionado antes ou depois do registo do pagamento.

O autor autenticado e a tesouraria podem excluir um pedido mediante confirmação. Pedidos enviados sem login só podem ser excluídos pela tesouraria. A exclusão é lógica e auditada: retira o pedido das listas e das sugestões, impede novas alterações ou pagamentos e preserva os documentos e a associação bancária existentes. Pagamentos efetuados não são anulados. Os documentos continuam acessíveis pelo movimento bancário associado.

A associação exige saída bancária, mesmo valor e moeda, importação pronta/confirmada e movimento que não esteja rejeitado, marcado como duplicado ou ignorado. As sugestões usam uma janela entre 7 dias antes e 30 dias depois do pagamento; a associação é sempre confirmada por uma pessoa. Associar não cria outra despesa nem altera a categorização ou conciliação contabilística existente. É possível desfazer a associação e corrigir um registo de pagamento ainda não associado.

## Documentos e acesso

Os documentos são apresentados em galeria, com miniaturas das fotos e da primeira página dos PDFs, tanto antes do envio como nos pedidos guardados e movimentos associados. Ao clicar abre uma visualização em ecrã inteiro com zoom, navegação entre anexos e páginas de PDF, e opção de descarregar. A galeria usa os endpoints privados existentes; as miniaturas não são guardadas como novas cópias no servidor e os URLs temporários são libertados ao sair.

Fotos JPEG/PNG até 10 MB, comprimidas no navegador para no máximo cerca de 2 MB sem recortes, mantendo a proporção e a imagem inteira. A compressão ajusta a qualidade JPEG e, em fotos grandes, reduz proporcionalmente a resolução para até 4096 píxeis no lado maior. Fotos já abaixo do objetivo são preservadas. PDFs até 1 MB. Até três documentos no envio inicial e dez no total. O conjunto inicial é ajustado até 4 MB para respeitar o limite do alojamento, podendo comprimir mais quando há várias fotos. A API recebe ficheiros preparados até 2 MB. Usa o armazenamento privado existente e valida MIME, extensão e assinatura. O envio inicial é atómico: os ficheiros são removidos se a persistência do pedido falhar. O formulário permite arrastar e largar, escolher ficheiros ou usar a câmara.

O formulário público só devolve uma referência e não permite consultar pedidos. O utilizador autenticado consulta e edita os seus pedidos ainda não pagos. A tesouraria utiliza as permissões existentes `FINANCE_TRANSACTION_READ` e `FINANCE_TRANSACTION_UPDATE`; a associação exige também `FINANCE_RECONCILE`. Os leitores de movimentos bancários podem consultar os documentos de um pedido associado ao movimento, com as permissões bancárias existentes. Operações e downloads são auditados.

O envio público tem um limite de cinco pedidos por minuto por endereço, além do throttling global. O cadastro pela tesouraria avisa se o conteúdo de um documento já tiver sido submetido noutro pedido, através de hash SHA-256. A pesquisa de duplicados não é exposta a visitantes.

## Ativação

A migração `20261015160000_reimbursements` cria as duas tabelas e a relação com movimentos bancários. Aplicar pelo processo habitual de deployment após verificar as outras migrações pendentes no projeto. Não é necessário configurar uma integração MB WAY: os pagamentos são feitos pela tesoureira e o comprovativo é anexado manualmente.

Esta versão não inclui OCR, receção automática de WhatsApp/email ou execução automática de pagamentos MB WAY.

## Validação

Os testes da API cobrem privacidade, pedidos anónimos, autor versus beneficiário, integridade do pagamento, correspondência de valor/moeda, exclusividade da associação, auditoria e limpeza em falhas. Os testes web cobrem envio público, nova tentativa após erro, pedidos para terceiros, lista pessoal e confirmação da associação pela tesouraria.
