import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Drawer, Dropdown, Input, Modal, Tabs, Tooltip, Typography, message } from 'antd'
import {
  DeleteOutlined,
  DislikeOutlined,
  DownOutlined,
  EditOutlined,
  LikeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  RedoOutlined,
  FormOutlined,
  BookOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { useTaskStore } from '@/store/task'
import { useFolderStore } from '@/store/folder'
import { useArtifactStore } from '@/store/artifact'
import { correctSpeakers, correctTranscript } from '@/api/tasks'
import { updateArtifact } from '@/api/artifacts'
import type VditorType from 'vditor'
import { useTemplateStore } from '@/store/template'
import { useAuthStore } from '@/store/auth'
import { ENV } from '@/config/env'
import MarkdownEditor from '@/components/MarkdownEditor'
import TaskConfigForm, { type CreateTaskFormValues } from '@/components/TaskConfigForm'
import type { Template } from '@/store/template'
import TemplateEditorModal from '@/components/TemplateEditorModal'

import FileSidebar from './components/FileSidebar'
import AudioPlayer, { type AudioPlayerRef } from './components/AudioPlayer'
import TranscriptEditor from './components/TranscriptEditor'
import ActionFooter from './components/ActionFooter'
import './workspace.css'

const renderMinutes = (raw: Record<string, unknown> | Array<Record<string, unknown>>) => {
  // 已在 store 层优先解析 data.content（markdown），此处只兜底旧格式
  const content = Array.isArray(raw) ? raw[0] || {} : raw

  const summary =
    content.summary ?? content['会议概要'] ?? content['会议总结'] ?? content['会议纪要'] ?? content['概述'] ?? ''
  const title = content.title ?? content['会议标题'] ?? content['标题'] ?? '纪要'
  const rawKeyPoints =
    content.key_points ??
    content['讨论要点'] ??
    content['关键要点'] ??
    content['要点'] ??
    content['决策事项'] ??
    content['决策'] ??
    []
  const rawActionItems =
    content.action_items ?? content['行动项'] ?? content['待办事项'] ?? content['待办'] ?? []
  const normalizeList = (value: unknown) => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    }
    return []
  }
  const keyPoints = normalizeList(rawKeyPoints)
  const actionItems = normalizeList(rawActionItems)
  return `# ${String(title)}

${String(summary || '')}

## 关键要点
${keyPoints.map((p) => `- ${String(p)}`).join('\n')}

## 行动项
${actionItems.map((p) => `- [ ] ${String(p)}`).join('\n')}
`
}

const resolveMarkdown = (raw: Record<string, unknown> | Array<Record<string, unknown>> | null) => {
  if (!raw) return ''
  const obj = Array.isArray(raw) ? (raw[0] as Record<string, unknown> | undefined) ?? {} : raw
  const direct =
    (typeof obj.content === 'string' && obj.content.trim()) ||
    (typeof obj.markdown === 'string' && obj.markdown.trim())
  if (direct) return direct
  return renderMinutes(obj)
}

const inlineImages = async (content: string) => {
  const imageRegex = /!\[([^\]]*)]\(([^)]+)\)/g
  const matches = [...content.matchAll(imageRegex)]
  if (matches.length === 0) return content

  const cache = new Map<string, string>()
  const toDataUrl = async (url: string) => {
    if (cache.has(url)) return cache.get(url) as string
    if (url.startsWith('data:')) {
      cache.set(url, url)
      return url
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('reader failed'))
        reader.readAsDataURL(blob)
      })
      cache.set(url, dataUrl)
      return dataUrl
    } catch {
      return url
    }
  }

  let result = content
  for (const match of matches) {
    const alt = match[1]
    const url = match[2]
    const dataUrl = await toDataUrl(url)
    result = result.replace(match[0], `![${alt}](${dataUrl})`)
  }
  return result
}

const MoveFolderIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M3 7.5h7l1.8-2h9.2a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z" />
    <path d="M10 14h6m0 0-2-2m2 2-2 2" />
  </svg>
)

const FindReplaceIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="10" r="6" />
    <path d="M14.5 14.5L20 20" />
    <path d="M16 6h4m0 0-1.5-1.5M20 6l-1.5 1.5" />
    <path d="M16 10h4m0 0-1.5-1.5M20 10l-1.5 1.5" />
  </svg>
)

const Workspace = () => {
  const { id } = useParams<{ id: string }>()
  const { username, userId } = useAuthStore()
  const { fetchDetail, currentTask, fetchTranscript, transcript } = useTaskStore()
  const { fetchList, fetchDetail: fetchArtifactDetail, list, parsedContent, regenerate } = useArtifactStore()
  const { folders, fetch: fetchFolders } = useFolderStore()
  const { getDetail: getTemplateDetail, create: createTemplate, templates } = useTemplateStore()

  const audioPlayerRef = useRef<AudioPlayerRef>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [paragraphs, setParagraphs] = useState(transcript?.paragraphs || [])
  const [activeArtifact, setActiveArtifact] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [markdownByArtifact, setMarkdownByArtifact] = useState<Record<string, string>>({})
  const [dirtyByArtifact, setDirtyByArtifact] = useState<Record<string, boolean>>({})
  const [allowTrain, setAllowTrain] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [transcriptDirty, setTranscriptDirty] = useState(false)
  const [transcriptStatus, setTranscriptStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [artifactStatus, setArtifactStatus] = useState<Record<string, 'saved' | 'saving' | 'error'>>({})
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptTemplate, setPromptTemplate] = useState<Template | null>(null)
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [localTemplate, setLocalTemplate] = useState<Template | null>(null)
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [artifactNameOverrides, setArtifactNameOverrides] = useState<Record<string, string>>({})
  const [hiddenArtifacts, setHiddenArtifacts] = useState<Set<string>>(new Set())
  const [syncedArtifacts, setSyncedArtifacts] = useState<Set<string>>(new Set())
  const [activeEditor, setActiveEditor] = useState<'transcript' | 'artifact' | null>(null)
  const [transcriptHistory, setTranscriptHistory] = useState<{ past: TranscriptParagraph[][]; future: TranscriptParagraph[][] }>({
    past: [],
    future: [],
  })
  const transcriptHistoryTimer = useRef<number | null>(null)
  const transcriptSnapshotRef = useRef<TranscriptParagraph[]>([])
  const applyingHistoryRef = useRef(false)
  const paragraphsRef = useRef<TranscriptParagraph[]>(paragraphs)
  const reviewContentRef = useRef<HTMLDivElement>(null)
  const reviewOutlineRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<VditorType | null>(null)

  useEffect(() => {
    // 切换任务时重置当前 artifact 相关状态，避免串任务
    setActiveArtifact(undefined)
    setMarkdownByArtifact({})
    setDirtyByArtifact({})
    setArtifactStatus({})
    setArtifactNameOverrides({})
    setHiddenArtifacts(new Set())
    setSyncedArtifacts(new Set())
  }, [id])

  useEffect(() => {
    if (!id) return
    fetchDetail(id)
    fetchTranscript(id)
    void fetchList(id)
  }, [id, fetchDetail, fetchTranscript, fetchList])

  useEffect(() => {
    if (folders.length === 0) {
      void fetchFolders()
    }
  }, [fetchFolders, folders.length])

  useEffect(() => {
    if (transcript) {
      setParagraphs(transcript.paragraphs)
      transcriptSnapshotRef.current = cloneParagraphs(transcript.paragraphs)
      setTranscriptHistory({ past: [], future: [] })
      setIsDirty(false)
      setIsConfirmed(false)
      setSpeakerMap({})
      setTranscriptDirty(false)
      setTranscriptStatus('saved')
      setSyncedArtifacts((prev) => {
        const next = new Set(prev)
        if (activeArtifact) next.delete(activeArtifact)
        return next
      })
    }
  }, [transcript, activeArtifact])

  useEffect(() => {
    if (!parsedContent || !activeArtifact) return
    if (syncedArtifacts.has(activeArtifact)) return
    const next = resolveMarkdown(parsedContent)
    setMarkdownByArtifact((prev) => {
      if (prev[activeArtifact] === next) return prev
      return { ...prev, [activeArtifact]: next }
    })
    setSyncedArtifacts((prev) => {
      const nextSet = new Set(prev)
      nextSet.add(activeArtifact)
      return nextSet
    })
    setIsDirty(false)
    setIsConfirmed(false)
  }, [parsedContent, activeArtifact, syncedArtifacts])

  useEffect(() => {
    if (!activeArtifact) return
    setIsDirty(Boolean(dirtyByArtifact[activeArtifact]))
  }, [activeArtifact, dirtyByArtifact])

  const artifactTabs = useMemo(() => {
    if (!list) return []
    const entries = Object.values(list.artifacts_by_type).flat()
    const filtered = entries.filter((item) => {
      const taskId = (item as { task_id?: string }).task_id
      if (!taskId) return true
      return taskId === id
    })
    const visible = filtered.filter((item) => !hiddenArtifacts.has(item.artifact_id))
    return visible.map((item) => {
      const isDefaultMinutes = item.artifact_type === 'meeting_minutes' && item.version === 1
      const baseName =
        artifactNameOverrides[item.artifact_id] || (item.artifact_type === 'meeting_minutes' ? '纪要' : item.artifact_type)
      const label = isDefaultMinutes ? baseName : `${baseName} v${item.version}`
      return {
        key: item.artifact_id,
        label,
        artifact: item,
        isDefaultMinutes,
      }
    })
  }, [list, artifactNameOverrides, hiddenArtifacts, id])

  useEffect(() => {
    if (!list) return
    const entries = Object.values(list.artifacts_by_type).flat()
    const filtered = entries.filter((item) => {
      const taskId = (item as { task_id?: string }).task_id
      if (!taskId) return true
      return taskId === id
    })
    if (filtered.length === 0) return
    const currentActive = filtered.find((item) => item.artifact_id === activeArtifact)
    const next = currentActive ?? filtered[0]
    if (!activeArtifact || !currentActive || activeArtifact !== next.artifact_id) {
      setActiveArtifact(next.artifact_id)
      setSyncedArtifacts(new Set())
      void fetchArtifactDetail(next.artifact_id)
    }
  }, [list, id, activeArtifact, fetchArtifactDetail])

  const activeArtifactInfo = useMemo(
    () => artifactTabs.find((tab) => tab.key === activeArtifact)?.artifact,
    [artifactTabs, activeArtifact]
  )

  const initialConfigValues: Partial<CreateTaskFormValues> = useMemo(() => {
    if (!currentTask) return {}
    const activeLabel = artifactTabs.find((tab) => tab.key === activeArtifact)?.label
    return {
      meeting_type: activeLabel || '纪要',
      output_language: currentTask.output_language,
      asr_languages: currentTask.asr_language ? currentTask.asr_language.split('+') : [],
      skip_speaker_recognition: false,
      description: '',
      template_id: activeArtifactInfo?.prompt_instance?.template_id,
    }
  }, [currentTask, activeArtifactInfo, activeArtifact, artifactTabs])

  const listFilter = useMemo(() => new URLSearchParams(location.search).get('folder'), [location.search])
  const editorToolbar = useMemo(
    () => ['headings', 'list', 'ordered-list', 'check', 'quote', 'code', '|', 'undo', 'redo'],
    []
  )
  const audioUrl = useMemo(() => {
    const file = currentTask?.audio_files?.[0]
    if (!file) return undefined
    if (/^https?:\/\//i.test(file)) return file
    const base = ENV.API_BASE_URL.replace(/\/$/, '')
    return `${base}/${String(file).replace(/^\/+/, '')}`
  }, [currentTask?.audio_files])

  const markDirty = () => {
    if (!isDirty) {
      setIsDirty(true)
    }
    if (isConfirmed) {
      setIsConfirmed(false)
    }
  }

  const cloneParagraphs = useCallback((items: TranscriptParagraph[]) => items.map((p) => ({ ...p })), [])

  const pushTranscriptHistory = useCallback(
    (nextParagraphs: TranscriptParagraph[]) => {
      if (applyingHistoryRef.current) return
      const snapshot = cloneParagraphs(nextParagraphs)
      const last = transcriptSnapshotRef.current
      if (last.length === snapshot.length && last.every((p, idx) => p.text === snapshot[idx].text && p.speaker === snapshot[idx].speaker)) {
        return
      }
      setTranscriptHistory((prev) => {
        const past = [...prev.past, cloneParagraphs(last)].slice(-50)
        return { past, future: [] }
      })
      transcriptSnapshotRef.current = snapshot
    },
    [cloneParagraphs]
  )

  const scheduleTranscriptHistory = useCallback(
    (nextParagraphs: TranscriptParagraph[]) => {
      if (transcriptHistoryTimer.current) {
        window.clearTimeout(transcriptHistoryTimer.current)
      }
      transcriptHistoryTimer.current = window.setTimeout(() => pushTranscriptHistory(nextParagraphs), 300)
    },
    [pushTranscriptHistory]
  )

  const handleUpdateParagraph = (id: string, text: string) => {
    setParagraphs((prev) => {
      const updated = prev.map((p) => (p.paragraph_id === id ? { ...p, text } : p))
      scheduleTranscriptHistory(updated)
      return updated
    })
    setTranscriptDirty(true)
    markDirty()
  }

  const handleRenameSpeaker = (from: string, to: string, scope: 'single' | 'global', pid?: string) => {
    if (scope === 'single' && pid) {
      setParagraphs((prev) => {
        const updated = prev.map((p) => (p.paragraph_id === pid ? { ...p, speaker: to } : p))
        scheduleTranscriptHistory(updated)
        return updated
      })
    } else {
      setParagraphs((prev) => {
        const updated = prev.map((p) => (p.speaker === from ? { ...p, speaker: to } : p))
        scheduleTranscriptHistory(updated)
        return updated
      })
      setSpeakerMap((prev) => ({ ...prev, [from]: to }))
    }
    setTranscriptDirty(true)
    markDirty()
  }

  const saveTranscript = useCallback(async () => {
    if (!id) return
    const text = paragraphs.map((p) => `[${p.speaker}] ${p.text}`).join('\n')
    setTranscriptStatus('saving')
    try {
      await correctTranscript(id, { corrected_text: text, regenerate_artifacts: false })
      if (Object.keys(speakerMap).length > 0) {
        await correctSpeakers(id, { speaker_mapping: speakerMap, regenerate_artifacts: false })
      }
      transcriptSnapshotRef.current = cloneParagraphs(paragraphs)
      setTranscriptDirty(false)
      setTranscriptStatus('saved')
    } catch (err) {
    setTranscriptStatus('error')
      message.error((err as Error)?.message || '保存失败')
    }
  }, [id, paragraphs, speakerMap, cloneParagraphs])

  useEffect(() => {
    if (!transcriptDirty) return
    const timer = setTimeout(() => {
      void saveTranscript()
    }, 1000)
    return () => clearTimeout(timer)
  }, [transcriptDirty, paragraphs, speakerMap, saveTranscript])

  const saveArtifact = useCallback(
    async (artifactId: string) => {
      const content = markdownByArtifact[artifactId] ?? ''
      setArtifactStatus((prev) => ({ ...prev, [artifactId]: 'saving' }))
      try {
        await updateArtifact(artifactId, content)
        setDirtyByArtifact((prev) => ({ ...prev, [artifactId]: false }))
        setArtifactStatus((prev) => ({ ...prev, [artifactId]: 'saved' }))
        setSyncedArtifacts((prev) => {
          const next = new Set(prev)
          next.add(artifactId)
          return next
        })
      } catch (err) {
        setArtifactStatus((prev) => ({ ...prev, [artifactId]: 'error' }))
        message.error((err as Error)?.message || '保存失败')
      }
    },
    [markdownByArtifact]
  )

  useEffect(() => {
    if (!activeArtifact) return
    if (!dirtyByArtifact[activeArtifact]) return
    const timer = setTimeout(() => {
      void saveArtifact(activeArtifact)
    }, 1000)
    return () => clearTimeout(timer)
  }, [activeArtifact, dirtyByArtifact, saveArtifact])

  useEffect(() => {
    return () => {
      if (transcriptDirty) {
        void saveTranscript()
      }
      if (activeArtifact && dirtyByArtifact[activeArtifact]) {
        void saveArtifact(activeArtifact)
      }
    }
  }, [transcriptDirty, saveTranscript, activeArtifact, dirtyByArtifact, saveArtifact])

  useEffect(() => {
    paragraphsRef.current = paragraphs
  }, [paragraphs])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!(event.ctrlKey || event.metaKey)) return
      if (key !== 'z' && key !== 'y') return
      const activeEl = document.activeElement as HTMLElement | null
      const inArtifact = activeEl?.closest('.workspace-markdown-surface--edit')
      const inTranscript = activeEl?.closest('.workspace-transcript')
      const editorScope = inArtifact ? 'artifact' : inTranscript ? 'transcript' : activeEditor
      if (editorScope === 'artifact' && vditorRef.current) {
        const editor = vditorRef.current as unknown as { undo?: () => void; redo?: () => void }
        if (key === 'z') {
          editor.undo?.()
        } else {
          editor.redo?.()
        }
        event.preventDefault()
        return
      }
      if (editorScope === 'transcript') {
        event.preventDefault()
        setParagraphs((prev) => {
          const currentSnapshot = cloneParagraphs(prev)
          setTranscriptHistory((history) => {
            if (key === 'z') {
              if (history.past.length === 0) return history
              const past = [...history.past]
              const previous = past.pop() as TranscriptParagraph[]
              const future = [currentSnapshot, ...history.future].slice(0, 50)
              applyingHistoryRef.current = true
              setParagraphs(previous)
              applyingHistoryRef.current = false
              transcriptSnapshotRef.current = cloneParagraphs(previous)
              return { past, future }
            } else {
              if (history.future.length === 0) return history
              const [next, ...restFuture] = history.future
              const past = [...history.past, currentSnapshot].slice(-50)
              applyingHistoryRef.current = true
              setParagraphs(next)
              applyingHistoryRef.current = false
              transcriptSnapshotRef.current = cloneParagraphs(next)
              return { past, future: restFuture }
            }
          })
          return prev
        })
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeEditor])

  const handleRegenerate = async (values: CreateTaskFormValues) => {
    if (!id) return
    try {
      const artifactName = values.meeting_type?.trim() || ''
      const payload = {
        prompt_instance: {
          template_id: values.template_id || activeArtifactInfo?.prompt_instance?.template_id || 'tmpl_rec_1',
          language: values.output_language || currentTask?.output_language || 'zh-CN',
          parameters: {
            meeting_description: values.description || '',
          },
        },
      }
      const res = await regenerate(id, payload)
      message.success(`已重新生成，版本 v${res.version}`)
      setConfigDrawerOpen(false)
      await fetchList(id)
      if (artifactName && res.artifact_id) {
        setArtifactNameOverrides((prev) => ({ ...prev, [res.artifact_id]: artifactName }))
      }
    } catch (err) {
      message.error((err as Error)?.message || '重新生成失败')
    }
  }

  const handleMarkdownChange = (next: string) => {
    if (!activeArtifact) return
    setMarkdownByArtifact((prev) => ({ ...prev, [activeArtifact]: next }))
    setDirtyByArtifact((prev) => ({ ...prev, [activeArtifact]: true }))
    markDirty()
  }

  const handleCopy = async () => {
    if (!isConfirmed) return
    try {
      const header = [
        `生成时间：${new Date().toLocaleString('zh-CN')}`,
        `负责人：${username || currentTask?.user_id || '未指定'}`,
        '声明：本内容由 AI 生成，已由人工校对。',
      ].join('\n')
      const content = `${header}\n\n${currentMarkdown}`
      const inlined = await inlineImages(content)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inlined)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = inlined
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      message.success('已复制！请切换至企微文档按 Ctrl+V 粘贴')
    } catch (err) {
      message.error((err as Error)?.message || '复制失败')
    }
  }

  const handleConfirmChange = (checked: boolean) => {
    setIsConfirmed(checked)
    if (checked) {
      setIsDirty(false)
    }
  }

  const handleFeedback = (type: "like" | "dislike", reason?: string) => {
  if (type === "dislike") {
    console.log("Dislike reason:", reason)
    return
  }
  console.log("Feedback:", type)
}

  const renderStatusText = (status: 'saved' | 'saving' | 'error') => {
    if (status === 'saving') return '保存中...'
    if (status === 'error') return '保存失败'
    return '已保存'
  }

  useEffect(() => {
    if (mode === 'preview') {
      setActiveEditor(null)
    }
  }, [mode])

const pageTitle = currentTask?.meeting_type || currentTask?.task_id || "会议记录"
const folderLabel = useMemo(() => {
  if (!listFilter) return "全部任务"
  if (listFilter === "uncategorized") return "未分类"
  const typed = currentTask as { folder_path?: string; folder_id?: string | null } | null
  const folderMap = new Map(folders.map((folder) => [folder.id, folder.name]))
  const folderId = typed?.folder_id || listFilter
  return folderMap.get(folderId ?? "") || typed?.folder_path || folderId || listFilter
}, [currentTask, folders, listFilter])

const currentMarkdown = activeArtifact ? markdownByArtifact[activeArtifact] ?? '' : ''

  useEffect(() => {
    if (mode !== 'preview') return
    const container = reviewContentRef.current
    if (!container) return
    let cancelled = false
    const render = async () => {
      const { default: Vditor } = await import('vditor')
      if (cancelled) return
      const markdown = currentMarkdown || resolveMarkdown(parsedContent)
      if (!markdown.trim()) {
        container.innerHTML = ''
        return
      }
      const baseUrl = import.meta.env.BASE_URL || '/'
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      const cdn = `${window.location.origin}${normalizedBase}vditor`
      try {
        await Vditor.preview(container, markdown, {
          cdn,
          icon: '',
          i18n: {},
          hljs: { enable: false },
          theme: { current: '', path: '' },
        })
      } catch {
        container.textContent = markdown
      }
      if (cancelled) return
      const outline = reviewOutlineRef.current
      if (outline) {
        outline.innerHTML = ''
        try {
          Vditor.outlineRender(container, outline)
        } catch {
          outline.innerHTML = ''
        }
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [mode, currentMarkdown, parsedContent])

  useEffect(() => {
    if (mode !== 'preview') return
    const outline = reviewOutlineRef.current
    const content = reviewContentRef.current
    if (!outline || !content) return
    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest('[data-target-id]') as HTMLElement | null
      if (!target) return
      const id = target.getAttribute('data-target-id')
      if (!id) return
      const heading = content.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
      if (!heading) return
      content.scrollTop = heading.offsetTop
    }
    outline.addEventListener('click', handleClick)
    return () => outline.removeEventListener('click', handleClick)
  }, [mode])

const taskFolderTarget = useMemo(() => {
  if (!listFilter) return '/tasks'
  if (listFilter === 'uncategorized') return '/tasks?folder=uncategorized'
  return `/tasks?folder=${encodeURIComponent(listFilter)}`
}, [listFilter])

  const handleTabAction = (action: 'delete' | 'regenerate' | 'rename', artifactId?: string) => {
    if (action === 'regenerate') {
      setConfigDrawerOpen(true)
      return
    }
    if (action === 'delete' && artifactId) {
      const target = artifactTabs.find((tab) => tab.key === artifactId)
      if (target?.isDefaultMinutes) return
      setHiddenArtifacts((prev) => {
        const next = new Set(prev)
        next.add(artifactId)
        return next
      })
      if (artifactId === activeArtifact) {
        const nextTab = artifactTabs.find((tab) => tab.key !== artifactId)
        if (nextTab) {
          setActiveArtifact(nextTab.key)
          fetchArtifactDetail(nextTab.key)
        } else {
          setActiveArtifact(undefined)
        }
      }
      return
    }
    if (action === 'rename' && artifactId) {
      const currentLabel = artifactNameOverrides[artifactId] || artifactTabs.find((tab) => tab.key === artifactId)?.label
      let value = currentLabel || ''
      Modal.confirm({
        title: '重命名版本',
        content: <Input defaultValue={value} onChange={(e) => (value = e.target.value)} />,
        onOk: () => {
          if (!value.trim()) {
            message.warning('名称不能为空')
            return Promise.reject()
          }
          setArtifactNameOverrides((prev) => ({ ...prev, [artifactId]: value.trim() }))
          return Promise.resolve()
        },
      })
      return
    }
  }

  const handleMoveFolder = () => {
    message.info('移至文件夹功能待接入')
  }

  const handleFindReplace = () => {
    message.info('查找替换功能待接入')
  }

  const handleOpenPromptModal = useCallback(async () => {
    const tplId = activeArtifactInfo?.prompt_instance?.template_id
    if (!tplId) {
      message.info('当前版本没有提示词')
      return
    }
    setPromptModalOpen(true)
    setPromptTemplate(null)
    try {
      const tpl = await getTemplateDetail(tplId)
      setPromptTemplate(tpl)
    } catch (err) {
      setPromptTemplate(null)
      message.error((err as Error)?.message || '提示词加载失败')
    }
  }, [activeArtifactInfo?.prompt_instance?.template_id, getTemplateDetail])

  const handleSavePromptAsNew = useCallback(
    async (payload: { title: string; description: string; prompt_body: string }) => {
      const title = payload.title?.trim()
      if (!title) {
        message.warning('请输入新模板名称')
        return
      }
      const exists = templates.some((tpl) => tpl.title.trim().toLowerCase() === title.toLowerCase())
      if (exists) {
        message.warning('已存在同名模板，请更换名称')
        return
      }
      try {
        await createTemplate(
          {
            title,
            description: payload.description,
            prompt_body: payload.prompt_body,
            artifact_type: activeArtifactInfo?.artifact_type || 'meeting_minutes',
            supported_languages: promptTemplate?.supported_languages || ['zh-CN'],
            parameter_schema: promptTemplate?.parameter_schema || {},
          },
          userId || undefined
        )
        message.success('已保存为新模板')
        setPromptModalOpen(false)
      } catch (err) {
        message.error((err as Error)?.message || '保存新模板失败')
      }
    },
    [templates, createTemplate, activeArtifactInfo?.artifact_type, promptTemplate?.parameter_schema, promptTemplate?.supported_languages, username]
  )

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        const active = document.activeElement as HTMLElement | null
        const inTranscript = active?.closest('.workspace-transcript')
        const inArtifact = active?.closest('.workspace-markdown-surface--edit')
        event.preventDefault()
        if (inTranscript && !inArtifact) {
          void saveTranscript()
          return
        }
        if (inArtifact) {
          if (activeArtifact) {
            void saveArtifact(activeArtifact)
          }
          return
        }
        void saveTranscript()
        if (activeArtifact) {
          void saveArtifact(activeArtifact)
        }
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [saveTranscript, saveArtifact, activeArtifact])

  const handleCreateArtifact = () => {
    setConfigDrawerOpen(true)
  }

  return (
    <div className="page-container workspace-page">
      <div className="workspace-header">
        <div className="workspace-header__left">
          <Button
            type="text"
            size="small"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <div className="workspace-header__meta">
            <button type="button" className="workspace-header__folder-link" onClick={() => navigate(taskFolderTarget)}>
              <Typography.Text type="secondary">{folderLabel}</Typography.Text>
            </button>
            <span className="workspace-header__divider">/</span>
            <Typography.Text className="workspace-header__title-text">{pageTitle}</Typography.Text>
          </div>
        </div>
        <div className="workspace-header__actions">
          <Tooltip placement="bottom" title="移至文件夹">
            <button type="button" className="workspace-header__action-btn" onClick={handleMoveFolder}>
              <MoveFolderIcon />
            </button>
          </Tooltip>
          <Tooltip placement="bottom" title="查找替换">
            <button type="button" className="workspace-header__action-btn" onClick={handleFindReplace}>
              <FindReplaceIcon />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={`workspace-body${sidebarCollapsed ? ' is-collapsed' : ''}`}>
        <div className={`workspace-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
          <FileSidebar listFilter={listFilter} />
        </div>

        <div className="workspace-main">
          <Group orientation="horizontal" className="workspace-panels">
            <Panel defaultSize={45} minSize={35} maxSize={70} style={{ minWidth: 340 }}>
                <div className="workspace-pane">
                  <AudioPlayer
                    ref={audioPlayerRef}
                    url={audioUrl}
                    onTimeUpdate={setCurrentTime}
                  />
                <div className="workspace-pane__toolbar">
                  <Typography.Text type="secondary">逐字稿编辑</Typography.Text>
                  <Typography.Text type={transcriptStatus === 'error' ? 'danger' : 'secondary'}>
                    {renderStatusText(transcriptStatus)}
                  </Typography.Text>
                </div>
                <div className="workspace-pane__body workspace-pane__body--scroll">
                  <TranscriptEditor
                    paragraphs={paragraphs}
                    currentTime={currentTime}
                    onSeek={(t) => audioPlayerRef.current?.seekTo(t)}
                    onUpdateParagraph={handleUpdateParagraph}
                    onRenameSpeaker={handleRenameSpeaker}
                    onFocusArea={() => setActiveEditor('transcript')}
                  />
                  <div className="workspace-pane__divider workspace-pane__divider--inset" />
                  <div className="workspace-feedback">
                        <Button size="small" icon={<LikeOutlined />} onClick={() => handleFeedback('like')}>
                          满意
                        </Button>
                        <Button size="small" icon={<DislikeOutlined />} onClick={() => handleFeedback('dislike')}>
                          不满意
                        </Button>
                  </div>
                </div>
              </div>
            </Panel>

            <Separator className="workspace-separator" />

            <Panel defaultSize={55} minSize={35} maxSize={70} style={{ minWidth: 340 }}>
              <div className="workspace-pane">
                <div className="workspace-pane__toolbar workspace-pane__toolbar--tabs">
                  <Tabs
                    activeKey={activeArtifact}
                    onChange={(key) => {
                      setActiveArtifact(key)
                      fetchArtifactDetail(key)
                    }}
                    tabBarExtraContent={{
                      right: (
                        <Tooltip title="生成新版本">
                          <Button
                            type="text"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={handleCreateArtifact}
                            className="workspace-tabs__add"
                          />
                        </Tooltip>
                      ),
                    }}
                    items={artifactTabs.map((tab) => ({
                      key: tab.key,
                      label: (
                        <span className="workspace-tab-label">
                          <span className="workspace-tab-label__name">{tab.label}</span>
                          <Dropdown
                            trigger={['click']}
                            menu={{
                              items: [
                                { key: 'rename', label: '重命名', icon: <EditOutlined /> },
                                { key: 'regenerate', label: '重新生成', icon: <RedoOutlined className="workspace-tab-action-icon" /> },
                                ...(tab.isDefaultMinutes ? [] : [{ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true }]),
                              ],
                              onClick: ({ key }) =>
                                handleTabAction(key as 'delete' | 'regenerate' | 'rename', tab.key),
                            }}
                          >
                            <button
                              type="button"
                              className="workspace-tab-label__menu"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DownOutlined className="workspace-tab-label__icon" />
                            </button>
                          </Dropdown>
                        </span>
                      ),
                    }))}
                        size="small"
                    className="workspace-tabs"
                  />
                <div className="workspace-pane__actions">
                  <Tooltip title="查看提示词">
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={handleOpenPromptModal}
                    />
                  </Tooltip>
                  <Tooltip title={mode === 'preview' ? '预览模式' : '编辑模式'}>
                    <Button
                      type="text"
                      size="small"
                      icon={mode === 'preview' ? <BookOutlined /> : <FormOutlined />}
                      onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}
                    />
                  </Tooltip>
                  <Typography.Text
                    type={
                      artifactStatus[activeArtifact || ''] === 'error'
                        ? 'danger'
                        : 'secondary'
                    }
                  >
                    {renderStatusText(artifactStatus[activeArtifact || ''] || 'saved')}
                  </Typography.Text>
                </div>
                </div>

                <div className="workspace-pane__body workspace-pane__body--markdown">
                  {!activeArtifact && <div className="workspace-empty">请在上方选择或生成一个纪要版本</div>}
                  {activeArtifact ? (
                    <>
                      <div
                        className="workspace-markdown-surface workspace-markdown-surface--edit"
                        style={{
                          display: mode === 'preview' ? 'none' : 'block',
                          minHeight: 320,
                          width: '100%',
                        }}
                        onFocusCapture={() => setActiveEditor('artifact')}
                      >
                        <MarkdownEditor
                          value={currentMarkdown}
                          onChange={handleMarkdownChange}
                          outline
                          height="auto"
                          hidePreviewActions
                          toolbarItems={editorToolbar}
                          previewMode="editor"
                          mode="sv"
                          onInstance={(inst) => {
                            vditorRef.current = inst
                          }}
                        />
                      </div>
                      {mode === 'preview' ? (
                        <div className="workspace-review">
                          <div className="workspace-review__content vditor-reset" ref={reviewContentRef} />
                          <div className="workspace-review__outline" ref={reviewOutlineRef} />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {mode === 'preview' && (
                    <>
                      <div className="workspace-pane__divider workspace-pane__divider--inset" />
                      <div className="workspace-feedback workspace-feedback--aligned">
                        <Button size="small" icon={<LikeOutlined />} onClick={() => handleFeedback('like')}>
                          满意
                        </Button>
                        <Button size="small" icon={<DislikeOutlined />} onClick={() => handleFeedback('dislike')}>
                          不满意
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                <div className="workspace-pane__footer">
                  <ActionFooter
                    isConfirmed={isConfirmed}
                    onConfirmChange={handleConfirmChange}
                    onCopy={handleCopy}
                    allowTrain={allowTrain}
                    onAllowTrainChange={setAllowTrain}
                  />
                </div>
              </div>
            </Panel>
          </Group>
      </div>
    </div>

      <TemplateEditorModal
        open={promptModalOpen}
        mode="task_creation"
        template={promptTemplate || undefined}
        onSaveAsNew={handleSavePromptAsNew}
        onClose={() => {
          setPromptModalOpen(false)
          setPromptTemplate(null)
        }}
      />

      <Drawer
        title="重新生成配置"
        width={600}
        onClose={() => setConfigDrawerOpen(false)}
        open={configDrawerOpen}
        styles={{ body: { paddingBottom: 80 } }}
      >
        <TaskConfigForm
          initialValues={initialConfigValues}
          onFinish={handleRegenerate}
          submitText="确认并重新生成"
          meetingTypeLabel="纪要名称"
          meetingTypePlaceholder="默认使用当前纪要名称"
          templateOverride={localTemplate}
          onTemplateChange={setLocalTemplate}
        />
      </Drawer>
    </div>
  )
}

export default Workspace







