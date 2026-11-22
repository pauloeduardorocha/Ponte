const { randomUUID } = require('node:crypto');

const retryDelays = [3000, 6000, 12000, 24000, 48000, 60000];

class PontePublisher {
  retryStep = 0;
  constructor(emit, request = fetch, log = () => {}, currentUrl = url => url) { this.currentUrl = currentUrl; this.log = log; this.emit = emit; this.request = request; this.sessionId = randomUUID(); this.generation = 0; }
  configure(value) {
    if (this.published || this.busy) throw new Error('Retire a publicação antes de alterar a ligação.');
    let configuration;
    try { configuration = JSON.parse(value); } catch { throw new Error('Cole a ligação gerada na administração do Ponte.'); }
    const url = new URL(configuration.apiUrl);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || !/^[a-f0-9]{64}$/.test(configuration.token)) throw new Error('Ligação do Ponte inválida.');
    const appOrigin = new URL(configuration.appOrigin || url.origin);
    if (appOrigin.protocol !== 'https:' && !(appOrigin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(appOrigin.hostname))) throw new Error('Origem da PWA inválida.');
    this.cancelRetry();
    this.retryStep = 0;
    ++this.generation;
    this.configuration = { apiUrl: url.href.replace(/\/$/, ''), token: configuration.token };
    this.origin = appOrigin.origin;
    this.emit({ publication: { configured: true, published: false } });
  }
  async call(action, body) {
    if (!this.configuration) throw new Error('Conecte o aplicativo ao Ponte primeiro.');
    if (action === "publish") body = { audienceUrl: this.currentUrl(body.audienceUrl) };
    const response = await this.request(`${this.configuration.apiUrl}/live-translation/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.configuration.token}` },
      body: JSON.stringify({ sessionId: this.sessionId, ...body }), signal: AbortSignal.timeout(8000), redirect: 'error'
    });
    if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Ligação revogada. Gere outra na administração do Ponte.' : `Não foi possível atualizar a publicação no Ponte (${response.status}).`), { status: response.status });
    return response.json();
  }
  async publish(audienceUrl) {
    if (this.busy || this.published) return;
    this.cancelRetry();
    this.busy = true;
    const generation = ++this.generation;
    try {
      const result = await this.call('publish', { audienceUrl });
      if (generation !== this.generation) { await this.call('unpublish', {}).catch(() => {}); return; }
      this.retryStep = 0;
      this.log('ponte.published'); this.leasePossible = true; this.published = true; this.audienceUrl = audienceUrl;
      this.emit({ publication: { configured: true, published: true, expiresAt: result.expiresAt } });
      this.timer = setInterval(async () => {
        if (this.renewing) return; this.renewing = true;
        try {
          this.renewal = this.call('publish', { audienceUrl });
          const renewal = await this.renewal;
          if (generation === this.generation) this.emit({ publication: { configured: true, published: true, expiresAt: renewal.expiresAt } });
        } catch (error) {
          if (generation === this.generation) { clearInterval(this.timer); this.published = false; this.scheduleRetry(error, audienceUrl, generation); this.emit({ publication: { configured: true, published: false, error: `${error.message} A publicação expira automaticamente em até 2 minutos.` } }); }
        } finally { this.renewing = false; this.renewal = null; }
      }, 30000);
    } catch (error) {
      this.scheduleRetry(error, audienceUrl, generation);
      throw error;
    } finally { this.busy = false; }
  }
  scheduleRetry(error, audienceUrl, generation) {
    if (generation !== this.generation) return;
    const status = error.status;
    const retry = !status || status === 408 || status === 409 || status === 429 || status >= 500;
    this.log('ponte.failure', { status, retry });
    if (!retry) return;
    const delay = retryDelays[this.retryStep];
    this.retryStep = Math.min(this.retryStep + 1, retryDelays.length - 1);
    this.retryNow = () => {
      if (generation === this.generation)
        void this.publish(audienceUrl).catch(() => {}); // publish schedules the next attempt
    };
    this.log('ponte.retry', { delay });
    this.retryTimer = setTimeout(this.retryNow, delay);
  }
  cancelRetry() {
    clearTimeout(this.retryTimer);
    this.retryNow = undefined;
  }
  async unpublish() {
    this.cancelRetry();
    this.retryStep = 0;
    ++this.generation; clearInterval(this.timer);
    const wasPublished = this.leasePossible; this.leasePossible = false; this.published = false;
    if (wasPublished) {
      await this.renewal?.catch(() => {});
      try { await this.call('unpublish', {}); }
      catch { this.emit({ publication: { configured: Boolean(this.configuration), published: false, error: 'Sem confirmação do Ponte. A publicação expira automaticamente em até 2 minutos.' } }); return; }
    }
    this.emit({ publication: { configured: Boolean(this.configuration), published: false } });
  }
}
module.exports = { PontePublisher };
