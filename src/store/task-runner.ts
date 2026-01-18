import { create } from 'zustand'

export type TaskRunStatus = 'PENDING' | 'PROCESSING' | 'PAUSED' | 'SUCCESS' | 'FAILED'
export type StepStatus = 'pending' | 'processing' | 'paused' | 'success' | 'failed'

export interface TaskStep {
  id: string
  title: string
  status: StepStatus
}

export interface TaskConfigSnapshot {
  templateName?: string
  meetingType?: string
  outputLanguage?: string
  asrLanguages?: string[]
  modelVersion?: string
  keywordMode?: string
}

export interface TaskInsight {
  keywords: string[]
  summarySentences: number
}

export interface TaskRunInfo {
  taskId: string
  title: string
  status: TaskRunStatus
  progress: number
  steps: TaskStep[]
  fileNames: string[]
  config: TaskConfigSnapshot
  insights: TaskInsight
  etaSeconds: number
  resourceUsage: {
    cpu: number
    memory: number
  }
  updatedAt: number
}

interface TaskRunnerState {
  tasks: Record<string, TaskRunInfo>
  ensureTask: (taskId: string, meta?: Partial<Pick<TaskRunInfo, 'title' | 'fileNames' | 'config'>>) => void
  startTask: (taskId: string) => void
  pauseTask: (taskId: string) => void
  resumeTask: (taskId: string) => void
  abortTask: (taskId: string) => void
  deleteTask: (taskId: string) => void
  updateFromServer: (taskId: string, payload: Partial<TaskRunInfo>) => void
}

const STEP_TITLES = ['解析音频', '降噪与分段', '语音转写', '说话人识别', '生成纪要']
const TOTAL_SECONDS = 240
const KEYWORD_POOL = ['项目评审', '预算', '上线时间', '风险', '里程碑', '资源排期']

const timers = new Map<string, number>()

const buildSteps = (status: TaskRunStatus, progress: number): TaskStep[] => {
  const totalSteps = STEP_TITLES.length
  const stepSize = 100 / totalSteps
  const currentIndex = Math.min(totalSteps - 1, Math.floor(progress / stepSize))
  return STEP_TITLES.map((title, index) => {
    if (status === 'SUCCESS') return { id: `${index}`, title, status: 'success' }
    if (status === 'FAILED') {
      if (index < currentIndex) return { id: `${index}`, title, status: 'success' }
      if (index === currentIndex) return { id: `${index}`, title, status: 'failed' }
      return { id: `${index}`, title, status: 'pending' }
    }
    if (status === 'PAUSED') {
      if (index < currentIndex) return { id: `${index}`, title, status: 'success' }
      if (index === currentIndex) return { id: `${index}`, title, status: 'paused' }
      return { id: `${index}`, title, status: 'pending' }
    }
    if (status === 'PROCESSING') {
      if (index < currentIndex) return { id: `${index}`, title, status: 'success' }
      if (index === currentIndex) return { id: `${index}`, title, status: 'processing' }
      return { id: `${index}`, title, status: 'pending' }
    }
    return { id: `${index}`, title, status: 'pending' }
  })
}

const makeTask = (taskId: string, meta?: Partial<Pick<TaskRunInfo, 'title' | 'fileNames' | 'config'>>): TaskRunInfo => {
  const title = meta?.title || `任务 ${taskId.slice(0, 6)}`
  const fileNames = meta?.fileNames ?? []
  const config: TaskConfigSnapshot = {
    templateName: meta?.config?.templateName,
    meetingType: meta?.config?.meetingType,
    outputLanguage: meta?.config?.outputLanguage,
    asrLanguages: meta?.config?.asrLanguages,
    modelVersion: meta?.config?.modelVersion ?? 'v2.1',
    keywordMode: meta?.config?.keywordMode ?? '自动抽取',
  }
  return {
    taskId,
    title,
    status: 'PENDING',
    progress: 0,
    steps: buildSteps('PENDING', 0),
    fileNames,
    config,
    insights: {
      keywords: [],
      summarySentences: 0,
    },
    etaSeconds: TOTAL_SECONDS,
    resourceUsage: {
      cpu: 18 + Math.round(Math.random() * 22),
      memory: 1.1 + Math.round(Math.random() * 9) / 10,
    },
    updatedAt: Date.now(),
  }
}

const stopTimer = (taskId: string) => {
  const timer = timers.get(taskId)
  if (timer) {
    window.clearInterval(timer)
    timers.delete(taskId)
  }
}

const buildInsights = (progress: number): TaskInsight => {
  if (progress <= 0) {
    return { keywords: [], summarySentences: 0 }
  }
  const keywordCount = progress < 30 ? 2 : progress < 60 ? 3 : progress < 85 ? 4 : 5
  const summarySentences = Math.min(12, Math.max(2, Math.floor(progress / 8)))
  return {
    keywords: KEYWORD_POOL.slice(0, keywordCount),
    summarySentences,
  }
}

export const useTaskRunnerStore = create<TaskRunnerState>((set, get) => ({
  tasks: {},
  ensureTask: (taskId, meta) => {
    set((state) => {
      const existing = state.tasks[taskId]
      if (existing) {
        return {
          tasks: {
            ...state.tasks,
            [taskId]: {
              ...existing,
              title: meta?.title ?? existing.title,
              fileNames: meta?.fileNames ?? existing.fileNames,
              config: {
                ...existing.config,
                ...meta?.config,
              },
            },
          },
        }
      }
      return {
        tasks: {
          ...state.tasks,
          [taskId]: makeTask(taskId, meta),
        },
      }
    })
  },
  startTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task) return
    if (task.status === 'SUCCESS' || task.status === 'FAILED') return
    stopTimer(taskId)
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...task,
          status: 'PROCESSING',
          steps: buildSteps('PROCESSING', task.progress),
          insights: buildInsights(task.progress),
          updatedAt: Date.now(),
        },
      },
    }))
    const timer = window.setInterval(() => {
      const current = get().tasks[taskId]
      if (!current || current.status !== 'PROCESSING') return
      const delta = 1 + Math.random() * 3
      const nextProgress = Math.min(100, current.progress + delta)
      const nextStatus: TaskRunStatus = nextProgress >= 100 ? 'SUCCESS' : 'PROCESSING'
      const insights = buildInsights(nextProgress)
      set((state) => ({
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...current,
            status: nextStatus,
            progress: nextProgress,
            steps: buildSteps(nextStatus, nextProgress),
            insights,
            etaSeconds: Math.max(0, Math.round(((100 - nextProgress) / 100) * TOTAL_SECONDS)),
            updatedAt: Date.now(),
          },
        },
      }))
      if (nextProgress >= 100) {
        stopTimer(taskId)
      }
    }, 1200)
    timers.set(taskId, timer)
  },
  pauseTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task || task.status !== 'PROCESSING') return
    stopTimer(taskId)
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...task,
          status: 'PAUSED',
          steps: buildSteps('PAUSED', task.progress),
          updatedAt: Date.now(),
        },
      },
    }))
  },
  resumeTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task || task.status !== 'PAUSED') return
    get().startTask(taskId)
  },
  abortTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task) return
    stopTimer(taskId)
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...task,
          status: 'FAILED',
          steps: buildSteps('FAILED', task.progress),
          updatedAt: Date.now(),
        },
      },
    }))
  },
  deleteTask: (taskId) => {
    stopTimer(taskId)
    set((state) => {
      const next = { ...state.tasks }
      delete next[taskId]
      return { tasks: next }
    })
  },
  updateFromServer: (taskId, payload) => {
    set((state) => {
      const current = state.tasks[taskId]
      if (!current) return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...current,
            ...payload,
            updatedAt: Date.now(),
          },
        },
      }
    })
  },
}))
