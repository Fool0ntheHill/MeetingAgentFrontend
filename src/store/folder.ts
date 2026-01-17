import { create } from 'zustand'
import { createFolder, deleteFolder, listFolders, updateFolder } from '@/api/folders'
import { message } from 'antd'
import type { FolderItem } from '@/api/folders'

interface FolderState {
  folders: Array<FolderItem & { id: string }>
  loading: boolean
  fetch: () => Promise<void>
  add: (name: string, parent_id?: string | null) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  loading: false,
  fetch: async () => {
    set({ loading: true })
    try {
      const res = await listFolders()
      const itemsRaw = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : []
      const items = itemsRaw.map((f: any) => ({
        id: f.folder_id ?? f.id ?? '',
        folder_id: f.folder_id ?? f.id ?? '',
        name: f.name,
        parent_id: f.parent_id ?? null,
        created_at: f.created_at,
        updated_at: f.updated_at,
      }))
      set({ folders: items })
    } catch (e) {
      message.error('获取文件夹失败')
      set({ folders: [] })
    } finally {
      set({ loading: false })
    }
  },
  add: async (name, parent_id = null) => {
    await createFolder({ name, parent_id })
    await get().fetch()
  },
  rename: async (id, name) => {
    await updateFolder(id, { name })
    await get().fetch()
  },
  remove: async (id) => {
    await deleteFolder(id)
    await get().fetch()
  },
}))
