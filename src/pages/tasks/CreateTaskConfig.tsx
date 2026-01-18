import { useEffect, useRef, useState } from 'react'
import { Button, Card, Collapse, Form, Input, Select, Space, Switch, Typography, message } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import TemplateSelector from '@/components/TemplateSelector'
import { useCreateTaskDraftStore } from '@/store/createTaskDraft'
import { useTaskStore } from '@/store/task'
import { useTaskRunnerStore } from '@/store/task-runner'
import { ENV } from '@/config/env'
import type { CreateTaskRequest } from '@/types/frontend-types'
import './create-task.css'

interface CreateTaskForm {
  meeting_type: string
  output_language: string
  asr_languages?: string[]
  skip_speaker_recognition?: boolean
  description?: string
}

const meetingTypeOptions = [
  { label: '通用会议', value: 'general' },
  { label: '销售', value: 'sales' },
  { label: '教育', value: 'education' },
  { label: '医疗', value: 'medical' },
]

const outputLanguageOptions = [
  { label: '中文', value: 'zh-CN' },
  { label: '英文', value: 'en-US' },
  { label: '日文', value: 'ja-JP' },
  { label: '韩文', value: 'ko-KR' },
]

const asrLanguageOptions = [
  { label: '中文', value: 'zh-CN' },
  { label: '英文', value: 'en-US' },
  { label: '日文', value: 'ja-JP' },
  { label: '韩文', value: 'ko-KR' },
]

const CreateTaskConfig = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm<CreateTaskForm>()
  const [templateModal, setTemplateModal] = useState(false)
  const suppressGuardRef = useRef(false)
  const { createTask } = useTaskStore()
  const { ensureTask } = useTaskRunnerStore()
  const {
    uploads,
    meeting_type,
    output_language,
    asr_languages,
    skip_speaker_recognition,
    description,
    template,
    updateConfig,
    setTemplate,
    reset,
  } = useCreateTaskDraftStore()

  useEffect(() => {
    if (suppressGuardRef.current) {
      return
    }
    if (uploads.length === 0) {
      message.warning('请先上传音频文件')
      navigate('/tasks/create')
    }
  }, [uploads.length, navigate])

  useEffect(() => {
    form.setFieldsValue({
      meeting_type,
      output_language,
      asr_languages,
      skip_speaker_recognition,
      description,
    })
  }, [form, meeting_type, output_language, asr_languages, skip_speaker_recognition, description])

  const onSubmit = async (values: CreateTaskForm) => {
    if (uploads.length === 0) {
      message.warning('请先上传音频文件')
      navigate('/tasks/create')
      return
    }
    if (!template) {
      message.warning('请选择提示词模板')
      return
    }
    const asr_language = values.asr_languages && values.asr_languages.length > 0 ? values.asr_languages.join('+') : undefined
    const payload: CreateTaskRequest = {
      audio_files: uploads.map((item) => ({
        file_path: item.file_path,
        speaker_id: item.speaker_id,
      })),
      file_order: uploads.map((_, index) => index),
      meeting_type: values.meeting_type,
      output_language: values.output_language,
      asr_language,
      skip_speaker_recognition: values.skip_speaker_recognition,
      prompt_instance: template ? { template_id: template.template_id, parameters: {} } : undefined,
    }
    try {
      let taskId = ''
      if (ENV.ENABLE_MOCK) {
        try {
          const res = await createTask(payload)
          taskId = res.task_id
        } catch {
          taskId = `mock_${Date.now()}`
        }
      } else {
        const res = await createTask(payload)
        taskId = res.task_id
      }
      message.success('任务创建成功')
      suppressGuardRef.current = true
      ensureTask(taskId, {
        title: template?.title ? `处理任务 · ${template.title}` : `任务 ${taskId.slice(0, 6)}`,
        fileNames: uploads.map((item) => item.name),
        config: {
          templateName: template?.title,
          meetingType: values.meeting_type,
          outputLanguage: values.output_language,
          asrLanguages: values.asr_languages ?? [],
          modelVersion: 'v2.1',
          keywordMode: '自动抽取',
        },
      })
      navigate(`/tasks/${taskId}/workbench`)
      window.setTimeout(() => reset(), 0)
    } catch (err) {
      message.error((err as Error)?.message || '创建失败')
    }
  }

  return (
    <div className="page-container create-task">
      <div className="create-task__center">
        <Typography.Title level={3} className="create-task__title">
          选择配置
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="create-task__subtitle">
          模板、语言与高级设置可在此完成。确认模板后将返回本页显示选择结果。
        </Typography.Paragraph>
        <Card className="create-task__step-card" bordered={false}>
          <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            onValuesChange={(changed, all) => {
              updateConfig({
                meeting_type: all.meeting_type,
                output_language: all.output_language,
                asr_languages: all.asr_languages ?? [],
                skip_speaker_recognition: all.skip_speaker_recognition ?? false,
                description: all.description,
              })
            }}
          >
            <div className="create-task__config-grid">
              <Form.Item name="meeting_type" label="会议类型" rules={[{ required: true, message: '请选择会议类型' }]}>
                <Select options={meetingTypeOptions} />
              </Form.Item>
              <Form.Item name="output_language" label="输出语言" rules={[{ required: true, message: '请选择输出语言' }]}>
                <Select options={outputLanguageOptions} />
              </Form.Item>
            </div>
            <Form.Item label="提示词模板" required>
              <Space align="start">
                <Button onClick={() => setTemplateModal(true)} icon={<PlusOutlined />}>
                  选择模板
                </Button>
                {template && (
                  <div className="template-selected">
                    <Typography.Text>已选：</Typography.Text>
                    <Typography.Text strong>{template.title}</Typography.Text>
                  </div>
                )}
              </Space>
              <Form.Item name="template_id" rules={[{ required: true, message: '请选择提示词模板' }]} hidden>
                <Input />
              </Form.Item>
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const errors = form.getFieldError('template_id')
                  return errors.length ? <Typography.Text type="danger">{errors[0]}</Typography.Text> : null
                }}
              </Form.Item>
            </Form.Item>
            <Collapse
              items={[
                {
                  key: 'advanced',
                  label: '高级设置',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item name="asr_languages" label="会议转写语言">
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount={3}
                          placeholder="选择 1-2 种语言，自动拼接为识别语言"
                          options={asrLanguageOptions}
                        />
                      </Form.Item>
                      <Form.Item name="skip_speaker_recognition" label="跳过说话人识别" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item label="会议描述（可选）" name="description">
                        <Input.TextArea placeholder="将作为补充上下文传给模型" rows={3} />
                      </Form.Item>
                    </Space>
                  ),
                },
              ]}
            />
            <div className="create-task__step-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks/create/sort')}>
                上一步：排序
              </Button>
              <Button type="primary" htmlType="submit" icon={<CheckOutlined />}>
                确认并创建任务
              </Button>
            </div>
          </Form>
        </Card>
      </div>
      <TemplateSelector
        open={templateModal}
        onClose={() => setTemplateModal(false)}
        onApply={(tpl) => {
          setTemplate(tpl)
          form.setFieldsValue({ template_id: tpl.template_id })
          setTemplateModal(false)
          message.success(`已选择模板：${tpl.title}`)
        }}
      />
    </div>
  )
}

export default CreateTaskConfig
