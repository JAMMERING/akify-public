const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.join(__dirname, 'src/icons');
const OUT_FILE = path.join(__dirname, 'public/assets/icons.svg');

const symbols = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort()
  .map((f) => {
    const name = path.basename(f, '.svg');
    const content = fs.readFileSync(path.join(SRC_DIR, f), 'utf-8');

    const openMatch = content.match(/<svg([^>]*)>/);
    const innerMatch = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (!openMatch || !innerMatch) {
      throw new Error(`Invalid SVG: ${f}`);
    }

    const attrs = openMatch[1]
      .replace(/\s*xmlns="[^"]*"/g, '')
      .trim();
    const inner = innerMatch[1].trim();

    return `  <symbol id="${name}" ${attrs}>\n    ${inner}\n  </symbol>`;
  })
  .join('\n');

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
${symbols}
</svg>
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, sprite, 'utf-8');
console.log(`✓ Generated ${path.relative(__dirname, OUT_FILE)} (${symbols.split('<symbol').length - 1} icons)`);
