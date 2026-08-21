// PROTOTYPE — throwaway: 无头截图合并 demo(idle / palette / 模型菜单(锚 mModel 上方) / Full access 风险模态 / 运行中)
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'replica'); // 复刻 demo 截图归 replica/(官方源 UI 截图归 official/,见 AGENTS.md §8)
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 960, height: 720, show: false });
  await win.loadFile(path.join(dir, 'input-bar-proto.html'));
  await sleep(1200);
  // 无头 capturePage 系统性返回上一合成帧(滞后一拍)—— 先拍一张丢弃强制合成,再拍取真帧
  const shot = async (name) => {
    await win.webContents.capturePage();
    await sleep(120);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `input-bar-proto--${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);
  const setInput = (v) => js(`(() => {
    const el = document.getElementById('cmdline');
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(v)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);

  await shot('idle');

  await setInput('/');
  await sleep(300);
  await shot('palette');

  // 模型菜单:锚 #mModel 上方
  await setInput('');
  await js(`document.getElementById('mModel').click(); 'ok'`);
  await sleep(300);
  await shot('model-menu');
  await js(`document.getElementById('mModel').click(); 'ok'`);

  // Full access 风险确认模态:/permission → 点 Full access 行 → 勾选 → 启用钮可用
  await setInput('/permission ');
  await sleep(300);
  await js(`document.querySelectorAll('.palette .palette-row')[2].click(); 'ok'`);
  await sleep(300);
  await shot('risk-modal-off');
  await js(`(() => {
    const c = document.getElementById('riskCheck');
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(200);
  await shot('risk-modal-on');
  await js(`document.getElementById('riskCancel').click(); 'ok'`);

  // 运行中 + goal + 样例图 + 排队一条(queue 行出现在 dock 停靠排)
  await js(`(() => {
    const s = document.getElementById('ctlState');
    s.value = 'RUNNING';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('ctlGoal').click();
    document.getElementById('ctlImg').click();
    const el = document.getElementById('cmdline');
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '排队:补充第二条指令');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return 'ok';
  })()`);
  await sleep(300);
  await shot('running-goal-img');

  // 插件槽:注入后出现,平时隐藏
  await js(`document.getElementById('ctlDock').click(); 'ok'`);
  await sleep(300);
  await shot('dock-injected');
  await js(`document.getElementById('ctlDock').click(); 'ok'`); // 卸载插件卡,画面干净

  // TodoDock 展开态(对位官方 todo-dock-expanded;无头合成帧少,先冻结动画再拍,避免截到显影中途)
  await js(`document.querySelector('.todo-head').click(); 'ok'`);
  await sleep(500);
  await js(`(() => { const s = document.createElement('style'); s.textContent = '*{animation-delay:0s!important;animation-duration:0.01s!important;transition:none!important}'; document.head.appendChild(s); return 'ok'; })()`);
  await sleep(150);
  await shot('todo-expanded');
  await js(`document.querySelector('.todo-head').click(); 'ok'`);

  // GoalBar 暂停态 / 受阻态(对位官方 goal-bar-paused / goal-bar-blocked)
  await js(`document.querySelector('#goalbar [data-a="pause"]').click(); 'ok'`);
  await sleep(300);
  await shot('goal-paused');
  await js(`document.getElementById('ctlGoalPhase').click(); 'ok'`); // paused → blocked
  await sleep(300);
  await shot('goal-blocked');
  await js(`document.getElementById('ctlGoalPhase').click(); 'ok'`); // blocked → active

  // 多行撑高:3 行(未封顶)+ 附件图在输入盒顶部
  await js(`(() => {
    const el = document.getElementById('cmdline');
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '第一行:需求分析'.split('').join('') + String.fromCharCode(10) + '第二行:入口差集' + String.fromCharCode(10) + '第三行:合并 demo');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(300);
  await shot('multiline-3');

  // 8 行:超 5 行封顶出滚动条
  await js(`(() => {
    const el = document.getElementById('cmdline');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ['一','二','三','四','五','六','七','八'].join(String.fromCharCode(10)));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(300);
  await shot('multiline-8');

  app.quit();
});
