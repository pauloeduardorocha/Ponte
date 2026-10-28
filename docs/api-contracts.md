# Contratos da API

## Fonte e geração

Os controladores e DTOs em `apps/api/src` são a fonte do contrato. O plugin
Swagger do Nest precisa participar da compilação para incluir os schemas dos
DTOs. A função `createOpenApiDocument` de `apps/api/src/openapi.ts` é usada tanto
pelo Swagger de desenvolvimento como pelo exportador. Não editar
`docs/openapi.json` manualmente.

```sh
npm ci
npm run openapi:generate
npm run openapi:check
```

Os comandos compilam os contratos compartilhados, geram o cliente Prisma e
compilam a API com o plugin Swagger. Usam variáveis fictícias apenas no processo
filho, sem ler `.env` e sem credenciais reais. O exportador não chama `init()` nem
`listen()`; a inicialização e a conexão explícita do Prisma estão bloqueadas.
Não executa migrations, jobs ou envios. O JSON tem chaves ordenadas, UTF-8 e
terminação LF; diferenças de CRLF no checkout não causam divergência.

Após um build completo, `npm run openapi:check -- --skip-build` reutiliza os
artefatos compilados. Não usar essa opção após editar fontes sem recompilar.
O comando falha se o JSON versionado diferir do contrato gerado e indica como
atualizá-lo. Não existe geração automática ao salvar arquivos nem durante uma
requisição em produção; o Swagger continua desativado em produção.

O prefixo público é `/api/v1`. Endpoints com `@Public()` não recebem Bearer JWT
por inferência, mas preservam requisitos declarados de cookie. Os demais recebem
a autenticação Bearer. As extensões `x-permissions-all` e `x-permissions-any`
registram as mesmas condições dos decorators usados pelo PermissionGuard.
Controladores explicitamente excluídos, como o worker de notificações, continuam
fora do documento público.

## Respostas compartilhadas

Os contratos de resumo, detalhe e estatísticas de erros do frontend vivem em
`packages/shared`. A API os reutiliza nos DTOs de resposta e na consulta tipada
de estatísticas; a interface os usa nos pedidos HTTP. Datas no contrato de rede
são strings ISO, mesmo quando o Prisma mantém objetos Date antes da serialização.

As rotas `GET /audit/frontend-errors`, `GET /audit/frontend-errors/stats` e
`GET /audit/frontend-errors/{id}` têm schemas explícitos de resposta. A consulta
de detalhe documenta também 404. Paginação é opcional e numérica, com os mesmos
defaults e limites dos validadores; biblioteca conserva o default de dez itens.
O padrão de valor positivo de reembolsos foi expresso sem lookahead, com a mesma
restrição decimal, para ser entendido também por validadores que usam RE2.

## CI: sincronização, validade e compatibilidade

O job de qualidade existente verifica a sincronização e a validade após o build.
Em pull requests também verifica a compatibilidade, no mesmo check já usado
pelo CI, sem depender de um novo nome de check nas regras de proteção:

1. Reconstrói o documento e exige correspondência com o JSON versionado.
2. Valida o OpenAPI com oasdiff, falhando em erros de schema.
3. Obtém o contrato do SHA exato da base da PR por `git show`.
4. Compara base e revisão com `oasdiff breaking`, incluindo flatten de allOf.
   Achados ERR bloqueiam a PR quando a base já usa o gerador.

As Actions estão fixadas por SHA, com permissões apenas de leitura. A comparação
não publica comentários, não envia os documentos a um serviço de revisão e não
resolve referências externas. A referência é a
[Action oficial do oasdiff](https://www.oasdiff.com/docs/github-action).

### Migração do documento legado

O snapshot anterior tinha 146 caminhos, omitia 70 caminhos já existentes e
mantinha duas rotas obsoletas de associação de faturas a transações. O documento
gerado tem 214 caminhos e registra as associações atuais a despesas. Esta tarefa
corrige a documentação; não remove nem substitui endpoints da aplicação.

Na primeira PR, comparar com o documento antigo sinaliza diferenças que já
existiam no código. `scripts/openapi-base.mjs` reconhece somente os dois hashes
exatos desse legado (snapshot da main e sua atualização de texto de agendamentos)
e mantém o relatório completo em modo informativo nessa migração inicial.
Qualquer outro snapshot legado falha e exige revisão da política. Uma base com
`x-ponte-generator: 1` sempre ativa o bloqueio em ERR. Não adicionar hashes como
forma de liberar uma quebra de contrato nova.

Depois dessa migração, revisar mudanças incompatíveis antes de publicar: manter
compatibilidade, oferecer transição ou versionar a API. O comparador não executa
regras de negócio nem garante a qualidade de schemas ausentes ou genéricos.
Alterações em escopos dinâmicos ou nas extensões de permissões exigem revisão e
testes de autorização; oasdiff não interpreta essas extensões como regras.

## Verificações de comportamento

Os testes HTTP com PostgreSQL descartável continuam responsáveis por transações,
permissões e persistência. A coleção existente
`docs/database-security.postman_collection.json` conserva os smoke checks de
saúde e autenticação, sem duplicá-la para a geração do contrato. Para executá-la
contra uma API local já iniciada, sem usar o destino de produção padrão:

```sh
postman collection run docs/database-security.postman_collection.json --env-var baseUrl=http://localhost:3000
```

A geração do OpenAPI e os testes com transportes simulados não demonstram envio
real de e-mail/push nem substituem uma execução observada do CI no GitHub.

## Validação local — 28/10/2026

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
