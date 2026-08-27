// PROTOTYPE — throwaway: 无头截图会话区合并 demo(块 6/7/8/9/11/12/15/18)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/(官方无这些视觉块,无 official/ 对照)
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false });
  await win.loadFile(path.join(dir, 'conversation-proto.html'));
  // 无头 capturePage 系统性返回上一合成帧 —— 先拍一张丢弃强制合成,再拍取真帧
  const shot = async (name) => {
    await win.webContents.capturePage();
    await sleep(150);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `conversation-proto--${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);

  await sleep(400); // 入场编舞中段:注入解码/烧录/中断锁定/雨轨走带进行中
  await shot('entrance');

  await sleep(2600); // 全部落定:解码交回正文、烧录冷却、校验环闭合、磁带纹走带中
  await shot('settled');

  await js(`document.getElementById('feed').scrollTop = document.getElementById('feed').scrollHeight; 'ok'`);
  await sleep(400);
  await shot('bottom'); // 中断标记 + 状态栏

  app.quit();
});
