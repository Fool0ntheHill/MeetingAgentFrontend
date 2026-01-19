import { Button, Input, Popover, Tag, Typography } from 'antd'
import type { TranscriptParagraph } from '@/types/frontend-types'
import { EditOutlined, UserOutlined } from '@ant-design/icons'

interface TranscriptEditorProps {
  paragraphs: TranscriptParagraph[]
  currentTime: number
  onSeek: (time: number) => void
  onUpdateParagraph: (id: string, text: string) => void
  onRenameSpeaker: (from: string, to: string, scope: 'single' | 'global', pid?: string) => void
  readOnly?: boolean
}

const TranscriptEditor = ({
  paragraphs,
  currentTime,
  onSeek,
  onUpdateParagraph,
  onRenameSpeaker,
  readOnly = false
}: TranscriptEditorProps) => {
  // Format seconds to HH:MM:SS or MM:SS
  const formatTime = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds))
    const hrs = Math.floor(total / 3600)
    const mins = Math.floor((total % 3600) / 60)
    const secs = total % 60
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="workspace-transcript">
      <div className="workspace-transcript__list">
        {paragraphs.map((item) => {
          const isActive = currentTime >= item.start_time && currentTime < item.end_time

          return (
            <div key={item.paragraph_id} className={`workspace-transcript__item${isActive ? ' is-active' : ''}`}>
              <div className="workspace-transcript__meta">
                <button type="button" className="workspace-transcript__time" onClick={() => onSeek(item.start_time)}>
                  [{formatTime(item.start_time)}]
                </button>

                <Popover
                  trigger="click"
                  content={
                    <div className="workspace-transcript__popover">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          const newName = prompt('输入新名称', item.speaker)
                          if (newName && newName !== item.speaker) {
                            onRenameSpeaker(item.speaker, newName, 'single', item.paragraph_id)
                          }
                        }}
                      >
                        仅修改此处
                      </Button>
                      <Button
                        type="text"
                        size="small"
                        icon={<UserOutlined />}
                        onClick={() => {
                          const newName = prompt('输入新名称 (全局替换)', item.speaker)
                          if (newName && newName !== item.speaker) {
                            onRenameSpeaker(item.speaker, newName, 'global')
                          }
                        }}
                      >
                        全局重命名
                      </Button>
                    </div>
                  }
                >
                  <Tag color="geekblue" className="cursor-pointer m-0 hover:opacity-80">
                    {item.speaker}
                  </Tag>
                </Popover>
              </div>

              {readOnly ? (
                <Typography.Text className="workspace-transcript__text">
                  {item.text}
                </Typography.Text>
              ) : (
                <Input.TextArea
                  variant="borderless"
                  autoSize
                  value={item.text}
                  onChange={(e) => onUpdateParagraph(item.paragraph_id, e.target.value)}
                  className="workspace-transcript__input"
                  style={{ minHeight: 24 }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TranscriptEditor
