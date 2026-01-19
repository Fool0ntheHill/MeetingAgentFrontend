/* eslint-disable react-hooks/set-state-in-effect */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Button, Dropdown, Popover, Slider, Spin } from 'antd'
import {
  CaretRightFilled,
  PauseOutlined,
  DownOutlined,
  SoundOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons'

export interface AudioPlayerRef {
  seekTo: (time: number) => void
  play: () => void
  pause: () => void
}

interface AudioPlayerProps {
  url?: string
  onTimeUpdate?: (currentTime: number) => void
  onReady?: () => void
}

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

const JumpIcon = ({ direction }: { direction: 'back' | 'forward' }) => (
  <span className="workspace-audio__jump-icon">
    {direction === 'back' ? <UndoOutlined /> : <RedoOutlined />}
    <span className="workspace-audio__jump-label">15</span>
  </span>
)

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(({ url, onTimeUpdate, onReady }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurfer = useRef<WaveSurfer | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(80)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current || !url) {
      setIsLoading(false)
      setDuration(0)
      setCurrentTime(0)
      return
    }

    setIsLoading(true)
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#d9d9d9',
      progressColor: '#1677ff',
      cursorColor: '#1677ff',
      barWidth: 2,
      barGap: 3,
      barRadius: 2,
      height: 48,
      normalize: true,
      minPxPerSec: 50,
      url: url,
    })

    ws.on('ready', () => {
      setIsLoading(false)
      setDuration(ws.getDuration())
      ws.setVolume(volume / 100)
      onReady?.()
    })

    ws.on('audioprocess', (time) => {
      setCurrentTime(time)
      onTimeUpdate?.(time)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('interaction', (time) => {
      setCurrentTime(time)
      onTimeUpdate?.(time)
    })
    ws.on('finish', () => setIsPlaying(false))

    wavesurfer.current = ws

    return () => {
      ws.destroy()
    }
  }, [url, onReady, onTimeUpdate, volume])

  useEffect(() => {
    wavesurfer.current?.setVolume(volume / 100)
  }, [volume])

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (!wavesurfer.current) return
      wavesurfer.current.setTime(time)
      wavesurfer.current.play()
    },
    play: () => wavesurfer.current?.play(),
    pause: () => wavesurfer.current?.pause(),
  }))

  const togglePlay = () => {
    wavesurfer.current?.playPause()
  }

  const handleSpeedChange = (value: number) => {
    setPlaybackRate(value)
    wavesurfer.current?.setPlaybackRate(value)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="workspace-audio">
      <div className="workspace-audio__controls">
        <div className="workspace-audio__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        <div className="workspace-audio__center">
          <Button type="text" className="workspace-audio__jump" onClick={() => wavesurfer.current?.skip(-15)}>
            <JumpIcon direction="back" />
          </Button>
          <Button type="text" className="workspace-audio__play" onClick={togglePlay}>
            <span className="workspace-audio__play-icon">
              {isPlaying ? <PauseOutlined /> : <CaretRightFilled />}
            </span>
          </Button>
          <Button type="text" className="workspace-audio__jump" onClick={() => wavesurfer.current?.skip(15)}>
            <JumpIcon direction="forward" />
          </Button>
        </div>

        <div className="workspace-audio__right">
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ width: 120, padding: '4px 2px' }}>
                <Slider value={volume} onChange={(value) => setVolume(value)} />
              </div>
            }
          >
            <Button type="text" icon={<SoundOutlined />} className="workspace-audio__volume-btn" />
          </Popover>
          <Dropdown
            trigger={['click']}
            menu={{
              items: speeds.map((s) => ({ key: String(s), label: `${s}x` })),
              onClick: ({ key }) => handleSpeedChange(Number(key)),
            }}
          >
            <Button type="text" className="workspace-audio__rate-btn">
              <span className="workspace-audio__rate-text">{playbackRate}x</span>
              <DownOutlined className="workspace-audio__rate-icon" />
            </Button>
          </Dropdown>
        </div>
      </div>

      <div className="workspace-audio__wave">
        {isLoading && (
          <div className="workspace-audio__loading">
            <Spin size="small" />
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </div>
  )
})

AudioPlayer.displayName = 'AudioPlayer'

export default AudioPlayer
