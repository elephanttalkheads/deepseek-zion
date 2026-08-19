/**
 * 轻量 Markdown → 纯文本抽取(ui-trajectory 的摘要/搜索索引用)。
 * 官方制品用完整 mdast 树(依赖整棵 micromark),工程内尚未引入 markdown 渲染栈,
 * 这里提供行为等效的流式剥离:目标是「去掉标记、保留内容与换行」——内联代码、链接标签、
 * 图片 alt、粗斜体、行内 TeX 均已覆盖,原始 HTML 保留为字面文本。
 * 后续引入官方渲染器(ui-primitives 整包)时可整体替换本文件。
 */

export type MarkdownPlainTextMode = 'all' | 'first-line' | 'first-paragraph'

export interface MarkdownPlainTextOptions {
  /** 投影边界;默认为整篇。 */
  mode?: MarkdownPlainTextMode
}

function stripInline(source: string): string {
  return source
    // 行内代码与代码块:保留源码文本
    .replace(/```[^`]*```|`[^`]*`/g, (m) => (m.startsWith('`') && m.endsWith('`') ? m.slice(1, -1) : m.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '')))
    // 图片 ![alt](url) → alt; 链接 [label](url) → label; 引用式 [label][ref] → label
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    // 粗斜体 **x** / __x__ / *x* / _x_
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // 行内 TeX $x$ 与 $$x$$
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$\n]*)\$/g, '$1')
    // 删除线
    .replace(/~~(.*?)~~/g, '$1')
  return source
}

function stripBlocks(source: string): string {
  return stripInline(
    source
      // 标题 # → 文本
      .replace(/^\s{0,3}#{1,6}[ \t]+/gm, '')
      // 无序/有序/任务列表
      .replace(/^\s{0,3}[-+*][ \t]+/gm, '')
      .replace(/^\s{0,3}\d+[.)][ \t]+/gm, '')
      // 引用块
      .replace(/^\s{0,3}>[ \t]?/gm, '')
      // 分隔线
      .replace(/^\s{0,3}([-*_]){3,}[ \t]*$/gm, ''),
  )
}

function normalizeLineBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

/**
 * 把一段 Markdown 内容投影为纯文本。
 * @param source - markdown 源文本。
 * @param options - 边界模式。
 * @returns 剥离标记后的纯文本。
 */
export function extractMarkdownPlainText(
  source: string,
  options: MarkdownPlainTextOptions = {},
): string {
  const normalized = stripBlocks(source === undefined ? '' : String(source))
  const mode = options.mode ?? 'all'
  if (mode === 'all') return normalizeLineBreaks(normalized)
  const paragraphs = normalizeLineBreaks(normalized).split(/\n{2,}/)
  if (mode === 'first-line') return paragraphs[0]?.split('\n')[0] ?? ''
  return paragraphs[0] ?? ''
}
