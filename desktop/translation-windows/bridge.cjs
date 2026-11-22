const WebSocket = require('ws');
class TranslationBridge {
  constructor(emit, Socket = WebSocket) { this.emit = emit; this.Socket = Socket; }
  stop() { clearTimeout(this.timer); clearInterval(this.heartbeat); const old = this.socket; this.socket = null; if (old) old.terminate(); }
  start(key, targetLanguageCode = 'en') {
    this.stop();
    const current = new this.Socket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent', { headers: { 'x-goog-api-key': key }, maxPayload: 8 * 1024 * 1024 });
    this.socket = current;
    const fail = (error, reason, retryable, code) => { if (this.socket === current) { this.stop(); this.emit({ error, reason, retryable, code }); } };
    this.timer = setTimeout(() => fail('Tempo esgotado ao conectar ao Gemini.', 'setup-timeout', true), 20000);
    let waitingForPong = false;
    current.on('pong', () => { waitingForPong = false; });
    current.on('open', () => current.send(JSON.stringify({ setup: {
      model: 'models/gemini-3.5-live-translate-preview',
      generationConfig: { responseModalities: ['AUDIO'], translationConfig: { targetLanguageCode, echoTargetLanguage: true } },
      outputAudioTranscription: {}, realtimeInputConfig: { automaticActivityDetection: { disabled: false } }
    } })));
    current.on('message', raw => {
      if (this.socket !== current) return;
      try {
        const message = JSON.parse(raw.toString());
        if (message.setupComplete) {
          clearTimeout(this.timer);
          clearInterval(this.heartbeat);
          this.heartbeat = setInterval(() => {
            if (waitingForPong) return fail('Gemini não respondeu.', 'heartbeat-timeout', true);
            waitingForPong = true;
            current.ping();
          }, 30000);
          this.emit({ ready: true });
        }
        if (message.error) { const code = Number(message.error.code) || undefined; fail('Gemini: ' + String(message.error.message || 'Erro da API.').split(key).join('[chave omitida]'), 'api', code === 429 || code >= 500, code); return; }
        if (message.serverContent) this.emit({ content: message.serverContent });
        if (message.goAway) fail('Sessão Gemini expirada.', 'session-expired', true);
      } catch { fail('Resposta inválida do servidor.', 'invalid-response', false); }
    });
    current.on('unexpected-response', (_request, response) => {
      const code = response.statusCode;
      response.destroy();
      fail('Gemini recusou a conexão (' + code + ').', 'handshake', code === 429 || code >= 500, code);
    });
    current.on('error', () => fail('Falha de conexão. Verifique internet, chave e acesso ao modelo.', 'network', true));
    current.on('close', code => fail(`Sessão Gemini encerrada (${code}). Verifique a chave, a cota e o acesso ao modelo.`, 'socket-close', [1000, 1001, 1005, 1006, 1011, 1012, 1013, 1014].includes(code), code));
  }
  audio(bytes) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 128000) { this.stop(); this.emit({ error: 'Conexão lenta demais.', reason: 'backpressure', retryable: true }); return; }
    this.socket.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(bytes).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
  }
}
module.exports = { TranslationBridge };
