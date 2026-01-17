/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Flex,
  Input,
  List,
  Row,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { AudioOutlined, EditOutlined, ExportOutlined, RedoOutlined, SendOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useTaskStore } from '@/store/task'
import { useArtifactStore } from '@/store/artifact'
import { correctSpeakers, correctTranscript } from '@/api/tasks'
import MarkdownEditor from '@/components/MarkdownEditor'
import { sanitizeHtml } from '@/utils/sanitize'

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

const Workspace = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const audioRef = useRef<HTMLAudioElement>(null)
  const { fetchDetail, currentTask, fetchTranscript, transcript } = useTaskStore()
  const { fetchList, fetchDetail: fetchArtifactDetail, list, parsedContent, regenerate } = useArtifactStore()
  const [paragraphs, setParagraphs] = useState(transcript?.paragraphs || [])
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({})
  const [activeArtifact, setActiveArtifact] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [markdown, setMarkdown] = useState<string>('')
  const [feedback, setFeedback] = useState('')
  const [allowTrain, setAllowTrain] = useState(false)

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
    }
  }, [transcript])

  useEffect(() => {
    if (parsedContent) {
      setMarkdown(renderMinutes(parsedContent))
    }
  }, [parsedContent])

  const artifactTabs = useMemo(() => {
    if (!list) return []
    const entries = Object.values(list.artifacts_by_type).flat()
    return entries.map((item) => ({
      key: item.artifact_id,
      label: `${item.artifact_type} v${item.version}`,
      artifact: item,
    }))
  }, [list])

  const handleSpeakerRename = (from: string, to: string, scope: 'single' | 'global', pid?: string) => {
    if (scope === 'single' && pid) {
      setParagraphs((prev) => prev.map((p) => (p.paragraph_id === pid ? { ...p, speaker: to } : p)))
    } else {
      setSpeakerMap((prev) => ({ ...prev, [from]: to }))
      setParagraphs((prev) => prev.map((p) => (p.speaker === from ? { ...p, speaker: to } : p)))
    }
  }

  const handleSaveTranscript = async () => {
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
  }

  const handleRegenerate = async () => {
    if (!id) return
    try {
      const res = await regenerate(id, { prompt_instance: { template_id: 'tmpl_rec_1' } })
      message.success(`已重新生成，版本 v${res.version}`)
      await fetchList(id)
    } catch (err) {
      message.error((err as Error)?.message || '重新生成失败')
    }
  }

  return (
    <div className="page-container">
      <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          人机协同工作台
        </Typography.Title>
        <Space>
          <Button onClick={() => navigate(`/tasks/${id}`)}>返回任务</Button>
          <Button icon={<RedoOutlined />} onClick={handleRegenerate}>
            重新生成（新版本）
          </Button>
          <Button icon={<ExportOutlined />} disabled>
            导出（占位）
          </Button>
        </Space>
      </Flex>
      <Row gutter={12}>
        <Col span={12}>
          <Card
            title={
              <Space>
                <AudioOutlined />
                事实层 · 音频 & 逐字稿
              </Space>
            }
            extra={
              <Space>
                <Button size="small" onClick={handleSaveTranscript} icon={<SendOutlined />}>
                  保存修正
                </Button>
              </Space>
            }
          >
            <audio
              ref={audioRef}
              controls
              style={{ width: '100%', marginBottom: 8 }}
              src={currentTask?.audio_files?.[0] || 'https://www.w3schools.com/html/horse.mp3'}
            />
            <List
              dataSource={paragraphs}
              renderItem={(item) => (
                <List.Item
                  key={item.paragraph_id}
                  actions={[
                    <Button size="small" type="link" onClick={() => handleSpeakerRename(item.speaker, `${item.speaker}*`, 'single', item.paragraph_id)}>
                      仅此处改名
                    </Button>,
                    <Button size="small" type="link" onClick={() => handleSpeakerRename(item.speaker, `${item.speaker}*`, 'global')}>
                      全局改名
                    </Button>,
                  ]}
                  style={{ alignItems: 'flex-start' }}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => audioRef.current && (audioRef.current.currentTime = item.start_time)}>
                          {Math.round(item.start_time)}s
                        </Tag>
                        <Tag color="geekblue">{item.speaker}</Tag>
                      </Space>
                    }
                    description={
                      <Input.TextArea
                        value={item.text}
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        onChange={(e) =>
                          setParagraphs((prev) =>
                            prev.map((p) => (p.paragraph_id === item.paragraph_id ? { ...p, text: e.target.value } : p))
                          )
                        }
                      />
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title={
              <Space>
                <EditOutlined />
                智能层 · 纪要版本
              </Space>
            }
            extra={
              <Space>
                <Button size="small" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
                  {mode === 'edit' ? '切换预览' : '手动编辑'}
                </Button>
              </Space>
            }
          >
            <Tabs
              activeKey={activeArtifact}
              onChange={(key) => {
                setActiveArtifact(key)
                fetchArtifactDetail(key)
              }}
              items={artifactTabs.map((tab) => ({
                key: tab.key,
                label: tab.label,
              }))}
            />
            {artifactTabs.length === 0 && <Alert message="无纪要版本，点击重新生成创建" type="info" />}
            {mode === 'preview' ? (
              <div
                style={{ minHeight: 320 }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdown ? markdown.replace(/\n/g, '<br/>') : '') }}
              />
            ) : (
              <MarkdownEditor value={markdown} onChange={setMarkdown} />
            )}
            <Alert
              style={{ marginTop: 12 }}
              message="溯源、导出、对比功能占位，后续接入 Grounding Metadata。"
              type="warning"
              showIcon
            />
          </Card>
          <Card title="反馈与隐私" style={{ marginTop: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea
                value={feedback}
                placeholder="填写对本次纪要/转写的反馈"
                onChange={(e) => setFeedback(e.target.value)}
              />
              <Checkbox checked={allowTrain} onChange={(e) => setAllowTrain(e.target.checked)}>
                允许 AI 学习本次修正（默认关闭）
              </Checkbox>
              <Button type="primary" disabled={!feedback}>
                提交反馈（占位）
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Workspace
