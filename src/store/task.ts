import { create } from 'zustand'
import {
  createTask,
  getTaskDetail,
  getTaskStatus,
  getTranscript,
  listTasks,
  listTrashSessions,
  type ListTasksParams,
  type TranscriptResponse,
} from '@/api/tasks'
import type { CreateTaskRequest, CreateTaskResponse, TaskDetailResponse, TaskStatusResponse } from '@/types/frontend-types'

const normalizeTask = (raw: any): TaskDetailResponse & {
  folder_id?: string | null
  folder_path?: string
  display_name?: string
  name?: string
  session_id?: string
} => {
  const rawFolder =
    raw?.folder_id ??
    raw?.folderId ??
    raw?.folder?.id ??
    raw?.folder?.folder_id ??
    raw?.folder ??
    null
  const folder_id = typeof rawFolder === 'string' && rawFolder.trim() ? rawFolder : null
  const folder_path =
    raw?.folder_path ??
    raw?.folderPath ??
    raw?.folder?.name ??
    raw?.folder_name ??
    undefined
  return {
    ...raw,
    task_id: raw?.task_id ?? raw?.session_id ?? raw?.id ?? '',
    display_name: raw?.display_name ?? raw?.name ?? raw?.title ?? undefined,
    name: raw?.name ?? raw?.display_name ?? raw?.title ?? undefined,
    folder_id,
    folder_path,
  }
}

interface TaskState {
  list: TaskDetailResponse[]
  total: number
  loading: boolean
  trash: TaskDetailResponse[]
  trashTotal: number
  currentTask: TaskDetailResponse | null
  status: TaskStatusResponse | null
  transcript: TranscriptResponse | null
  fetchList: (params?: ListTasksParams) => Promise<void>
  fetchTrash: (params?: ListTasksParams) => Promise<void>
  fetchDetail: (taskId: string) => Promise<void>
  fetchStatus: (taskId: string) => Promise<TaskStatusResponse>
  fetchTranscript: (taskId: string) => Promise<void>
  createTask: (payload: CreateTaskRequest) => Promise<CreateTaskResponse>
}

export const useTaskStore = create<TaskState>((set) => ({
  list: [],
  total: 0,
  loading: false,
  trash: [],
  trashTotal: 0,
  currentTask: null,
  status: null,
  transcript: null,
  fetchList: async (params) => {
    set({ loading: true })
    try {
      const res = await listTasks(params)
      const itemsRaw = Array.isArray((res as { items?: TaskDetailResponse[] })?.items)
        ? (res as { items: TaskDetailResponse[] }).items
        : Array.isArray(res)
          ? (res as TaskDetailResponse[])
          : []
      const items = itemsRaw.map((t: any) => normalizeTask(t))
      const total = typeof (res as { total?: number })?.total === 'number' ? (res as { total: number }).total : items.length
      set({ list: items, total })
    } finally {
      set({ loading: false })
    }
  },
  fetchTrash: async (params) => {
    set({ loading: true })
    try {
      const res = await listTrashSessions(params)
      const itemsRaw = Array.isArray((res as { items?: TaskDetailResponse[] })?.items)
        ? (res as { items: TaskDetailResponse[] }).items
        : Array.isArray(res)
          ? (res as TaskDetailResponse[])
          : []
      const items = itemsRaw.map((t: any) => {
        const normalized = normalizeTask(t)
        return {
          ...normalized,
          name: normalized.name ?? normalized.task_id ?? normalized.meeting_type ?? '',
        }
      })
      const total = typeof (res as { total?: number })?.total === 'number' ? (res as { total: number }).total : items.length
      set({ trash: items, trashTotal: total })
    } finally {
      set({ loading: false })
    }
  },
  fetchDetail: async (taskId) => {
    const detail = await getTaskDetail(taskId)
    set({ currentTask: detail })
  },
  fetchStatus: async (taskId) => {
    const status = await getTaskStatus(taskId)
    set({ status })
    return status
  },
  fetchTranscript: async (taskId) => {
    const transcript = await getTranscript(taskId)
    set({ transcript })
  },
  createTask: async (payload) => {
    const res = await createTask(payload)
    return res
  },
}))
