# Backup e recuperação

## Estado e objetivos

Inspeção de 27/10/2026: o projeto Neon `proud-dream-93315359` usa PostgreSQL 18,
plano Free, histórico de 21 600 segundos (6 horas) e nenhuma agenda de snapshots
na branch de produção `br-icy-fire-b2v6raw9`. A cópia externa complementa esse
histórico e não exige mudança de plano.

Implementação preparada para Google Drive com **Restic + rclone**. Os dados são
encriptados antes de sair da máquina; não usar a pasta sincronizada do Drive
como repositório local. Restic acessa diretamente a API via rclone.
Não há cópias agendadas ativas até concluir a configuração abaixo.

Política inicial proposta, a confirmar com o responsável pela operação:

| Item                 | Política                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Responsável          | Administrador do projeto Ponte; definir um substituto com acesso de recuperação                                   |
| Frequência           | A cada 6 horas, minuto 23, UTC                                                                                    |
| RPO externo desejado | 6 horas mais duração do backup e atraso do agendamento                                                            |
| RTO desejado         | Até 2 horas; ainda não demonstrado com dados e infraestrutura de produção                                         |
| Retenção             | Todas as cópias de 7 dias, uma semanal por 4 semanas, uma mensal por 3 meses                                      |
| Ensaio               | Local em cada CI; mensalmente a partir de uma cópia real do Drive                                                 |
| Alerta               | Falha do workflow pelo GitHub Actions; administrador precisa habilitar notificações e conferir atraso de execução |

Agendamentos GitHub podem atrasar e ser desativados por inatividade; isso não é
um SLA de RPO. Monitorização externa de ausência de execução permanece pendente.
Guardar a senha Restic num gestor de senhas independente do GitHub/Drive e dar
acesso ao substituto. Sem essa senha não é possível recuperar as cópias.

## O que está incluído

O script exige `PRIVATE_STORAGE_DRIVER=database`, modo persistente usado pela
aplicação na Vercel. `pg_dump` inclui todas as tabelas, histórico de migrações,
funções/triggers, documentos `private_files.content` e anexos
`schedule_attachments.content`. Os documentos e metadados compartilham o mesmo
snapshot consistente. Nenhum endpoint/contrato HTTP foi alterado.

Papéis globais, senhas do PostgreSQL, variáveis Vercel, Bird/Stripe/Web Push,
domínios e conta Google não estão no dump. Recuperá-los do gestor de segredos;
reaplicar os privilégios com o script versionado de segurança do banco.
Instalações que usam filesystem são recusadas: precisam pausar as escritas e
copiar também `PRIVATE_STORAGE_PATH` de forma coordenada antes de aderir à rotina.

## Configurar Google Drive

1. Criar um cliente OAuth próprio no Google Cloud, com Google Drive API ativa.
   Seguir [o guia do rclone](https://rclone.org/drive/#making-your-own-client-id).
   O cliente partilhado está em retirada; aplicações OAuth em modo Testing podem
   expirar os tokens e interromper a rotina. Rever o estado de publicação OAuth.
2. Na máquina do administrador, executar `rclone config` fora do repositório.
   Criar remote `gdrive`, tipo `drive`, com o client ID/secret próprio e scope
   `drive.file`. Autorizar no navegador com a conta que será responsável pelas
   cópias. Esse scope limita o acesso aos arquivos criados/autorizados para o app.
3. Guardar client ID, client secret e o JSON completo de `token` como secrets do
   GitHub abaixo, usando o painel; não colar tokens no chat nem em arquivos Git.
   Manter a mesma identidade OAuth para criar e ler o repositório.
4. Criar uma senha Restic aleatória exclusiva e armazená-la no gestor de senhas.
   Reservar espaço no Drive; não mover, editar ou apagar os arquivos internos da
   pasta `ponte-backups/production`.

Em **Settings → Secrets and variables → Actions**, adicionar:

| Secret                       | Valor                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `BACKUP_PGHOST`              | Host direto da produção Neon, sem `-pooler`           |
| `BACKUP_PGDATABASE`          | Nome do banco de produção                             |
| `BACKUP_PGUSER`              | Login autorizado a ler integralmente todas as tabelas |
| `BACKUP_PGPASSWORD`          | Senha desse login                                     |
| `BACKUP_RESTIC_PASSWORD`     | Senha de encriptação exclusiva                        |
| `BACKUP_DRIVE_CLIENT_ID`     | Cliente OAuth do Google                               |
| `BACKUP_DRIVE_CLIENT_SECRET` | Secret desse cliente                                  |
| `BACKUP_DRIVE_TOKEN`         | JSON do token OAuth do remote gdrive                  |

Usar um login dedicado de leitura, com acesso a todas as tabelas atuais e futuras,
incluindo auditoria e binários. O login restrito da aplicação não deve ser
presumido suficiente. O proprietário pode provisionar o login de backup e conceder
`pg_read_all_data`, após avaliar as políticas RLS existentes. Nunca conceder
escrita apenas para fazer o dump funcionar. O script aborta se pg_dump falhar.

Adicionar a variável `PONTE_BACKUPS_ENABLED=true`. Executar o workflow
**Encrypted database backup** manualmente com `initialize=true` **apenas na
primeira execução**, para criar o repositório dedicado. Nas seguintes, deixar
false. Um erro de senha/rede nunca inicializa silenciosamente outro repositório.

Confirmar a primeira cópia e um restauro real antes de considerar a proteção
ativa. Ativar notificações de workflows com falha no GitHub. Não são criados
artifacts GitHub com dumps, tokens ou configurações rclone.

## Execução fora do GitHub

Linux ou WSL, com PostgreSQL client 18, Restic com `--stdin-from-command` e rclone.
Configurar variáveis por um gestor de segredos/arquivo privado fora do Git.
`PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE=require`,
`PRIVATE_STORAGE_DRIVER=database`, `RESTIC_PASSWORD` e
`RESTIC_REPOSITORY=rclone:gdrive:ponte-backups/production`.

```sh
# Somente na criação inicial de um repositório dedicado vazio:
restic init
bash scripts/backup-database.sh
restic snapshots --host ponte --tag ponte-database
```

O fluxo usa `restic backup --stdin-from-command -- pg_dump`: uma falha do produtor
cancela a criação do snapshot. Não substituir por um pipe com `restic --stdin`,
que pode registrar um dump incompleto como backup. Nenhum dump em claro é escrito
no disco durante a cópia. `restic check` verifica a estrutura após cada backup;
fazer também `restic check --read-data` no ensaio mensal para ler todos os blocos.

A imagem `scripts/backup.Dockerfile` contém essas ferramentas. Não passar valores
secretos em argumentos Docker; usar `-e NOME_DA_VARIAVEL` e o ambiente do processo.

## Recuperar em ambiente isolado

1. Selecionar uma cópia íntegra anterior ao incidente. Registrar o ID **completo**,
   data e commit da aplicação. Suspender notificações e integrações no ambiente
   de recuperação. Não fazer testes com dados reais via provedores externos.
2. Criar banco **vazio**, PostgreSQL 18, chamado `ponte_restore_<identificador>`
   num ambiente isolado. Configurar PG* para o **destino**, ligação direta com
   login proprietário; manter Restic/rclone apontando à cópia no Drive.
3. Definir `RESTORE_EXPECTED_HOST` com o host do destino e `RESTORE_SNAPSHOT` com
   o ID completo. Executar `bash scripts/restore-database.sh`.
   O script recusa outros nomes/hosts e bancos com tabelas; não usa `--clean`.
   Desencripta num diretório temporário privado em `/dev/shm` (tmpfs), verifica o
   download e restaura numa única transação. Em Docker, dimensionar `--shm-size`
   para caber o dump; o diretório é removido ao sair.
4. Guardar a URL do proprietário como `ADMIN_DATABASE_URL`, gerar nova senha de
   runtime e executar `node apps/api/scripts/database-security.cjs bootstrap`.
   Consultar [segurança do banco](database-security.md) para os parâmetros.
   O dump deliberadamente não restaura donos nem ACLs originais: reaplicar as
   permissões é obrigatório antes de iniciar a API.
5. Usar o commit compatível com o backup. Conferir migrations antes de aplicar
   mudanças posteriores, configurar URL restrita e segredos de autenticação.
   Iniciar a aplicação isolada; testar saúde, login, permissões, saldos e download
   dos documentos. Comparar contagens/hash dos dados críticos com evidências da
   cópia. Registrar duração desde o início do incidente e perda de dados.
6. Só promover o ambiente recuperado após revisão explícita de destino, dados e
   integrações. A troca da produção não faz parte do script nem do ensaio local.

Em falha de backup: verificar última cópia bem sucedida, espaço/quota no Drive,
autorização OAuth, ligação direta/TLS e permissões do login. Corrigir a causa e
reexecutar sem `initialize`. Não executar `unlock`/`forget` manualmente para
esconder falhas ou remover evidências.

## Ensaio reproduzível

```sh
npm run test:recovery
```

Provisiona PostgreSQL 18 com porta/URL e senhas aleatórias via Compose; aplica
migrations; cria documento privado e anexo de escala com bytes conhecidos;
usa Restic através do backend rclone local; testa produtor com falha e senha
incorreta; lê todos os blocos; restaura para banco vazio e compara hashes/contagens
de **todas as tabelas**. Reaplica permissões e executa os 13 testes existentes de
API/login restrito, mais dois testes dos documentos recuperados via Prisma e
StorageService com esse login. Remove o projeto Compose ao terminar.

O ensaio não acessa Google nem dados de produção. Valida as ferramentas e o
conteúdo restaurado, sem provar OAuth, quota, latência Drive, RPO/RTO reais ou
recuperação da infraestrutura Vercel. O CI inclui esse ensaio no check existente
de integração; as regras obrigatórias da main continuam usando os mesmos nomes.

### Validação local em 27/10/2026

- Backup Restic 0.18.1 através de rclone 1.74.1, leitura integral dos blocos e
  restauro no PostgreSQL 18 aprovados; hashes/contagens de todas as tabelas iguais.
- Documentos privados e anexos de escalas recuperados com conteúdo binário exato.
- Produtor com falha não criou snapshot; senha incorreta e destino ocupado foram
  recusados. Ligação pooled e armazenamento filesystem também recusados.
- 15 testes passaram no banco recuperado: 13 de API/login/permissões e dois dos
  documentos. Os 13 testes também passaram no PostgreSQL 17.
- Backup/restauro e verificações em shell levaram 12 segundos na base sintética
  (arquivo de aproximadamente 253 KiB), excluindo instalação, migrations e Jest.
  Esse tempo não representa o RTO real de produção.
- Confirmado `tmpfs` para os dados em ambas as versões; containers removidos.
- Build da imagem Docker de backup com PostgreSQL client 18, Restic e rclone
  concluído; as ferramentas não dependem de instalação no servidor da aplicação.
- TypeScript da API e frontend, ESLint dos arquivos alterados, sintaxe Bash,
  parsing YAML dos workflows/Compose e `git diff --check` aprovados.
- Primeira tentativa de download da imagem falhou por interrupção da rede; a
  nova execução concluiu o ensaio. Nenhum acesso à produção ou ao Drive foi feito.

Fontes: [Neon pg_dump](https://neon.com/docs/manage/backup-pg-dump),
[Restic backup por comando](https://restic.readthedocs.io/en/stable/040_backup.html#reading-data-from-a-command),
[Restic e rclone](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#other-services-via-rclone),
[Google Drive no rclone](https://rclone.org/drive/).
