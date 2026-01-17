import { Button, Card, Form, Input, Typography, Space, Alert } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useState } from 'react'

const Login = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loading } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  const onFinish = async (values: { username: string }) => {
    setError(null)
    try {
      await login(values.username)
      const redirect = ((location.state as { from?: string } | null)?.from) ?? '/tasks'
      navigate(redirect, { replace: true })
    } catch {
      setError('登录失败，请稍后重试')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <Card style={{ width: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <Typography.Title level={4} style={{ marginBottom: 8 }}>
          Meeting AI 登录
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          开发环境支持用户名直登；企业微信扫码（占位，Phase 2）
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '至少 3 个字符' },
            ]}
            initialValue="test_user"
          >
            <Input placeholder="任意英文/数字，自动创建用户" aria-label="username" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Button block disabled>
            企业微信扫码登录（占位，生产启用）
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Token 24 小时有效，过期自动跳转登录。
          </Typography.Text>
        </Space>
      </Card>
    </div>
  )
}

export default Login
