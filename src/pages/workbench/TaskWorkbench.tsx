import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Drawer, Modal, Progress, Row, Space, Tag, Typography, message } from 'antd'
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  InfoCircleOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useTaskRunnerStore, type TaskStep, type TaskRunStatus } from '@/store/task-runner'
import { useTaskStore } from '@/store/task'
import type { TaskState } from '@/types/frontend-types'
import { ENV } from '@/config/env'
import TaskConfigForm, { type CreateTaskFormValues } from '@/components/TaskConfigForm'
import './task-workbench.css'

const tips = ['正在准备模型资源...', '数据加速处理中...', '稍后即可进入结果区。', '可切换页面，任务会在后台持续运行。']

const getStepIcon = (status: TaskStep['status']) => {
  if (status === 'success') return <CheckCircleFilled style={{ color: '#52c41a' }} />
  if (status === 'processing') return <LoadingOutlined style={{ color: '#1677ff' }} />
  if (status === 'paused') return <PauseCircleOutlined style={{ color: '#8c8c8c' }} />
  if (status === 'failed') return <CloseCircleFilled style={{ color: '#ff4d4f' }} />
  return <ClockCircleOutlined style={{ color: '#bfbfbf' }} />
}

const TaskWorkbench = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tasks, ensureTask, startTask, pauseTask, resumeTask, abortTask, deleteTask, updateFromServer } = useTaskRunnerStore()
  const { fetchStatus, fetchDetail, currentTask } = useTaskStore()
  const task = id ? tasks[id] : undefined
  const [tip, setTip] = useState(tips[0])
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [nowTs, setNowTs] = useState(() => Date.now())

  useEffect(() => {
    if (!id) return
    ensureTask(id)
  }, [id, ensureTask])

  useEffect(() => {
    if (!id) return
    fetchDetail(id)
  }, [id, fetchDetail])
  const mapBackendStatus = (state?: TaskState): TaskRunStatus => {
    if (!state) return 'PENDING'
    if (state === 'success' || state === 'partial_success') return 'SUCCESS'
    if (state === 'failed') return 'FAILED'
    if (state === 'pending' || state === 'queued') return 'PENDING'
    return 'PROCESSING'
  }

  useEffect(() => {
    if (!id || !task) return
    if (ENV.ENABLE_MOCK && task.status === 'PENDING') {
      startTask(id)
    }
  }, [id, task, startTask])
  useEffect(() => {
    if (!id || ENV.ENABLE_MOCK) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetchStatus(id)
        if (cancelled) return
        updateFromServer(id, {
          status: mapBackendStatus(res.state),
          progress: res.progress ?? 0,
          etaSeconds: res.estimated_time ?? task?.etaSeconds ?? 0,
        })
      } catch {
        // keep last state on polling errors
      }
    }
    poll()
    const timer = window.setInterval(poll, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [id, fetchStatus, updateFromServer, task?.etaSeconds])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTip(tips[Math.floor(Math.random() * tips.length)])
    }, 4500)
    return () => window.clearInterval(timer)
  }, [])

  const currentStep = useMemo(() => {
    if (!task) return null
    return (
      task.steps.find((step) => step.status === 'processing' || step.status === 'paused' || step.status === 'failed') ||
      task.steps.find((step) => step.status === 'pending') ||
      null
    )
  }, [task])

  const hintText = task?.status === 'PROCESSING' && currentStep ? `正在${currentStep.title}...` : tip

  const audioDurationSec = useMemo(() => {
    const detail = currentTask as (typeof currentTask & { duration?: number; audio_duration?: number }) | null
    const raw = detail?.duration ?? detail?.audio_duration ?? 0
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  }, [currentTask])

  const taskStartAt = useMemo(() => {
    const createdAt = currentTask?.created_at
    if (!createdAt) return null
    const ts = Date.parse(createdAt)
    return Number.isNaN(ts) ? null : ts
  }, [currentTask?.created_at])

  const expectedSeconds = useMemo(() => Math.max(0, Math.round(audioDurationSec * 0.25)), [audioDurationSec])

  useEffect(() => {
    if (!taskStartAt || !expectedSeconds) return
    if (task?.status !== 'PROCESSING') return
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [task?.status, taskStartAt, expectedSeconds])

  const remainingSeconds = useMemo(() => {
    if (!taskStartAt || !expectedSeconds) return 0
    const elapsed = Math.floor((nowTs - taskStartAt) / 1000)
    return Math.max(0, expectedSeconds - elapsed)
  }, [taskStartAt, expectedSeconds, nowTs])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.max(0, seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  const expectedFinishTime =
    taskStartAt && expectedSeconds > 0 ? formatTime(taskStartAt + expectedSeconds * 1000) : '--:--'

  const getStepDetail = (step: TaskStep, index: number) => {
    const fileName = task?.fileNames?.[index] || task?.fileNames?.[0] || '音频片段'
    if (step.status === 'processing') {
      return `正在处理：${fileName}`
    }
    if (step.status === 'paused') {
      return '任务已暂停，等待继续'
    }
    if (step.status === 'success') {
      return '已完成'
    }
    if (step.status === 'failed') {
      return '处理中止'
    }
    return '等待上一步完成'
  }

  const canPause = task?.status === 'PROCESSING'
  const canResume = task?.status === 'PAUSED'
  const showAbort = task?.status === 'PROCESSING' || task?.status === 'PAUSED' || task?.status === 'PENDING'
  const showResult = task?.status === 'SUCCESS'
  const showDelete = task?.status && task.status !== 'PROCESSING' && task.status !== 'SUCCESS'

  const handleAbort = () => {
    if (!id) return
    Modal.confirm({
      title: '确认中止任务？',
      content: '任务将立即停止，状态标记为失败，可在列表中查看记录。',
      okText: '确认中止',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => abortTask(id),
    })
  }

  const handleDelete = () => {
    if (!id) return
    Modal.confirm({
      title: '确认删除任务？',
      content: '任务记录将被清理并返回列表页。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteTask(id)
        navigate('/tasks')
      },
    })
  }

  const handleRegenerate = (values: CreateTaskFormValues) => {
    console.log('Regenerate with values:', values)
    message.loading({ content: '正在重新提交任务...', key: 'regenerate' })
    setTimeout(() => {
      message.success({ content: '任务已重新提交', key: 'regenerate' })
      setConfigDrawerOpen(false)
      // Mock restarting the task
      if (id && ENV.ENABLE_MOCK) startTask(id)
    }, 1000)
  }

  const initialConfigValues: Partial<CreateTaskFormValues> = useMemo(() => {
    if (!task) return {}
    return {
      meeting_type: task.config.meetingType,
      output_language: task.config.outputLanguage,
      asr_languages: task.config.asrLanguages,
      skip_speaker_recognition: false,
      description: '',
    }
  }, [task])

  return (
    <div className="workbench">
      <div className="workbench__container">
        <div className="workbench__header">
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              任务进度
            </Typography.Title>
            <Typography.Text type="secondary">{task?.title || '正在加载任务信息...'}</Typography.Text>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>
              返回列表 / 后台运行
            </Button>
          </Space>
        </div>

        <Card className="workbench__progress" bordered={false}>
          <Progress percent={Math.round(task?.progress || 0)} status={task?.status === 'FAILED' ? 'exception' : 'active'} />
          <Typography.Text className="workbench__hint" type="secondary">
            {hintText}
          </Typography.Text>
          <div className="workbench__control">
            <Space>
              {canPause && (
                <Button icon={<PauseOutlined />} onClick={() => id && pauseTask(id)}>
                  暂停
                </Button>
              )}
              {canResume && (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => id && resumeTask(id)}>
                  继续
                </Button>
              )}
              {showAbort && (
                <Button danger icon={<StopOutlined />} onClick={handleAbort}>
                  中止
                </Button>
              )}
              {showResult && (
                <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => id && navigate(`/workspace/${id}`)}>
                  查看结果
                </Button>
              )}
              {showDelete && (
                <Button icon={<DeleteOutlined />} onClick={handleDelete}>
                  删除
                </Button>
              )}
            </Space>
            <Tag color={task?.status === 'SUCCESS' ? 'green' : task?.status === 'FAILED' ? 'red' : 'blue'}>
              {task?.status || 'PENDING'}
            </Tag>
          </div>
        </Card>

        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} md={16} className="workbench__col">
            <Card title="执行环节" className="workbench__steps workbench__card" bordered={false}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {task?.steps.map((step, index) => (
                  <div key={step.id} className={`workbench__step workbench__step--${step.status}`}>
                    <div className="workbench__step-icon">{getStepIcon(step.status)}</div>
                    <div className="workbench__step-content">
                      <Typography.Text strong={step.status === 'processing'}>
                        {index + 1}. {step.title}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="workbench__step-sub">
                        {step.status === 'success'
                          ? '已完成'
                          : step.status === 'processing'
                            ? '执行中...'
                            : step.status === 'paused'
                              ? '已暂停'
                              : step.status === 'failed'
                                ? '已中止'
                                : '待开始'}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="workbench__step-detail">
                        {getStepDetail(step, index)}
                      </Typography.Text>
                    </div>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={8} className="workbench__col">
            <Card
              title={
                <Space>
                  <InfoCircleOutlined />
                  实时情报
                </Space>
              }
              className="workbench__info workbench__card"
              bordered={false}
            >
              <div className="workbench__info-section">
                <Typography.Text type="secondary">进度预估</Typography.Text>
                <div className="workbench__info-item">
                  <Typography.Text type="secondary">预期完成时间</Typography.Text>
                  <Typography.Text>{expectedFinishTime}</Typography.Text>
                </div>
                <div className="workbench__info-item">
                  <Typography.Text type="secondary">剩余时间</Typography.Text>
                  <Typography.Text>{expectedSeconds ? formatDuration(remainingSeconds) : '--:--'}</Typography.Text>
                </div>
              </div>
              <div className="workbench__info-section">
                <Typography.Text type="secondary">任务配置快照</Typography.Text>
                <div className="workbench__info-item">
                  <Typography.Text type="secondary">模板</Typography.Text>
                  <Typography.Text>{task?.config.templateName || '未指定'}</Typography.Text>
                </div>
                <div className="workbench__info-item">
                  <Typography.Text type="secondary">输出语言</Typography.Text>
                  <Typography.Text>{task?.config.outputLanguage || '--'}</Typography.Text>
                </div>
                <div className="workbench__info-item">
                  <Typography.Text type="secondary">识别语言</Typography.Text>
                  <Typography.Text>{task?.config.asrLanguages?.length ? task.config.asrLanguages.join(' / ') : '自动'}</Typography.Text>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        
      </div>
      <Drawer
        title="重新生成任务配置"
        width={600}
        onClose={() => setConfigDrawerOpen(false)}
        open={configDrawerOpen}
        styles={{ body: { paddingBottom: 80 } }}
      >
        <TaskConfigForm
          initialValues={initialConfigValues}
          onFinish={handleRegenerate}
          submitText="确认并重新生成"
        />
      </Drawer>
    </div>
  )
}

export default TaskWorkbench
