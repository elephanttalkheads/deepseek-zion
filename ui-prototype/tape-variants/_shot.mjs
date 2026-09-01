// PROTOTYPE — throwaway: 无头截图 磁带纹动效变体(两帧对照,记录运动差异)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 960, height: 1140, show: false });
  await win.loadFile(path.join(dir, 'tape-variants-proto.html'));
  await sleep(1500);
  // 无头 capturePage 滞后一拍——先拍丢弃强制合成,再拍取真帧
  const shot = async (name) => {
    await win.webContents.capturePage();
    await sleep(120);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `tape-variants-proto--${name}.png`), img.toPNG());
  };
  await shot('t1');
  await sleep(700);
  await shot('t2');
  app.quit();
});
