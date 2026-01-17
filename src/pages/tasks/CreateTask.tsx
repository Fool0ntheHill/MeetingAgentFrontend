import { useState } from 'react'
import {
  Button,
  Card,
  Col,
  Collapse,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined, PlusOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import type { UploadRequestOption as RcCustomRequestOptions } from 'rc-upload/lib/interface'
import { useNavigate } from 'react-router-dom'
import { uploadAudio } from '@/api/tasks'
import { useTaskStore } from '@/store/task'
import TemplateSelector from '@/components/TemplateSelector'
import type { CreateTaskRequest } from '@/types/frontend-types'

const audioTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/x-m4a', 'audio/webm']

const CreateTask = () => {
  const [form] = Form.useForm<CreateTaskRequest & { description?: string }>()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploadedPaths, setUploadedPaths] = useState<{ file_path: string; speaker_id: string }[]>([])
  const [templateModal, setTemplateModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>()
  const [uploading, setUploading] = useState(false)
  const navigate = useNavigate()
  const { createTask } = useTaskStore()

  const beforeUpload = (file: File) => {
    if (!audioTypes.includes(file.type)) {
      message.error('仅支持 wav/mp3/m4a/opus')
      return Upload.LIST_IGNORE
    }
    const sizeMb = file.size / 1024 / 1024
    if (sizeMb > 200) {
      message.error('单文件需小于 200MB')
      return Upload.LIST_IGNORE
    }
    return true
  }

  const customRequest = async ({ file, onSuccess, onError }: RcCustomRequestOptions) => {
    try {
      setUploading(true)
      const res = await uploadAudio(file as File)
      setUploadedPaths((prev) => [...prev, { file_path: res.file_path, speaker_id: `speaker_${prev.length + 1}` }])
      onSuccess?.(res as never)
    } catch (err) {
      onError?.(err as Error)
    } finally {
      setUploading(false)
    }
  }

  const onSubmit = async (values: CreateTaskRequest & { description?: string }) => {
    if (uploadedPaths.length === 0) {
      message.warning('请先上传音频文件')
      return
    }
    const payload: CreateTaskRequest = {
      ...values,
      audio_files: uploadedPaths,
      prompt_instance: selectedTemplate ? { template_id: selectedTemplate, parameters: {} } : undefined,
    }
    try {
      const res = await createTask(payload)
      message.success('任务创建成功')
      navigate(`/tasks/${res.task_id}`)
    } catch (err) {
      message.error((err as Error)?.message || '创建失败')
    }
  }

  return (
    <div className="page-container">
      <Typography.Title level={4}>创建任务</Typography.Title>
      <Typography.Paragraph type="secondary">
        支持多文件上传（wav/mp3/m4a/opus），最大 200MB，上传后返回 file_path 直接用于 /tasks。
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col span={16}>
          <Card title="音频上传" style={{ marginBottom: 16 }}>
            <Upload.Dragger
              multiple
              fileList={fileList}
              beforeUpload={beforeUpload}
              customRequest={customRequest}
              onChange={(info) => setFileList(info.fileList)}
              accept={audioTypes.join(',')}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">拖拽或点击上传</p>
              <p className="ant-upload-hint">支持多文件，顺序即 file_order；自动附带 speaker_id</p>
            </Upload.Dragger>
            <Space direction="vertical" style={{ marginTop: 12 }}>
              {uploadedPaths.map((f, idx) => (
                <Typography.Text key={f.file_path}>{`${idx + 1}. ${f.file_path} (${f.speaker_id})`}</Typography.Text>
              ))}
            </Space>
          </Card>
          <Card title="任务参数">
            <Form form={form} layout="vertical" initialValues={{ meeting_type: 'general', output_language: 'zh-CN' }} onFinish={onSubmit}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="meeting_type" label="会议类型" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { label: '通用会议', value: 'general' },
                        { label: '销售', value: 'sales' },
                        { label: '教育', value: 'education' },
                        { label: '医疗', value: 'medical' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="asr_language" label="ASR 语言">
                    <Select
                      allowClear
                      options={[
                        { label: '中英混合 (默认)', value: 'zh-CN+en-US' },
                        { label: '中文', value: 'zh-CN' },
                        { label: '英文', value: 'en-US' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="output_language" label="输出语言">
                    <Select
                      options={[
                        { label: '中文', value: 'zh-CN' },
                        { label: '英文', value: 'en-US' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="提示词模板">
                    <Space>
                      <Button onClick={() => setTemplateModal(true)} icon={<PlusOutlined />}>
                        选择模板
                      </Button>
                      {selectedTemplate && <Typography.Text type="success">已选：{selectedTemplate}</Typography.Text>}
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
              <Collapse
                items={[
                  {
                    key: 'advanced',
                    label: '高级选项',
                    children: (
                      <Space direction="vertical" style={{ width: '100%' }}>
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
              <Space style={{ marginTop: 16 }}>
                <Button type="primary" htmlType="submit" loading={uploading}>
                  创建任务
                </Button>
                <Button onClick={() => navigate('/tasks')}>返回列表</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="上传规范" style={{ marginBottom: 16 }}>
            <Space direction="vertical">
              <Typography.Text>- 支持 wav/mp3/m4a/opus</Typography.Text>
              <Typography.Text>- 单文件 ≤ 200MB</Typography.Text>
              <Typography.Text>- 返回 file_path 直接用于 /tasks</Typography.Text>
              <Typography.Text>- 429/413 将提示并停止</Typography.Text>
            </Space>
          </Card>
          <Card title="模板提示">
            <Typography.Paragraph>
              模板会作为 prompt_instance 传给后端，纪要生成时使用；重新生成会产生新版本，不覆盖旧版。
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
      <TemplateSelector
        open={templateModal}
        onClose={() => setTemplateModal(false)}
        onApply={(id) => {
          setSelectedTemplate(id)
          setTemplateModal(false)
        }}
      />
    </div>
  )
}

export default CreateTask
