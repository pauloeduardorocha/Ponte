const { resolve } = require('node:path');

// Deployment preflight: no portal access, credentials or invoice data.
if (process.platform === 'linux') {
  const { launchBrowser } = require(
    resolve(
      __dirname,
      '../dist/efatura-runtime/apps/api/src/modules/banking/efatura/browser.cjs',
    ),
  );
  (async () => {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent('<title>e-Fatura browser preflight</title>');
      if ((await page.title()) !== 'e-Fatura browser preflight')
        throw new Error('Browser preflight failed');
      console.log('e-Fatura Chromium preflight passed');
    } finally {
      await browser.close();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
