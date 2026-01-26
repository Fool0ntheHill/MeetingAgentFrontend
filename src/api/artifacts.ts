import { request } from './request'
import type {
  ArtifactDetailResponse,
  GenerateArtifactRequest,
  GenerateArtifactResponse,
  ListArtifactsResponse,
  DeleteArtifactResponse,
} from '@/types/frontend-types'

export const listArtifacts = (taskId: string) =>
  request<ListArtifactsResponse>({
    url: `/tasks/${taskId}/artifacts`,
    method: 'GET',
  })

export const getArtifactDetail = (artifactId: string) =>
  request<ArtifactDetailResponse>({
    url: `/artifacts/${artifactId}`,
    method: 'GET',
  })

export const regenerateArtifact = (taskId: string, artifactType: string, payload: GenerateArtifactRequest) =>
  request<GenerateArtifactResponse>({
    url: `/tasks/${taskId}/artifacts/${artifactType}/generate`,
    method: 'POST',
    data: payload,
    timeout: 1200000, // 生成耗时较长，延长超时到 1200s
  })

export const updateArtifact = (artifactId: string, content: string) =>
  request<ArtifactDetailResponse>({
    url: `/artifacts/${artifactId}`,
    method: 'PUT',
    data: { content },
  })

export const deleteArtifact = (taskId: string, artifactId: string) =>
  request<DeleteArtifactResponse>({
    url: `/tasks/${taskId}/artifacts/${artifactId}`,
    method: 'DELETE',
  })
