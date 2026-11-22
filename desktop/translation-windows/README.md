# Ponte — Tradução ao vivo para Windows

O aplicativo captura um microfone e distribui áudio e texto em canais de tradução. O servidor roda no computador da igreja; a tradução exige internet e envia áudio ao Google Gemini. Os ouvintes precisam estar no mesmo Wi-Fi.

## Instalar e atualizar

Extraia o ZIP inteiro e execute **Instalar.cmd**. A instalação usa **%LOCALAPPDATA%\Ponte-Traducao**, sem privilégios de administrador, e cria o atalho **Ponte - Tradução** na Área de Trabalho e no menu Iniciar. Abra pelo atalho.

Para atualizar, termine a transmissão, feche o aplicativo e execute Instalar.cmd do novo ZIP. O instalador substitui o runtime no mesmo local e mantém os atalhos. Uma pasta portátil antiga não é apagada automaticamente. O aplicativo verifica releases oficiais ao iniciar e oferece **Baixar atualização** ou **Agora não**; também é possível usar **Ajuda → Verificar atualizações**. A consulta não impede o uso sem internet e não instala código automaticamente.

## Canais de tradução

O inglês vem aberto por padrão. Escolha o idioma de saída e toque em **Abrir canal** para disponibilizar até três canais de idiomas diferentes. O idioma falado é detectado automaticamente. É preciso ter pelo menos um canal aberto para iniciar a tradução.

Preencha primeiro a chave Gemini e depois a ligação gerada pelo administrador. Escolha o microfone e toque em **Iniciar tradução e publicar**. A captura é única e alimenta uma sessão Gemini por canal; todos os ouvintes do mesmo canal compartilham essa tradução. Cada canal usa a cota da API enquanto traduz.

Pode abrir e fechar canais durante a transmissão. Um canal novo traduz as próximas palavras, sem reiniciar os demais. Se um canal falhar, use **Reconectar**; os outros continuam funcionando. **Fechar** interrompe apenas aquele canal. Fechar o último para a captura e retira a publicação. **Parar** encerra a tradução e mantém a lista de canais até fechar o aplicativo. Ao reabrir, volta o padrão inglês.

Os canais são três painéis verticais lado a lado. Os espaços inativos ficam em cinza e permitem escolher um idioma e abrir um canal. O texto de cada tradução aparece no próprio painel. **Ouvir neste PC** permite monitorar um canal com fones, sem alterar a escolha dos ouvintes.

## Publicar no Ponte

Um administrador acessa **Comunicação → Aplicativo de tradução**, gera uma ligação e a cola no segundo campo, **Ligação gerada pelo administrador**. A ligação e a chave Gemini ficam somente na memória durante a execução.

O botão **Iniciar tradução e publicar** valida a ligação e publica automaticamente assim que um canal fica ao vivo. O endereço da rede é escolhido automaticamente; não há seleção manual de IP. Se a publicação falhar, **Tentar publicar** repete essa etapa sem reiniciar a captura. O menu aparece na PWA em até um minuto. O Ponte recebe somente o endereço da audiência e confirmações de disponibilidade; áudio, texto e catálogo de canais ficam na rede local.

**Parar transmissão**, fechar o último canal, perder todos os canais por falha ou fechar o aplicativo retira a publicação. Uma falha abrupta do computador expira em até dois minutos. Mantenha o computador ligado; o firewall deve permitir a porta TCP 3210 na rede privada, e o Wi-Fi deve permitir comunicação com esse computador.

O acesso direto mostra um link e um QR code lado a lado. Eles abrem a mesma página de audiência na rede local. O QR é gerado no computador, sem serviços externos, e não contém as chaves ou o segredo do apresentador.

## Ouvir

Abra **Tradução ao vivo** no Ponte e depois **Abrir tradução ao vivo**. Na tela local, toque na bandeira do idioma para iniciar o áudio e mostrar a transcrição. Os cartões dividem a largura igualmente: um canal usa 100%, dois usam 50% cada e três usam um terço cada. O canal selecionado fica destacado. Os nomes dos idiomas permanecem nos rótulos acessíveis e nas dicas ao passar o mouse. Pode trocar de canal a qualquer momento: áudio e texto mudam juntos e a escuta retoma no ponto atual. Toque novamente na bandeira escolhida para pausar; outro toque retoma ao vivo. Se o canal for fechado, escolha outro; nenhum idioma alternativo começa a tocar sozinho.

A página mostra somente a logo e o nome da igreja, as bandeiras e a transcrição. Sem transmissão, o aviso de espera permanece.

O mesmo player HTML recebe MP3 mono contínuo a 48 kbit/s e permite minimizar ou bloquear o ecrã quando o aparelho suportar. Mantenha a aba aberta e o Wi-Fi conectado. Chamadas, políticas de bateria e o sistema podem interromper áudio; valide no celular real. O texto usa WebSocket independentemente e pode chegar antes do áudio. O servidor mantém ADPCM para clientes compatíveis anteriores, sem enviar PCM bruto à audiência.

## Empacotar e verificar

No Windows, execute **node build-windows.cjs**. Passe o caminho do repositório Ponte para incluir o guia compartilhado e copiar o ZIP para o download local autenticado. O pacote contém Electron, a aplicação e as dependências de execução; não inclui credenciais ou modelos locais de IA. Em produção, o download usa TRANSLATION_APP_DOWNLOAD_URL e a release oficial do GitHub.

Execute **npm test** e **npm run check**. **channels-smoke.cjs** é uma fixture Electron com microfone e Gemini simulados, reprodução MP3 real, criação durante a transmissão, seleção, fechamento e reconexão de canais. Aceita um diretório de saída opcional para capturas. **installer-package-smoke.cjs** testa instalação e substituição do runtime em pasta temporária, sem alterar os atalhos ou a instalação real do usuário.
