/**
 * Render LiftUp brand SVGs to PNG at multiple sizes.
 *
 * Usage:  pnpm brand:render
 *
 * Reads:  public/assets/brand/{icon,logo}.svg
 * Writes: public/assets/brand/{icon-128,icon-256,icon-512,icon-1024,
 *                              logo-512,logo-1024,logo-2048}.png
 *
 * Uses @resvg/resvg-js with the Sora woff2 file shipped by @fontsource/sora
 * so the wordmark renders identically to the live site (display font).
 */

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const BRAND_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const FONT_FILE = path.join(__dirname, 'fonts', 'Sora.ttf');

// resvg-js loads TTF reliably; the woff2 files shipped by @fontsource don't
// register their family name in resvg's fontdb. The TTF variable font has
// all weights we need.
const fontFiles = [FONT_FILE];

function render(svgPath, width, outPath) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: 'Sora',
    },
    background: 'rgba(0,0,0,0)',
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(outPath, pngBuffer);
  const kb = (pngBuffer.length / 1024).toFixed(1);
  console.log(`  ✓ ${path.basename(outPath).padEnd(20)} ${width.toString().padStart(5)}px  ${kb} KB`);
}

function main() {
  console.log('LiftUp brand asset renderer\n');
  console.log(`Font files loaded: ${fontFiles.length} Sora weights\n`);

  const icon = path.join(BRAND_DIR, 'icon.svg');
  const logo = path.join(BRAND_DIR, 'logo.svg');

  console.log('Icon (square mark):');
  for (const size of [128, 256, 512, 1024]) {
    render(icon, size, path.join(BRAND_DIR, `icon-${size}.png`));
  }

  console.log('\nLogo (mark + wordmark):');
  // Aspect ratio is 900:256, so width drives height.
  for (const size of [512, 1024, 2048]) {
    render(logo, size, path.join(BRAND_DIR, `logo-${size}.png`));
  }

  console.log('\nDone. Files in public/assets/brand/');
}

main();
