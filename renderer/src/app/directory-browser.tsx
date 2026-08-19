/**
 * Miller 目录浏览弹窗(ui-directory-picker-browse)zion 直编适配。
 *
 * 官方以 BrowseDirectoryFlow 填 ui-workspace 的目录流孔(新建工作区的
 * 「选择工作区目录」680×500 弹窗);DirectoryBrowser 是纯消费组件
 * (open/busy/listDirectory/createDirectory/onOpen/onClose/t),zion 直接接线:
 * - listDirectory/createDirectory → wire.api.host.*(fixture 已有 browse 树)。
 * - onOpen(选中目录)→ workspace.create(官方 owner onPicked 语义)。
 * 入口:WorkspaceMenu「+ 新建工作区」由原生 host.pickDirectory 改为本弹窗。
 */
import { useState } from 'react'
import type { DirectoryListing } from '../../vendor/client-runtime/client/index.ts'
import { DirectoryBrowseError } from '../../vendor/client-runtime/client/index.ts'
import { DirectoryBrowser, type DirectoryBrowserProps } from '../../vendor/ui-directory-picker-browse/client/DirectoryBrowser.tsx'
import { useRuntime } from './runtime.tsx'
import { makeT } from './locale-common.ts'

/** 官方 client/index.ts apply 内联注册的 zh 词表(逐字搬入)。 */
const directoryBrowserZh = {
  'browser.title': '选择工作区目录',
  'browser.home': '主目录',
  'browser.newFolder': '新建文件夹',
  'browser.folderName': '文件夹名称',
  'browser.createIn': '在"{name}"中新建文件夹',
  'browser.untitledFolder': '未命名文件夹',
  'browser.create': '创建',
  'browser.cancel': '取消',
  'browser.open': '打开',
  'browser.editPath': '编辑路径',
  'browser.loading': '加载中…',
  'browser.truncated': '文件夹过多，仅显示开头部分。',
  'browser.showHidden': '显示隐藏文件',
} as const

const browserT = makeT(directoryBrowserZh as Record<string, string>)

/** 新建工作区的 Miller 目录浏览弹窗(open 由调用方持有)。 */
export function WorkspaceDirectoryBrowser({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  /** 工作区创建成功(路径已确认并 workspace.create 落地)。 */
  onCreated: (path: string) => void
}): JSX.Element | null {
  const { wire } = useRuntime()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const listDirectory = async (path?: string, signal?: AbortSignal): Promise<DirectoryListing> => {
    const res = await wire.api.host.listDirectory(path === undefined ? {} : { path }, signal ?? new AbortController().signal)
    if (!res.result.ok) throw new DirectoryBrowseError(res.result.error)
    return res.result.value
  }
  const createDirectory = async (path: string, name: string): Promise<string> => {
    const res = await wire.api.host.createDirectory({ path, name })
    if (!res.result.ok) throw new DirectoryBrowseError(res.result.error)
    return res.result.value.path
  }
  const adopt = async (path: string): Promise<void> => {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await wire.api.workspace.create({ path })
      setCreating(false)
      if (!res.result.ok) {
        setCreateError(res.result.error?.message ?? 'workspace.create failed')
        return
      }
      onCreated(path)
    } catch (e) {
      setCreating(false)
      setCreateError(String(e))
    }
  }

  const props = {
    open,
    busy: creating,
    listDirectory,
    createDirectory,
    onOpen: (path: string) => { void adopt(path) },
    onClose,
    t: browserT,
  } as unknown as DirectoryBrowserProps
  return (
    <>
      <DirectoryBrowser {...props} />
      {createError !== null && (
        <div className="directory-browser-create-error" role="alert">{createError}</div>
      )}
    </>
  )
}
