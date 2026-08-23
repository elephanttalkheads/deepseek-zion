// 数字雨 —— 单层、低速、Pip-Boy 磷光绿(算法与数值逐字移植自 pi-martix-ui-dev
// src/renderer/src/components/RainCanvas.tsx,ZION 块 1;参数照 ui-demo/index-v4.html §4.1)
// 算法:FS=18 逐列下落;0.035 半透明拖尾(数值越小尾巴越长);90/fx.speed 帧节流;
// 12% 概率"亮头"(近白磷光 + shadowBlur 8 辉光);落出屏底 96.5% 概率重置。
// FX 读模块级对象(app/ambient-fx),不触发 React 渲染。
// 字形:Matrix Code(真·电影镜像片假名,本地打包)——只映射全角片假名 34 字 +
// 数字 012345789(无 6)+ *+<>:|,字符集必须落在其 cmap 内,否则回退系统字体穿帮。
import { useEffect, useRef } from 'react';
import { fx } from '../app/ambient-fx';
import { MATRIX_CHARS } from '../matrixGlyphs';

const CHARS = MATRIX_CHARS;
const RAIN_FONT = '"Matrix Code", "Share Tech Mono", monospace';
const FS = 18;
/** 字形横向压缩:Matrix Code 全角字形 18px 下 advance 16.8px,
 *  原半角假名约 9px——X 向 ×0.55 恢复原雨丝的纤细观感(网格 FS 不变) */
const GLYPH_SX = 0.55;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Col {
  x: number;
  y: number;
}

export default function RainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cols: Col[] = [];
    let last = 0;
    let raf = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Array.from({ length: Math.ceil(canvas.width / FS) }, (_, i) => ({
        x: i * FS,
        y: Math.random() * -60 * FS,
      }));
    };
    window.addEventListener('resize', resize);
    resize();

    ctx.textAlign = 'center';
    /** 横向压缩绘制(GLYPH_SX),保持字形墨色高度不变、宽度回到原半角观感 */
    const put = (ch: string, x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(GLYPH_SX, 1);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    };

    if (REDUCED) {
      // reduced-motion:只绘制一帧静态雨幕
      ctx.font = `${FS}px ${RAIN_FONT}`;
      ctx.fillStyle = 'rgba(61,255,143,0.6)';
      for (let k = 0; k < cols.length; k++) {
        for (let y = -FS * 2; y < canvas.height; y += FS * 2) {
          put(CHARS[(Math.random() * CHARS.length) | 0], cols[k].x + FS / 2, y);
        }
      }
      return () => window.removeEventListener('resize', resize);
    }

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 90 / fx.speed) return;
      last = ts;
      ctx.fillStyle = 'rgba(1,10,4,0.035)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${FS}px ${RAIN_FONT}`;
      for (let k = 0; k < cols.length; k++) {
        const c = cols[k];
        const ch = CHARS[(Math.random() * CHARS.length) | 0];
        if (Math.random() < 0.12) {
          // 亮头:近白磷光 + 轻微辉光
          ctx.shadowColor = 'rgba(120,255,175,0.9)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = 'rgba(220,255,232,1)';
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(61,255,143,0.95)';
        }
        put(ch, c.x + FS / 2, c.y);
        ctx.shadowBlur = 0;
        c.y += FS * 0.9;
        if (c.y > canvas.height && Math.random() > 0.965) c.y = Math.random() * -30 * FS;
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas id="rain" ref={canvasRef} aria-hidden="true" />;
}
