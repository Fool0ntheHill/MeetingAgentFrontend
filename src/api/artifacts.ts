import { request } from './request'
import type {
  ArtifactDetailResponse,
  GenerateArtifactRequest,
  GenerateArtifactResponse,
  ListArtifactsResponse,
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
  })
