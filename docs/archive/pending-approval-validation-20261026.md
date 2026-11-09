# Verificações locais

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.


- Prisma Client gerado com o novo enum; TypeScript da API e do frontend e ESLint dos arquivos alterados aprovados.
- Testes HTTP e de serviço em `pending-approval.spec.ts`: autorização, aprovação repetida, conta removida, paginação, login/refresh, permissões após aprovação, persistência do payload e validação dos campos; banco simulado.
- Testes de segurança de autenticação, passkeys e aniversariantes, além dos testes de interface de cadastro, lista de espera, rotas, painel, membros, aparência e passkeys.
- As fixtures PostgreSQL foram atualizadas para informar telefone/nascimento e preparar explicitamente contas aprovadas quando necessário. A suíte de integração de autenticação foi ignorada por ausência de `TEST_DATABASE_URL`; a migration não foi executada num banco real nesta tarefa.

A versão da aplicação passa a `1.0.0`, pois o cadastro público passa a exigir dois campos adicionais, incompatíveis com o payload antigo.

O build `1.0.1` inclui o pacote CommonJS compartilhado na conversão do Vite, permitindo usar a mesma regra de aprovação no frontend e na API.

Na publicação de 26/10/2026, a migration foi aplicada na branch `production` do projeto Neon APonte. Como a conexão direta encerrou a negociação TLS, o conector Neon executou o SQL e o registro em `_prisma_migrations` na mesma transação, com o checksum SHA-256 do arquivo. `runtime-privileges.sql` foi reaplicado; o login `church_app` reconhece o novo enum e continua sem UPDATE na auditoria.
