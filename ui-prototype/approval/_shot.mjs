// PROTOTYPE — throwaway: 无头截图 C07+C15 审批弹层微 demo
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 960, height: 1240, show: false });
  await win.loadFile(path.join(dir, 'approval-proto.html'));
  await sleep(900);
  await win.webContents.capturePage();
  await sleep(120);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'approval-proto--full.png'), img.toPNG());
  // 滚到 C 红蓝药丸一节单拍(页面超一屏)
  await win.webContents.executeJavaScript(`document.querySelectorAll('h2')[2].scrollIntoView({block:'start'}); 'ok'`);
  await sleep(300);
  await win.webContents.capturePage();
  await sleep(120);
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'approval-proto--pills.png'), img2.toPNG());
  app.quit();
});
