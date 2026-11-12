# Tradução ao vivo na rede local

O aplicativo Windows tem código e ciclo de publicação próprios, fora deste
repositório. Os patches versionados abaixo mantêm o leitor, o atualizador e o empacotamento;
a existência deles não comprova a versão do ZIP atualmente distribuído.

Validação do leitor: a fixture `channels-smoke.cjs` na pasta Live translation usa microfone e Gemini simulados para verificar a interface do apresentador, a publicação e o player local com MP3 nativo. Toques nas bandeiras selecionam, iniciam, pausam e retomam a escuta. Execute com Electron e um diretório de saída opcional para capturas. Não usa contas reais nem chama o Gemini.

O aplicativo Windows captura o microfone, conecta-se ao Gemini e serve a audiência no Wi-Fi. Na versão do leitor MP3 descrita abaixo, áudio MP3 e texto seguem diretamente do computador para os ouvintes; não passam pela Vercel nem são salvos no banco do Ponte.

O apresentador usa a missão **Conhecer a Cristo e fazê-lo conhecido**. A tela do ouvinte mantém somente a logo e o nome da igreja, as bandeiras e a transcrição. O aviso de espera aparece quando não há transmissão ativa.

## Canais de tradução

O computador abre com um canal em inglês. O apresentador pode abrir até três canais simultâneos, cada um para um idioma suportado diferente, e fechá-los a qualquer momento. É preciso ter pelo menos um canal aberto para iniciar a captura. A entrada tem detecção automática de idioma. Cada canal tem sua própria sessão Gemini, transcrição e transmissão MP3, compartilhadas pelos ouvintes desse canal; a captura do microfone é única. O consumo da API depende dos canais ativos, sem criar uma tradução por ouvinte.

Abrir um canal durante a tradução conecta a nova sessão e passa a traduzir as próximas palavras, sem reiniciar os demais. Uma falha afeta somente aquele canal, que pode ser reconectado pelo apresentador. Fechar o último canal para a captura, apaga a chave da sessão em memória e retira a publicação. Parar mantém os canais abertos para a próxima execução. Ao fechar o aplicativo, as escolhas são descartadas; ao reabrir, o inglês volta como padrão.

Quando nenhum canal está ao vivo, a página dos ouvintes informa: **Aguardando a transmissão**, seguido de **Assim que começar, a tradução aparecerá aqui. Pode manter esta página aberta.** O estado de espera usa ícone discreto e texto centralizado, sem caixa de alerta ou cores de erro. O estado de espera também aparece na entrada pública ou autenticada do Ponte sem publicação ativa. Na tela local, ele é retirado automaticamente quando um canal começa a transmitir e reaparece quando todos param; os canais abertos continuam disponíveis para seleção, e o toque só inicia áudio quando o canal escolhido está ao vivo.

A tela local mostra os canais abertos como cartões com bandeiras em uma linha. Com um canal, o cartão ocupa toda a largura; com dois, cada um ocupa metade; com três, cada um ocupa um terço, descontando os espaços entre cartões. Os nomes dos idiomas continuam nos rótulos acessíveis e nas dicas de mouse. A bandeira é um símbolo representativo do idioma: inglês usa Reino Unido; português do Brasil e de Portugal usam suas respectivas bandeiras. A escolha funciona por toque, clique ou teclado e o cartão selecionado fica destacado. Tocar numa bandeira inicia o áudio e mostra a transcrição desse canal, sem botão de ouvir. Tocar novamente pausa; outro toque retoma ao vivo. Não há reprodução automática ao abrir a página. O layout ativo mantém somente a logo e o nome da igreja, as bandeiras e o texto traduzido. Estados e mensagens técnicas usam rótulos acessíveis sem texto visível.

O áudio e o texto continuam acompanhando o canal selecionado. As imagens SVG são incluídas no pacote, sem CDN, com a licença de flag-icons em flags/LICENSE e a correspondência em language-flags.js.

O ouvinte pode escolher ou trocar de canal a qualquer momento. A troca limpa o texto anterior e reconecta o áudio nativo ao vivo no novo idioma, iniciando a escuta no idioma escolhido pelo toque. Se o canal for fechado, o áudio para e a pessoa escolhe outro canal; nenhum idioma alternativo começa a tocar automaticamente. O suporte à tela bloqueada continua no mesmo player, incluindo controles Media Session.

O catálogo e a seleção de canais passam diretamente pelo WebSocket local. A publicação no Ponte continua divulgando apenas a URL de audiência e sua validade: não há nova tabela ou credencial por canal. A administração de canais permanece restrita ao apresentador autenticado pelo segredo local. Os ouvintes só podem selecionar canais existentes e não recebem chave Gemini ou diagnóstico privado.

No protocolo local, as mensagens de conteúdo incluem channelId; o catálogo contém id, name, nativeName e state (idle, connecting, live ou error). O ouvinte usa select-channel com channelId e recebe selectedChannel, snapshot e state. O áudio usa /audio/<sala>.mp3?channel=<código>. A URL sem canal mantém o padrão inglês, ou o primeiro aberto quando não houver inglês. As ações open-channel (languageCode), close-channel e retry-channel (channelId) exigem autenticação do apresentador.

## Tela do apresentador

A configuração segue a ordem: chave Gemini, ligação gerada pelo administrador e microfone. Abaixo há exatamente três colunas de canais. Painéis sem canal ficam em cinza e permitem escolher o idioma e abrir um canal. Cada painel ativo contém seu texto e controles para monitorar áudio neste computador, limpar texto, reconectar ou fechar o canal. A monitoração é independente da seleção dos ouvintes.

**Iniciar tradução e publicar** valida a ligação, inicia a captura e publica assim que houver um canal ao vivo. As duas chaves, uma rede privada alcançável e pelo menos um canal são necessários. **Parar transmissão** encerra captura e publicação; em falha de publicação, **Tentar publicar** usa o mesmo botão e não reinicia a tradução. Comandos de configuração e publicação continuam restritos ao apresentador autenticado.

O aplicativo escolhe automaticamente o endereço IPv4 privado da rede, considerando a rota do sistema e priorizando interfaces físicas sobre adaptadores virtuais/VPN. O endereço não é um campo de configuração. Link de acesso direto e QR code apontam para a mesma URL pública de audiência na rede local, sem chave Gemini, credencial de administrador ou segredo do apresentador. O QR é gerado no próprio servidor, sem serviço externo, e não usa localhost ou um IP público. Computador e ouvintes precisam estar numa rede que permita comunicação entre si.

No protocolo local, start-service recebe key e configuration e coordena a conexão dos canais e a publicação; publish-service repete somente a publicação. A URL selecionada é enviada ao apresentador como audienceUrl. /qr/<sala>.svg entrega o QR do endereço atual. A biblioteca de QR é distribuída em um módulo pequeno, com licenças incluídas; o leitor independente jsqr é uma dependência apenas de desenvolvimento. A fonte do módulo está em scripts/translation-windows/qr-entry.mjs e o build em build-qr.mjs.

## Configuração e uso

### Uma única tela para ouvir e ler

O Ponte oferece **Abrir tradução ao vivo**, na mesma aba. O endereço local abre uma única tela com texto e um leitor HTML de MP3 contínuo, com o navegador visível, minimizado ou com o ecrã bloqueado, conforme suporte do aparelho. Toque na bandeira para começar; tocar novamente pausa e mantém o texto conectado. Outro toque abre uma nova conexão à transmissão atual, descartando o áudio acumulado. Os controles Media Session usam as mesmas ações. Não há botão nem página separados para ouvir com a tela desligada; o pacote Windows inclui apenas a tela normal de áudio e texto. Links antigos com `?mode=background` abrem essa mesma tela.

A navegação para a origem local evita carregar áudio HTTP de um IP privado dentro da PWA HTTPS, que pode ser bloqueado pelo navegador ([MDN: mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)). O texto usa WebSocket e reconecta independentemente; falhas ou suspensão do texto não param o áudio nativo. O texto pode chegar antes do áudio. Ao ler trechos anteriores, a página respeita a posição de rolagem.

Use o pacote Windows atual. A seleção por bandeiras requer 0.7.0 ou superior; o estado de espera amigável requer 0.7.1 ou superior; a correção do instalador CMD requer 0.7.2 ou superior. Deve-se manter a aba aberta e continuar no Wi-Fi. A codificação MP3 mono a 48 kbit/s ocorre uma vez no PC, compartilhada pelos ouvintes, com silêncio entre falas. Brave, Android, iOS, chamadas e políticas de bateria ainda podem interromper mídia: a validação com tela bloqueada precisa ocorrer no aparelho real. A página não promete reprodução após encerrar o navegador.

A fonte Windows fica na pasta irmã **Live translation**, fora do Git deste repositório. Os patches para manter essa fonte estão relacionados na seção de manutenção abaixo.

Visitantes sem conta também podem acompanhar a tradução. O login consulta `GET /api/v1/live-translation/public-status` e, somente durante uma publicação válida, mostra **Ouvir tradução ao vivo — sem entrar**, com o aviso de que é necessário usar o Wi-Fi da igreja. O botão abre `/listen-translation`, uma página pública com a mesma entrada para o leitor local. A rota pública divulga somente disponibilidade, endereço da audiência e expiração; as rotas administrativas e o status autenticado permanecem protegidos. O áudio continua na rede local e não é retransmitido pela Vercel. Fora do Wi-Fi, a página pode abrir, mas não alcança o computador da igreja.

1. Um usuário ADMIN ou SUPER_ADMIN abre **Comunicação → Aplicativo de tradução** (`/translation-app`).
2. Baixa o pacote Windows, extrai a pasta inteira e executa `Instalar.cmd`. Depois abre o atalho **Ponte - Tradução**. Não precisa instalar Node.js nem ter privilégios de administrador.
3. Gera uma ligação e copia para o aplicativo local. Essa credencial é exibida uma vez na PWA e fica somente na memória no aplicativo; a API guarda apenas SHA-256. Gerar outra revoga a anterior e retira qualquer publicação ativa.
4. No aplicativo, informa a chave Gemini e a ligação do administrador, escolhe o microfone e os canais e clica em **Iniciar tradução e publicar**. O endereço da rede é escolhido automaticamente.
5. O menu **Tradução ao vivo** aparece para contas aprovadas na PWA em até 1 minuto. A página `/live-translation` oferece **Abrir tradução ao vivo**, que navega para o leitor no computador da igreja; o usuário precisa estar no mesmo Wi-Fi.
6. **Parar transmissão**, fechar o último canal, perder todos os canais por falha ou fechar o aplicativo retira a publicação. Uma falha abrupta expira em até 120 segundos após a última confirmação. Clientes em primeiro plano consultam a disponibilidade a cada 60 segundos; a interface também respeita a expiração localmente.

O PC confirma presença a cada 30 segundos apenas enquanto publicado. São pedidos HTTP curtos de metadados, sem áudio, texto ou chave Gemini. Uma única publicação simultânea é permitida; outra sessão precisa esperar a expiração ou a revogação da ligação. Membros sem acesso administrativo não podem criar credenciais ou baixar o pacote pelo backend.

O firewall do Windows deve permitir a porta TCP 3210 na rede privada e a rede Wi-Fi deve permitir comunicação com esse computador. O pacote não altera firewall ou roteador automaticamente. O PC precisa continuar ligado. Ao mudar de rede, pare e inicie novamente para atualizar o endereço e o QR code.

## Atualizações do aplicativo Windows (0.3.2+)

Ao iniciar, o aplicativo consulta as releases públicas do GitHub de pauloeduardorocha/Ponte, com timeout total de 8 segundos e sem enviar credenciais, chave Gemini, áudio ou configuração da igreja. Seleciona a maior versão estável com tag ponte-traducao-vMAJOR.MINOR.PATCH e ZIP completo publicado. Tags da PWA, rascunhos, pré-lançamentos e versões iguais ou anteriores são ignorados. A comparação é numérica (0.10.0 é maior que 0.9.0).

Se houver novidade, **Baixar atualização** abre o ZIP daquela release no navegador padrão; **Agora não** mantém o uso normal. A consulta não bloqueia o carregamento. Falha de rede no startup fica silenciosa e **Ajuda → Verificar atualizações** permite tentar novamente e ver o resultado. Só são abertos links HTTPS de download da release esperada no repositório oficial. O aplicativo avisa sobre atualizações; não baixa nem executa código automaticamente.

Extraia o ZIP e execute **Instalar.cmd**. O instalador usa sempre **%LOCALAPPDATA%\Ponte-Traducao**, substitui o runtime completo e reutiliza os atalhos **Ponte - Tradução** na Área de Trabalho e no menu Iniciar. Exige fechar o aplicativo antes, sem encerrar uma tradução à força. Prepara os arquivos numa pasta temporária e só depois troca a instalação, restaurando a anterior se a troca falhar. Dados do usuário fora da pasta do runtime são preservados; chaves e ligação continuam apenas na memória e precisam ser informadas ao abrir. Impede downgrade e substituição de uma pasta não reconhecida como Ponte.

Na migração de um ZIP portátil anterior, instale uma vez e passe a abrir pelo atalho. A pasta portátil antiga não é apagada. Versões anteriores a 0.3.2 ainda não verificam atualizações: esta primeira instalação precisa ser feita manualmente. O novo pacote e sua release precisam ser publicados para a igreja recebê-los.

### Se o Instalar.cmd mostrar comandos cortados

Erros como rshell.exe, rrorlevel ou ho. indicam que o CMD interpretou incorretamente as quebras de linha do arquivo. Executar como administrador não corrige isso. Extraia o pacote corrigido inteiro e execute Instalar.cmd normalmente; a instalação é por usuário.

Como alternativa no pacote já extraído, abra o PowerShell nessa pasta e execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1"
```

O empacotamento grava Instalar.cmd em UTF-8 sem BOM, com CRLF, e install-windows.ps1 em UTF-8 com BOM e CRLF, compatível com Windows PowerShell 5.1. Essa normalização ocorre na geração do pacote, independentemente das quebras de linha do checkout. O lançador preserva sucesso ou falha e encaminha os argumentos para o instalador.

## Download e publicação de uma versão Windows

O pacote inclui `GUIA-COMECE-AQUI.html` (guia visual que abre no navegador sem internet) e `LEIA-ME-PRIMEIRO.txt` (Bloco de Notas), ao lado de `Ponte-Traducao.exe`. A página administrativa mostra o mesmo conteúdo em seções expansíveis. A fonte é `apps/web/src/content/translation-windows-guide.json`; o empacotamento lê esse arquivo ao receber o caminho do Ponte e mantém uma cópia local para builds independentes. O guia cobre extração do ZIP, ligação ao Ponte, chave Gemini, microfone, publicação, uso pelos ouvintes, encerramento e problemas comuns.

No repositório **Live translation**, execute no Windows:

```powershell
node build-windows.cjs "C:\caminho\para\Ponte"
```

O script inclui o runtime Electron, a aplicação, `ws`, `lamejs`, as bandeiras SVG e o módulo de QR code com suas licenças, sem credenciais, histórico ou arquivos de ambiente. As ferramentas de testes, o leitor de QR de desenvolvimento e as dependências de build não entram no runtime. Produz `dist/Ponte-Traducao-Windows.zip` e SHA-256. A cópia opcional para `Ponte/private-storage/translation/` habilita o download autenticado em desenvolvimento (API iniciada pelo workspace ou pela raiz). O ZIP inclui `Instalar.cmd` e `install-windows.ps1`, que instalam por usuário, sem privilégios de administrador. O pacote ainda não tem assinatura de código própria.

Em produção, hospede esse ZIP em um serviço de arquivos/release separado e configure `TRANSLATION_APP_DOWNLOAD_URL` com a URL HTTPS. O Ponte fornece o link; não transmite o binário pelas Functions nem inclui o Electron no deploy. Sem URL configurada, a administração mostra a indisponibilidade explicitamente, sem link fictício. `TRANSLATION_APP_ARCHIVE` permite definir um ZIP local fora do caminho padrão, apenas em desenvolvimento.

Para distribuir uma nova versão:

1. Execute npm test e npm run check na fonte Windows. Gere o pacote e teste o lançador real com node installer-package-smoke.cjs <pasta-do-pacote>, incluindo instalação e atualização no mesmo destino.
2. Crie uma release estável com tag ponte-traducao-vMAJOR.MINOR.PATCH. Envie Ponte-Traducao-Windows.zip e Ponte-Traducao-Windows.zip.sha256 e confira tamanho e SHA-256 antes de publicar. Não substitua silenciosamente um ZIP já publicado: uma correção recebe outra versão.
3. Configure TRANSLATION_APP_DOWNLOAD_URL de produção com a URL HTTPS do ZIP dessa release. A configuração é incorporada ao próximo deploy; atualizá-la não altera um deploy já construído.
4. Publique o Ponte quando houver mudanças nele e acompanhe os dois jobs do CI e a implantação Vercel. Confirme o commit servido pelo domínio público e /app-version.json, além do estado READY da build.
5. Confira o download público e se o atualizador Windows encontra a nova versão estável. A versão Windows tem ciclo próprio e não é substituída pelo número da PWA.

Antes de publicar o Ponte, aplique pelo fluxo normal a migration `20261106190000_live_translation`. Nenhuma alteração no banco de produção é feita ao gerar o pacote ou executar os testes unitários. Após alterações de contrato, execute `npm run openapi:generate`; o build normal não grava o snapshot OpenAPI.

## Contrato

Todos os caminhos usam `/api/v1/live-translation`:

| Método / caminho        | Autorização                | Comportamento                                                                                                    |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET `/status`           | Conta aprovada autenticada | `{ active, audienceUrl, expiresAt }`; sem credenciais ou conteúdo                                                |
| GET `/public-status`    | Público, sem login         | Os mesmos metadados de disponibilidade para o botão do login e a página pública; sem credenciais, áudio ou texto |
| POST `/credential`      | ADMIN / SUPER_ADMIN        | Gera `{ token }` uma vez, revoga a anterior e limpa a publicação                                                 |
| POST `/publish`         | Bearer da credencial do PC | `{ sessionId: UUIDv4, audienceUrl }`; publica/renova lease de 120s                                               |
| POST `/unpublish`       | Bearer da credencial do PC | `{ sessionId }`; retira somente essa sessão                                                                      |
| GET `/download`         | ADMIN / SUPER_ADMIN        | `{ url, localAvailable }`                                                                                        |
| GET `/download/archive` | ADMIN / SUPER_ADMIN        | ZIP local apenas em desenvolvimento                                                                              |

As rotas de dispositivo usam autenticação própria, não o JWT do usuário. Aceitam apenas audiência HTTP em IPv4 privado RFC1918 com caminho `/listen/<24 hex>` e sem credenciais, query ou fragmento. Uma atualização condicional impede sobrepor outro lease ativo. A página do apresentador permanece protegida por um segredo local diferente. A origem da PWA autorizada é configurada pela ligação e aceita somente conexões de audiência; não habilita acesso ao controle do microfone.

## Verificação

Testes de API: validação de endereços, hashes, permissões administrativas, expiração, conflito de sessão e retirada. Testes web: entrada única na mesma aba para visitantes e membros, visibilidade condicional, rotas negadas, download e geração da ligação. Testes do leitor: pausa, retomada com conexão nova, controles Media Session, falhas e rejeições tardias de reprodução. Testes do aplicativo: codec, distribuição e publicação/retirada. O teste real completo ainda requer uma chave Gemini, microfone, migration aplicada e celulares no Wi-Fi da igreja, incluindo Safari/iOS e permissões de rede local.

## Manutenção da fonte Windows

Confira a versão de base antes de aplicar cada patch com git apply --no-index. Não reaplique um patch já incorporado. Os caminhos abaixo são relativos à raiz do Ponte; a aplicação ocorre na pasta da fonte Windows.

| Patch                                                                         | Base → resultado | Responsabilidade                                     |
| ----------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- |
| [Leitor nativo](windows-listener-0.3.1.patch)                                 | 0.3.0 → 0.3.1    | MP3 nativo e Media Session                           |
| [Atualizador e instalador](windows-updater-0.3.2.patch)                       | 0.3.1 → 0.3.2    | Consulta no startup e instalação no mesmo destino    |
| [Leitor único](../scripts/translation-windows/single-listener.patch)          | 0.3.2 → 0.3.3    | Remoção do modo separado de tela bloqueada           |
| [Missão](../scripts/translation-windows/mission-statement.patch)              | 0.3.3 → 0.3.4    | Texto institucional                                  |
| [Canais](../scripts/translation-windows/channels.patch)                       | 0.3.4 → 0.4.0    | Sessões e seleção por idioma                         |
| [Apresentador](../scripts/translation-windows/presenter-ui.patch)             | 0.4.0 → 0.5.0    | Três painéis, início/publicação e QR code            |
| [Espera](../scripts/translation-windows/listener-waiting.patch)               | 0.5.0 → 0.5.1    | Sincronização da disponibilidade                     |
| [Bandeiras em colunas](../scripts/translation-windows/listener-columns.patch) | 0.5.1 → 0.6.0    | Colunas proporcionais e SVGs locais                  |
| [Leitor mínimo](../scripts/translation-windows/minimal-listener.patch)        | 0.6.0 → 0.7.0    | Reprodução pelo toque na bandeira                    |
| [Espera amigável](../scripts/translation-windows/friendly-waiting.patch)      | 0.7.0 → 0.7.1    | Estado neutro sem alerta                             |
| [Lançador CMD](../scripts/translation-windows/installer-cmd.patch)            | 0.7.1 → 0.7.2    | CRLF, codificação e teste pelo ponto de entrada real |

O teste unitário do lançador executa cmd.exe fora da pasta extraída, com espaços e caracteres especiais no caminho, e verifica sucesso, falha e encaminhamento de argumentos. O smoke de instalação usa o Instalar.cmd do pacote construído, em destino temporário e sem criar atalhos do usuário. Os testes do PowerShell continuam verificando atualização, recusa de downgrade e preservação de pastas não reconhecidas.
