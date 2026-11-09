# Aparência da conta

Em **Minha conta → Aparência → Modo de cores**, escolha **Seguir o dispositivo**, **Claro** ou **Escuro**. `system` é o padrão para contas novas e preferências ausentes; acompanha `prefers-color-scheme`, inclusive com a página aberta. Escolhas explícitas de claro/escuro são preservadas.

A mudança aplica-se após salvar com sucesso. Uma falha mantém o modo anterior e permite tentar novamente. Sair retorna ao tema do dispositivo.

`PATCH /api/v1/auth/preferences` aceita `colorMode: system | light | dark` e retorna as preferências salvas, incluindo os demais campos da conta, com `Cache-Control: no-store`. Exige sessão; o ID vem da autenticação e não requer permissão administrativa. Valores inválidos ou propriedades desconhecidas retornam 400; ausência de sessão retorna 401. O mesmo endpoint também recebe [foto](account-photo.md) e preferências de [push](notifications.md).

A preferência fica em `users.color_mode` e é retornada por login, refresh, passkey e `/auth/me`. Outras sessões abertas recebem a alteração ao restaurar/recarregar. As migrations `20261022100000_user_color_mode` e `20261022110000_system_color_mode` estão no histórico; aplique todas as pendentes pelo [fluxo administrativo](database-security.md). Não repita manualmente o procedimento SQL usado em intervenções antigas.

Os testes `appearance.test.tsx` e `preferences.spec.ts` cobrem padrão, modos, restauração, erro ao salvar, saída e validação da API. O tema é definido em `apps/web/src/theme/theme.ts`.
