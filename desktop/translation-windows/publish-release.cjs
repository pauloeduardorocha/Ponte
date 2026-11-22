// Uses the existing Git credential helper; credentials stay in memory and go only to GitHub.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const repo = 'pauloeduardorocha/Ponte', tag = 'ponte-traducao-v' + require('./package.json').version;
async function main() {
  const result = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
  const token = /^password=(.+)$/m.exec(result.stdout || '')?.[1];
  if (!token) throw new Error('GitHub authentication unavailable');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Ponte-release' };
  async function api(url, options = {}) {
    const parsed = new URL(url);
    if (!['api.github.com','uploads.github.com'].includes(parsed.hostname)) throw new Error('Unexpected GitHub host');
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error' });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return response.json();
  }
  let release;
  const existing = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers, redirect: 'error' });
  if (existing.ok) release = await existing.json();
  else if (existing.status === 404) release = await api(`https://api.github.com/repos/${repo}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: process.argv[2], name: 'Ponte · Tradução ao vivo para Windows ' + require('./package.json').version, draft: true, prerelease: false, body: 'Aplicativo para o computador da igreja. Extraia o ZIP inteiro e execute Instalar.cmd. A instalação substitui a versão anterior no mesmo local, sem privilégios de administrador, e mantém os atalhos. Feche o aplicativo antes de instalar. Na primeira atualização de uma versão portátil antiga, passe a abrir pelo atalho criado. O aplicativo verifica novas versões ao iniciar. Consulte GUIA-COMECE-AQUI.html ou LEIA-ME-PRIMEIRO.txt. O pacote inclui o guia para Windows e não contém credenciais. Áudio e texto são distribuídos pela rede local.' }) });
  else throw new Error(`GitHub HTTP ${existing.status}`);
  const names = ['Ponte-Traducao-Windows.zip','Ponte-Traducao-Windows.zip.sha256'];
  for (const name of names) {
    console.log('Uploading release asset: ' + name);
    const file = path.join(__dirname,'dist',name), previous = release.assets?.find(asset=>asset.name === name);
    if (previous) {
      if (previous.size !== fs.statSync(file).size) throw new Error('Existing release asset differs; refusing to replace it');
      continue;
    }
    await api(release.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(name), { method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:fs.readFileSync(file) });
  }
  if (release.draft) release = await api(`https://api.github.com/repos/${repo}/releases/${release.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body:JSON.stringify({draft:false}) });
  console.log(JSON.stringify({releaseUrl:release.html_url,downloadUrl:`https://github.com/${repo}/releases/download/${tag}/Ponte-Traducao-Windows.zip`,tag}));
}
main().catch(error=>{ console.error(error.message);process.exitCode=1; });
