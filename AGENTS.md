# Instruções do projeto Ponte

Estas instruções aplicam-se a todo o repositório. Registre aqui os acordos duradouros de implementação e manutenção.

## Estrutura e implementação

- Monorepo npm: `apps/api` contém a API NestJS com Prisma; `apps/web` contém o frontend React com Vite; `packages/shared` contém os contratos compartilhados.
- Preserve os padrões do módulo alterado e mantenha o trabalho limitado ao pedido do usuário.
- Ao alterar uma funcionalidade, confira o fluxo completo entre interface, API, permissões e persistência. Preserve os contratos existentes quando não houver mudança solicitada.
- Atualize a documentação correspondente em `docs/` quando o comportamento ou o contrato mudar.
- Execute testes relevantes e verificações de TypeScript/lint nos módulos afetados. Informe exatamente o que foi validado e eventuais limitações.
- Não inclua credenciais, dados pessoais ou arquivos de ambiente em commits.

## Git e publicação

- Versão da aplicação: atualize `APP_VERSION` em `apps/web/src/lib/app-version.ts` em toda tarefa que altere a aplicação, antes do commit/publicação. Use `MAJOR.MINOR.PATCH` e incremente pelo menos o patch; mudanças incompatíveis incrementam major e funcionalidades podem incrementar minor. O rodapé e os relatórios de erros devem sempre usar essa mesma constante. Não substitua a versão enviada pelo cliente pela versão do servidor: clientes PWA antigos precisam continuar identificáveis. Verifique essa atualização na revisão antes de publicar.

- Antes de editar, confira a branch, `git status --short` e eventuais alterações já existentes. Preserve trabalhos de outras tarefas.
- Antes de publicar, execute `git fetch origin` e confira a diferença entre a branch local e a remota. Integre os commits remotos preservando as alterações locais.
- Faça commits apenas dos arquivos e trechos pertencentes à tarefa. Quando um arquivo tiver alterações de várias tarefas, separe os trechos.
- Prefira commits normais na branch de trabalho. Evite publicar commits criados com índice temporário ou `git commit-tree` deixando a branch e o índice locais desatualizados.
- Se for necessário publicar a partir de outro checkout ou índice, finalize reconciliando a branch e o índice deste checkout, preservando o conteúdo local e qualquer trabalho em andamento.
- Em tarefas simultâneas, prefira checkouts/worktrees separados para evitar que uma tarefa altere a branch ou o índice de outra.
- Quando o usuário pedir para enviar à `main`, conclua o commit e o push, confirme o SHA na remota e verifique a sincronização local. Criar apenas um commit não conclui esse pedido.
- Não use force push, descarte de arquivos ou limpeza de alterações para fazer o estado do Git parecer limpo.
- Ao finalizar uma publicação, confira `git status --short` e `git rev-list --left-right --count HEAD...origin/main` quando estiver na `main`. O resultado esperado é `0 0` e nenhuma alteração da tarefa pendente.
- Se houver alterações pendentes de outro trabalho, preserve-as e informe quais são. Diferencie commit local, push confirmado e deploy verificado; não afirme que houve deploy apenas porque o push terminou.
- Sem pedido de publicação, registre o trabalho concluído em commit local, preservando alterações alheias, e informe que ainda falta o push.

## Verificações disponíveis

- API: `npm exec --workspace @church/api -- jest --runInBand --runTestsByPath <arquivos>`.
- Frontend: `npm exec --workspace @church/web -- vitest run <arquivos>`.
- TypeScript: `npx tsc --noEmit -p apps/api/tsconfig.build.json` e `npx tsc --noEmit -p apps/web/tsconfig.json`.
- Lint: `npx eslint <arquivos-alterados>`.
- Diff antes do commit: `git diff --check` e revisão do conteúdo em staging.

<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->
