// PROTOTYPE — throwaway: 无头截图侧栏迁移合并 demo(ASCII 城市 + 工具条 + City Index)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/(官方基准在 official/)
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false });
  const file = path.join(dir, 'sidebar-proto.html');
  const js = (code) => win.webContents.executeJavaScript(code);
  // 无头隐藏窗口 compositor 被 occlusion 节流:CSS transition 不走帧。
  // 连拍 capturePage 强制 BeginFrame 推进合成时钟(HANDOFF §5 waitFx 套路)。
  const pump = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { await win.webContents.capturePage(); } catch { /* ignore */ }
      await sleep(60);
    }
  };
  // 无头 capturePage 系统性返回上一合成帧 —— 先拍一张丢弃强制合成,再拍取真帧
  const shot = async (name) => {
    const w = await js(`document.querySelector('.zion-sidebar').getBoundingClientRect().width`);
    const rect = { x: 0, y: 0, width: Math.ceil(w), height: 900 };
    await win.webContents.capturePage();
    await sleep(150);
    const img = await win.webContents.capturePage(rect);
    fs.writeFileSync(path.join(outDir, `sidebar-proto--${name}.png`), img.toPNG());
    console.log('shot:', name, `${rect.width}x${rect.height}`);
  };

  // 1. 默认城市态(工具条 + 城市 + Portal)
  await win.loadFile(file);
  await pump(1400); // 字体加载 + 首帧动画稳定
  await shot('city');

  // 2. City Index 分组态(BAY 章节 + caret + ⋯ + 折叠 +N + LOCATE 按钮)
  await js(`document.getElementById('map-toggle').click(); 'ok'`);
  await pump(700); // 推过 240ms 滑入 transition
  await shot('map-grouped');

  // 3. 行 ⋯ 菜单展开(hover 浮出 ⋯ → 点击 → 全局弹层)
  await js(`(() => {
    const b = [...document.querySelectorAll('.map-row-menu')][0];
    b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    b.click();
    return 'ok';
  })()`);
  await pump(300);
  await shot('row-menu');
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 'ok'`);

  // 4. 搜索过滤态(索引内过滤)
  await js(`(() => {
    const el = document.getElementById('tb-search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '会话');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await pump(400);
  await shot('search-filter');
  await js(`(() => {
    const el = document.getElementById('tb-search');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);

  // 5. 视图选项菜单(关索引 → 开工具条弹层)
  await js(`document.getElementById('map-toggle').click(); 'ok'`); // 关索引
  await pump(400);
  await js(`document.getElementById('tb-view').click(); 'ok'`);
  await pump(300);
  await shot('view-options');
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 'ok'`);

  // 6. City Index 平铺态(map-stylebar 已删,平铺走 ?mapstyle=flat 调试参数)
  await win.loadFile(file, { search: '?map=1&mapstyle=flat' });
  await pump(1200);
  await shot('map-flat');

  // 7. 调宽 420px(城市不变形,横向视野扩展)
  await win.loadFile(file, { search: '?w=420' });
  await pump(1400);
  await shot('width-420');

  app.quit();
});
