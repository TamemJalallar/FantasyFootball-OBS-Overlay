const fs = require('node:fs/promises');
const path = require('node:path');

const TD_STATE_PATH = path.resolve(process.cwd(), 'cache', 'td-state.json');

async function loadTdState() {
  try {
    const raw = await fs.readFile(TD_STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTdState(payload) {
  await fs.mkdir(path.dirname(TD_STATE_PATH), { recursive: true });
  await fs.writeFile(TD_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

module.exports = {
  TD_STATE_PATH,
  loadTdState,
  saveTdState
};
