# Conciliação do repositório — 23 de outubro de 2026

## Referência publicada

A consulta à Vercel identificou o deployment de produção
`dpl_Fn2hwbdyJmvGMfpdvJak38Wy8maZ`, READY, criado a partir de
`a867f61516ca267e7093ebb6c24a702bfeb9b90c`. Os aliases incluem
`igrejaponte.com`, `www.igrejaponte.com` e `ponte-umber.vercel.app`.
Esse commit corresponde ao `origin/main` consultado nesta conciliação.
A associação do deployment ao commit comprova a versão publicada; não substitui
testes autenticados de cada fluxo em produção.

## Funcionalidades conciliadas

| Funcionalidade | Commits publicados | Decisão |
| --- | --- | --- |
| Catálogo, inventário e categorias da biblioteca | `f26696f`, `7c0bb8d` | Preservar a versão remota, incluindo enriquecimento, pesquisas e proveniência. |
| Aparência clara, escura e conforme o dispositivo | `16315a6` | Código local já incorporado; recuperar também `account-appearance.md`, que estava apenas local. |
| Pagamentos e ajustes de multas paginados | `b46231a` | Preservar implementação e testes remotos. |
| Biblioteca com 10 registos por defeito e tamanho selecionável | `be37002` | Preservar a versão remota; a cópia local tinha paginação anterior. |
| Reembolsos com login, IBAN e categoria | `8fa505d` | Conteúdo local já incorporado no remoto. |
| Montante de reembolso positivo | `4d6b22d` | Conteúdo local já incorporado no remoto. |
| Reembolsos limitados ao membro autenticado | `a5e72c1` | Conteúdo local já incorporado no remoto. |
| Beneficiário visivelmente só de leitura | `a867f61` | Conteúdo local já incorporado no remoto. |
| Menu de vídeos e playlists | `6f860fe` | Preservar a versão publicada e a navegação dos vídeos. |
| Bloqueio de URLs antes de montar páginas e consultar dados | Apenas local | Recuperar numa branch local, com política partilhada pelo menu e pelos guards e respetivos testes. Não é uma funcionalidade já publicada no commit acima. |
| Imagens, QR code e prompts dos materiais de reembolso | Apenas local | Por indicação do utilizador, manter apenas como ficheiros locais e no backup externo. `output/reembolsos/` está excluído do Git e dos envios para a Vercel. |

Autenticação, dashboards, galeria de documentos, anexos e estilos locais iguais
ao remoto são preservados através do avanço da branch para o commit publicado.
O schema, contrato OpenAPI, scripts e documentação antiga da biblioteca não são
reaplicados sobre versões remotas mais recentes.

## Recuperação

Antes de atualizar a `main`, os 75 ficheiros alterados ou novos foram copiados para
`C:/Users/act User/Documents/Projetos/Ponte-reconciliation-backup-20261023-100834`.
O diretório inclui o HEAD e o estado Git originais. O HEAD original era `3137022`.

O snapshot Git completo está conservado no stash de hash
`5482b0e2faab7342a62bffdfb38f90bae3b09aec`, com mensagem
`reconciliation-2026-10-23-preserve-local-features`. O terceiro parent guarda os
ficheiros originalmente untracked. Recuperar ficheiros seletivamente; aplicar o
stash completo sobre a versão publicada reintroduziria versões antigas.

A `main` local foi avançada por fast-forward para `a867f61`. O trabalho exclusivo
foi recuperado em `codex/reconcile-published-features`. A conciliação não executa
push, deployment, seed ou migração em produção.

## Verificação

- Vercel: deployment e aliases de produção confirmados por metadados; nova
  consulta antes de concluir manteve o mesmo deployment e commit.
- `git fetch origin`: `main` e `origin/main` continuam em `a867f61`.
- Comparação com `origin/main`: API, shared, schema, OpenAPI, biblioteca,
  reembolsos, vídeos e temas permanecem idênticos aos publicados. As diferenças
  de código da branch são os guards e a política de navegação recuperados.
- Builds de shared, API e frontend e geração do Prisma: passaram.
- Testes do runtime e-Fatura: 13/13 passaram.
- `npm run lint`: passou. Foram excluídos scripts temporários de `tmp/` e
  declarado CommonJS para o bootstrap administrativo, sem mudar o seu código.
- Testes focados de permissões, App e operações: 60/60 passaram. Duas
  expectativas antigas do menu foram atualizadas para incluir o grupo Vídeos,
  já presente na versão publicada.
- Suite completa final do frontend: 277/277 passaram, exit code 0. A execução
  inicial detetou as duas expectativas antigas do menu e uma espera intermitente
  no dashboard operacional; a execução focada e a completa final passaram.
- Preparação do inventário e importação de enriquecimento com mocks: 6/6 passaram.
- Postman em `https://igrejaponte.com`, coleção existente de smoke checks:
  três pedidos GET, seis assertions aprovadas, exit code 0. Comprovam health e
  base de dados saudáveis, e HTTP 401 sem dados para membros e auditoria sem login.
  Os resultados não foram publicados na cloud Postman.
- Suite completa da API: 283 passaram, 124 falharam e 28 foram ignorados;
  35 suites passaram, nove falharam e três foram ignoradas. As falhas incluem
  ausência da base de testes `TEST_DATABASE_URL` e um mock financeiro em
  `member-portal.controller.spec.ts` sem `bankTransaction.aggregate`.
  Esses ficheiros da API permanecem iguais ao commit publicado.
- O teste administrativo de importação real exige seleção explícita de uma
  base isolada. A sua proteção recusou a execução sem essa configuração.
  Não foi usado o banco de produção como destino dos testes.

As operações autenticadas reais de cada funcionalidade não foram executadas em
produção. A preservação dessas funcionalidades assenta na igualdade do código
com o commit do deployment, complementada pelos testes locais e smoke checks.

## Commits locais de preservação

| Commit | Conteúdo |
| --- | --- |
| `235eeb1` | Preservação inicial de posters, QR code e prompts; posteriormente retirados do acompanhamento do Git por indicação do utilizador. |
| `1c87476` | Notas das versões de aparência já publicadas. |
| `0854647` | Política de acesso a rotas, integração no menu e testes. |
| `c9dcfa5` | Configuração de lint dos scripts temporários e CommonJS. |

Estes commits registam a conciliação na branch local
`codex/reconcile-published-features`. O stash e a cópia externa foram mantidos para
recuperação; não são alterações pendentes no checkout.

## Preparação da publicação

Por pedido do utilizador, a publicação parte de
`codex/publish-reconciled-features`, criada sobre `origin/main`, com as diferenças
finais consolidadas num único commit. Assim, os cartazes e QR codes inicialmente
preservados e depois retirados não entram no histórico publicado da `main`.
A API, o schema, as migrações e os módulos publicados continuam iguais ao commit
de referência; esta versão não requer migração ou alteração dos dados.
