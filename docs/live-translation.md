# Tradução ao vivo na rede local

Validação do leitor: a fixture `listener-smoke.cjs` na pasta Live translation inicia o servidor local com Gemini simulado, abre a tela em Electron com largura de celular e verifica início do MP3 nativo, transcrição, pausa e retomada. Salva uma captura para revisão visual, sem contas reais ou chamadas ao Gemini. Execute `node_modules/electron/dist/electron.exe listener-smoke.cjs` com a variável `ELECTRON_RUN_AS_NODE` removida do ambiente. Os testes da PWA verificam a entrada pública/autenticada e as permissões administrativas.

O aplicativo Windows captura o microfone, conecta-se ao Gemini e serve a audiência no Wi-Fi. Áudio comprimido ADPCM e texto seguem diretamente do computador para os ouvintes; não passam pela Vercel nem são salvos no banco do Ponte.

## Configuração e uso

### Uma única tela para ouvir e ler (Windows 0.3.1+)

O Ponte oferece **Abrir tradução ao vivo**, na mesma aba. O endereço local abre uma única tela com texto e um leitor HTML de MP3 contínuo, com o navegador visível, minimizado ou com o ecrã bloqueado, conforme suporte do aparelho. Toque em **Ouvir ao vivo** para começar; **Pausar áudio** mantém o texto conectado e **Retomar ao vivo** abre uma nova conexão à transmissão atual, descartando o áudio acumulado. Os controles Media Session usam as mesmas ações. Links antigos com `?mode=background` abrem essa mesma tela.

A navegação para a origem local evita carregar áudio HTTP de um IP privado dentro da PWA HTTPS, que pode ser bloqueado pelo navegador ([MDN: mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)). O texto usa WebSocket e reconecta independentemente; falhas ou suspensão do texto não param o áudio nativo. O texto pode chegar antes do áudio. Ao ler trechos anteriores, a página respeita a posição de rolagem.

É preciso atualizar o aplicativo Windows para **0.3.1**, manter a aba aberta e continuar no Wi-Fi. A codificação MP3 mono a 48 kbit/s ocorre uma vez no PC, compartilhada pelos ouvintes, com silêncio entre falas. Brave, Android, iOS, chamadas e políticas de bateria ainda podem interromper mídia: a validação com tela bloqueada precisa ocorrer no aparelho real. A página não promete reprodução após encerrar o navegador.

As alterações Windows foram aplicadas na pasta irmã **Live translation**, fora do Git deste repositório. O patch `docs/windows-listener-0.3.1.patch` permite reproduzi-las sobre o código 0.3.0: aplique com `git apply --no-index <caminho-do-patch>` na pasta do aplicativo. Execute `npm test` e `npm run check` e gere o pacote pelo comando abaixo. Atualize o pacote distribuído junto com o Ponte; a versão 0.3.0 ainda possui telas separadas.

Visitantes sem conta também podem acompanhar a tradução. O login consulta `GET /api/v1/live-translation/public-status` e, somente durante uma publicação válida, mostra **Ouvir tradução ao vivo — sem entrar**, com o aviso de que é necessário usar o Wi-Fi da igreja. O botão abre `/listen-translation`, uma página pública com a mesma entrada para o leitor local. A rota pública divulga somente disponibilidade, endereço da audiência e expiração; as rotas administrativas e o status autenticado permanecem protegidos. O áudio continua na rede local e não é retransmitido pela Vercel. Fora do Wi-Fi, a página pode abrir, mas não alcança o computador da igreja.

1. Um usuário ADMIN ou SUPER_ADMIN abre **Comunicação → Aplicativo de tradução** (`/translation-app`).
2. Baixa o pacote Windows, extrai a pasta inteira e executa `Instalar.cmd`. Depois abre o atalho **Ponte - Tradução**. Não precisa instalar Node.js nem ter privilégios de administrador.
3. Gera uma ligação e copia para o aplicativo local. Essa credencial é exibida uma vez na PWA e fica somente na memória no aplicativo; a API guarda apenas SHA-256. Gerar outra revoga a anterior e retira qualquer publicação ativa.
4. No aplicativo, configura a chave Gemini, escolhe o microfone e inicia a tradução. Escolhe o IP da rede da igreja (não VPN) e clica em **Publicar tradução**.
5. O menu **Tradução ao vivo** aparece para contas aprovadas na PWA em até 1 minuto. A página `/live-translation` oferece **Abrir tradução ao vivo**, que navega para o leitor no computador da igreja; o usuário precisa estar no mesmo Wi-Fi.
6. **Retirar publicação**, parar, falha no Gemini ou fechar o aplicativo retira a publicação. Uma falha abrupta expira em até 120 segundos após a última confirmação. Clientes em primeiro plano consultam a disponibilidade a cada 60 segundos; a interface também respeita a expiração localmente.

O PC confirma presença a cada 30 segundos apenas enquanto publicado. São pedidos HTTP curtos de metadados, sem áudio, texto ou chave Gemini. Uma única publicação simultânea é permitida; outra sessão precisa esperar a expiração ou a revogação da ligação. Membros sem acesso administrativo não podem criar credenciais ou baixar o pacote pelo backend.

O firewall do Windows deve permitir a porta TCP 3210 na rede privada e a rede Wi-Fi deve permitir comunicação com esse computador. O pacote não altera firewall ou roteador automaticamente. O PC precisa continuar ligado. Trocar o IP exige selecionar o novo endereço e republicar.

## Atualizações do aplicativo Windows (0.3.2+)

Ao iniciar, o aplicativo consulta as releases públicas do GitHub de pauloeduardorocha/Ponte, com timeout total de 8 segundos e sem enviar credenciais, chave Gemini, áudio ou configuração da igreja. Seleciona a maior versão estável com tag ponte-traducao-vMAJOR.MINOR.PATCH e ZIP completo publicado. Tags da PWA, rascunhos, pré-lançamentos e versões iguais ou anteriores são ignorados. A comparação é numérica (0.10.0 é maior que 0.9.0).

Se houver novidade, **Baixar atualização** abre o ZIP daquela release no navegador padrão; **Agora não** mantém o uso normal. A consulta não bloqueia o carregamento. Falha de rede no startup fica silenciosa e **Ajuda → Verificar atualizações** permite tentar novamente e ver o resultado. Só são abertos links HTTPS de download da release esperada no repositório oficial. O aplicativo avisa sobre atualizações; não baixa nem executa código automaticamente.

Extraia o ZIP e execute **Instalar.cmd**. O instalador usa sempre **%LOCALAPPDATA%\Ponte-Traducao**, substitui o runtime completo e reutiliza os atalhos **Ponte - Tradução** na Área de Trabalho e no menu Iniciar. Exige fechar o aplicativo antes, sem encerrar uma tradução à força. Prepara os arquivos numa pasta temporária e só depois troca a instalação, restaurando a anterior se a troca falhar. Dados do usuário fora da pasta do runtime são preservados; chaves e ligação continuam apenas na memória e precisam ser informadas ao abrir. Impede downgrade e substituição de uma pasta não reconhecida como Ponte.

Na migração de um ZIP portátil anterior, instale uma vez e passe a abrir pelo atalho. A pasta portátil antiga não é apagada. Versões anteriores a 0.3.2 ainda não verificam atualizações: esta primeira instalação precisa ser feita manualmente. O novo pacote e sua release precisam ser publicados para a igreja recebê-los.

As mudanças sobre o aplicativo Windows 0.3.1 estão no patch **docs/windows-updater-0.3.2.patch**, incluindo testes e instalador. Aplique na pasta Live translation com git apply --no-index após aplicar o patch do leitor 0.3.1, se necessário. Verificações: node --test update-checker.test.cjs installer.test.cjs, além da suíte existente; o teste do instalador usa uma pasta temporária sem alterar a instalação real nem os atalhos do usuário.

## Download e publicação de uma versão Windows

O pacote inclui `GUIA-COMECE-AQUI.html` (guia visual que abre no navegador sem internet) e `LEIA-ME-PRIMEIRO.txt` (Bloco de Notas), ao lado de `Ponte-Traducao.exe`. A página administrativa mostra o mesmo conteúdo em seções expansíveis. A fonte é `apps/web/src/content/translation-windows-guide.json`; o empacotamento lê esse arquivo ao receber o caminho do Ponte e mantém uma cópia local para builds independentes. O guia cobre extração do ZIP, ligação ao Ponte, chave Gemini, microfone, publicação, uso pelos ouvintes, encerramento e problemas comuns.

No repositório **Live translation**, execute no Windows:

```powershell
node build-windows.cjs "C:\caminho\para\Ponte"
```

O script inclui o runtime Electron, a aplicação e `ws`, sem credenciais, histórico ou arquivos de ambiente. Produz `dist/Ponte-Traducao-Windows.zip` e SHA-256. A cópia opcional para `Ponte/private-storage/translation/` habilita o download autenticado em desenvolvimento (API iniciada pelo workspace ou pela raiz). O ZIP inclui `Instalar.cmd` e `install-windows.ps1`, que instalam por usuário, sem privilégios de administrador. O pacote ainda não tem assinatura de código própria.

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

Testes de API: validação de endereços, hashes, permissões administrativas, expiração, conflito de sessão e retirada. Testes web: entrada única na mesma aba para visitantes e membros, visibilidade condicional, rotas negadas, download e geração da ligação. Testes do leitor: pausa, retomada com conexão nova, controles Media Session, falhas e rejeições tardias de reprodução. Testes do aplicativo: codec, distribuição e publicação/retirada. O teste real completo ainda requer uma chave Gemini, microfone, migration aplicada e celulares no Wi-Fi da igreja, incluindo Safari/iOS e permissões de rede local.
