/**
 * ambient-fx — 氛围层 FX 模块级对象(源仓 pi-martix-ui-dev store.fx 口径,ZION 块 1 迁移)。
 * 纪律:FX 不进 React 渲染路径——氛围组件(RainCanvas,后续 TurnRail 等)直接 import
 * 本对象读取 speed/energy(90/fx.speed 帧节流);不复制进组件 state,不自行插值。
 * 两档取值(ADR 0002,非连续插值,勿改):READY {speed:1, energy:0.3} / 忙碌 {speed:2.2, energy:0.85}。
 * 驱动:AppFrame 订阅选中会话的 running 快照手动写入(不经 useSyncExternalStore)。
 */
export const fx = { speed: 1, energy: 0.3 }

// 探针缝(只读):无头验证 fx 档位(probe-ambient);氛围层无 DOM 可读状态。
;(window as unknown as Record<string, unknown>).__zionAmbientFx = fx

export function setAmbientBusy(busy: boolean): void {
  fx.speed = busy ? 2.2 : 1
  fx.energy = busy ? 0.85 : 0.3
}
