import { useState } from 'react'
import { Alert, Button, Card, Divider, Space, Typography, Upload, message } from 'antd'
import { ArrowRightOutlined, InboxOutlined } from '@ant-design/icons'
import type { UploadRequestOption as RcCustomRequestOptions } from 'rc-upload/lib/interface'
import { useNavigate } from 'react-router-dom'
import { uploadAudio } from '@/api/tasks'
import { useCreateTaskDraftStore } from '@/store/createTaskDraft'
import { ENV } from '@/config/env'
import './create-task.css'

const audioTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/x-m4a', 'audio/webm']
const maxSizeMb = 200

const readAudioDuration = (file: File) =>
  new Promise<number | null>((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    const url = URL.createObjectURL(file)
    const cleanup = () => {
      URL.revokeObjectURL(url)
    }
    audio.onloadedmetadata = () => {
      const value = Number.isFinite(audio.duration) ? audio.duration : null
      cleanup()
      resolve(value)
    }
    audio.onerror = () => {
      cleanup()
      resolve(null)
    }
    audio.src = url
  })

const CreateTask = () => {
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const { fileList, uploads, setFileList, addUpload, removeUpload, setUploadsWithFiles } = useCreateTaskDraftStore()

  const beforeUpload = (file: File) => {
    if (!audioTypes.includes(file.type)) {
      message.error('仅支持 wav/mp3/m4a/opus/webm')
      return Upload.LIST_IGNORE
    }
    const sizeMb = file.size / 1024 / 1024
    if (sizeMb > maxSizeMb) {
      message.error(`单文件需小于 ${maxSizeMb}MB`)
      return Upload.LIST_IGNORE
    }
    return true
  }

  const customRequest = async ({ file, onSuccess, onError }: RcCustomRequestOptions) => {
    try {
      setUploading(true)
      const rawFile = file as File
      const [duration, res] = await Promise.all([readAudioDuration(rawFile), uploadAudio(rawFile)])
      const rcFile = file as { uid?: string; name?: string }
      const fallbackId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      addUpload({
        uid: rcFile.uid ?? rcFile.name ?? fallbackId,
        name: rcFile.name ?? '未命名文件',
        file_path: res.file_path,
        duration,
      })
      onSuccess?.(res as never)
    } catch (err) {
      onError?.(err as Error)
    } finally {
      setUploading(false)
    }
  }

  const onNext = () => {
    if (uploads.length === 0) {
      message.warning('请先上传音频文件')
      return
    }
    navigate('/tasks/create/sort')
  }

  const onSeedMock = () => {
    setUploadsWithFiles([
      {
        uid: `mock-${Date.now()}-1`,
        name: '需求评审-上半场.wav',
        file_path: 'mock/meeting_part1.wav',
        duration: 812,
      },
      {
        uid: `mock-${Date.now()}-2`,
        name: '需求评审-下半场.ogg',
        file_path: 'mock/meeting_part2.ogg',
        duration: 1045,
      },
    ])
    message.success('已注入示例音频，可继续体验后续步骤')
  }

  return (
    <div className="page-container create-task">
      <div className="create-task__center">
        <Typography.Title level={3} className="create-task__title">
          上传会议音频
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="create-task__subtitle">
          支持多文件上传，上传完成后可在下一步拖拽排序。我们会根据顺序自动生成说话人编号并拼接音频。
        </Typography.Paragraph>
        <Card className="create-task__card" bordered={false}>
          <Upload.Dragger
            multiple
            fileList={fileList}
            beforeUpload={beforeUpload}
            customRequest={customRequest}
            onChange={(info) => {
              setFileList(info.fileList)
              if (info.file.status === 'removed') {
                removeUpload(info.file.uid)
              }
            }}
            accept={audioTypes.join(',')}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">拖拽或点击上传</p>
            <p className="ant-upload-hint">支持多文件上传，单文件不超过 {maxSizeMb}MB</p>
          </Upload.Dragger>
          <Divider className="create-task__divider">上传小贴士</Divider>
          <Alert
            type="info"
            showIcon
            message="音频文件限制说明"
            description={
              <div className="create-task__tips">
                <Typography.Text>• 支持 wav/mp3/m4a/ogg/opus/webm，多文件可分段上传。</Typography.Text>
                <Typography.Text>• 单文件建议小于 {maxSizeMb}MB，超大文件可先分段。</Typography.Text>
                <Typography.Text>• 上传完成后可拖拽调整顺序，顺序即转写顺序。</Typography.Text>
                <Typography.Text>• 系统会按顺序自动拼接音频文件。</Typography.Text>
              </div>
            }
          />
          {ENV.ENABLE_MOCK && uploads.length === 0 && (
            <div style={{ marginTop: 12 }}>
              <Button onClick={onSeedMock}>使用示例数据体验后续流程</Button>
              <Typography.Text type="secondary" style={{ marginLeft: 12 }}>
                Mock 模式下上传接口不可用时可直接体验后续页面
              </Typography.Text>
            </div>
          )}
          {uploads.length > 0 && (
            <div className="create-task__uploads">
              <Typography.Text type="secondary">已上传 {uploads.length} 个文件</Typography.Text>
              <div className="create-task__upload-list">
                {uploads.map((item, index) => (
                  <div key={item.uid} className="create-task__upload-item">
                    <Typography.Text>{`${index + 1}. ${item.name}`}</Typography.Text>
                    <Typography.Text type="secondary">{item.speaker_id}</Typography.Text>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Space className="create-task__actions">
            <Button type="primary" icon={<ArrowRightOutlined />} onClick={onNext} loading={uploading}>
              下一步：排序音频
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  )
}

export default CreateTask
