import { useEffect, useState } from 'react'
import { Button, Collapse, Form, Input, Select, Space, Switch, Typography, message } from 'antd'
import { CheckOutlined, PlusOutlined } from '@ant-design/icons'
import TemplateSelector from '@/components/TemplateSelector'
import type { Template } from '@/store/template'

export interface CreateTaskFormValues {
  meeting_type: string
  output_language: string
  asr_languages?: string[]
  skip_speaker_recognition?: boolean
  description?: string
  template_id?: string
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

interface TaskConfigFormProps {
  initialValues?: Partial<CreateTaskFormValues>
  onFinish: (values: CreateTaskFormValues) => void
  onValuesChange?: (changed: Partial<CreateTaskFormValues>, all: CreateTaskFormValues) => void
  submitText?: string
  renderExtraActions?: () => React.ReactNode
  templateOverride?: Template | null
  onTemplateChange?: (tpl: Template | null) => void
}

const TaskConfigForm = ({
  initialValues,
  onFinish,
  onValuesChange,
  submitText = '确认并创建任务',
  renderExtraActions,
  templateOverride,
  onTemplateChange,
}: TaskConfigFormProps) => {
  const [form] = Form.useForm<CreateTaskFormValues>()
  const [templateModal, setTemplateModal] = useState(false)
  
  // Use local state for template if not controlled/overridden
  const [localTemplate, setLocalTemplate] = useState<Template | null>(null)
  const activeTemplate = templateOverride !== undefined ? templateOverride : localTemplate
  
  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues)
    }
  }, [initialValues, form])

  const handleTemplateApply = (tpl: Template) => {
    if (onTemplateChange) {
      onTemplateChange(tpl)
    } else {
      setLocalTemplate(tpl)
    }
    form.setFieldsValue({ template_id: tpl.template_id })
    setTemplateModal(false)
    message.success(`已选择模板：${tpl.title}`)
  }

  return (
    <>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        onValuesChange={onValuesChange}
        initialValues={initialValues}
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
            {activeTemplate && (
              <div className="template-selected">
                <Typography.Text>已选：</Typography.Text>
                <Typography.Text strong>{activeTemplate.title}</Typography.Text>
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
        <div className="create-task__step-actions" style={{ marginTop: 24 }}>
          {renderExtraActions && renderExtraActions()}
          <Button type="primary" htmlType="submit" icon={<CheckOutlined />}>
            {submitText}
          </Button>
        </div>
      </Form>
      <TemplateSelector
        open={templateModal}
        onClose={() => setTemplateModal(false)}
        onApply={handleTemplateApply}
      />
    </>
  )
}

export default TaskConfigForm
