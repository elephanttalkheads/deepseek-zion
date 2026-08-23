// PROTOTYPE — throwaway: 无头截图氛围层合并 demo(READY / RUNNING fx 档 / 全关对照)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/(本块无官方对应物,无 official/)
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false });
  await win.loadFile(path.join(dir, 'ambient-proto.html'));
  await sleep(16000); // 等字体加载 + 雨幕达稳态(全周期:爬入 ~6s + 落底 4.4s + 重生等待 2.6s,READY 档 90ms 节流)
  // 无头 capturePage 系统性返回上一合成帧 —— 先拍一张丢弃强制合成,再拍取真帧
  const shot = async (name) => {
    await win.webContents.capturePage();
    await sleep(150);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `ambient-proto--${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);
  const click = (id) => js(`document.getElementById('${id}').click(); 'ok'`);

  await shot('ready'); // 雨 + 扫描线 + Matrix 字体,READY 档(speed 1)

  await click('ctlBusy'); // fx 2.2 档
  await sleep(1500);
  await shot('running');

  await click('ctlBusy');
  await click('ctlRain'); // 全关对照:无雨无扫描线、系统字体
  await click('ctlScan');
  await click('ctlFont');
  await sleep(300);
  await shot('bare');

  // 恢复全开 + 弹层/菜单半透明口径(整个 UI 含浮层都透雨)
  await click('ctlRain');
  await click('ctlScan');
  await click('ctlFont');
  await click('ctlMenu');
  await sleep(600);
  await shot('menu');
  await click('ctlModal');
  await sleep(300);
  await shot('modal');

  app.quit();
});
