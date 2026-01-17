import { useEffect, useState, useMemo } from 'react'
import { Button, Card, Dropdown, Flex, Modal, Typography, message, Input, Select } from 'antd'
import type { MenuProps } from 'antd'
import { EllipsisOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTaskStore } from '@/store/task'
import { useFolderStore } from '@/store/folder'
import { renameTask, batchMoveTasks, batchDeleteTasks } from '@/api/tasks'
import StatusTag from '@/components/StatusTag'
import type { TaskDetailResponse } from '@/types/frontend-types'

type TimeField = 'created_at' | 'updated_at'
type SortOrder = 'asc' | 'desc'

const formatDuration = (seconds?: number | null) => {
  if (!seconds || Number.isNaN(seconds)) return '00:00:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const getDisplayTime = (task: TaskDetailResponse & { last_content_modified_at?: string }) => {
  const display = task.last_content_modified_at || task.completed_at || task.created_at
  return display ? new Date(display).toLocaleString() : '--'
}

const getSortValue = (task: TaskDetailResponse & { last_content_modified_at?: string }, field: TimeField) => {
  if (field === 'created_at') return task.created_at || ''
  // updated_at 列使用内容修改时间优先
  return task.last_content_modified_at || task.updated_at || task.completed_at || task.created_at || ''
}

const TaskList = () => {
  const { list, fetchList, fetchTrash, trash } = useTaskStore()
  const { folders, fetch: fetchFolders } = useFolderStore()
  const location = useLocation()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [timeField, setTimeField] = useState<TimeField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [headerHover, setHeaderHover] = useState(false)
  const navigate = useNavigate()

  const folderFilter = useMemo(() => new URLSearchParams(location.search).get('folder'), [location.search])
  const isTrash = useMemo(() => location.pathname.startsWith('/tasks/trash'), [location.pathname])

  useEffect(() => {
    fetchFolders()
  }, [fetchFolders])

  useEffect(() => {
    // 保持全量列表用于侧边栏统计；页面自身再做前端筛选
    fetchList({ limit: 200, offset: 0, include_deleted: false })
    if (isTrash) {
      fetchTrash({ limit: 200, offset: 0 })
    }
  }, [fetchList, fetchTrash, isTrash])

  const effectiveList = useMemo(() => {
    const base = isTrash ? trash : list
    return base
  }, [list, trash, isTrash])

  const filteredList = useMemo(() => {
    if (isTrash) return effectiveList
    if (!folderFilter) return effectiveList
    if (folderFilter === 'uncategorized') return effectiveList.filter((item) => !(item as { folder_id?: string }).folder_id)
    return effectiveList.filter((item) => (item as { folder_id?: string }).folder_id === folderFilter)
  }, [effectiveList, folderFilter, isTrash])

  const sortedList = useMemo(() => {
    const arr = [...filteredList]
    arr.sort((a, b) => {
      const ta = new Date(getSortValue(a as TaskDetailResponse, timeField)).getTime()
      const tb = new Date(getSortValue(b as TaskDetailResponse, timeField)).getTime()
      return sortOrder === 'desc' ? tb - ta : ta - tb
    })
    return arr
  }, [filteredList, timeField, sortOrder])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const folderMap = useMemo(() => {
    const map = new Map<string, string>()
    if (Array.isArray(folders)) {
      folders.forEach((f) => map.set(f.id, f.name))
    }
    return map
  }, [folders])

  const getFolderLabel = (item: TaskDetailResponse) => {
    const folderId = (item as { folder_id?: string | null }).folder_id || null
    if (!folderId) return '未分类'
    const folderPath = (item as { folder_path?: string }).folder_path
    return folderPath || folderMap.get(folderId) || folderId
  }

  const folderOptions = useMemo(() => {
    const opts = [{ value: 'uncategorized', label: '未分类' }]
    folders?.forEach((f) => opts.push({ value: f.id, label: f.name }))
    return opts
  }, [folders])

  const handleRename = (ids: string[]) => {
    const firstId = ids[0]
    const current = effectiveList.find((t) => t.task_id === firstId)
    let value = (current as { display_name?: string } | undefined)?.display_name || current?.task_id || ''
    Modal.confirm({
      title: ids.length > 1 ? '重命名（仅首个）' : '重命名',
      content: <Input defaultValue={value} onChange={(e) => (value = e.target.value)} />,
      onOk: async () => {
        if (!value) {
          message.warning('名称不能为空')
          return Promise.reject()
        }
        try {
          await renameTask(firstId, value)
          message.success('重命名成功')
          void fetchList({ limit: 200, offset: 0, include_deleted: false })
        } catch (error) {
          message.error('重命名失败，请稍后重试')
        }
      },
    })
  }

  const handleMove = (ids: string[]) => {
    let target = folderOptions[0]?.value ?? 'uncategorized'
    Modal.confirm({
      title: '移至文件夹',
      content: (
        <Select
          style={{ width: '100%' }}
          defaultValue={target}
          onChange={(v) => {
            target = v
          }}
          options={folderOptions}
        />
      ),
      onOk: async () => {
        const folderId = target === 'uncategorized' ? null : target
        try {
          await batchMoveTasks(ids, folderId)
          message.success('已移动')
          await Promise.all([
            fetchList({ limit: 200, offset: 0, include_deleted: false }),
            fetchFolders(),
          ])
        } catch (error) {
          message.error('移动失败，请稍后重试')
        }
      },
    })
  }

  const handleTrash = (ids: string[]) => {
    Modal.confirm({
      title: '移至回收站',
      content: `确定将选中的 ${ids.length} 条会话移至回收站吗？`,
      onOk: async () => {
        try {
          await batchDeleteTasks(ids)
          message.success('已移至回收站')
          clearSelection()
          void fetchList({ limit: 200, offset: 0, include_deleted: false })
          void fetchTrash({ limit: 200, offset: 0 })
        } catch (error) {
          clearSelection()
          message.error('移至回收站失败，请稍后重试')
        }
      },
    })
  }

  const rowMenu = (id: string): MenuProps => ({
    items: [
      { key: 'rename', icon: <EditOutlined />, label: '重命名' },
      { key: 'move', icon: <FolderOpenOutlined />, label: '移至文件夹' },
      { key: 'delete', icon: <DeleteOutlined />, label: '移至回收站' },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent?.stopPropagation()
      if (key === 'rename') handleRename([id])
      if (key === 'move') handleMove([id])
      if (key === 'delete') {
        handleTrash([id])
      }
    },
  })

  const toggleSort = (field: TimeField) => {
    if (timeField === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setTimeField(field)
      setSortOrder('desc')
    }
  }

  const renderSortLabel = (label: string, field: TimeField) => {
    const isActive = timeField === field
    const icon = sortOrder === 'desc' ? <DownOutlined /> : <UpOutlined />
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
          opacity: selected.size > 0 ? 0.3 : 1,
          fontWeight: selected.size > 0 ? 400 : 600,
        }}
        onClick={() => toggleSort(field)}
      >
        <span>{label}</span>
        {isActive ? icon : <DownOutlined style={{ opacity: 0.4 }} />}
      </div>
    )
  }

  const pageTitle = useMemo(() => {
    if (isTrash) return '回收站'
    if (folderFilter === 'uncategorized') return '未分类'
    if (folderFilter && folderMap.get(folderFilter)) return folderMap.get(folderFilter) as string
    if (folderFilter) return folderFilter
    return '全部任务'
  }, [folderFilter, folderMap, isTrash])

  return (
    <div className="page-container">
      <Typography.Title level={3} style={{ marginBottom: 12 }}>
        {pageTitle}
      </Typography.Title>

      <Card bodyStyle={{ padding: 0 }}>
        <div
          style={{
            display: selected.size > 0 ? 'none' : 'grid',
            gridTemplateColumns: '64px 2fr 1fr 1.1fr 1.1fr 1fr 0.5fr',
            padding: '14px 20px',
            color: '#666',
            fontSize: 14,
            minHeight: 48,
          }}
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
        >
          <div>
            <input
              type="checkbox"
              style={{ visibility: headerHover ? 'visible' : 'hidden' }}
              checked={selected.size > 0 && selected.size === filteredList.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelected(new Set(filteredList.map((i) => i.task_id)))
                } else {
                  clearSelection()
                }
              }}
            />
          </div>
          <div style={{ fontWeight: 600 }}>名称</div>
          <div style={{ fontWeight: 600 }}>时长</div>
          {renderSortLabel('创建时间', 'created_at')}
          {renderSortLabel('修改时间', 'updated_at')}
          <div style={{ fontWeight: 600 }}>文件夹</div>
          <div style={{ textAlign: 'right' }} />
        </div>
        {selected.size > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 2fr 1fr 1.1fr 1.1fr 1fr 0.5fr',
              padding: '14px 20px',
              alignItems: 'center',
              borderBottom: '1px solid #f0f0f0',
              minHeight: 48,
            }}
          >
            <div>
              <input
                type="checkbox"
                checked={selected.size === filteredList.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelected(new Set(filteredList.map((i) => i.task_id)))
                  } else {
                    clearSelection()
                  }
                }}
              />
            </div>
            <div style={{ gridColumn: '2 / span 1', color: '#666', fontSize: 14, fontWeight: 600 }}>
              <Typography.Text strong>已选（{selected.size}）</Typography.Text>
            </div>
            <div style={{ gridColumn: '3 / span 4', textAlign: 'left' }}>
              <Flex align="center" gap={12} justify="flex-start" wrap={false}>
                <Button
                  icon={<FolderOpenOutlined />}
                  size="small"
                  style={{ height: 30, paddingInline: 16 }}
                  onClick={() => handleMove(Array.from(selected))}
                >
                  移至文件夹
                </Button>
                <Button
                  icon={<EditOutlined />}
                  size="small"
                  style={{ height: 30, paddingInline: 16 }}
                  disabled={selected.size !== 1}
                  onClick={() => handleRename(Array.from(selected))}
                >
                  重命名
                </Button>
                <Button
                  icon={<DeleteOutlined />}
                  size="small"
                  style={{ height: 30, paddingInline: 16 }}
                  danger
                  onClick={() => handleTrash(Array.from(selected))}
                >
                  回收站
                </Button>
                <div style={{ flex: 1 }} />
                <Flex align="center" justify="flex-end" style={{ minWidth: 80 }}>
                  <Button type="link" size="small" style={{ height: 30, paddingInline: 6 }} onClick={clearSelection}>
                    取消
                  </Button>
                </Flex>
              </Flex>
            </div>
          </div>
        )}
        {sortedList.map((item) => {
          const checked = selected.has(item.task_id)
          const showCheckbox = checked || hoverId === item.task_id
          return (
            <div
              key={item.task_id}
              onMouseEnter={() => setHoverId(item.task_id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: 'grid',
                gridTemplateColumns: '64px 2fr 1fr 1.1fr 1.1fr 1fr 0.5fr',
                alignItems: 'center',
                padding: '16px 20px',
                borderTop: '1px solid #f0f0f0',
                background: checked ? '#f7f7f9' : 'white',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/tasks/${item.task_id}`)}
            >
              <div>
                <input
                  type="checkbox"
                  style={{ visibility: showCheckbox ? 'visible' : 'hidden' }}
                  checked={checked}
                  onChange={(e) => {
                    e.stopPropagation()
                    toggleSelect(item.task_id)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  {(item as { display_name?: string }).display_name || item.task_id}
                </Typography.Text>
                <div style={{ marginTop: 4 }}>
                  <StatusTag state={item.state} /> <Typography.Text type="secondary">{item.meeting_type}</Typography.Text>
                </div>
              </div>
              <div>
                <Typography.Text>{formatDuration((item as { duration?: number }).duration)}</Typography.Text>
              </div>
              <div>
                <Typography.Text>{item.created_at ? new Date(item.created_at).toLocaleString() : '--'}</Typography.Text>
              </div>
              <div>
                <Typography.Text>{getDisplayTime(item as TaskDetailResponse)}</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">
                  {getFolderLabel(item as TaskDetailResponse)}
                </Typography.Text>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Dropdown menu={rowMenu(item.task_id)} trigger={['click']}>
                  <Button type="text" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
                </Dropdown>
              </div>
            </div>
          )
        })}
        {!sortedList.length && (
          <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>暂无任务</div>
        )}
      </Card>
    </div>
  )
}

export default TaskList
