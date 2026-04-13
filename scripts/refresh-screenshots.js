const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const SHOTS_DIR = path.resolve(ROOT, 'docs', 'screenshots');
const MANIFEST_PATH = path.resolve(SHOTS_DIR, 'manifest.json');

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function runStep(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function listScreenshotFiles() {
  if (!fs.existsSync(SHOTS_DIR)) {
    return [];
  }

  return fs.readdirSync(SHOTS_DIR)
    .filter((name) => /\.(png|gif)$/i.test(name))
    .sort();
}

function main() {
  runStep(process.execPath, [path.resolve(ROOT, 'scripts', 'generate-demo-gif.js')]);

  const files = listScreenshotFiles();
  const payload = {
    generatedAt: new Date().toISOString(),
    files: files.map((name) => {
      const abs = path.resolve(SHOTS_DIR, name);
      const stat = fs.statSync(abs);
      return {
        path: `docs/screenshots/${name}`,
        size: stat.size,
        sha256: sha256(abs)
      };
    })
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(`Updated ${path.relative(ROOT, MANIFEST_PATH)} for ${files.length} screenshot files.\n`);
}

main();
