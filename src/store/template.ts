import { create } from 'zustand'
import {
  createTemplate,
  deleteTemplate,
  getTemplateDetail,
  listTemplates,
  updateTemplate,
} from '@/api/templates'
import type { PromptTemplate } from '@/types/frontend-types'

const mockTemplates: PromptTemplate[] = [
  {
    template_id: 'tmpl_rec_1',
    title: '推荐 | 通用会议纪要',
    description: '自动提炼要点、行动项，适用于常规内部会议',
    prompt_body: '请基于逐字稿生成纪要，包含要点与行动项',
    artifact_type: 'meeting_minutes',
    supported_languages: ['zh-CN', 'en-US'],
    parameter_schema: {},
    is_system: true,
    scope: 'global',
    created_at: new Date().toISOString(),
  },
  {
    template_id: 'tmpl_sales_1',
    title: '销售商机跟进',
    description: '提取商机、竞争对手、下一步行动',
    prompt_body: '请列出需求、竞争对手、下一步行动和责任人',
    artifact_type: 'summary_notes',
    supported_languages: ['zh-CN'],
    parameter_schema: {},
    is_system: false,
    scope: 'tenant',
    created_at: new Date().toISOString(),
  },
]

interface TemplateState {
  templates: PromptTemplate[]
  loading: boolean
  keyword: string
  filterBy: string
  fetchTemplates: (userId?: string, tenantId?: string) => Promise<void>
  setKeyword: (kw: string) => void
  setFilter: (filter: string) => void
  filtered: () => PromptTemplate[]
  getDetail: (id: string) => Promise<PromptTemplate | null>
  create: (payload: Partial<PromptTemplate>, userId?: string) => Promise<void>
  update: (id: string, payload: Partial<PromptTemplate>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  keyword: '',
  filterBy: 'all',
  fetchTemplates: async (userId?: string, tenantId?: string) => {
    set({ loading: true })
    try {
      const res = await listTemplates(userId, tenantId)
      set({ templates: res.templates })
    } catch {
      // 后端不可用时使用本地 Mock
      set({ templates: mockTemplates })
    } finally {
      set({ loading: false })
    }
  },
  setKeyword: (kw) => set({ keyword: kw }),
  setFilter: (filter) => set({ filterBy: filter }),
  filtered: () => {
    const { templates, keyword, filterBy } = get()
    return templates.filter((tpl) => {
      const matchKeyword =
        !keyword ||
        tpl.title.toLowerCase().includes(keyword.toLowerCase()) ||
        tpl.description.toLowerCase().includes(keyword.toLowerCase())
      const matchFilter = filterBy === 'all' ? true : tpl.scope === filterBy
      return matchKeyword && matchFilter
    })
  },
  getDetail: async (id) => {
    try {
      const res = await getTemplateDetail(id)
      return res.template
    } catch {
      const fallback = get().templates.find((t) => t.template_id === id)
      return fallback || null
    }
  },
  create: async (payload, userId) => {
    await createTemplate(
      {
        title: payload.title || '未命名模板',
        prompt_body: payload.prompt_body || '',
        artifact_type: payload.artifact_type || 'meeting_minutes',
        description: payload.description || '',
        supported_languages: payload.supported_languages || ['zh-CN'],
        parameter_schema: payload.parameter_schema || {},
      },
      userId
    )
  },
  update: async (id, payload) => {
    await updateTemplate(id, {
      title: payload.title,
      description: payload.description,
      prompt_body: payload.prompt_body,
      supported_languages: payload.supported_languages,
      parameter_schema: payload.parameter_schema,
    })
  },
  remove: async (id) => {
    await deleteTemplate(id)
  },
}))
