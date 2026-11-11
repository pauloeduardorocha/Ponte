import QR from 'qrcode/lib/core/qrcode.js';
export function toSvg(value) {
  const { modules } = QR.create(value, { errorCorrectionLevel: 'M' }),
    size = modules.size,
    margin = 4;
  let cells = '';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules.get(y, x))
        cells += 'M' + (x + margin) + ' ' + (y + margin) + 'h1v1h-1z';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    (size + margin * 2) +
    ' ' +
    (size + margin * 2) +
    '" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h' +
    (size + margin * 2) +
    'v' +
    (size + margin * 2) +
    'H0z"/><path fill="#111" d="' +
    cells +
    '"/></svg>'
  );
}
