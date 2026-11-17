import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const fontBase64 = readFileSync(resolve('src/landing/fonts/InterTight-Latin.woff2')).toString(
  'base64',
);

const html = `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Inter Tight';
  src: url('data:font/woff2;base64,${fontBase64}') format('woff2');
  font-weight: 300 900;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: 1200px;
  height: 630px;
  overflow: hidden;
  position: relative;
  background: #0e0d1a;
  color: #f4f3fa;
  font-family: 'Inter Tight', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 56px 68px;
}
body::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(520px 360px at 84% 16%, rgba(43, 86, 255, .36), transparent 72%),
    radial-gradient(480px 340px at 14% 92%, rgba(106, 53, 255, .32), transparent 72%);
}
.band {
  --wave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 150' preserveAspectRatio='none'%3E%3Cpath d='M0 18 Q25 0 50 18 T100 18 T150 18 T200 18 T250 18 T300 18 T350 18 T400 18 V132 Q375 150 350 132 T300 132 T250 132 T200 132 T150 132 T100 132 T50 132 T0 132Z'/%3E%3C/svg%3E") 0 0 / 400px 150px repeat-x;
  position: absolute;
  left: 52%;
  top: 58%;
  width: 1800px;
  height: 150px;
  translate: -50% -50%;
  rotate: -24deg;
  background: linear-gradient(135deg, #2b56ff, #6a35ff);
  -webkit-mask: var(--wave);
  mask: var(--wave);
  opacity: 0.92;
}
.top {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 24px;
  font-weight: 700;
}
.top svg { width: 42px; height: 42px; }
.wordmark {
  position: relative;
  z-index: 2;
  width: 780px;
  margin-top: -10px;
}
.wordmark text {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 900;
  font-size: 268px;
  letter-spacing: -14px;
}
.copy {
  position: relative;
  z-index: 2;
  max-width: 680px;
}
.copy h1 {
  font-size: 38px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
}
.copy p {
  margin-top: 12px;
  font-size: 21px;
  color: rgba(244, 243, 250, 0.72);
}
.phone {
  position: absolute;
  z-index: 3;
  right: 74px;
  top: 76px;
  width: 248px;
  height: 520px;
  padding: 8px;
  border-radius: 34px;
  rotate: 6deg;
  background: linear-gradient(160deg, #2a2840, #0c0b16);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 40px 90px -24px rgba(43, 86, 255, .6);
}
.clip {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 26px;
  overflow: hidden;
  background:
    radial-gradient(50% 40% at 30% 25%, #2fc6d9, transparent 70%),
    radial-gradient(60% 50% at 75% 60%, #6a35ff, transparent 70%),
    radial-gradient(65% 55% at 25% 80%, #2b56ff, transparent 70%), #110f24;
  padding: 58px 20px 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}
.clip p {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.16;
  letter-spacing: -0.015em;
  color: rgba(255,255,255,0.62);
}
.clip p.active {
  color: #fff;
  text-shadow: 0 0 14px rgba(255,255,255,0.45);
}
.clip p.upcoming {
  color: rgba(255,255,255,0.32);
  filter: blur(1px);
}
</style>
</head>
<body>
  <div class="band"></div>
  <div class="top">
    <svg viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2B56FF"/><stop offset="1" stop-color="#6A35FF"/></linearGradient></defs><path d="M136 0H376C460 0 512 52 512 136V376C512 460 460 512 376 512H136C52 512 0 460 0 376V136C0 52 52 0 136 0Z" fill="url(#g)"/><path d="M88 176.8C113.2 176.8 118.8 143.2 144 143.2S174.8 176.8 200 176.8 230.8 143.2 256 143.2 286.8 176.8 312 176.8 342.8 143.2 368 143.2 398.8 176.8 424 176.8" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" opacity=".55"/><path d="M88 224.8C120.4 224.8 127.6 287.2 160 287.2S199.6 224.8 232 224.8 271.6 287.2 304 287.2 343.6 224.8 376 224.8" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round"/><path d="M88 335.2C113.2 335.2 118.8 368.8 144 368.8S174.8 335.2 200 335.2 230.8 368.8 256 368.8 286.8 335.2 312 335.2 342.8 368.8 368 368.8 398.8 335.2 424 335.2" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" opacity=".55"/><circle cx="430" cy="256" r="24" fill="#fff"/></svg>
    ZH3 Marea
  </div>
  <svg class="wordmark" viewBox="0 0 1000 250">
    <defs>
      <clipPath id="wc"><text x="-6" y="214" textLength="1010" lengthAdjust="spacingAndGlyphs">Marea</text></clipPath>
      <linearGradient id="sg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#2FC6D9"/><stop offset=".45" stop-color="#2B56FF"/><stop offset="1" stop-color="#6A35FF"/></linearGradient>
    </defs>
    <text x="-6" y="214" textLength="1010" lengthAdjust="spacingAndGlyphs" fill="rgba(244,243,250,.06)">Marea</text>
    <g clip-path="url(#wc)">
      <g transform="translate(0, 110)">
        <path fill="#6A35FF" opacity=".55" d="M0 12 Q31 0 62.5 12 T125 12 T187.5 12 T250 12 T312.5 12 T375 12 T437.5 12 T500 12 T562.5 12 T625 12 T687.5 12 T750 12 T812.5 12 T875 12 T937.5 12 T1000 12 V400 H0Z"/>
        <path fill="url(#sg)" d="M0 18 Q31 4 62.5 18 T125 18 T187.5 18 T250 18 T312.5 18 T375 18 T437.5 18 T500 18 T562.5 18 T625 18 T687.5 18 T750 18 T812.5 18 T875 18 T937.5 18 T1000 18 V400 H0Z"/>
      </g>
    </g>
    <text x="-6" y="214" textLength="1010" lengthAdjust="spacingAndGlyphs" fill="none" stroke="rgba(244,243,250,.25)" stroke-width="1.4">Marea</text>
  </svg>
  <div class="copy">
    <h1>Clips de letra sincronizada sílaba por sílaba para TikTok.</h1>
    <p>Gratis, código abierto (AGPL-3.0) y sin cuenta · Web y Windows</p>
  </div>
  <div class="phone">
    <div class="clip">
      <p>cada ola trae algo que perdí</p>
      <p class="active">Si la marea sube, déjala subir</p>
      <p class="upcoming">que la luz se quede en el fondo del mar</p>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve('public/og-image.png'), type: 'png' });
await browser.close();
console.log('Generated public/og-image.png (1200x630)');
