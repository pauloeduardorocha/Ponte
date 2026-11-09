# Validação local — 28/10/2026

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.


A geração com DTOs compilados e a comparação com o snapshot passaram. Um snapshot
alterado de propósito foi rejeitado, e restaurar o original voltou a aprovar o
check. O oasdiff v1.29.1, em container sem rede, validou o documento final sem
achados; dois documentos iguais não apresentaram mudanças, e remover o health
provocou a saída 1 por quebra de contrato. A comparação com o legado produziu
139 achados (122 ERR, 17 WARN), sobretudo diferenças de documentação, incluindo
paginação anteriormente descrita como objeto. Esse relatório não deve ser
interpretado como 122 mudanças novas no comportamento da aplicação.

Os testes da política da base verificam o bloqueio em ERR para contratos gerados,
a rejeição de legados desconhecidos e de SHAs inválidos. Os testes da factory
verificam prefixo, segurança, permissões, DTOs e exclusão do endpoint interno sem
abrir um servidor. A validação monetária cobre 25 valores de fronteira válidos e
inválidos. Verificações locais não comprovam execução no GitHub ou deploy.

A rodada completa da API aprovou 464 testes unitários. Depois do ajuste temporal,
43 testes dos provedores/públicos/worker foram repetidos e passaram. A integração
final aprovou 159 testes com PostgreSQL 17 descartável e 14 do login restrito;
os dois testes exclusivos de restauro ficaram ignorados no modo normal. Os
projetos Compose foram removidos ao finalizar. Os 3 testes da política da base,
TypeScript de API/web, lint e build completo da versão 1.1.12 passaram.

A rodada geral do frontend teve 346/348 testes aprovados: dashboard e relatórios
falharam ao aguardar telas carregadas sob demanda. A repetição isolada das duas
suítes, sem mudar as asserções, aprovou os 8 testes. Isso não transforma a rodada
geral inicial num resultado verde único. A biblioteca (23 testes) e os gráficos
de erros (3 testes) também passaram nas execuções focadas. O teste de Chromium
real do e-Fatura ficou ignorado no Windows; 12 testes Node desse módulo passaram.
O build manteve o aviso existente de chunk acima de 500 kB.

Uma execução de integração intermediária terminou com erro nativo do Node no
Windows. A rodada final, após corrigir os relógios das fixtures, passou inteira.
Não houve execução observada no GitHub Actions nem validação em navegador real.
