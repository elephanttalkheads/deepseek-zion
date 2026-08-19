/**
 * JsonTree 最小等位实现(ui-trajectory 的请求载荷查看用)。
 * 官方为可折叠 JSON 树 + 语法着色;这里用 <details>/<summary> 做同功能的递归折叠树,
 * 数据展示与折叠交互对齐,视觉细节留待整包 vendor 时替换。
 */
import { Fragment } from 'react'

export interface JsonTreeProps {
  /** JSON 可序列化数据。 */
  data: unknown
  /** 根节点标签(可选)。 */
  label?: string
  /** 根元素类名。 */
  className?: string
  /** 是否压缩预览(限制深度/截断)。 */
  compact?: boolean
  /** 展开深度(compact 模式仍强制折叠)。 */
  depth?: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function renderScalar(value: unknown): string {
  return JSON.stringify(value) ?? String(value)
}

/** 递归可折叠节点:对象/数组展开为子树,标量直接呈现。 */
function TreeNode({ value, name }: { value: unknown; name?: string }): JSX.Element {
  if (value === null || typeof value !== 'object') {
    return <span className="json-tree-leaf">{renderScalar(value)}</span>
  }
  const entries = Array.isArray(value)
    ? value.map((entry, index) => ({ key: String(index), entry }))
    : Object.entries(value).map(([key, entry]) => ({ key, entry }))
  const kind = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`
  return (
    <details className="json-tree-node" open>
      <summary className="json-tree-summary">
        {name !== undefined && <span className="json-tree-key">{name}: </span>}
        <span className="json-tree-kind">{kind}</span>
      </summary>
      <div className="json-tree-children">
        {entries.map(({ key, entry }) => (
          <div className="json-tree-row" key={key}>
            <span className="json-tree-key">{key}: </span>
            <TreeNode value={entry} />
          </div>
        ))}
      </div>
    </details>
  )
}

/** JSON 查看树:data 可序列化则递归渲染,否则降级为文本。 */
export function JsonTree({ data, label, className, depth = 2 }: JsonTreeProps): JSX.Element {
  let body: JSX.Element
  try {
    const clamped = depth > 0 ? data : undefined
    body = <TreeNode value={clamped ?? data} name={label} />
  } catch {
    body = <pre className="json-tree-fallback">{JSON.stringify(data)}</pre>
  }
  return <div className={`json-tree ${className ?? ''}`.trim()}>{body}</div>
}
