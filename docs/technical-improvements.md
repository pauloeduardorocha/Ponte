# Plano de melhorias técnicas do Ponte

Avaliação inicial: 27/10/2026. Preservar o monólito modular, os contratos existentes,
a autorização centralizada e os cuidados já implementados com identidade e auditoria.
Cada item deve ser executado e validado separadamente.

## 1. Validação automática antes da publicação — alta prioridade

**Estado:** publicado na main em 27/10/2026 (`add53db`), CI aprovado e deploy
1.1.4 verificado. Proteção da branch configurada pelo utilizador.

Problema: verificações locais disponíveis, mas sem workflow de CI versionado;
testes com PostgreSQL têm requisitos diferentes e algumas suítes podem ser ignoradas
quando a URL não está configurada.

- [x] Workflow em pull requests e pushes na main com instalação por `npm ci`.
- [x] Geração do Prisma, TypeScript, lint e build de produção.
- [x] Testes sem banco separados dos testes com PostgreSQL real.
- [x] PostgreSQL 17 descartável via Docker Compose, com URL extraída automaticamente.
- [x] Aplicação das migrations e validação do login restrito de execução.
- [x] Mesmos comandos reproduzíveis localmente e no CI, sem credenciais externas.
- [x] Execução local completa e documentação dos resultados/limitações.

Implementação e comandos: [CI e testes locais](ci.md).
O workflow verifica alterações; exigir os checks para merge depende também das regras
de proteção da branch no GitHub.

## 2. Recuperação de dados — alta prioridade

**Estado:** cópias encriptadas implementadas e ensaio local aprovado em 27/10/2026.
Destino escolhido: Google Drive, com primeira cópia real e verificação estrutural
aprovadas (`4ccfd51f`). Agendamento habilitado. Workflow manual de ensaio permite
restaurar a cópia real num container isolado. O ensaio externo passou em 27/10/2026:
30 segundos, 17 documentos lidos e permissões verificadas. O RPO/RTO completo
da aplicação ainda precisa ser demonstrado.

A documentação de segurança registra cópias independentes e ensaios completos de
restauro como pendentes; confirmar o estado real da infraestrutura ao iniciar.

- Definir perda máxima de dados aceitável (RPO), tempo de recuperação (RTO),
  responsáveis, frequência e retenção.
- Automatizar backups independentes e encriptados, com alertas de falha.
- Incluir banco e documentos no plano e testar a recuperação integral em ambiente isolado.

Aceite: recuperação demonstrada da aplicação e de documentos, com tempos medidos.
Referência: [segurança do banco](database-security.md).
Implementação, política proposta e ativação: [backup e recuperação](backup-recovery.md).

## 3. Entrega confiável de notificações — alta prioridade

**Estado:** versão 1.1.6 publicada e migration/privilégios aplicados em produção
em 27/10/2026. Endpoint do worker validado com segredo dedicado; falta habilitar
e confirmar a primeira execução do agendamento no GitHub.

Problema original: `OperationsService.notificationAction` chamava o provedor
externo dentro da transação que bloqueava a notificação, permitindo um envio
antes de falha no commit. A implementação usa intenção durável, reserva curta e
envio após commit, com reconciliação explícita de resultados incertos.

- [x] Persistir a intenção de envio junto da alteração de estado (transactional outbox).
- [x] Processar fora da transação com idempotência, tentativas limitadas e recuperação.
- [x] Preservar agendamentos manuais e públicos/permissões; bloquear cancelamento em envio ativo.
- [x] Publicar e aplicar migration/privilégios; configurar segredo dedicado.
- [ ] Habilitar o agendamento do worker.
- [ ] Confirmar processamento real em produção e alertas do agendamento.

Aceite: falhas antes/depois do envio não perdem mensagens nem causam duplicação sem controle.
Referência: [notificações](notifications.md).

## 4. Evolução do armazenamento de anexos — média prioridade

**Estado:** pendente.

O armazenamento atual suporta binários no PostgreSQL; anexos de escalas também usam
`Bytes`. Medir volume e crescimento antes de escolher uma migração.

- Avaliar armazenamento privado de objetos, mantendo metadados e autorização no banco.
- Planejar integridade, arquivos órfãos, migração reversível e recuperação conjunta.
- Preservar limites, validação de assinatura/MIME e downloads privados.

Aceite: acessos continuam protegidos e a migração/restauração preserva todos os documentos.

## 5. Divisão dos maiores módulos — média prioridade

**Estado:** pendente.

`OperationsService` concentra visitantes, acompanhamento, grupos, ministérios,
escalas, notificações e dashboard; `LibraryPage` reúne muitas telas e ações.

- Extrair serviços e componentes por responsabilidade em mudanças pequenas.
- Preservar os endpoints, transações, permissões e comportamento da interface.
- Concentrar regras de domínio e testes no módulo que as possui.

Aceite: módulos menores com regressão dos fluxos preservada; sem introduzir microserviços.

## 6. Contratos e documentação sincronizados — média prioridade

**Estado:** pendente.

O README descreve rate limit em memória e reset de senha sem envio de e-mail,
enquanto o código usa PostgreSQL e Bird. O OpenAPI versionado não contém algumas
rotas atuais de consulta de erros do frontend.

- Corrigir divergências e adicionar geração reproduzível do OpenAPI.
- Verificar diferenças de contrato no CI e reduzir tipos de resposta duplicados.
- Reutilizar as coleções existentes quando agregarem verificações de comportamento.

Aceite: contratos gerados correspondem às rotas e mudanças incompatíveis são identificadas.

## 7. Relatórios financeiros escaláveis — média prioridade

**Estado:** pendente.

O relatório de saldos busca fontes anteriores por conta, soma em memória e limita
o histórico a 10 mil fontes.

- Calcular totais com agregações no banco, preservando precisão decimal.
- Disponibilizar fontes em consulta paginada separada, sem perder rastreabilidade.
- Medir planos/tempos de consulta e validar saldos com histórico representativo.

Aceite: saldo correto com mais de 10 mil movimentos e detalhamento paginado consistente.

## 8. Manutenção e observabilidade — média prioridade

**Estado:** pendente.

Não foi localizada limpeza de buckets expirados de rate limit na revisão inicial.
O projeto já possui request IDs e relatórios de erros, que devem ser aproveitados.

- Implementar manutenção em lotes e medir crescimento de tabelas operacionais.
- Medir latência, erros e pendências de comunicação sem registrar dados sensíveis.
- Adicionar cancelamento de consultas ao cliente HTTP.
- Adicionar testes de navegador para login, permissões, uploads e atualização da PWA.

Aceite: retenção e alertas demonstrados, consultas canceláveis e fluxos críticos
verificados em navegador real.

## Ordem de execução

1. CI e recuperação de dados.
2. Entrega de notificações e sincronização dos contratos.
3. Relatórios, armazenamento e divisão gradual dos módulos.
4. Manutenção e observabilidade ao longo das etapas.
