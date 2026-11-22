const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { TranslationBridge } = require('./bridge.cjs');
const audioCodec = require('./audio-codec.js');
const { PontePublisher } = require('./ponte-publisher.cjs');
const { TranslationChannels } = require('./translation-channels.cjs');
const { preferredAddress, selectAudienceUrl } = require('./network-address.cjs');
const { toSvg } = require('./qr-code.cjs');
const languageFlags = require('./language-flags.js');
function createTranslationServer({ port = 3210, host = '0.0.0.0', Bridge = TranslationBridge, log = () => {}, networkInterfaces = os.networkInterfaces, getPreferredAddress = preferredAddress } = {}) {
  const presenterToken = randomBytes(32).toString('hex'), room = randomBytes(12).toString('hex');
  let presenter = null, audienceUrl = null, serviceGeneration = 0, autoPublish = false, publishing = false, wasRunning = false;
  let presenterTimeout, closing = false;
  const audience = new Set();
  const send = (client, data) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client === presenter) {
      if (client.bufferedAmount >= 128000 && !client.shedding) {
        client.shedding = true;
        log('presenter.preview-paused');
      } else if (client.shedding && client.bufferedAmount < 32000) {
        client.shedding = false;
        log('presenter.preview-resumed');
      }
      if (client.shedding && (data.content || data.viewers !== undefined && !data.authenticated)) return;
    } else if (client.bufferedAmount > 1024 * 1024) { client.close(1013, 'Connection too slow'); return; }
    client.send(JSON.stringify(data));
  };
  const counts = () => { if (presenter) send(presenter, { viewers: audience.size }); };
  const publisher = new PontePublisher(message => { if (presenter) send(presenter, message); }, fetch, log, previous => {
    const links = audienceLinks();
    const current = links.includes(previous) ? previous : selectAudienceUrl(links, networkInterfaces());
    if (audienceUrl !== current) {
      audienceUrl = current;
      if (presenter) send(presenter, { audienceUrl });
    }
    if (!current) throw Error('Aguardando a rede local da igreja.');
    return current;
  });
  const selectedSnapshot = client => {
    const channel = channels.channels.get(client.channelId);
    return { selectedChannel: channel?.id ?? null, channelId: channel?.id ?? null, state: channel?.state ?? 'idle', snapshot: channel?.transcript ?? '', reset: true };
  };
  const channels = new TranslationChannels({ Bridge, log, onCount: counts,
    onCatalogue: () => {
      const data = { channels: channels.list(), running: channels.running, state: channels.state };
      if (presenter) send(presenter, data);
      for (const client of audience) {
        if (client.channelId && !channels.channels.has(client.channelId)) { client.channelId = null; send(client, { ...data, ...selectedSnapshot(client), channelClosed: true }); }
        else send(client, { ...data, state: channels.channels.get(client.channelId)?.state ?? 'idle', channelId: client.channelId });
      }
      if (wasRunning && !channels.running) { autoPublish = false; serviceGeneration++; }
      wasRunning = channels.running;
      if (channels.state === 'idle') void publisher.unpublish();
      if (autoPublish && channels.state === 'live' && !publishing) { autoPublish = false; void publishService(); }
    },
    onError: (channel, error) => { if (presenter) send(presenter, { channelError: channel.name + ': ' + error, errorChannelId: channel.id }); },
    onMessage: (channel, message) => {
      const packets = [], content = message.content;
      let publicContent;
      if (content) {
        if (content.interrupted) channel.radio.clear();
        publicContent = { ...content };
        if (content.modelTurn) {
          const parts = [];
          for (const part of content.modelTurn.parts || []) {
            if (part.inlineData) {
              const { mimeType = '', data } = part.inlineData;
              if (!mimeType.startsWith('audio/pcm') || typeof data !== 'string') continue;
              const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] || 24000);
              try { const pcm = Buffer.from(data, 'base64'); packets.push(audioCodec.encode(pcm, rate)); channel.radio.enqueue(pcm, rate); }
              catch { if (presenter) send(presenter, { audioWarning: 'Um bloco de áudio inválido foi descartado.', channelId: channel.id }); }
            } else parts.push(part);
          }
          publicContent.modelTurn = { ...content.modelTurn, parts };
        }
      }
      const data = { ...message, channelId: channel.id, state: channel.state };
      if (publicContent) data.content = publicContent;
      if (presenter) {
        const includeAudio = presenter.monitorChannel === undefined || presenter.monitorChannel === channel.id;
        const preview = content && !includeAudio ? { ...message, content: publicContent } : message;
        send(presenter, { ...preview, channelId: channel.id });
      }
      for (const client of audience) {
        if (client.channelId !== channel.id) continue;
        send(client, data);
        for (const packet of packets) {
          if (client.readyState !== WebSocket.OPEN) break;
          if (client.bufferedAmount > 128000) { client.close(1013, 'Connection too slow'); break; }
          client.send(packet, { binary: true });
        }
      }
    }
  });
  const files = { '/presenter': 'index.html', '/renderer.js': 'renderer.js', '/transport.js': 'transport.js', '/capture.js': 'capture.js', '/style.css': 'style.css', '/audience.js': 'audience.js', '/playback.js': 'playback.js', '/audio-codec.js': 'audio-codec.js', '/logo.png': 'logo.png', '/radio.js': 'radio.js', '/languages.js': 'languages.js' };
  files['/language-flags.js'] = 'language-flags.js';
  for (const flag of new Set(Object.values(languageFlags))) files['/flags/' + flag + '.svg'] = 'flags/' + flag + '.svg';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'), pathname = url.pathname;
    if (pathname === `/qr/${room}.svg`) {
      if (!audienceUrl) { res.writeHead(503); res.end('Conecte o computador à rede da igreja.'); return; }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(toSvg(audienceUrl)); return;
    }
    if (pathname === `/audio/${room}.mp3`) {
      const id = url.searchParams.get('channel') ?? channels.defaultId;
      const channel = channels.channels.get(id);
      if (!channel) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('Canal não disponível.'); return; }
      if (req.method !== 'GET' || channel.state !== 'live') { res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end('A tradução não está ativa.'); return; }
      try { channel.radio.subscribe(res); } catch { res.destroy(); }
      return;
    }
    let file = Object.hasOwn(files, pathname) ? files[pathname] : undefined;
    if (pathname === `/listen/${room}`) file = 'audience.html';
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Página não encontrada. Peça o link ao apresentador.'); return; }
    const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      'Permissions-Policy': `microphone=${file === 'index.html' ? '(self)' : '()'}` });
    fs.createReadStream(path.join(__dirname, file)).pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64000 });
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!['/presenter-ws', `/audience-ws/${room}`].includes(pathname)) { socket.destroy(); return; }
    try { if (new URL(req.headers.origin).host !== req.headers.host && !(pathname === `/audience-ws/${room}` && req.headers.origin === publisher.origin)) { socket.destroy(); return; } }
    catch { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, client => wss.emit('connection', client, pathname));
  });
  wss.on('connection', (client, pathname) => {
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; }); client.on('error', () => {});
    if (pathname.startsWith('/audience-ws/')) {
      client.channelId = channels.defaultId;
      audience.add(client); send(client, { channels: channels.list(), ...selectedSnapshot(client) }); counts();
      client.on('message', (raw, binary) => {
        if (binary) return;
        let message; try { message = JSON.parse(raw.toString()); } catch { return; }
        if (message?.action !== 'select-channel') return;
        if (typeof message.channelId !== 'string' || !channels.channels.has(message.channelId)) { send(client, { selectionError: 'Este canal não está mais disponível.' }); return; }
        client.channelId = message.channelId; send(client, selectedSnapshot(client));
      });
      client.on('close', () => { audience.delete(client); counts(); }); return;
    }
    let authenticated = false;
    const timeout = setTimeout(() => client.close(1008, 'Authentication required'), 5000);
    client.on('close', code => {
      clearTimeout(timeout);
      if (presenter === client) {
        log('presenter.disconnected', { code });
        presenter = null;
        const stopAbandonedSession = () => { autoPublish = false; serviceGeneration++; channels.stop(); };
        if (!closing && client.canResume && channels.running) {
          log('presenter.recovery-start', { seconds: 600 });
          presenterTimeout = setTimeout(() => {
            presenterTimeout = undefined;
            log('presenter.recovery-expired');
            stopAbandonedSession();
          }, 600000);
        } else if (!closing) stopAbandonedSession();
      }
    });
    client.on('message', (raw, binary) => {
      client.isAlive = true;
      if (binary) { if (authenticated && presenter === client && channels.running) channels.audio(raw); return; }
      let message; try { message = JSON.parse(raw.toString()); } catch { client.close(1008); return; }
      if (!message || typeof message !== 'object') { client.close(1008); return; }
      if (!authenticated) {
        const token = Buffer.from(typeof message.token === 'string' ? message.token : '');
        if (token.length !== presenterToken.length || !timingSafeEqual(token, Buffer.from(presenterToken))) { client.close(1008, 'Access denied'); return; }
        if (presenter) { client.close(1013, 'Presenter connected'); return; }
        clearTimeout(timeout);
        if (presenterTimeout) {
          clearTimeout(presenterTimeout);
          presenterTimeout = undefined;
          log('presenter.recovered');
        }
        presenter = client;
        client.monitorChannel = message.monitorChannel;
        client.canResume = message.canResume === true; authenticated = true; log('presenter.connected');
        send(client, { authenticated: true, publication: { published: Boolean(publisher.published), publishing }, links: audienceLinks(), audienceUrl, viewers: audience.size, channels: channels.list(), running: channels.running, state: channels.state }); return;
      }
      if (message.action === 'monitor') {
        client.monitorChannel = channels.channels.has(message.channelId) ? message.channelId : null;
        return;
      }
      if (message.action === 'microphone') {
        if (typeof message.lost === 'boolean' && message.lost !== client.microphoneLost) {
          client.microphoneLost = message.lost;
          log(message.lost ? 'microphone.lost' : 'microphone.restored');
        }
        return;
      }
      if (message.action === 'network-online') { publisher.retryNow?.(); return; }
      if (message.action === 'start-service') { void startService(client, message); return; }
      if (message.action === 'publish-service') { if (channels.state === 'live') void publishService(); return; }
      if (message.action === 'start' && typeof message.key === 'string' && message.key.trim() && message.key.length < 512) {
        try { channels.start(message.key.trim()); }
        catch (error) { send(client, { channelError: error.message }); }
      } else if (message.action === 'stop') { log('service.stop'); autoPublish = false; serviceGeneration++; channels.stop(); void publisher.unpublish(); }
      else if (message.action === 'open-channel') {
        try { channels.add(message.languageCode); } catch (error) { send(client, { channelError: error.message }); }
      } else if (message.action === 'close-channel') {
        try { channels.remove(message.channelId); } catch (error) { send(client, { channelError: error.message }); }
      } else if (message.action === 'retry-channel') {
        try { channels.retry(message.channelId); } catch (error) { send(client, { channelError: error.message }); }
      } else if (message.action === 'clear') channels.clear(message.channelId);
      else if (message.action === 'configure-ponte' && typeof message.configuration === 'string' && message.configuration.length < 2048) {
        try { publisher.configure(message.configuration); }
        catch (error) { send(client, { publication: { error: error.message } }); }
      } else if (message.action === 'publish' && channels.state === 'live') {
        const links = audienceLinks();
        if (!links.includes(message.audienceUrl) || message.audienceUrl.startsWith('http://localhost:')) { send(client, { publication: { error: 'Selecione o endereço da rede Wi-Fi da igreja.' } }); return; }
        void publisher.publish(message.audienceUrl).catch(error => send(client, { publication: { published: false, error: error.message } }));
      } else if (message.action === 'unpublish') void publisher.unpublish();
    });
  });
  async function publishService() {
    if (publishing || publisher.published || channels.state !== 'live') return;
    publishing = true;
    const generation = serviceGeneration;
    if (presenter) send(presenter, { publication: { publishing: true } });
    try {
      const preferred = await getPreferredAddress();
      if (generation !== serviceGeneration || !channels.running) return;
      audienceUrl = selectAudienceUrl(audienceLinks(), networkInterfaces(), preferred);
      if (!audienceUrl) throw Error('Conecte o computador ao Wi-Fi ou à rede da igreja e tente publicar novamente.');
      if (presenter) send(presenter, { audienceUrl });
      await publisher.publish(audienceUrl);
    } catch (error) { if (generation === serviceGeneration && presenter) send(presenter, { publication: { published: false, error: error.message } }); }
    finally { publishing = false; if (presenter) send(presenter, { publication: { publishing: false } }); }
  }
  async function startService(client, message) {
    if (channels.running) { send(client, { serviceError: 'A tradução já está em andamento.' }); return; }
    if (typeof message.key !== 'string' || !message.key.trim() || message.key.length >= 512) { send(client, { serviceError: 'Informe sua chave Gemini API.' }); return; }
    if (!channels.channels.size) { send(client, { serviceError: 'Abra pelo menos um canal antes de iniciar.' }); return; }
    if (typeof message.configuration !== 'string' || message.configuration.length >= 2048) { send(client, { serviceError: 'Cole a ligação gerada pelo administrador.' }); return; }
    const generation = ++serviceGeneration;
    try {
      publisher.configure(message.configuration);
      const preferred = await getPreferredAddress();
      if (generation !== serviceGeneration || presenter !== client) return;
      audienceUrl = selectAudienceUrl(audienceLinks(), networkInterfaces(), preferred);
      if (!audienceUrl) throw Error('Conecte o computador à rede da igreja antes de iniciar.');
      send(client, { audienceUrl });
      autoPublish = true;
      channels.start(message.key.trim());
    } catch (error) { autoPublish = false; if (presenter === client) send(client, { serviceError: error.message }); }
  }
  const heartbeat = setInterval(() => { for (const client of wss.clients) { if (!client.isAlive) { if (client === presenter) log('presenter.heartbeat-timeout'); client.terminate(); } else { client.isAlive = false; client.ping(); if (audience.has(client)) send(client, { heartbeat: true }); } } }, 15000);
  function audienceLinks() {
    const actualPort = server.address().port;
    const ips = Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
    return [`http://localhost:${actualPort}/listen/${room}`, ...ips.map(ip => `http://${ip}:${actualPort}/listen/${room}`)];
  }
  return {
    server, room,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, async () => { server.removeListener('error', reject); audienceUrl = selectAudienceUrl(audienceLinks(), networkInterfaces(), await getPreferredAddress()); resolve({ presenterUrl: `http://localhost:${server.address().port}/presenter#${presenterToken}`, audienceLinks: audienceLinks() }); });
    }),
    close: async () => { closing = true; clearTimeout(presenterTimeout); clearInterval(heartbeat); channels.stop(); await publisher.unpublish(); for (const client of wss.clients) client.terminate(); wss.close(); return new Promise(resolve => server.close(resolve)); }
  };
}
module.exports = { createTranslationServer };
if (require.main === module) {
  const instance = createTranslationServer({ port: Number(process.env.PORT || 3210) });
  instance.listen().then(info => { console.log('Apresentador (link privado):', info.presenterUrl); console.log('Audiência:', info.audienceLinks.join('\n')); }).catch(error => { console.error(error.message); instance.close().finally(() => process.exit(1)); });
  process.on('SIGINT', () => instance.close().then(() => process.exit()));
}
