# Documentação do Ponte

Revisão do conteúdo próprio do projeto em **09/11/2026**, confrontando documentação com fontes, schema, rotas, scripts, testes e workflows versionados. Os guias descrevem o código; não certificam o estado atual de produção, serviços externos ou dispositivos. O [registro da revisão](documentation-review-20261109.md) explica escopo e validação.

## Começar e manter

| Documento                                       | Uso                                                        |
| ----------------------------------------------- | ---------------------------------------------------------- |
| [README principal](../README.md)                | Instalação, requisitos, Docker, seed e comandos            |
| [AGENTS.md](../AGENTS.md)                       | Acordos de implementação, Git e publicação                 |
| [CI e testes](ci.md)                            | Testes sem banco, PostgreSQL descartável e recuperação     |
| [Contratos](api-contracts.md)                   | Geração e verificação de [OpenAPI](openapi.json)           |
| [Organização dos módulos](module-structure.md)  | Fachada e serviços operacionais, componentes da biblioteca |
| [Melhorias técnicas](technical-improvements.md) | Implementações existentes e limitações atuais              |
| [Bundle](frontend-bundle.md)                    | Medição reproduzível de build                              |

## Publicação, segurança e operação

| Documento                                                   | Uso                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| [Publicação Vercel](vercel-deployment.md)                   | Serviços da raiz, alternativa de projetos separados e ativação |
| [Segurança do banco](database-security.md)                  | Login restrito, migrations, grants e segredos                  |
| [Autenticação, auditoria e privacidade](SECURITY_REVIEW.md) | Regras de acesso e tratamento de dados                         |
| [Backup e recuperação](backup-recovery.md)                  | Restic/Drive, retenção e restauro isolado                      |
| [E-mail](email.md)                                          | Bird e recuperação de senha                                    |
| [Notificações](notifications.md)                            | Caixa pessoal, push, públicos, outbox e worker                 |
| [Erros do frontend](frontend-error-reporting.md)            | Telemetria, transporte, rede, versão e investigação            |
| [Cache HTTP](http-cache-policy.md)                          | Persistência privada, TTL e invalidação                        |

## Conta, pessoas e comunidade

| Documento                                          | Uso                                                |
| -------------------------------------------------- | -------------------------------------------------- |
| [Aprovação de cadastro](pending-approvals.md)      | Campos obrigatórios e Lista de espera              |
| [Cadastro unificado e família](unified-members.md) | Identidades, gestão de acesso e parentesco         |
| [Aparência](account-appearance.md)                 | Modo do dispositivo, claro e escuro                |
| [Foto da conta](account-photo.md)                  | Preparação, persistência e exibição de avatar      |
| [Passkeys](passkeys.md)                            | Configuração, cadastro e login biométrico          |
| [Aniversariantes](birthdays.md)                    | Listagem e push diário                             |
| [Conversas e Mural](conversations.md)              | Publicações, menções, imagens e respostas          |
| [Vídeos](youtube-videos.md)                        | Canal, playlists e chave da API                    |
| [Tradução ao vivo](live-translation.md)            | Ponte e aplicativo Windows externo, Wi-Fi e pacote |
| [Navegação](sidebar-navigation.md)                 | Menus, páginas e redirecionamentos                 |
| [PWA](pwa.md)                                      | Instalação, atualização e limites offline          |
| [Identidade visual](BRAND_COLORS.md)               | Marca e temas                                      |

## Operações, eventos e biblioteca

| Documento                                                                    | Uso                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Vida da igreja](CHURCH_OPERATIONS.md)                                       | Visitantes, acompanhamento, grupos e escopos                |
| [Ministérios e escalas](ministry-schedules.md)                               | Lideranças, participação e anexos                           |
| [Gestão de eventos](etapa-11-event-manager.md)                               | Atribuições, permissões, ingressos, presença e relatórios   |
| [Inscrição pública e Stripe](inscricoes-publicas-stripe.md)                  | Checkout, webhooks e reserva de vagas                       |
| [Modelo da biblioteca](library-data-model.md)                                | Estrutura implementada, origem e curadoria                  |
| [Circulação e multas](library-circulation.md)                                | Empréstimos, renovação, reservas, UTC, multas e pagamentos  |
| [Catálogo e paginação](library-pagination.md)                                | Listas, filtros, disponibilidade, históricos e multas       |
| [Ferramentas de inventário](../apps/api/prisma/library-production/README.md) | Preparação, execução administrativa e testes                |
| [Revisão gerada do acervo](library-seed-review.md)                           | Dados de origem e propostas; não é estado atual da produção |

## Financeiro

| Documento                                                        | Uso                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [Financeiro, banco e relatórios](finance.md)                     | Lançamentos, permissões, importação, documentos e exportações |
| [Dashboard da tesouraria](treasury-dashboard.md)                 | Agregados, moedas e projeção                                  |
| [Reembolsos](reimbursements.md)                                  | Pedidos pessoais, IBAN, categoria, documentos e gestão        |
| [Uploads em blocos](reimbursement-resumable-uploads.md)          | Idempotência, retomada e limites                              |
| [Duplicidades bancárias](bank-import-duplicates.md)              | Identidade e correspondência entre extratos                   |
| [Sugestões de classificação](bank-classification-suggestions.md) | Evidência histórica de categoria/centro de custo              |
| [Faturas e e-Fatura](EFATURA.md)                                 | Consulta, importação e vínculo com despesas                   |

## Referências, gerados e histórico

[Arquivo histórico](archive/README.md) contém publicações, incidentes, investigações e validações datadas. Não use seus comandos como roteiro atual nem suas autorizações como permissão permanente. Os nomes antigos de alguns guias foram mantidos para compatibilidade com referências existentes.

A biblioteca mantém documentação especializada junto dos scripts: [Bing Imagens](../apps/api/prisma/library-production/GOOGLE-COVERS.md) (nome legado), [Open Library](../apps/api/prisma/library-production/OPENLIBRARY-COVERS.md), [piloto de ISBN](../apps/api/prisma/library-production/ISBN-REVIEW.md) e [pesquisa/enriquecimento](../apps/api/prisma/library-production/ISBN-RESEARCH.md). Fontes externas e edição física exigem conferência.

[Exemplo de conversa](examples/conversations/dia-da-reforma.md) e [prompt da capa](examples/conversations/dia-da-reforma-imagem-prompt.md) são material editorial de exemplo, não especificação funcional. Os patches [leitor Windows 0.3.1](windows-listener-0.3.1.patch) e [atualizador 0.3.2](windows-updater-0.3.2.patch) são referências para o aplicativo externo; confira a base antes de aplicar.

`openapi.json` é gerado por `npm run openapi:generate`; `library-seed-review.md` e `seed.json` são gerados pelo preparador da biblioteca. Corrija a fonte/gerador quando necessário, sem editar resultados manualmente. A coleção [Postman](database-security.postman_collection.json) é um smoke test público de leitura; selecione o destino explicitamente.

As skills de provedor em `.agents/skills/` são instruções de ferramentas, não descrição da arquitetura instalada. Sua presença não significa que o Ponte usa Neon Auth, Functions, AI Gateway ou Object Storage.

## Como manter os guias

Execute `npm run docs:check` ao revisar documentos; o mesmo comando roda no CI.
Ele verifica destinos locais, políticas de cache e os gerados da biblioteca; o
OpenAPI tem sua própria verificação.

Cada assunto deve ter uma referência principal. Ao mudar comportamento, revise interface, API, permissões e persistência e atualize esse guia. Evite copiar tabelas completas de endpoints para o README; use OpenAPI e os guias de domínio. Registre resultados de intervenções com data no histórico. Não publique identidades de operadores, credenciais ou dados pessoais como configuração de referência.
