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
  EyeOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { useTaskStore } from '@/store/task'
import { useArtifactStore } from '@/store/artifact'
import { correctSpeakers, correctTranscript } from '@/api/tasks'
import { useAuthStore } from '@/store/auth'
import MarkdownEditor from '@/components/MarkdownEditor'
import TaskConfigForm, { type CreateTaskFormValues } from '@/components/TaskConfigForm'
import type { Template } from '@/store/template'

import FileSidebar from './components/FileSidebar'
import AudioPlayer, { type AudioPlayerRef } from './components/AudioPlayer'
import TranscriptEditor from './components/TranscriptEditor'
import ActionFooter from './components/ActionFooter'
import './workspace.css'

const renderMinutes = (content: Record<string, unknown>) => {
  const { title, summary, key_points = [], action_items = [] } = content
  const keyPoints = Array.isArray(key_points) ? key_points : []
  const actionItems = Array.isArray(action_items) ? action_items : []
  return `# ${title || '纪要'}

${summary || ''}

## 关键要点
${keyPoints.map((p) => `- ${String(p)}`).join('\n')}

## 行动项
${actionItems.map((p) => `- [ ] ${String(p)}`).join('\n')}
`
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
  const { username } = useAuthStore()
  const { fetchDetail, currentTask, fetchTranscript, transcript } = useTaskStore()
  const { fetchList, fetchDetail: fetchArtifactDetail, list, parsedContent, regenerate } = useArtifactStore()

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
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [localTemplate, setLocalTemplate] = useState<Template | null>(null)
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [artifactNameOverrides, setArtifactNameOverrides] = useState<Record<string, string>>({})
  const [hiddenArtifacts, setHiddenArtifacts] = useState<Set<string>>(new Set())
  const reviewContentRef = useRef<HTMLDivElement>(null)
  const reviewOutlineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    fetchDetail(id)
    fetchTranscript(id)
    fetchList(id).then(() => {
      const current = useArtifactStore.getState().list
      const first = current?.artifacts_by_type
      const firstId = first ? Object.values(first)[0]?.[0]?.artifact_id : undefined
      if (firstId) {
        setActiveArtifact(firstId)
        fetchArtifactDetail(firstId)
      }
    })
  }, [id, fetchDetail, fetchTranscript, fetchList, fetchArtifactDetail])

  useEffect(() => {
    if (transcript) {
      setParagraphs(transcript.paragraphs)
      setIsDirty(false)
      setIsConfirmed(false)
      setSpeakerMap({})
    }
  }, [transcript])

  useEffect(() => {
    if (!parsedContent || !activeArtifact) return
    const next = renderMinutes(parsedContent)
    setMarkdownByArtifact((prev) => {
      if (dirtyByArtifact[activeArtifact]) return prev
      if (prev[activeArtifact] === next) return prev
      return { ...prev, [activeArtifact]: next }
    })
    setIsDirty(false)
    setIsConfirmed(false)
  }, [parsedContent, activeArtifact, dirtyByArtifact])

  useEffect(() => {
    if (!activeArtifact) return
    setIsDirty(Boolean(dirtyByArtifact[activeArtifact]))
  }, [activeArtifact, dirtyByArtifact])

  const artifactTabs = useMemo(() => {
    if (!list) return []
    const entries = Object.values(list.artifacts_by_type).flat()
    const visible = entries.filter((item) => !hiddenArtifacts.has(item.artifact_id))
    return visible.map((item) => ({
      key: item.artifact_id,
      label: artifactNameOverrides[item.artifact_id] || `${item.artifact_type} v${item.version}`,
      artifact: item,
    }))
  }, [list, artifactNameOverrides, hiddenArtifacts])

  const activeArtifactInfo = useMemo(
    () => artifactTabs.find((tab) => tab.key === activeArtifact)?.artifact,
    [artifactTabs, activeArtifact]
  )

  const initialConfigValues: Partial<CreateTaskFormValues> = useMemo(() => {
    if (!currentTask) return {}
    return {
      meeting_type: currentTask.meeting_type,
      output_language: currentTask.output_language,
      asr_languages: currentTask.asr_language ? currentTask.asr_language.split('+') : [],
      skip_speaker_recognition: false,
      description: '',
      template_id: activeArtifactInfo?.prompt_instance?.template_id,
    }
  }, [currentTask, activeArtifactInfo])

  const listFilter = useMemo(() => new URLSearchParams(location.search).get('folder'), [location.search])
  const editorToolbar = useMemo(
    () => ['headings', 'list', 'ordered-list', 'check', 'quote', 'code', '|', 'undo', 'redo'],
    []
  )

  const markDirty = () => {
    if (!isDirty) {
      setIsDirty(true)
    }
    if (isConfirmed) {
      setIsConfirmed(false)
    }
  }

  const handleUpdateParagraph = (id: string, text: string) => {
    setParagraphs((prev) => prev.map((p) => (p.paragraph_id === id ? { ...p, text } : p)))
    markDirty()
  }

  const handleRenameSpeaker = (from: string, to: string, scope: 'single' | 'global', pid?: string) => {
    if (scope === 'single' && pid) {
      setParagraphs((prev) => prev.map((p) => (p.paragraph_id === pid ? { ...p, speaker: to } : p)))
    } else {
      setParagraphs((prev) => prev.map((p) => (p.speaker === from ? { ...p, speaker: to } : p)))
      setSpeakerMap((prev) => ({ ...prev, [from]: to }))
    }
    markDirty()
  }

  const handleSaveTranscript = useCallback(async () => {
    if (!id) return
    const text = paragraphs.map((p) => `[${p.speaker}] ${p.text}`).join('\n')
    try {
      await correctTranscript(id, { corrected_text: text, regenerate_artifacts: false })
      if (Object.keys(speakerMap).length > 0) {
        await correctSpeakers(id, { speaker_mapping: speakerMap, regenerate_artifacts: false })
      }
      message.success('逐字稿已保存（未触发重新生成）')
    } catch (err) {
      message.error((err as Error)?.message || '保存失败')
    }
  }, [id, paragraphs, speakerMap])

  const handleRegenerate = async (values: CreateTaskFormValues) => {
    if (!id) return
    try {
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
        `责任人：${username || currentTask?.user_id || '未指定'}`,
        '声明：本内容由 AI 生成，已由人工校对',
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

  const handleFeedback = (type: 'like' | 'dislike', reason?: string) => {
    if (type === 'dislike') {
      console.log('Dislike reason:', reason)
      return
    }
    console.log('Feedback:', type)
  }

  const pageTitle = currentTask?.meeting_type || currentTask?.task_id || '会议记录'
  const folderLabel = useMemo(() => {
    if (!listFilter) return '全部任务'
    if (listFilter === 'uncategorized') return '未分类'
    const typed = currentTask as { folder_path?: string; folder_id?: string | null } | null
    return typed?.folder_path || typed?.folder_id || listFilter
  }, [currentTask, listFilter])

  const currentMarkdown = activeArtifact ? markdownByArtifact[activeArtifact] ?? '' : ''

  useEffect(() => {
    if (mode !== 'preview') return
    const container = reviewContentRef.current
    if (!container) return
    let cancelled = false
    const render = async () => {
      const { default: Vditor } = await import('vditor')
      if (cancelled) return
      await Vditor.preview(container, currentMarkdown)
      const outline = reviewOutlineRef.current
      if (outline) {
        outline.innerHTML = ''
        Vditor.outlineRender(container, outline)
      }
    }
    render()
    return () => {
      cancelled = true
    }
  }, [mode, currentMarkdown])

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

  const handleSaveArtifact = useCallback(() => {
    if (!activeArtifact) return
    if (isDirty) {
      setIsDirty(false)
    }
    setDirtyByArtifact((prev) => ({ ...prev, [activeArtifact]: false }))
    message.success('纪要已保存')
  }, [activeArtifact, isDirty])

  const handleMoveFolder = () => {
    message.info('移至文件夹功能待接入')
  }

  const handleFindReplace = () => {
    message.info('查找替换功能待接入')
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        const active = document.activeElement as HTMLElement | null
        const inTranscript = active?.closest('.workspace-transcript')
        const inArtifact = active?.closest('.workspace-markdown-surface--edit')
        event.preventDefault()
        if (inTranscript && !inArtifact) {
          void handleSaveTranscript()
          return
        }
        if (inArtifact) {
          handleSaveArtifact()
          return
        }
        void handleSaveTranscript()
        handleSaveArtifact()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [handleSaveTranscript, handleSaveArtifact])

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
                  url={currentTask?.audio_files?.[0]}
                  onTimeUpdate={setCurrentTime}
                />
                <div className="workspace-pane__toolbar">
                  <Typography.Text type="secondary">逐字稿编辑</Typography.Text>
                  <Tooltip title="保存修正">
                    <Button size="small" type="text" icon={<SaveOutlined />} onClick={handleSaveTranscript} />
                  </Tooltip>
                </div>
                <div className="workspace-pane__body workspace-pane__body--scroll">
                  <TranscriptEditor
                    paragraphs={paragraphs}
                    currentTime={currentTime}
                    onSeek={(t) => audioPlayerRef.current?.seekTo(t)}
                    onUpdateParagraph={handleUpdateParagraph}
                    onRenameSpeaker={handleRenameSpeaker}
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
                                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
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
                    <Tooltip title={mode === 'preview' ? '审阅模式' : '编辑模式'}>
                      <Button
                        type="text"
                        size="small"
                        icon={mode === 'preview' ? <EyeOutlined /> : <FormOutlined />}
                        onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}
                      />
                    </Tooltip>
                  </div>
                </div>

                <div className="workspace-pane__body workspace-pane__body--markdown">
                  {!activeArtifact && (
                    <div className="workspace-empty">请在上方选择或生成一个纪要版本</div>
                  )}
                  {activeArtifact && mode === 'preview' ? (
                    <div className="workspace-review">
                      <div className="workspace-review__content vditor-reset" ref={reviewContentRef} />
                      <div className="workspace-review__outline" ref={reviewOutlineRef} />
                    </div>
                  ) : activeArtifact ? (
                    <div className="workspace-markdown-surface workspace-markdown-surface--edit">
                      <MarkdownEditor
                        value={currentMarkdown}
                        onChange={handleMarkdownChange}
                        outline
                        height="auto"
                        hidePreviewActions
                        toolbarItems={editorToolbar}
                        previewMode="editor"
                        mode="sv"
                      />
                    </div>
                  ) : null}
                
                  <div className="workspace-pane__divider workspace-pane__divider--inset" />
                  <div className="workspace-feedback workspace-feedback--aligned">
                        <Button size="small" icon={<LikeOutlined />} onClick={() => handleFeedback('like')}>
                          满意
                        </Button>
                        <Button size="small" icon={<DislikeOutlined />} onClick={() => handleFeedback('dislike')}>
                          不满意
                        </Button>
                  </div>
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
          submitText="确认并生成"
          templateOverride={localTemplate}
          onTemplateChange={setLocalTemplate}
        />
      </Drawer>
    </div>
  )
}

export default Workspace
