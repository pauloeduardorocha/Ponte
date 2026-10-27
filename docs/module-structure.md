# Organização dos módulos

## Operações

`OperationsService` é a fachada usada pelos controladores e pelos outros módulos.
Conserva os métodos públicos, argumentos e tipos inferidos anteriores. A fachada
recebe as dependências do Nest e compõe os serviços abaixo com a mesma instância
de Prisma e os mesmos provedores de comunicação, sem dependências circulares.

| Arquivo em `apps/api/src/modules/operations/` | Responsabilidade |
| --- | --- |
| `operations-context.ts` | Escopos de autorização, validação de vínculos, paginação e transações auditadas |
| `operations.projections.ts` | Projeções explícitas para consultas sem expor campos adicionais dos membros |
| `operations-people.service.ts` | Pessoas, visitantes, conversão, acompanhamento e interações |
| `operations-groups.service.ts` | Grupos, ministérios e participação |
| `operations-events.service.ts` | Eventos, capacidade, inscrições e cancelamentos |
| `operations-schedules.service.ts` | Escalas, anexos, convocações e respostas |
| `schedule-conflicts.service.ts` | Sobreposição de horários e contagem de conflitos |
| `operations-notifications.service.ts` | Públicos, envio, caixa pessoal e modelos de notificação |
| `operations-dashboard.service.ts` | Consultas e indicadores do dashboard |

Uma operação de escrita continua dentro da mesma transação auditada: a extração
não abre transações adicionais, não muda os locks nem a ordem das validações.
Envios externos continuam sob as garantias da outbox. As regras HTTP de permissões
continuam nos controladores; os escopos por usuário continuam no contexto.
Novas regras devem ficar no serviço responsável pelo domínio, mantendo a fachada
como delegação. Evitar importar a fachada de volta nos serviços internos.

## Biblioteca

`apps/web/src/pages/library/LibraryPage.tsx` conserva a navegação por abas, os
filtros e a paginação, as consultas React Query e o estado dos diálogos. As chaves
de cache, a habilitação das consultas por aba e as verificações de permissão
continuam iguais.

Os painéis `CatalogPanel`, `CopiesPanel`, `LoansPanel`, `FinesPanel`,
`ReservationsPanel` e `SettingsPanel` recebem dados e callbacks tipados.
`LibraryActionDialog` concentra o formulário e a invalidação dos caches após
salvar. `CopyHistoryDialog` concentra a consulta e apresentação do histórico do
exemplar. `LibraryPaged` mantém os controles de paginação. Os campos e conversões
dos formulários ficam em `library-actions.ts`.

Os componentes extraídos ficam no escopo do módulo, sem componentes declarados
dentro de outros componentes, sem duplicar requisições e sem acrescentar estado
global. Os fluxos de catálogo, empréstimo, reserva, multa e histórico continuam
cobertos por `library.test.tsx`; autorização, transações e concorrência das
operações são exercitadas pelas suítes existentes com PostgreSQL descartável.

## Valida��o em 27/10/2026

TypeScript da API/web e lint dos m�dulos alterados passaram. As su�tes existentes
aprovaram 94 testes unit�rios de opera��es, 23 do frontend da biblioteca, 158 de
integra��o com PostgreSQL 17 descart�vel e 14 do login restrito. Os dois testes
exclusivos de restauro ficaram ignorados na rodada normal. O glob do Jest foi
ajustado apenas durante a execu��o no worktree Windows, como registrado no guia
de notifica��es, e restaurado em seguida. N�o houve chamadas a provedores reais.
