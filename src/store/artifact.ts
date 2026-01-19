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
    set({ loading: true })
    try {
      const data = await listArtifacts(taskId)
      set({ list: data })
    } finally {
      set({ loading: false })
    }
  },
  fetchDetail: async (artifactId) => {
    const data = await getArtifactDetail(artifactId)
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = data.artifact.content ? JSON.parse(data.artifact.content) : null
    } catch {
      parsed = null
    }
    set({ current: data, parsedContent: parsed })
  },
  regenerate: async (taskId, payload) => {
    // Default to 'meeting_minutes' for now as it's the main artifact type
    const res = await regenerateArtifact(taskId, 'meeting_minutes', payload)
    return res
  },
}))
