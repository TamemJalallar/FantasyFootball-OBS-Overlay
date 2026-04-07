const fs = require('node:fs/promises');
const path = require('node:path');

const SECRET_PATH = path.resolve(process.cwd(), 'config', 'secrets.json');

async function loadSecrets() {
  try {
    const raw = await fs.readFile(SECRET_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveSecrets(next) {
  await fs.mkdir(path.dirname(SECRET_PATH), { recursive: true });
  await fs.writeFile(SECRET_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

async function getSecret(key) {
  const all = await loadSecrets();
  return all[key] || '';
}

async function setSecret(key, value) {
  const all = await loadSecrets();
  all[key] = value;
  await saveSecrets(all);
}

module.exports = {
  SECRET_PATH,
  loadSecrets,
  getSecret,
  setSecret
};
