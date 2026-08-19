/**
 * MarkdownFileMentions — 官方 ui-primitives render.tsx 的类型等位
 * (zion 的 markdown-text 是等位实现,未拉整棵 micromark;turn-deliverables 的
 * producedFileMentions 只消费该类型面)。
 */

/** File-mention affordance for inline code(官方 render.tsx 等位)。 */
export interface MarkdownFileMentions {
  /**
   * Resolve one inline-code token.
   * @param value - The authored token, exactly as written.
   * @returns The opener with its accessible label and full-path title, or
   * undefined when the token names no known file — it then stays inert code.
   */
  resolve(value: string): { open: () => void; label: string; title: string } | undefined
}
