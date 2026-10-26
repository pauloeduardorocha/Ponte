# Instalar a Ponte

A versão de produção deve ser servida por HTTPS. O service worker é gerado apenas no build de produção (`npm run build --workspace @church/web`).

- Android (Chrome): abrir a aplicação e tocar em **Instalar aplicação**, ou usar a opção de instalação do menu do navegador.
- iPhone/iPad (Safari): tocar em **Instalar aplicação** para ver as instruções, ou abrir **Partilhar → Adicionar ao ecrã principal → Adicionar**.

Os ícones usam a logo fornecida pela igreja. O ícone maskable inclui margem para os recortes do Android.

O botão de instalação fica oculto quando a Ponte está aberta como PWA, após a confirmação de instalação ou quando um navegador compatível deteta a Ponte através de `getInstalledRelatedApps()`. A deteção numa aba normal depende do suporte do navegador; falhas não impedem a instalação manual. No iPhone/iPad, as instruções incluem **Já instalei / Não mostrar novamente**. Esta preferência é guardada apenas neste navegador e pode ser reposta limpando os dados do site; se o armazenamento estiver indisponível, vale apenas até recarregar a página. A instalação continua disponível pelo menu do navegador.

A abertura de links na PWA instalada depende do sistema, navegador e preferências do utilizador. O site não força essa escolha nem redireciona automaticamente uma aba para a PWA. O âmbito da Ponte cobre as rotas do mesmo domínio (`scope: /`).

O service worker guarda os ficheiros públicos da aplicação para permitir carregar a interface sem ligação após a primeira visita. Consultas, autenticação, documentos e gravações continuam a necessitar de internet; as respostas da API não são guardadas pelo service worker. As atualizações apresentam um aviso e só recarregam a página quando o utilizador escolher Atualizar.

Verificação num dispositivo: abrir a versão HTTPS, instalar, iniciar pelo ícone e confirmar que abre sem a barra de navegação. Depois de uma primeira visita, testar a abertura em modo de avião; as operações de dados requerem restabelecer a ligação.
