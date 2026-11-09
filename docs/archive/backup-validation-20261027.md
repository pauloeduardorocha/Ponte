### Validação local em 27/10/2026

> Registro histórico; resultados e autorizações valem apenas para a intervenção descrita.
> Consulte o [índice atual](../README.md) para procedimentos.


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
