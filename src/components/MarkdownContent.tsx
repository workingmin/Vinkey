import { Check, Copy } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  return <div className="message-code">
    <header><span>代码</span><button type="button" title={state === 'error' ? '复制失败，重试' : '复制代码'} aria-label="复制代码" onClick={() => {
      void navigator.clipboard.writeText(ref.current?.textContent ?? '').then(() => setState('copied')).catch(() => setState('error'))
    }}>{state === 'copied' ? <Check /> : <Copy />}</button></header>
    <pre ref={ref}>{children}</pre>
  </div>
}

export function MarkdownContent({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    table: ({ children }) => <div className="message-table" tabIndex={0}><table>{children}</table></div>,
  }}>{content}</ReactMarkdown>
}
