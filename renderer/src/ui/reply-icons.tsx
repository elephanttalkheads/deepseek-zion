/**
 * reply-icons — 回复尾操作条图标原子(DESIGN.md §2.14,SET D 舱位语言:
 * 空心方块/细线、1px stroke、方角、currentColor;path 逐字照
 * ui-prototype/msg-action-icons/reply-actions-proto.html V1,2026-08-29 选定)。
 * 尺寸由 CSS 收口(.reply-actions svg 13px;viewBox 0 0 12 12)。
 */
const iconProps = {
  viewBox: '0 0 12 12',
  'aria-hidden': true as const,
  fill: 'none',
  stroke: 'currentColor',
}

/** 复制 = 前后叠块。 */
export function CopyIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <rect x="4.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" />
      <rect x="1.5" y="4.5" width="6" height="6" fill="none" stroke="currentColor" />
    </svg>
  )
}

/** 好的回答 = 直角拇指 up(官方 👍 语义直译)。 */
export function ThumbUpIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <path d="M1.8 5 H3.6 V10.6 H1.8 Z" fill="none" stroke="currentColor" />
      <path d="M3.6 6.2 L6.2 1.8 H7.6 L7 4.8 H10.2 V9.4 H3.6" fill="none" stroke="currentColor" />
    </svg>
  )
}

/** 有问题的回答 = 直角拇指 down(官方 👎 语义直译)。 */
export function ThumbDownIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <path d="M1.8 1.8 H3.6 V7.4 H1.8 Z" fill="none" stroke="currentColor" />
      <path d="M3.6 6.2 L6.2 10.6 H7.6 L7 7.6 H10.2 V3 H3.6" fill="none" stroke="currentColor" />
    </svg>
  )
}

/** 分支 = 三方块节点 + 横枝(竖干 + 直角横枝)。 */
export function BranchIcon(): JSX.Element {
  return (
    <svg {...iconProps}>
      <rect x="2" y="1.5" width="3" height="3" fill="none" stroke="currentColor" />
      <rect x="2" y="7.5" width="3" height="3" fill="none" stroke="currentColor" />
      <rect x="7" y="1.5" width="3" height="3" fill="none" stroke="currentColor" />
      <path d="M3.5 4.5 V7.5 M5 3 H7" fill="none" stroke="currentColor" />
    </svg>
  )
}
