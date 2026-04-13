const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();
const CHANGELOG_PATH = path.resolve(ROOT, 'CHANGELOG.md');

function safeExec(command) {
  try {
    return execSync(command, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function collectEntries() {
  const latestTag = safeExec('git describe --tags --abbrev=0');
  const range = latestTag ? `${latestTag}..HEAD` : 'HEAD';
  const raw = safeExec(`git log ${range} --pretty=format:%h%x09%s`);
  if (!raw) {
    return { latestTag, entries: [] };
  }

  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ...subjectParts] = line.split('\t');
      return {
        hash,
        subject: subjectParts.join('\t').trim()
      };
    })
    .filter((row) => row.subject);

  return { latestTag, entries };
}

function main() {
  const version = process.argv[2] || safeExec('node -p "require(\'./package.json\').version"');
  const { latestTag, entries } = collectEntries();

  if (!entries.length) {
    process.stdout.write('No changelog entries found for current range.\n');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const header = `## v${version} - ${date}`;
  const bodyLines = entries.map((entry) => `- ${entry.subject} (${entry.hash})`);
  const intro = latestTag ? `_Changes since ${latestTag}_` : '_Initial release notes_';

  const section = [header, intro, ...bodyLines, ''].join('\n');

  let existing = '# Changelog\n\n';
  if (fs.existsSync(CHANGELOG_PATH)) {
    existing = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    if (!existing.startsWith('# Changelog')) {
      existing = `# Changelog\n\n${existing}`;
    }
  }

  const next = `${existing.replace(/\s*$/, '')}\n\n${section}`;
  fs.writeFileSync(CHANGELOG_PATH, `${next.trimEnd()}\n`, 'utf8');
  process.stdout.write(`Updated ${path.relative(ROOT, CHANGELOG_PATH)} with ${entries.length} entries.\n`);
}

main();
