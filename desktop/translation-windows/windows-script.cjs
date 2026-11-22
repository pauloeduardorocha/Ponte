const fs = require('node:fs');
function writeWindowsScript(source, destination) {
  const text = fs.readFileSync(source, 'utf8').replace(/^\ufeff/, '').replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(destination, (destination.toLowerCase().endsWith('.ps1') ? '\ufeff' : '') + text);
}
module.exports = { writeWindowsScript };
