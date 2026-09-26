const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = () => path.join(app.getPath('userData'), 'foodplan.json');
const ALLOWED_HOSTS = new Set(['api.nal.usda.gov', 'world.openfoodfacts.org']);

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 700,
    title: 'FoodPlan',
    backgroundColor: '#f6f5f1',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  // Open external links in the system browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('state:load', async () => {
  try {
    return JSON.parse(await fs.promises.readFile(DATA_FILE(), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read data file:', err);
    return null;
  }
});

let saveChain = Promise.resolve();
ipcMain.handle('state:save', (_e, state) => {
  // Serialise writes so overlapping saves never race on the temp file.
  saveChain = saveChain.catch(() => {}).then(() => writeState(state));
  return saveChain;
});

async function writeState(state) {
  const file = DATA_FILE();
  const tmp = `${file}.tmp`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(tmp, JSON.stringify(state, null, 1));
  await fs.promises.rename(tmp, file); // atomic replace so a crash never corrupts the plan
}

ipcMain.handle('net:fetchJson', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error(`Host not allowed: ${u.hostname}`);
  const res = await fetch(u, { headers: { 'User-Agent': 'FoodPlan/0.1 (Linux desktop meal planner)' } });
  if (!res.ok) {
    const hint = res.status === 429 ? ' (rate limited — add your own free USDA API key in Profile)' : '';
    throw new Error(`HTTP ${res.status} from ${u.hostname}${hint}`);
  }
  return res.json();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
