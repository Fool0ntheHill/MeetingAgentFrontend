import { useEffect, useMemo, useState } from 'react'
import { Drawer, Input, Segmented, Card, Space, Button, Tag, Flex, Typography } from 'antd'
import { useTemplateStore } from '@/store/template'

interface Props {
  open: boolean
  onClose: () => void
  onApply: (templateId: string) => void
}

const TemplateSelector = ({ open, onClose, onApply }: Props) => {
  const { fetchTemplates, filtered, setKeyword, setFilter } = useTemplateStore()
  const [search, setSearch] = useState('')
  const data = useMemo(() => filtered(), [filtered])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  return (
    <Drawer title="选择提示词模板" width={720} open={open} onClose={onClose} destroyOnClose>
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
            title={tpl.title}
            style={{ width: 320 }}
            extra={<Tag color={tpl.is_system ? 'blue' : 'green'}>{tpl.is_system ? '官方' : '自定义'}</Tag>}
          >
            <Typography.Paragraph ellipsis={{ rows: 3 }}>{tpl.description || '暂无描述'}</Typography.Paragraph>
            <Space wrap>
              {tpl.supported_languages?.map((lang) => (
                <Tag key={lang}>{lang}</Tag>
              ))}
            </Space>
            <Button type="primary" block style={{ marginTop: 12 }} onClick={() => onApply(tpl.template_id)}>
              应用
            </Button>
          </Card>
        ))}
        {data.length === 0 && <Typography.Text type="secondary">暂无模板，可切换 Mock 或稍后重试</Typography.Text>}
      </Flex>
    </Drawer>
  )
}

export default TemplateSelector
