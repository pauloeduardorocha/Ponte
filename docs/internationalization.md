# Idiomas da interface

A interface suporta português de Portugal (`pt-PT`, predefinido), português do
Brasil (`pt-BR`) e inglês (`en`). O seletor fica na barra superior, imediatamente
antes do avatar, e nas páginas de autenticação. Cada opção apresenta a bandeira
de Portugal, Brasil ou Reino Unido e o nome do idioma na própria língua.

O nome da igreja, **A Ponte**, nunca é traduzido, incluindo em saudações,
cabeçalhos e mensagens. Referências à aplicação Ponte e nomes de atalhos,
como `Ponte - Tradução`, também mantêm a grafia original em todos os idiomas.
A página inicial apresenta uma única saudação com o primeiro nome do utilizador,
sem referência à hora do dia nem um segundo texto de apresentação.

A escolha atualiza a interface sem recarregar a página, preservando os dados dos
formulários. A preferência fica neste navegador, na chave `ponte.locale.v1` do
`localStorage`, e sincroniza entre separadores. Sem preferência válida, utiliza-se
`pt-PT`, independentemente do idioma do dispositivo. Se o armazenamento estiver
bloqueado, a escolha continua a funcionar durante a sessão. Não altera a conta,
as permissões ou os contratos da API.

A preferência é também guardada no cache `ponte-preferences-v1`, exclusivamente
para a mensagem genérica das notificações PWA quando o servidor não envia texto.
Os títulos e mensagens enviados pelos remetentes conservam o conteúdo original.

Os catálogos em `apps/web/src/i18n/{pt-PT,pt-BR,en}.json` usam as mensagens de
origem como chaves estáveis. `t(mensagem, valores)` resolve o idioma atual e
interpola parâmetros numerados (`{0}`, `{1}`), preservando os valores. Novos
textos da interface devem ser incluídos nos três catálogos. Componentes que
apresentam traduções subscrevem `useLocale()`. Configurações estáticas usam
getters para rótulos e `localized()` para listas de texto, evitando fixar o idioma
durante a importação do módulo. Identificadores de navegação e valores enviados
à API permanecem estáveis.

Datas, horas, números e valores monetários utilizam o idioma selecionado;
inglês usa a convenção britânica para datas. Os campos de data mantêm o formato
explícito `dd/mm/yyyy`, e os pedidos mantêm os valores ISO. A moeda original dos
registos não é convertida. Os controlos Material UI e a validação acompanham o
idioma, assim como o atributo `lang` do documento e o calendário incorporado.

São traduzidos textos da aplicação, incluindo estados, mensagens conhecidas de
erro da API e o guia de tradução para Windows apresentado no site. Nomes,
publicações, documentos, títulos de vídeos e outros conteúdos introduzidos pelos
utilizadores ou fornecidos por serviços externos conservam o conteúdo original.
As traduções são distribuídas com a aplicação e funcionam sem serviço externo
de tradução em tempo de execução.
