# Validação desta implementação — 27/10/2026

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.


| Verificação                                                   | Resultado                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Instalação limpa com `npm ci` em container Linux Node 24.15.0 | Passou; auditoria da instalação sem vulnerabilidades reportadas           |
| TypeScript da API e frontend (`npm run typecheck`)            | Passou                                                                    |
| Lint completo (`npm run lint`)                                | Passou                                                                    |
| API sem banco (`jest.unit.config.cjs`)                        | 50 suítes, 426 testes passaram                                            |
| HTTP/seed com PostgreSQL 17 descartável                       | 10 suítes, 138 testes passaram                                            |
| Login restrito e privilégios (`--security-only`)              | 13 testes passaram                                                        |
| Frontend (`npm run test --workspace @church/web`)             | 47 arquivos, 341 testes passaram                                          |
| Worker e-Fatura no Windows                                    | 12 testes passaram; o teste com Chromium real foi ignorado por plataforma |
| Chromium real em container Linux, rede da página bloqueada    | 1 teste passou, sem ignorados                                             |
| Build completo e nova compilação do frontend com versão 1.1.4 | Passaram                                                                  |
| YAML do workflow, gatilhos, jobs e permissões                 | Verificados localmente                                                    |
| Falta de `TEST_DATABASE_URL` no setup de integração           | Falha explícita confirmada                                                |

Os testes foram executados por etapas; a suíte de privilégios foi repetida com
`--security-only` após corrigir seu acesso ao papel administrativo. Os projetos
PostgreSQL criados pelo runner foram removidos ao finalizar.

As fixtures foram atualizadas para a criação automática de identidades, vínculo
obrigatório de ministérios nas escalas e regras atuais de autorização. Testes da
interface aguardam o conteúdo principal antes de procurar elementos de páginas
carregadas sob demanda. O teste de erro em uploads continua garantindo um único
POST, permitindo a consulta independente de atualização da aplicação.

Não houve execução observada no GitHub Actions, push, deploy ou teste de provedores
reais de e-mail/pagamento/portal e-Fatura. O build ainda emite o aviso existente de
chunks maiores que 500 kB; isso não impediu a compilação.
