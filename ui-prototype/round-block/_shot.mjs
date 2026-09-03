// PROTOTYPE — throwaway: 无头截图 C10 回合分组 block 微 demo
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 900, show: false });
  await win.loadFile(path.join(dir, 'round-block-proto.html'));
  await sleep(900);
  await win.webContents.capturePage();
  await sleep(120);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'round-block-proto--full.png'), img.toPNG());
  app.quit();
});
