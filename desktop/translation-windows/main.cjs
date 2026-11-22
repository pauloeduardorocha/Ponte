const { app, BrowserWindow, session, dialog, shell, Menu, powerMonitor } = require('electron');
const { createTranslationServer } = require('./server.cjs');
const path = require('node:path');
const { platform } = require('node:process');
const { isPrivateIPv4 } = require('./network-address.cjs');
const { createUpdateChecker } = require('./update-checker.cjs');
const version = require('./package.json').version;
let win, instance;
const checkUpdates = createUpdateChecker({ version, getWindow: () => win, dialog, shell });
app.whenReady().then(async () => {
  const directory = path.join(app.getPath('userData'), 'logs');
  const log = require('./diagnostics.cjs').createDiagnostics(directory);
  log('desktop.start', { version });
  instance = createTranslationServer({ log });
  try {
    const info = await instance.listen();
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(contents === win?.webContents && permission === 'media'));
    win = new BrowserWindow({ title: 'Ponte · Tradução ao vivo — ' + version, icon: path.join(__dirname, platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'), width: 1280, height: 960, minWidth: 1040, minHeight: 700, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const link = new URL(url);
        if (link.protocol === 'http:' && isPrivateIPv4(link.hostname) && link.port === String(instance.server.address().port) && link.pathname === '/listen/' + instance.room && !link.username && !link.password && !link.search && !link.hash) void shell.openExternal(link.href).catch(() => dialog.showErrorBox('Não foi possível abrir', 'Copie o link de acesso direto ou use o QR code.'));
      } catch { /* untrusted navigation stays blocked */ }
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', event => event.preventDefault());
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Aplicativo', submenu: [{ role: 'quit', label: 'Sair' }] },
      { label: 'Editar', submenu: [{ role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
      { label: 'Ajuda', submenu: [
        { label: 'Verificar atualizações…', click: () => void checkUpdates({ manual: true }) },
        { label: 'Abrir pasta de logs', click: async () => { if (await shell.openPath(directory)) dialog.showErrorBox('Logs indisponíveis', 'Não foi possível abrir a pasta de logs.'); } },
        { label: 'Versão ' + version, enabled: false },
      ] },
    ]));
    let closing = false;
    const suspend = () => { log('desktop.suspend'); win.close(); };
    powerMonitor.on('suspend', suspend);
    win.on('close', event => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      powerMonitor.removeListener('suspend', suspend);
      log('desktop.close');
      win.hide();
      instance.close().finally(() => { win.destroy(); app.quit(); });
    });
    await win.loadURL(info.presenterUrl);
    void checkUpdates();
  } catch (error) { dialog.showErrorBox('Não foi possível iniciar', error.code === 'EADDRINUSE' ? 'A porta 3210 já está em uso. Feche a outra instância do aplicativo.' : error.message); await instance.close(); app.quit(); }
});
app.on('window-all-closed', () => app.quit());
