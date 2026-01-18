import { useEffect, useState } from 'react'
import { Button, Card, Flex, Input, Modal, Segmented, Space, Tag, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { useTemplateStore } from '@/store/template'
import type { PromptTemplate } from '@/types/frontend-types'
import './TemplateSelector.css'

interface Props {
  open: boolean
  onClose: () => void
  onApply: (template: PromptTemplate) => void
}

const TemplateSelector = ({ open, onClose, onApply }: Props) => {
  const { fetchTemplates, filtered, setKeyword, setFilter, templates, loading } = useTemplateStore()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const data = filtered()

  useEffect(() => {
    if (open) {
      fetchTemplates()
    }
  }, [fetchTemplates, open])

  const selectedTemplate = templates.find((tpl) => tpl.template_id === selectedId) || null
  const previewTemplate = templates.find((tpl) => tpl.template_id === previewId) || null
  const hasSelection = Boolean(selectedTemplate)

  const resetLocalState = () => {
    setSearch('')
    setSelectedId(null)
    setPreviewId(null)
    setKeyword('')
    setFilter('all')
  }

  const handleClose = () => {
    resetLocalState()
    onClose()
  }

  const handleConfirm = () => {
    if (!selectedTemplate) return
    onApply(selectedTemplate)
    resetLocalState()
  }

  return (
    <Modal
      title="选择提示词模板"
      width={1080}
      open={open}
      onCancel={handleClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" disabled={!hasSelection} onClick={handleConfirm}>
            确认模板
          </Button>
        </Space>
      }
    >
      <div className="template-selector">
        <div className="template-selector__list">
          <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
            <Input.Search
              placeholder="搜索名称/描述"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setKeyword(e.target.value)
              }}
            />
            <Segmented
              options={[
                { label: '全部', value: 'all' },
                { label: '官方', value: 'global' },
                { label: '我的/租户', value: 'tenant' },
              ]}
              onChange={(val) => setFilter(val as string)}
            />
          </Space>
          <Flex wrap="wrap" gap={12}>
            {data.map((tpl) => (
              <Card
                key={tpl.template_id}
                className={`template-card${selectedId === tpl.template_id ? ' template-card--selected' : ''}`}
                title={tpl.title}
                extra={<Tag color={tpl.is_system ? 'blue' : 'green'}>{tpl.is_system ? '官方' : '自定义'}</Tag>}
                onClick={() => {
                  setSelectedId(tpl.template_id)
                  setPreviewId(null)
                }}
              >
                <Typography.Paragraph ellipsis={{ rows: 3 }}>{tpl.description || '暂无描述'}</Typography.Paragraph>
                <Space wrap>
                  {tpl.supported_languages?.map((lang) => (
                    <Tag key={lang}>{lang}</Tag>
                  ))}
                </Space>
                <Button
                  className="template-card__preview-btn"
                  type="primary"
                  shape="circle"
                  icon={<EyeOutlined />}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedId(tpl.template_id)
                    setPreviewId(tpl.template_id)
                  }}
                />
              </Card>
            ))}
            {!loading && data.length === 0 && <Typography.Text type="secondary">暂无模板，可切换 Mock 或稍后重试</Typography.Text>}
          </Flex>
        </div>
        <div className="template-selector__preview">
          {previewTemplate ? (
            <div className="template-preview">
              <div className="template-preview__title">
                <Typography.Title level={4}>{previewTemplate.title}</Typography.Title>
                <Space wrap>
                  <Tag color={previewTemplate.is_system ? 'blue' : 'green'}>
                    {previewTemplate.is_system ? '官方' : '自定义'}
                  </Tag>
                  <Tag>{previewTemplate.artifact_type}</Tag>
                </Space>
              </div>
              <div className="template-preview__section">
                <Typography.Text type="secondary">说明</Typography.Text>
                <Typography.Paragraph>{previewTemplate.description || '暂无描述'}</Typography.Paragraph>
              </div>
              <div className="template-preview__section">
                <Typography.Text type="secondary">概览</Typography.Text>
                <ul className="template-preview__list">
                  <li>支持语言：{previewTemplate.supported_languages?.join(' / ') || '不限'}</li>
                  <li>作用域：{previewTemplate.scope || 'global'}</li>
                  <li>模板 ID：{previewTemplate.template_id}</li>
                </ul>
              </div>
              <div className="template-preview__section">
                <Typography.Text type="secondary">模板内容预览</Typography.Text>
                <div className="template-preview__content">
                  {previewTemplate.prompt_body || '暂无模板内容'}
                </div>
              </div>
            </div>
          ) : (
            <Typography.Text type="secondary">点击卡片右下角的眼睛图标即可预览模板内容。</Typography.Text>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default TemplateSelector
