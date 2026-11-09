# notification-validation-20261027

Validação do envio automático em 27/10/2026: 38 testes de integração de

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.

notificações/operações e 14 do login restrito aprovados com PostgreSQL 17
descartável via Docker Compose; 43 testes unitários dos provedores, públicos e
worker, 26 do formulário, TypeScript de API/web e lint dos arquivos alterados
aprovados. No worktree Windows foi usado temporariamente o glob
`**/test/**/*.e2e-spec.ts`, pois o Jest não reconheceu o caminho expandido com
`.codex`; a configuração original foi restaurada após a execução. Transportes
externos foram simulados, sem enviar e-mail ou push reais.

Validação local em 27/10/2026: 153 testes de integração e 14 do login restrito
aprovados; os dois testes exclusivos de documentos do modo `--recovery-only`
ficaram ignorados na rodada normal. A suíte unitária completa da API passou
(51 arquivos, 430 testes), incluindo replay do corpo exato e mudança de credencial.
Frontend: 40 testes de operações/formulários aprovados.
TypeScript de API e web, ESLint dos arquivos alterados, build de produção,
parsing do workflow/OpenAPI e revisão do diff aprovados. Os testes Node e-Fatura
passaram com a exclusão de navegador Linux esperada no Windows. Não foram
enviados e-mails/push reais nem aplicada migration em produção nesta etapa.
