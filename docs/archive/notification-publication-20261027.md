# notification-publication-20261027

Publicação em 27/10/2026: API/web 1.1.6 e migration verificadas em produção,

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.

incluindo privilégios de `church_app`. O worker respondeu 401 sem credencial e
201 com o segredo dedicado, com fila vazia e sem envios externos. A primeira
execução do workflow deve confirmar também o secret/configuração do GitHub.
