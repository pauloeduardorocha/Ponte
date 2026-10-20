# Restauração de produção — 20 de outubro de 2026

## Causa confirmada

O deploy automático `dpl_Hv5MzmfrdNd41XVHWxq9vYYXAHzs`, proveniente do commit GitHub `a898196484a00d3cbb88209c1d45515d8d26b1af`, substituiu uma versão publicada a partir de alterações locais ainda não registadas no Git. O commit alterava a importação bancária; não continha uma remoção explícita das outras funcionalidades. Elas já estavam ausentes da árvore versionada usada pelo build automático.

Os pedidos reproduzidos em produção mostraram quatro respostas 404 em `/api/v1/videos` e quatro em `/api/v1/community/birthdays`. O código do commit e os logs de arranque confirmaram a ausência dessas rotas.

Foi criado o commit de reversão `a29daf8d7c1503637306c9b27bc3b696e1a28f78`. Essa reversão desfez a alteração bancária, mas não recuperou as funcionalidades que nunca tinham sido incluídas no Git.

## Restauração executada

- Deploy recuperado: `dpl_AqMNprr11bkqRPuWHQS5N8c2zoSC`.
- Artefacto: https://ponte-av3bgg4vz-paulo-eduardo-araujo-da-rochas-projects.vercel.app.
- Domínio público: https://ponte-umber.vercel.app.
- Trata-se do último deploy completo anterior ao incidente, incluindo a atualização identificada como `restricted-database-login`, baseada no deploy `dpl_6FKpvKNV7KkBMtZFMDyrZA8reTcT`.
- A Vercel recusou o comando rollback por limite do plano Hobby. A promoção do deploy de produção existente foi concluída com sucesso, sem rebuild.
- Não foram executados migrations, seeds ou alterações a registos do banco durante a restauração. O diretório de trabalho original foi preservado.

## Funcionalidades que ficaram fora do deploy Git

Comparação do inventário de ficheiros do deploy completo com o Git, verificação de hashes dos ficheiros locais e leitura dos contratos existentes:

| Área | Diferenças recuperadas com o deploy completo |
| --- | --- |
| Página inicial | Vídeos do YouTube, aniversariantes e melhorias do painel pessoal/responsividade |
| Reembolsos | Pedido público, pedidos pessoais, gestão financeira, anexos e associação a movimentos bancários |
| Autenticação | Registo e utilização de passkeys e controlos de conta correspondentes |
| Membros e acesso | Unificação de membro/conta, gestão de senha e roles no membro, permissões básicas de membro |
| Portal do membro | Painel pessoal, grupos, ministérios, eventos e reservas com identidade da sessão |
| Ministérios e escalas | Gestão por líderes, escalas sem evento obrigatório, participantes e anexos, transferências em partes |
| Biblioteca | Paginação e pesquisa de opções, históricos paginados, reservas pessoais e melhorias dos seletores |
| Documentos e interface | Galeria, visualização de PDFs/imagens, instalação PWA, navegação e melhorias visuais |

Também estavam ausentes do Git oito migrations novas, entre `20261015120000_unified_member_accounts` e `20261016140000_passkeys`. A ausência no repositório não comprova remoção das estruturas ou dos dados no banco.

Esta tabela descreve diferenças de código e capacidades. Não constitui uma auditoria de perda de registos nem uma validação autenticada de cada fluxo.

## Verificação após a promoção

- Domínio público resolvido pela API da Vercel para `dpl_AqMNprr11bkqRPuWHQS5N8c2zoSC`.
- `/api/v1/health`: HTTP 200; API e banco `up`.
- `/api/v1/videos`: HTTP 401 sem sessão, confirmando rota existente.
- `/api/v1/community/birthdays`: HTTP 401 sem sessão, confirmando rota existente.
- `/api/v1/member-portal/dashboard`, `/api/v1/auth/passkeys` e `/api/v1/reimbursements`: HTTP 401 sem sessão.
- Não foi feito login com uma conta real; conteúdo dos vídeos, aniversariantes e demais fluxos autenticados não foi validado nesta intervenção.

## Correção do Git para evitar repetição

Após a restauração do artefacto, a `main` ainda estava no commit de reversão `a29daf8`. A correção recupera os 323 ficheiros de código, configuração e documentação do deploy completo numa cópia isolada sobre essa `main`. Cada ficheiro foi verificado pelo SHA-1 do inventário da Vercel; 310 foram recuperados de cópias locais idênticas e 13 foram descarregados do deploy. Artefactos de build, dependências e ficheiros de ambiente privados ficam fora do commit. Foram removidos ficheiros TypeScript de cache anteriormente versionados e acrescentada a regra `*.tsbuildinfo` ao `.gitignore`.

O código da aplicação corresponde ao deploy restaurado, com apenas normalização de linhas vazias no fim de três ficheiros. Alterações locais posteriores, incluindo os controlos adicionais de segurança do banco ainda não publicados nesse deploy, foram preservadas no diretório original e não misturadas nesta recuperação.

Validação da cópia isolada: instalação limpa pelo lockfile, geração do Prisma Client sem ligação ao banco, build completo de shared/API/frontend/PWA, lint da API e frontend, oito suítes de API aprovadas (73 testes) e seis ficheiros de testes de interface aprovados (27 testes). Na interface foi usado o pool de threads após o executor padrão não apresentar progresso. Não foram executadas migrations nem seeds. Os testes HTTP sem sessão demonstram a existência das rotas e a exigência de autenticação; não validam os fluxos com dados de um membro real.
