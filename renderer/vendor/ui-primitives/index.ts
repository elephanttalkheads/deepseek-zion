/**
 * ui-primitives 最小 vendor 面(供 ui-trajectory 直编)。
 * Tooltip 与 markdown plain-text 为官方文件/等位实现;图标整表转发(纯 SVG 数据,
 * 无额外依赖)。视觉 later 替换为整包 vendor 时不改调用方。
 */
export * from './icons/index.tsx'
export { Tooltip, type TooltipSide } from './Tooltip.tsx'
export { JsonTree, type JsonTreeProps } from './json-tree.tsx'
export { MarkdownText, type MarkdownTextProps } from './markdown-text.tsx'
export { Toast, type ToastProps } from './toast.tsx'
export { Menu, type MenuEntry, type MenuItem, type MenuSeparator, type MenuLabel } from './Menu.tsx'
export { Button, type ButtonVariant } from './Button.tsx'
export { Modal } from './Modal.tsx'
export { RiskConfirmation, type RiskConfirmationProps } from './RiskConfirmation.tsx'
export { StateDot, type StateDotState } from './StateDot.tsx'
export { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'
export {
  extractMarkdownPlainText,
  type MarkdownPlainTextMode,
  type MarkdownPlainTextOptions,
} from './markdown/plain-text.ts'
