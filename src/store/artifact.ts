import { create } from 'zustand'
import { getArtifactDetail, listArtifacts, regenerateArtifact } from '@/api/artifacts'
import type {
  ArtifactDetailResponse,
  GenerateArtifactRequest,
  GenerateArtifactResponse,
  ListArtifactsResponse,
} from '@/types/frontend-types'

interface ArtifactState {
  list: ListArtifactsResponse | null
  current: ArtifactDetailResponse | null
  parsedContent: Record<string, unknown> | null
  loading: boolean
  fetchList: (taskId: string) => Promise<void>
  fetchDetail: (artifactId: string) => Promise<void>
  regenerate: (taskId: string, payload: GenerateArtifactRequest) => Promise<GenerateArtifactResponse>
}

export const useArtifactStore = create<ArtifactState>((set) => ({
  list: null,
  current: null,
  parsedContent: null,
  loading: false,
  fetchList: async (taskId) => {
    set({ loading: true, list: null, current: null, parsedContent: null })
    try {
      const data = await listArtifacts(taskId)
      const mapped = {
        ...data,
        artifacts_by_type: Object.fromEntries(
          Object.entries(data.artifacts_by_type || {}).map(([key, arr]) => [
            key,
            (arr || []).map((item) => ({
              ...item,
              task_id: (item as any).task_id ?? taskId,
            })),
          ])
        ),
      }
      set({ list: mapped })
    } finally {
      set({ loading: false })
    }
  },
  fetchDetail: async (artifactId) => {
    const data = await getArtifactDetail(artifactId)
    const artifact = (data as { data?: unknown; artifact?: unknown }).artifact ?? data
    let parsed: Record<string, unknown> | null = null

    // 新版后端契约：artifact.data.content 为 markdown 字符串
    const asRecord = artifact as Record<string, unknown>
    const dataField = (asRecord.data ?? null) as Record<string, unknown> | null
    const markdownDirect =
      (dataField && typeof dataField.content === 'string' && dataField.content.trim()) || null

    if (markdownDirect) {
      parsed = { content: markdownDirect, title: (dataField?.title as string) || '' }
    } else {
      // 兼容旧格式：artifact.content
      try {
        if (asRecord.content && typeof asRecord.content === 'string') {
          const maybe = JSON.parse(asRecord.content)
          parsed = typeof maybe === 'string' ? { content: maybe } : (maybe as Record<string, unknown>)
        } else if (asRecord.content && typeof asRecord.content === 'object') {
          parsed = asRecord.content as Record<string, unknown>
        }
      } catch {
        parsed = null
      }
    }

    set({ current: { artifact: artifact as any }, parsedContent: parsed })
  },
  regenerate: async (taskId, payload) => {
    // Default to 'meeting_minutes' for now as it's the main artifact type
    const res = await regenerateArtifact(taskId, 'meeting_minutes', payload)
    return res
  },
}))
