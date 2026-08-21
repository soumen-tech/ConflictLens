#!/usr/bin/env node
/**
 * check-no-bom.js
 *
 * CI/pre-commit lint guard: fails if any .ts file in src/ starts with a
 * UTF-8 BOM (EF BB BF). ts-node's shebang stripping requires the shebang
 * to be the literal first bytes — a BOM breaks npx ts-node src/cli.ts.
 *
 * Usage: node scripts/check-no-bom.js
 * Add to package.json scripts.lint: "node scripts/check-no-bom.js"
 */
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
let failed = false;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".ts")) {
      const buf = fs.readFileSync(full);
      if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        console.error(`[BOM ERROR] ${full} starts with a UTF-8 BOM (EF BB BF).`);
        console.error(`  Fix: re-save as UTF-8 WITHOUT BOM.`);
        failed = true;
      }
    }
  }
}

walk(srcDir);

if (failed) {
  console.error("\nBOM check failed. Fix the files above and re-run.");
  process.exit(1);
} else {
  console.log("[BOM check] All .ts files are BOM-free. ✓");
  process.exit(0);
}
