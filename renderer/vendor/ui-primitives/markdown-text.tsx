/**
 * MarkdownText 最小等位实现(ui-trajectory 的消息/系统文本渲染用)。
 * 官方走完整 markdown 渲染栈(micromark + shiki 高亮),工程内暂未引入;
 * 这里用 plain-text 投影保留全部可读内容,块级结构由 white-space 保留。
 * 引入官方渲染器后整体替换。
 */
import { extractMarkdownPlainText } from './markdown/plain-text.ts'

export interface MarkdownTextProps {
  /** markdown 源文本。 */
  text: string
  /** 类名。 */
  className?: string
}

/** 纯文本投影渲染(保序文本,先等位再优化)。 */
export function MarkdownText({ text, className }: MarkdownTextProps): JSX.Element {
  return <div className={`markdown-text ${className ?? ''}`.trim()}>{extractMarkdownPlainText(text)}</div>
}
