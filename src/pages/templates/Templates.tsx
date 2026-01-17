import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Flex, Input, Space, Tag, Typography, message, Modal, Form, Select } from 'antd'
import {
  FileTextOutlined,
  PlusOutlined,
  FileSearchOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { useTemplateStore } from '@/store/template'
import { useAuthStore } from '@/store/auth'
import type { PromptTemplate } from '@/types/frontend-types'

const Templates = () => {
  const { fetchTemplates, filtered, setFilter, setKeyword } = useTemplateStore()
  const data = filtered()
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [form] = Form.useForm()
  const { userId } = useAuthStore()

  useEffect(() => {
    fetchTemplates(userId, useAuthStore.getState().tenantId || undefined)
    setFilter('all')
    setKeyword('')
  }, [fetchTemplates, setFilter, setKeyword, userId])

  const [official, personal] = useMemo(() => {
    const officialList = data.filter((tpl) => tpl.is_system || tpl.scope === 'global')
    const personalList = data.filter((tpl) => !tpl.is_system && tpl.scope !== 'global')
    return [officialList, personalList]
  }, [data])

  const iconByType = (tpl: PromptTemplate) => {
    if (tpl.artifact_type?.includes('meeting')) return <FileTextOutlined />
    if (tpl.artifact_type?.includes('summary')) return <BulbOutlined />
    return <FileSearchOutlined />
  }

  const renderSection = (title: string, list: PromptTemplate[], emptyText: string) => (
    <div style={{ marginTop: 16 }}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 8 }}>
        <Space>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          <Tag color={title === '默认模板' ? 'blue' : 'green'}>{list.length}</Tag>
        </Space>
      </Flex>
      <Flex wrap="wrap" gap={12}>
        {list.map((tpl) => (
          <Card
            key={tpl.template_id}
            title={
              <Space>
                {iconByType(tpl)}
                <span>{tpl.title}</span>
              </Space>
            }
            style={{ width: 320 }}
            extra={<Tag color={tpl.is_system ? 'blue' : 'green'}>{tpl.is_system ? '官方' : '私人'}</Tag>}
            actions={[
              <Button type="link" onClick={() => message.info('应用模板占位')}>
                应用
              </Button>,
              <Button type="link" onClick={() => message.info('预览占位')}>
                预览
              </Button>,
            ]}
          >
            <Typography.Paragraph ellipsis={{ rows: 2 }}>{tpl.description || '暂无描述'}</Typography.Paragraph>
            <Space wrap>
              {tpl.supported_languages?.map((lang) => (
                <Tag key={lang}>{lang}</Tag>
              ))}
            </Space>
          </Card>
        ))}
        {list.length === 0 && <Typography.Text type="secondary">{emptyText}</Typography.Text>}
      </Flex>
    </div>
  )


  return (
    <div className="page-container">
      <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          模板广场
        </Typography.Title>
        <Space size="middle">
          <Input.Search
            placeholder="搜索模板"
            allowClear
            style={{ width: 240 }}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateOpen(true)}>
            创建模板
          </Button>
        </Space>
      </Flex>
      {renderSection('默认模板', official, '暂无默认模板')}
      {renderSection('私人模板', personal, '暂无私人模板')}
      {data.length === 0 && <Typography.Text type="secondary">暂无数据，检查后端或开启 Mock。</Typography.Text>}

      <Modal
        title="创建模板"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createLoading}
        onOk={async () => {
          try {
            const values = await form.validateFields()
            setCreateLoading(true)
            await useTemplateStore.getState().create({
              title: values.title,
              description: values.description,
              prompt_body: values.prompt_body,
              artifact_type: values.artifact_type,
              supported_languages: values.supported_languages,
              parameter_schema: {},
            }, userId || undefined)
            message.success('创建成功')
            setCreateOpen(false)
            form.resetFields()
            fetchTemplates(userId, useAuthStore.getState().tenantId || undefined)
          } catch (err) {
            if ((err as { errorFields?: unknown[] })?.errorFields) return
            message.error('创建失败，请稍后重试')
          } finally {
            setCreateLoading(false)
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="模板名称"
            name="title"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如：会议纪要（简洁版）" />
          </Form.Item>
          <Form.Item
            label="模板类型"
            name="artifact_type"
            rules={[{ required: true, message: '请选择模板类型' }]}
          >
            <Select
              options={[
                { label: '会议纪要', value: 'meeting_minutes' },
                { label: '摘要 / 笔记', value: 'summary_notes' },
                { label: '行动项', value: 'action_items' },
              ]}
            />
          </Form.Item>
          <Form.Item label="简介" name="description">
            <Input.TextArea placeholder="一句话说明使用场景" maxLength={200} showCount />
          </Form.Item>
          <Form.Item
            label="提示词内容"
            name="prompt_body"
            rules={[{ required: true, message: '请输入提示词内容' }]}
          >
            <Input.TextArea rows={4} placeholder="示例：请提取要点、行动项并标注责任人" />
          </Form.Item>
          <Form.Item
            label="支持语言"
            name="supported_languages"
            rules={[{ required: true, message: '请选择至少一种语言' }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="选择支持的语言"
              options={[
                { label: '中文 (zh-CN)', value: 'zh-CN' },
                { label: '英文 (en-US)', value: 'en-US' },
                { label: '日语 (ja-JP)', value: 'ja-JP' },
                { label: '韩语 (ko-KR)', value: 'ko-KR' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Templates
