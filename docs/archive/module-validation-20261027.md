# Validação em 27/10/2026

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.


TypeScript da API/web e lint dos módulos alterados passaram. As suítes existentes
aprovaram 94 testes unitários de operações, 23 do frontend da biblioteca, 158 de
integração com PostgreSQL 17 descartável e 14 do login restrito. Os dois testes
exclusivos de restauro ficaram ignorados na rodada normal. O glob do Jest foi
ajustado apenas durante a execução no worktree Windows, como registrado no guia
de notificações, e restaurado em seguida. Não houve chamadas a provedores reais.
