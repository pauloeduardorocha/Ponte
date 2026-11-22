const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { writeWindowsScript } = require('./windows-script.cjs');
if (process.platform !== 'win32') throw new Error('Execute o empacotamento no Windows.');
const root = __dirname, version = require('./package.json').version;
const destination = path.join(root, 'dist', `Ponte-Traducao-${version}-${Date.now()}`);
const application = path.join(destination, 'resources', 'app');
const iconBuild = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'build-app-icon.ps1')], { stdio: 'inherit', windowsHide: true });
if (iconBuild.status !== 0) throw new Error('Could not generate application icons.');
fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), destination, { recursive: true });
fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, 'Ponte-Traducao.exe'));
const iconStamp = spawnSync(process.execPath, [path.join(root, 'set-app-icon.cjs'), path.join(destination, 'Ponte-Traducao.exe'), path.join(root, 'app-icon.ico')], { stdio: 'inherit', windowsHide: true });
if (iconStamp.status !== 0) throw new Error('Could not set executable icon.');
fs.mkdirSync(application, { recursive: true });
const sources = ['main.cjs','diagnostics.cjs','update-checker.cjs','server.cjs','network-address.cjs','qr-code.cjs','qr-code.LICENSE.txt','translation-channels.cjs','languages.js','language-flags.js','bridge.cjs','ponte-publisher.cjs','audio-codec.js','capture.js','transport.js','renderer.js','audience.js','playback.js','radio-stream.cjs','radio.js','index.html','audience.html','style.css','logo.png','app-icon.png','app-icon.ico','README.md'];
for (const file of sources) fs.copyFileSync(path.join(root, file), path.join(application, file));
fs.writeFileSync(path.join(application, 'package.json'), JSON.stringify({ name: 'ponte-traducao', productName: 'Ponte · Tradução ao vivo', version, main: 'main.cjs' }, null, 2));
fs.cpSync(path.join(root, 'flags'), path.join(application, 'flags'), { recursive: true });
fs.mkdirSync(path.join(application, 'node_modules'), { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'ws'), path.join(application, 'node_modules', 'ws'), { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'lamejs'), path.join(application, 'node_modules', 'lamejs'), { recursive: true });
const ponte = process.argv[2];
const guideSource = ponte ? path.join(path.resolve(ponte), 'apps/web/src/content/translation-windows-guide.json') : path.join(root, 'windows-guide.json');
const guide = JSON.parse(fs.readFileSync(guideSource, 'utf8'));
if (path.resolve(guideSource) !== path.join(root, 'windows-guide.json')) fs.copyFileSync(guideSource, path.join(root, 'windows-guide.json'));
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A Ponte — ${escape(guide.title)}</title><style>body{font:17px/1.7 system-ui,sans-serif;color:#24252b;background:#f7f8fa;margin:0}main{max-width:850px;margin:auto;padding:32px}header{display:flex;gap:16px;align-items:center}header img{width:56px;height:56px}h1{font-size:30px}h2{font-size:23px;color:#ad0d13}section{background:white;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin:24px 0}li{margin-bottom:14px}h3{font-size:18px;margin-bottom:4px}p{margin-top:4px}footer{font-size:14px;color:#62646e}@media print{body{background:white}section{break-inside:avoid;border:0;padding:0}main{padding:0}}</style></head><body><main><header><img src="logo.png" alt="A Ponte"><strong>A Ponte · Tradução ao vivo</strong></header><h1>${escape(guide.title)}</h1><p>${escape(guide.introduction)}</p>${guide.sections.map(section=>`<section><h2>${escape(section.title)}</h2><ol>${section.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol></section>`).join('')}<section><h2>Se algo não funcionar</h2>${guide.troubleshooting.map(item=>`<h3>${escape(item.problem)}</h3><p>${escape(item.solution)}</p>`).join('')}</section><footer>Guia incluído no aplicativo Windows ${escape(version)}. Para imprimir, pressione Ctrl+P. Áudio e texto são distribuídos pela rede local.</footer></main></body></html>`;
const text = [guide.title,'A Ponte · Tradução ao vivo',guide.introduction,'',...guide.sections.flatMap(section=>[section.title,...section.steps.map((step,index)=>`${index+1}. ${step}`),'']),'SE ALGO NÃO FUNCIONAR',...guide.troubleshooting.flatMap(item=>[item.problem,item.solution,''])].join('\r\n');
fs.writeFileSync(path.join(destination, 'GUIA-COMECE-AQUI.html'), html);
fs.writeFileSync(path.join(destination, 'LEIA-ME-PRIMEIRO.txt'), '\ufeff' + text);
fs.copyFileSync(path.join(root, 'logo.png'), path.join(destination, 'logo.png'));
for (const file of ['Instalar.cmd', 'install-windows.ps1']) {
  // CMD requires CRLF; Windows PowerShell 5.1 requires a BOM for UTF-8 accents.
  writeWindowsScript(path.join(root, file), path.join(destination, file));
}
const output = path.join(root, 'dist', 'Ponte-Traducao-Windows.zip');
// Native Windows tar creates ZIP files; arguments are passed without shell interpolation.
const result = spawnSync('tar.exe', ['-a','-cf',output,'-C',path.dirname(destination),path.basename(destination)], { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) throw new Error('Não foi possível gerar o pacote Windows.');
const sha256 = createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(output + '.sha256', `${sha256}  Ponte-Traducao-Windows.zip\n`);
if (ponte) {
  const downloads = path.join(path.resolve(ponte), 'private-storage', 'translation');
  fs.mkdirSync(downloads, { recursive: true });
  fs.copyFileSync(output, path.join(downloads, path.basename(output)));
  fs.copyFileSync(output + '.sha256', path.join(downloads, path.basename(output) + '.sha256'));
}
console.log(JSON.stringify({ output, application: destination, version, bytes: fs.statSync(output).size, sha256 }));
