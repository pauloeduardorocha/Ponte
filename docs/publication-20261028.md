# Integração das alterações locais — 28/10/2026

Versão consolidada: `1.2.6`.

## Escopo

- Tratamento explícito de HTTP 429 e outros erros HTTP na pesquisa e-Fatura,
  sem retentativas automáticas e sem gravar respostas privadas.
- Período inicial/final do extrato no seletor de consulta das faturas.
- Envio automático de notificações agendadas pelo worker, a partir da data,
  usando o relógio da base e preservando os limites de recuperação da outbox.
- Separação dos serviços de operações e dos painéis da biblioteca, preservando
  a fachada e as permissões existentes.
- Geração e validação do contrato OpenAPI a partir dos controladores e DTOs,
  contratos compartilhados para erros de frontend e verificações no CI.
- Pesquisa de candidatos a capas pelo Bing no script local da biblioteca.

## Reconciliação

O patch da branch de playlists já estava publicado na main. Os scripts e a
curadoria commitados da branch de biblioteca também já estavam presentes; não
foram reaplicados. Somente a alteração local do script de capas, seus testes e
documentação foram incluídos. CSVs, caches, pesquisas e arquivos gerados desse
worktree permanecem locais e não fazem parte desta integração.

Os três commits de notificações, modularização e contratos da branch
`codex/modularization-and-api-contracts` ainda não estavam publicados e foram
integrados. A resolução preserva os mapas de erros/IP já existentes, o período
dos extratos e a versão enviada pelos clientes PWA.

## Verificação

- API: 57 suítes, 502 testes unitários aprovados.
- Frontend: 49 arquivos, 364 testes aprovados.
- PostgreSQL descartável: 159 testes de integração aprovados; dois testes
  reservados a outro modo ficaram ignorados. Mais 14 testes de permissões do
  login restrito aprovados. O ambiente descartável foi removido ao terminar.
- Runtime e-Fatura: 23 testes aprovados, incluindo Chrome real com HTML e
  respostas simuladas, sem consultas adicionais à Autoridade Tributária.
- Contratos: três testes aprovados, geração reproduzível e oasdiff sem achados.
- Script de capas: sete testes Python aprovados, sem pesquisas externas.
- TypeScript, lint, build da API/frontend e revisão do diff aprovados.

Uma importação e-Fatura bem-sucedida em produção ainda precisa ser verificada.
O HTTP 429 foi reproduzido localmente; o tratamento novo não remove limites do
portal nem comprova retrospectivamente a causa de um timeout de produção.
