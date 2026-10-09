const puppeteer = require('puppeteer-core').default;

async function launchBrowser() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args:
        process.env.EFATURA_CHROMIUM_NO_SANDBOX === 'true'
          ? ['--no-sandbox', '--disable-setuid-sandbox']
          : [],
    });
  }
  if (process.platform !== 'linux')
    throw new Error(
      'Configure PUPPETEER_EXECUTABLE_PATH para o Chrome/Chromium local.',
    );
  const { default: chromium } = await import('@sparticuz/chromium');
  return puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}

module.exports = { launchBrowser };
