const { execSync } = require('child_process');
try {
  execSync('npm i puppeteer --no-save', { stdio: 'ignore' });
  const puppeteer = require('puppeteer');
  (async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
    await browser.close();
  })();
} catch (e) {
  console.log('Error running puppeteer', e);
}
