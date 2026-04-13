const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const MANIFEST_PATH = path.resolve(ROOT, 'docs', 'screenshots', 'manifest.json');

function digest(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail('Missing screenshot manifest. Run: npm run screenshots:refresh');
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const rows = Array.isArray(manifest.files) ? manifest.files : [];
  if (!rows.length) {
    fail('Screenshot manifest has no files. Run: npm run screenshots:refresh');
  }

  const expectedPaths = new Set(rows.map((row) => row.path));

  for (const row of rows) {
    const abs = path.resolve(ROOT, row.path);
    if (!fs.existsSync(abs)) {
      fail(`Missing screenshot file: ${row.path}`);
    }

    const stat = fs.statSync(abs);
    if (Number(row.size) !== stat.size) {
      fail(`Screenshot size mismatch: ${row.path}`);
    }

    const currentDigest = digest(abs);
    if (row.sha256 !== currentDigest) {
      fail(`Screenshot hash mismatch: ${row.path}. Run: npm run screenshots:refresh`);
    }
  }

  const liveFiles = fs.readdirSync(path.resolve(ROOT, 'docs', 'screenshots'))
    .filter((name) => /\.(png|gif)$/i.test(name))
    .map((name) => `docs/screenshots/${name}`);

  for (const liveFile of liveFiles) {
    if (!expectedPaths.has(liveFile)) {
      fail(`Screenshot not tracked in manifest: ${liveFile}`);
    }
  }

  process.stdout.write(`Screenshot manifest verified (${rows.length} files).\n`);
}

main();
