// PROTOTYPE — throwaway: 无头截图 综合场景 demo(C11+C12+C01 × 锚点)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false });
  await win.loadFile(path.join(dir, 'composite-tui-proto.html'));
  await win.webContents.executeJavaScript(`document.getElementById('apToggle').style.display='none'; 'ok'`); // 临时开关不入镜
  await sleep(9000); // 让数字雨积累拖尾与密度(雨列初生在屏上 -60 行,需多帧爬入)
  // 无头 capturePage 滞后一拍——先拍丢弃强制合成,再拍取真帧
  await win.webContents.capturePage();
  await sleep(120);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'composite-tui-proto--full.png'), img.toPNG());
  // 审批接管态(§2.11):隐藏输入行,显示审批面板
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('.input-box').style.display = 'none';
    document.querySelector('.subline').style.display = 'none';
    document.getElementById('apPanel').style.display = 'block';
    return 'ok';
  })()`);
  await sleep(400);
  await win.webContents.capturePage();
  await sleep(120);
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'composite-tui-proto--approval.png'), img2.toPNG());
  app.quit();
});
