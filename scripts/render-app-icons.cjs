// Renders the PNG app icons from packages/client/public/icon.svg. Needs Playwright with Chromium:
// node scripts/render-app-icons.cjs packages/client/public
const { chromium } = require("playwright");
const fs = require("fs");
const dir = process.argv[2];
const svg = fs.readFileSync(dir + "/icon.svg", "utf8");
// Maskable: the same mark on a full-bleed square, scaled into the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1b1712"/><g transform="translate(9.6 9.6) scale(0.7)"><path d="M32 8 L40 30 L32 56 L24 30 Z" fill="#d8b46a"/><rect x="18" y="28" width="28" height="4" rx="2" fill="#d8b46a"/></g></svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, src, size] of [["icon-192.png", svg, 192], ["icon-512.png", svg, 512], ["icon-maskable-512.png", maskable, 512], ["apple-touch-icon.png", maskable, 180]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${src.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: `${dir}/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
})();
