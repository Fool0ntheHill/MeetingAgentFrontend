import { useEffect, useRef, useState } from 'react'
import type VditorType from 'vditor'
import 'vditor/dist/index.css'

interface Props {
  value: string
  onChange?: (val: string) => void
  readonly?: boolean
  height?: number
}

const MarkdownEditor = ({ value, onChange, readonly = false, height = 320 }: Props) => {
  const elRef = useRef<HTMLDivElement>(null)
  const instance = useRef<VditorType | null>(null)
  const [ready, setReady] = useState(false)

  // 初始化或依赖变化时重建编辑器
  useEffect(() => {
    const load = async () => {
      const Vditor = (await import('vditor')).default
      instance.current = new Vditor(elRef.current as HTMLDivElement, {
        height,
        cache: { enable: false },
        toolbarConfig: { hide: readonly },
        after: () => {
          if (value) instance.current?.setValue(value)
          setReady(true)
        },
        input: (val) => onChange?.(val),
        mode: 'ir',
        preview: { hljs: { lineNumber: true } },
        upload: {
          accept: 'image/*',
          // 占位校验，实际上传需接后端
          filename: () => 'image',
        },
        readOnly: readonly,
      })
    }
    load()
    return () => {
      instance.current?.destroy()
      instance.current = null
    }
  }, [height, onChange, readonly, value])

  useEffect(() => {
    if (ready) {
      instance.current?.setValue(value)
    }
  }, [value, ready])

  return <div ref={elRef} />
}

export default MarkdownEditor
