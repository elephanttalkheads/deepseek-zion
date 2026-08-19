/**
 * 共享词典投影工具 + 官方 common 词表。
 *
 * 官方 locale 插件注册 `common` 命名空间(dsh-client-locale),命名空间查不到
 * 的键回退查 common(官方 locale.service lookup 链)。zion 不跑官方 locale
 * 服务,这里把 common 的 zh 词表原样搬入(来源:
 * `packages/client/locale/src/locales/zh.ts`,dsh-v0.1.0-rc.7),并提供一个
 * 统一翻译器工厂:命名空间字典命中优先,miss 后查 common,再 miss 返回键本身。
 */

/** 官方 common 命名空间 zh 词表(逐字搬入,键集即 CommonKey)。 */
export const commonZh = {
  'ok': '确定',
  'cancel': '取消',
  'close': '关闭',
  'copy': '复制',
  'copied': '复制成功',
  'retry': '重试',
  'loading': '加载中…',
  'load.failed': '加载失败',
  'submit': '提交',
  'submitting': '正在提交…',
  'next': '下一步',
  'previous': '上一步',
  'skip': '跳过',
  'delete': '删除',
  'edit': '编辑',
  'save': '保存',
  'search': '搜索',
  'more': '更多',
  'collapse': '收起',
  'expand': '展开',
  'back': '返回',
  'unknown': '未知',
  'none': '无',
  'truncated': '已截断',
} as const

/**
 * 字典投影翻译器工厂:namespace 字典 → common 词表 → 键本身。
 * `{name}` 插值与官方 locale 渲染一致;错误文案不本地化。
 */
export function makeT(
  dict: Record<string, string>,
  common: Record<string, string> = commonZh,
): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    let text = dict[key] ?? common[key] ?? key
    if (params !== undefined) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }
}

// 等位声明(官方在 dsh-client-locale client/index.ts 的 apply,不在编译面):
// common 命名空间并入 LocaleNamespaceMap,使 TranslateNS 的键域包含共享词表
// (官方 locale 查链:命名空间 miss 后查 common)。
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shared cross-feature vocabulary(官方 dsh-client-locale 等位)。 */
    common: keyof typeof commonZh
  }
}
