const fs = require('node:fs');
const path = require('node:path');

// Callers supply fixed event names, language IDs and numeric metadata only.
function createDiagnostics(directory) {
  const file = path.join(directory, 'traducao.txt');
  return (event, fields = {}) => {
    try {
      const line = JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + '\n';
      const bytes = Buffer.byteLength(line);
      if (bytes > 1024 * 1024) return;
      fs.mkdirSync(directory, { recursive: true });
      if ((fs.statSync(file, { throwIfNoEntry: false })?.size || 0) + bytes > 1024 * 1024)
        fs.renameSync(file, file + '.1');
      fs.appendFileSync(file, line);
    } catch { /* A storage failure must not interrupt capture. */ }
  };
}
module.exports = { createDiagnostics };
