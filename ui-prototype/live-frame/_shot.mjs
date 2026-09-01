// PROTOTYPE — throwaway: 无头截图 聚光框重设计 V1/V2(两帧对照,记录扰码差异)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 960, height: 1000, show: false });
  await win.loadFile(path.join(dir, 'live-frame-proto.html'));
  await sleep(1200);
  const shot = async (name) => {
    await win.webContents.capturePage();
    await sleep(120);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `live-frame-proto--${name}.png`), img.toPNG());
  };
  await shot('t1');
  await sleep(500);
  await shot('t2');
  app.quit();
});
