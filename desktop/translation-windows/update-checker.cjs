const RELEASES_URL = 'https://api.github.com/repos/pauloeduardorocha/Ponte/releases?per_page=100';
const REPOSITORY_URL = 'https://github.com/pauloeduardorocha/Ponte';
const ASSET_NAME = 'Ponte-Traducao-Windows.zip';
function parseVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  const parts = version.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (!a || !b) throw new Error('Versão inválida.');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function findUpdate(releases, installedVersion) {
  if (!Array.isArray(releases)) throw new Error('Resposta de versões inválida.');
  if (!parseVersion(installedVersion)) throw new Error('Versão instalada inválida.');
  let latest = null;
  for (const release of releases) {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') continue;
    const version = release.tag_name.replace(/^ponte-traducao-v/, '');
    if (release.tag_name !== `ponte-traducao-v${version}` || !parseVersion(version)) continue;
    if (compareVersions(version, installedVersion) <= 0 || (latest && compareVersions(version, latest.version) <= 0)) continue;
    const downloadUrl = `${REPOSITORY_URL}/releases/download/${release.tag_name}/${ASSET_NAME}`;
    const asset = Array.isArray(release.assets) && release.assets.find(item => item && item.name === ASSET_NAME && item.state === 'uploaded' && item.size > 0 && item.browser_download_url === downloadUrl);
    if (asset) latest = { version, downloadUrl };
  }
  return latest;
}
async function fetchUpdate(installedVersion, fetchImpl = fetch) {
  const releases = [], signal = AbortSignal.timeout(8000);
  for (let page = 1; page <= 5; page++) {
    const response = await fetchImpl(`${RELEASES_URL}&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Ponte-Traducao-update-check', 'X-GitHub-Api-Version': '2022-11-28' },
      signal, redirect: 'error',
    });
    if (!response.ok) throw new Error(`Não foi possível consultar as versões (HTTP ${response.status}).`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Resposta de versões inválida.');
    releases.push(...batch);
    if (batch.length < 100) return findUpdate(releases, installedVersion);
  }
  throw new Error('Não foi possível concluir a consulta de versões. Tente novamente mais tarde.');
}
function createUpdateChecker({ version, getWindow, dialog, shell, fetchImpl = fetch }) {
  let checking = null;
  return function check({ manual = false } = {}) {
    if (checking) return checking;
    checking = (async () => {
      try {
        const update = await fetchUpdate(version, fetchImpl), win = getWindow();
        if (!win || win.isDestroyed()) return;
        if (!update) {
          if (manual) await dialog.showMessageBox(win, { type: 'info', title: 'Atualizações do Ponte', message: `Você está na versão ${version}.`, detail: 'Não há uma versão mais recente do aplicativo de tradução disponível.', buttons: ['OK'] });
          return;
        }
        const result = await dialog.showMessageBox(win, {
          type: 'info', title: 'Atualização disponível', message: `Ponte · Tradução ${update.version} disponível`,
          detail: `Versão instalada: ${version}.\n\nBaixe o ZIP, extraia e execute Instalar.cmd. A instalação substitui a versão anterior na mesma pasta e mantém os atalhos. Feche o aplicativo antes de instalar, após terminar a tradução.`,
          buttons: ['Baixar atualização', 'Agora não'], defaultId: 0, cancelId: 1, noLink: true,
        });
        if (result.response === 0 && !win.isDestroyed()) await shell.openExternal(update.downloadUrl);
      } catch {
        const win = getWindow();
        if (manual && win && !win.isDestroyed()) await dialog.showMessageBox(win, { type: 'warning', title: 'Atualizações do Ponte', message: 'Não foi possível verificar as atualizações.', detail: 'Confira a conexão com a internet e tente novamente em Ajuda → Verificar atualizações. Você pode continuar usando o aplicativo.', buttons: ['OK'] });
        // Startup checks must never prevent an offline launch or interrupt translation.
      }
    })().finally(() => { checking = null; });
    return checking;
  };
}
module.exports = { compareVersions, findUpdate, fetchUpdate, createUpdateChecker };
