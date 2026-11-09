# Manutenção e melhorias técnicas

Revisão documental em 09/11/2026, baseada no código versionado. Não atesta configuração ou disponibilidade de produção. O [plano de outubro](archive/technical-improvements-20261027.md) misturava itens já integrados com pendências de publicação daquela data.

## Recursos implementados

| Área                                                         | Referência                                        |
| ------------------------------------------------------------ | ------------------------------------------------- |
| CI, PostgreSQL descartável e recuperação                     | [CI](ci.md)                                       |
| Restic/rclone e workflows de backup e ensaio                 | [Backup](backup-recovery.md)                      |
| Outbox transacional, retentativas e agendamentos automáticos | [Notificações](notifications.md)                  |
| Serviços por domínio e painéis da biblioteca                 | [Organização dos módulos](module-structure.md)    |
| OpenAPI reproduzível e comparação de compatibilidade         | [Contratos](api-contracts.md)                     |
| Prazos, recuperação de rede e uploads idempotentes           | [Transporte e erros](frontend-error-reporting.md) |

## Limitações e trabalho possível

- **Relatórios financeiros:** `reports.service.ts` ainda limita linhas e fontes de saldo a 10 mil. Histórico por conta é somado em memória. Evoluir para agregação no banco e paginação das fontes, preservando Decimal, moedas e rastreabilidade; validar históricos acima do limite atual.
- **Manutenção:** buckets de rate limit vencem logicamente; não foi localizada rotina dedicada de remoção periódica em lotes. Definir retenção e medir volume sem remover auditoria. Sessões de upload de reembolso têm limpeza oportunista.
- **Recuperação operacional:** demonstrar aplicação, permissões e documentos a partir de cópia real com tempos medidos. Definir substituto, RPO/RTO e detecção de ausência de execução; conferir jobs nos painéis.
- **Provedores e dispositivos:** testes simulados não confirmam entrega real de Bird/Web Push, checkout real, portal e-Fatura, biometria ou áudio no Wi-Fi. Usar roteiros dos guias em ambientes autorizados.
- **Armazenamento:** binários no PostgreSQL continuam suportados na Vercel. Medir crescimento antes de propor objetos privados e migração com recuperação conjunta.
- **Navegador:** o CI versionado executa testes de componentes e HTTP, além de Chromium local do e-Fatura. Não inclui uma suíte de navegador cobrindo login, permissões, PWA e uploads como fluxo completo da aplicação.

Execute e valide cada evolução separadamente. Preserve monólito modular, autorização centralizada e compatibilidade dos contratos.
