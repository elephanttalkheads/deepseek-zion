// PROTOTYPE — throwaway: 无头截图**真组件**侧栏(5199 复刻页面,real 轨 3080 数据),
// 与 replica/sidebar-proto--*.png demo 基准做形态比对(迁移流程第 4 步完成判据)。
// 只读操作:开菜单/搜索/切分组/调宽,不改名不归档不新建。
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_REAL = 'http://localhost:5199/';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false });
  const js = (code) => win.webContents.executeJavaScript(code);
  // 无头隐藏窗口 compositor 被 occlusion 节流:连拍 capturePage 泵帧(HANDOFF §5 waitFx)
  const pump = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { await win.webContents.capturePage(); } catch { /* ignore */ }
      await sleep(60);
    }
  };
  // 无头 capturePage 系统性返回上一合成帧 —— 先拍一张丢弃,再拍取真帧
  const shot = async (name) => {
    const w = await js(`document.querySelector('.sidebar').getBoundingClientRect().width`);
    const rect = { x: 0, y: 0, width: Math.ceil(w), height: 900 };
    await win.webContents.capturePage();
    await sleep(150);
    const img = await win.webContents.capturePage(rect);
    fs.writeFileSync(path.join(outDir, `sidebar-real--${name}.png`), img.toPNG());
    console.log('shot:', name, `${rect.width}x${rect.height}`);
  };
  const esc = () => js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 'ok'`);

  await win.loadURL(URL_REAL);
  // 与 probe-archive-filter 同口径:先等 Portal 投影行(会话数据到达),再操作
  for (let i = 0; i < 50; i++) {
    const n = await js(`document.querySelectorAll('.sidebar-item').length`).catch(() => 0);
    if (n > 0) break;
    await sleep(400);
  }
  const waitRows = async () => {
    for (let i = 0; i < 40; i++) {
      const n = await js(`document.querySelectorAll('.map-row').length`).catch(() => 0);
      if (n > 0) return true;
      await sleep(250);
    }
    return false;
  };

  // 1. 默认城市态(工具条 + 城市 + Portal)
  await pump(1600); // 字体加载 + 首帧动画稳定
  await shot('city');

  // 2. City Index 分组态(BAY 章节 + caret + ⋯ + 折叠 +N + LOCATE)
  // 注意:.map-row 只在索引展开时渲染,先开索引再等行
  await js(`document.querySelector('.map-toggle').click(); 'ok'`);
  const hasRows = await waitRows();
  console.log('index rows present:', hasRows);
  await pump(700);
  await shot('map-grouped');

  // 3. 行 ⋯ 菜单展开
  await js(`(() => {
    const b = [...document.querySelectorAll('.map-row-menu')][0];
    if (!b) return 'NO_ROWS';
    b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    b.click();
    return 'ok';
  })()`).then((r) => console.log('row menu:', r));
  await pump(300);
  await shot('row-menu');
  await esc();

  // 4. 搜索过滤态
  await js(`(() => {
    const el = document.querySelector('.sidebar-search-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '会话');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await pump(400);
  await shot('search-filter');
  await js(`(() => {
    const el = document.querySelector('.sidebar-search-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);

  // 5. 视图选项菜单(开工具条弹层)
  await js(`document.querySelector('.sidebar-view-options').click(); 'ok'`);
  await pump(300);
  await shot('view-options');

  // 6. 切单列表(平铺)→ 菜单项「单列表」
  await js(`(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.includes('单列表'));
    if (item) item.click();
    return item ? 'ok' : 'MISSING 单列表';
  })()`).then((r) => console.log('flat switch:', r));
  await pump(500);
  await shot('map-flat');
  // 切回工作区分组,恢复默认态
  await js(`document.querySelector('.sidebar-view-options').click(); 'ok'`);
  await pump(250);
  await js(`(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.includes('工作区'));
    if (item) item.click();
    return item ? 'ok' : 'MISSING 工作区';
  })()`);
  await esc();

  // 7. 调宽 420px(width-handle 写 --sidebar-width,脚本直写等效)
  await js(`document.documentElement.style.setProperty('--sidebar-width', '420px'); 'ok'`);
  await pump(1200);
  await shot('width-420');
  await js(`document.documentElement.style.removeProperty('--sidebar-width'); 'ok'`);

  app.quit();
});
