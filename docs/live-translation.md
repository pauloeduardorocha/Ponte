# Tradução ao vivo na rede local

Validação visual de ponta a ponta: a fixture `smoke-integration.cjs` no projeto Live translation carrega o build da PWA e a implementação compilada do serviço de descoberta com banco em memória. Ela gera uma ligação pela interface, simula captura/Gemini, publica pelo botão do apresentador, verifica o menu e a reprodução ADPCM na PWA e confirma a retirada ao parar. Não usa contas reais nem faz chamadas ao Gemini. Execute com o Electron após os builds da API e da web.

O aplicativo Windows captura o microfone, conecta-se ao Gemini e serve a audiência no Wi-Fi. Áudio comprimido ADPCM e texto seguem diretamente do computador para os ouvintes; não passam pela Vercel nem são salvos no banco do Ponte.

## Configuração e uso

### Escuta com o ecrã bloqueado (Windows 0.3.0+)

Na página de tradução, **Ouvir com o ecrã bloqueado** abre uma página local com um elemento HTML `audio`, transmissão HTTP contínua de MP3 mono a 48 kbit/s e integração Media Session quando suportada. Toque em **Ouvir ao vivo** antes de minimizar. A codificação acontece uma vez no PC e é compartilhada por todos os ouvintes desse modo; silêncio local mantém o fluxo entre as falas sem enviar áudio adicional ao Gemini. Esse leitor não depende dos timers, do WebSocket ou da decodificação JavaScript da PWA para produzir som em segundo plano. O acompanhamento de texto/áudio ADPCM continua disponível no modo normal.

O link abre a origem local para evitar carregar áudio HTTP dentro da PWA HTTPS. É preciso atualizar o aplicativo Windows para 0.3.0 ou superior, manter a aba/navegador abertos e continuar no Wi-Fi. O modo pode ter um atraso maior que o player de texto. Brave, Android, chamadas e políticas de bateria ainda podem interromper mídia; é necessário testar no aparelho real. O projeto não desativa proteções nem promete execução quando o sistema encerra o navegador. Pausar e retomar pelo leitor reconecta à transmissão atual, sem reproduzir o áudio acumulado durante a pausa.

Visitantes sem conta também podem acompanhar a tradução. O login consulta `GET /api/v1/live-translation/public-status` e, somente durante uma publicação válida, mostra **Ouvir tradução ao vivo — sem entrar**, com o aviso de que é necessário usar o Wi-Fi da igreja. O botão abre `/listen-translation`, uma página pública com o mesmo player e alternativa de acesso local. A rota pública divulga somente disponibilidade, endereço da audiência e expiração; as rotas administrativas e o status autenticado permanecem protegidos. O áudio continua na rede local e não é retransmitido pela Vercel. Fora do Wi-Fi, a página pode abrir, mas não alcança o computador da igreja.

1. Um usuário ADMIN ou SUPER_ADMIN abre **Comunicação → Aplicativo de tradução** (`/translation-app`).
2. Baixa o pacote Windows, extrai a pasta inteira e executa `Ponte-Traducao.exe`. Não precisa instalar Node.js.
3. Gera uma ligação e copia para o aplicativo local. Essa credencial é exibida uma vez na PWA e fica somente na memória no aplicativo; a API guarda apenas SHA-256. Gerar outra revoga a anterior e retira qualquer publicação ativa.
4. No aplicativo, configura a chave Gemini, escolhe o microfone e inicia a tradução. Escolhe o IP da rede da igreja (não VPN) e clica em **Publicar tradução**.
5. O menu **Tradução ao vivo** aparece para contas aprovadas na PWA em até 1 minuto. A página `/live-translation` conecta diretamente ao computador; o usuário precisa estar no mesmo Wi-Fi e pode precisar autorizar rede local no navegador. **Abrir página local** é a alternativa quando uma conexão HTTPS → rede local é bloqueada.
6. **Retirar publicação**, parar, falha no Gemini ou fechar o aplicativo retira a publicação. Uma falha abrupta expira em até 120 segundos após a última confirmação. Clientes em primeiro plano consultam a disponibilidade a cada 60 segundos; a interface também respeita a expiração localmente.

O PC confirma presença a cada 30 segundos apenas enquanto publicado. São pedidos HTTP curtos de metadados, sem áudio, texto ou chave Gemini. Uma única publicação simultânea é permitida; outra sessão precisa esperar a expiração ou a revogação da ligação. Membros sem acesso administrativo não podem criar credenciais ou baixar o pacote pelo backend.

O firewall do Windows deve permitir a porta TCP 3210 na rede privada e a rede Wi-Fi deve permitir comunicação com esse computador. O pacote não altera firewall ou roteador automaticamente. O PC precisa continuar ligado. Trocar o IP exige selecionar o novo endereço e republicar.

## Download e publicação de uma versão Windows

O pacote inclui `GUIA-COMECE-AQUI.html` (guia visual que abre no navegador sem internet) e `LEIA-ME-PRIMEIRO.txt` (Bloco de Notas), ao lado de `Ponte-Traducao.exe`. A página administrativa mostra o mesmo conteúdo em seções expansíveis. A fonte é `apps/web/src/content/translation-windows-guide.json`; o empacotamento lê esse arquivo ao receber o caminho do Ponte e mantém uma cópia local para builds independentes. O guia cobre extração do ZIP, ligação ao Ponte, chave Gemini, microfone, publicação, uso pelos ouvintes, encerramento e problemas comuns.

No repositório **Live translation**, execute no Windows:

```powershell
node build-windows.cjs "C:\caminho\para\Ponte"
```

O script inclui o runtime Electron, a aplicação e `ws`, sem credenciais, histórico ou arquivos de ambiente. Produz `dist/Ponte-Traducao-Windows.zip` e SHA-256. A cópia opcional para `Ponte/private-storage/translation/` habilita o download autenticado em desenvolvimento (API iniciada pelo workspace ou pela raiz). O ZIP é portátil e ainda não tem assinatura de código própria.

Em produção, hospede esse ZIP em um serviço de arquivos/release separado e configure `TRANSLATION_APP_DOWNLOAD_URL` com a URL HTTPS. O Ponte fornece o link; não transmite o binário pelas Functions nem inclui o Electron no deploy. Sem URL configurada, a administração mostra a indisponibilidade explicitamente, sem link fictício. `TRANSLATION_APP_ARCHIVE` permite definir um ZIP local fora do caminho padrão, apenas em desenvolvimento.

Antes de publicar o Ponte, aplique pelo fluxo normal a migration `20261106190000_live_translation`. Nenhuma alteração no banco de produção é feita ao gerar o pacote ou executar os testes unitários. O build atualiza o contrato OpenAPI com os endpoints abaixo.

## Contrato

Todos os caminhos usam `/api/v1/live-translation`:

| Método / caminho | Autorização | Comportamento |
| --- | --- | --- |
| GET `/status` | Conta aprovada autenticada | `{ active, audienceUrl, expiresAt }`; sem credenciais ou conteúdo |
| GET `/public-status` | Público, sem login | Os mesmos metadados de disponibilidade para o botão do login e a página pública; sem credenciais, áudio ou texto |
| POST `/credential` | ADMIN / SUPER_ADMIN | Gera `{ token }` uma vez, revoga a anterior e limpa a publicação |
| POST `/publish` | Bearer da credencial do PC | `{ sessionId: UUIDv4, audienceUrl }`; publica/renova lease de 120s |
| POST `/unpublish` | Bearer da credencial do PC | `{ sessionId }`; retira somente essa sessão |
| GET `/download` | ADMIN / SUPER_ADMIN | `{ url, localAvailable }` |
| GET `/download/archive` | ADMIN / SUPER_ADMIN | ZIP local apenas em desenvolvimento |

As rotas de dispositivo usam autenticação própria, não o JWT do usuário. Aceitam apenas audiência HTTP em IPv4 privado RFC1918 com caminho `/listen/<24 hex>` e sem credenciais, query ou fragmento. Uma atualização condicional impede sobrepor outro lease ativo. A página do apresentador permanece protegida por um segredo local diferente. A origem da PWA autorizada é configurada pela ligação e aceita somente conexões de audiência; não habilita acesso ao controle do microfone.

## Verificação

Testes de API: validação de endereços, hashes, permissões administrativas, expiração, conflito de sessão e retirada. Testes web: visibilidade condicional, rotas negadas, download e geração da ligação. Testes do aplicativo: codec, distribuição e publicação/retirada. O teste real completo ainda requer uma chave Gemini, microfone, migration aplicada e celulares no Wi-Fi da igreja, incluindo Safari/iOS e permissões de rede local.
