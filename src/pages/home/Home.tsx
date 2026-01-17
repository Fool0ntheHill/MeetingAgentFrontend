import { Card, Col, Row, Typography, Tag, Space, Button, List, Skeleton } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTaskStore } from '@/store/task'
import { useTemplateStore } from '@/store/template'
import StatusTag from '@/components/StatusTag'
import type { TaskDetailResponse, PromptTemplate } from '@/types/frontend-types'

const latestNews = [
  { title: 'AI 纪要新版本发布', tag: '更新', time: '5 分钟前' },
  { title: '新增「销售跟进」模板', tag: '模板', time: '30 分钟前' },
  { title: '语音识别模型升级', tag: '系统', time: '1 小时前' },
]

const Home = () => {
  const navigate = useNavigate()
  const { list, loading, fetchList } = useTaskStore()
  const { templates, loading: tplLoading, fetchTemplates } = useTemplateStore()

  useEffect(() => {
    fetchList({ limit: 6, offset: 0 })
    fetchTemplates()
  }, [fetchList, fetchTemplates])

  const taskCards: Array<TaskDetailResponse | undefined> = loading ? Array.from({ length: 4 }) : list.slice(0, 4)
  const templateCards: Array<PromptTemplate | undefined> = tplLoading ? Array.from({ length: 4 }) : templates.slice(0, 4)

  return (
    <div className="page-container">
      <Typography.Title level={3} style={{ marginBottom: 16 }}>
        欢迎回来
      </Typography.Title>
      <Card
        title={
          <Space>
            <Typography.Text strong>查看会话</Typography.Text>
          </Space>
        }
        extra={
          <Button type="link" onClick={() => navigate('/tasks')}>
            前往任务 <ArrowRightOutlined />
          </Button>
        }
        style={{ borderRadius: 12, marginBottom: 16 }}
      >
        <Row gutter={12}>
          {taskCards.map((item, idx) => (
            <Col span={6} key={item?.task_id || idx}>
              <Card
                hoverable
                onClick={() => (item?.task_id ? navigate(`/tasks/${item.task_id}`) : undefined)}
                style={{ minHeight: 120 }}
              >
                {loading ? (
                  <Skeleton active paragraph={{ rows: 2 }} />
                ) : (
                  <>
                    <Typography.Text strong>{item?.task_id}</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      {item?.state && <StatusTag state={item.state} />}{' '}
                      <Typography.Text type="secondary">{item?.meeting_type}</Typography.Text>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                      更新时间：{item?.updated_at}
                    </Typography.Text>
                  </>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        title={<Typography.Text strong>提示词模板</Typography.Text>}
        extra={
          <Button type="link" onClick={() => navigate('/templates')}>
            前往模板 <ArrowRightOutlined />
          </Button>
        }
        style={{ borderRadius: 12, marginBottom: 16 }}
      >
        <Row gutter={12}>
          {templateCards.map((tpl, idx) => (
            <Col span={6} key={tpl?.template_id || idx}>
              <Card
                hoverable
                onClick={() => (tpl?.template_id ? navigate(`/templates?focus=${tpl.template_id}`) : undefined)}
                style={{ minHeight: 120 }}
              >
                {tplLoading ? (
                  <Skeleton active paragraph={{ rows: 2 }} />
                ) : (
                  <>
                    <Typography.Text strong>{tpl?.title}</Typography.Text>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginTop: 4, marginBottom: 0 }}>
                      {tpl?.description || '暂无描述'}
                    </Typography.Paragraph>
                  </>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="公告与更新" style={{ borderRadius: 12 }}>
        <List
          grid={{ gutter: 16, column: 3 }}
          dataSource={latestNews}
          renderItem={(item) => (
            <List.Item>
              <Card hoverable>
                <Space>
                  <Tag color="blue">{item.tag}</Tag>
                  <div>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <div style={{ fontSize: 12, color: '#999' }}>{item.time}</div>
                  </div>
                </Space>
              </Card>
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}

export default Home
