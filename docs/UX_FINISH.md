# Acabamento do Ponte

## Interface e fluxos

- Componentes compartilhados para indicadores, gráficos e estados com cores
  semânticas, texto e valores acessíveis. Crédito/conclusão em verde,
  débito/atraso/erro em vermelho, pendência em amarelo e informação em azul.
- Painéis da administração, biblioteca e financeiro consultam dados reais e
  respeitam RBAC. Membros sem privilégios recebem acesso à própria conta.
- Cadastros de visitantes e eventos, com pesquisa, situação, paginação,
  validação, estados de carregamento/erro/vazio e feedback após salvar.
- Receitas, despesas e contribuições têm filtros por período, conta e tipo;
  lançamentos também têm categoria/status. Valores, categorias, vencimento e
  pagamento são apresentados junto ao item. Formulários financeiros usam
  grade adaptável e validação visual; valores aceitam ponto ou vírgula decimal.
- Revisão bancária com filtros e busca por descrição/referência, páginas de
  20/50/100 itens, seleção de créditos/débitos, classificação individual e em
  lote, categoria rápida, descrição no cabeçalho e valor à direita.
- Origem/conciliação ficam em seção expansível de cada movimento. A seleção
  é limitada à página atual e limpa ao mudar filtros. Duplicidades e associação
  de membros continuam explícitas. A categoria rápida não aceita duplicidades
  nem altera movimentos conciliados, e preserva associações existentes.
- Layout adaptável, navegação móvel, loading por rota, formulários consistentes,
  estados vazios/erros e feedback. A barra de seleção é fixa durante a rolagem
  em desktop e permanece no fluxo em telas pequenas.

## Arquitetura e performance

- Visitantes/eventos têm tabelas próprias, status com constraints, permissões
  específicas e os mesmos triggers/contexto de auditoria usados no sistema.
- O painel financeiro faz agregações SQL por moeda em snapshot consistente;
  saldo usa receitas concluídas e despesas pagas até a data de corte.
  Valores monetários continuam Decimal no banco/API; conversão para número
  ocorre apenas na apresentação dos gráficos.
- Listas paginadas e filtros no servidor; relacionamentos carregados em conjunto;
  índices para classificação, datas/status, arquivos e conta/importação.
- Cache curto por sessão com invalidação de mutações e limpeza no logout.
  Debounce reduz consultas durante pesquisa. Módulos maiores carregam por rota;
  os gráficos usam componentes leves, sem dependência adicional.
- O bundle da aplicação inicial ficou em aproximadamente **235 KB / 58 KB gzip**;
  React/Router, MUI/Emotion e Query são chunks compartilhados separados.
  Esses tamanhos não representam o download total da primeira visita.
- Seed compilado separadamente para poder executar no Docker sem ts-node em
  produção. Perfil demo opcional, senha obrigatória e IDs estáveis; preserva
  registros já existentes. Reutiliza as categorias das migrations e preserva
  categorias renomeadas, sem duplicá-las. O arquivo original da demonstração é privado.

## Documentação e operação

- README cobre arquitetura, instalação, variáveis, migrations, seed, Docker,
  testes, build e deploy, com proteção de banco/arquivos e backups conjuntos.
- Swagger usa DTOs compilados e esquemas de Bearer/refresh cookie.
  [OpenAPI](openapi.json) contém 79 caminhos e 47 schemas; a UI e o JSON são
  servidos em desenvolvimento. Swagger não fica público em produção.
- `docker compose up -d` aplica migrations, aguarda PostgreSQL/API saudáveis
  e inicia o Nginx. A demonstração executa com o perfil `demo`, explicitamente.

## Validação

**Lint sem erros/avisos; 200 testes passaram (139 API, 61 frontend); build
completo passou.** Foram acrescentadas verificações de dashboard por conta/
período, privacidade de pesquisa, CRUD/auditoria de visitantes/eventos, categorias
rápidas, seleção por direção, filtros/paginação, painéis por permissão e seed
idempotente. O teste do seed reprocessa o CSV e compara os fingerprints de todos
os 150 movimentos com a normalização utilizada pelo importador.

O ambiente Docker isolado foi iniciado com imagens construídas do projeto.
O smoke test verificou saúde, login/cookies seguros, painéis/RBAC, paginação de
150 movimentos, filtro de débito e download privado do original. A seed também
foi executada dentro do contêiner. O banco e os volumes normais do projeto não
foram substituídos pelo ambiente de teste.

## Problemas resolvidos e limites

Uma tentativa da regressão encerrou nativamente no Windows (3221226505).
A repetição integral completou todas as 16 suítes da API e 11 do frontend.

- Dashboards com indicadores ilustrativos foram substituídos por consultas reais.
- Listas financeiras/bancárias tinham filtros limitados e excesso de informação
  de rastreabilidade sempre aberta; receberam filtros e hierarquia visual.
- Consultas repetidas por moeda no financeiro foram substituídas por agregação.
- Ajustados tipos do seed, imports após separar os módulos, schemas de Swagger,
  build do seed no Docker e exclusão de artefatos compilados do lint/Git/contexto
  de build. Nenhuma funcionalidade existente foi removida.
- A validação visual automatizada não ocorreu: a política do navegador recusou
  acesso a `localhost:55173`. Os testes de componentes/fluxos e API não substituem
  uma inspeção visual final em desktop e telefone.
- npm avisa sobre configurações legadas locais `always-auth`/`email`; Rollup
  informa sobre comentários PURE de uma dependência. Não impedem o build.

## Próximos passos

Validar visualmente desktop/telefone com os perfis de demonstração, realizar
uma sessão com o operador financeiro usando extrato fictício grande e preparar
o ambiente de produção com TLS, credenciais próprias e teste de restauração
dos backups. Para bases muito maiores, medir consultas e navegação antes de
adotar virtualização ou cache adicional.
