import { Fragment, memo, type ReactNode } from 'react'
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { PhrasingContent, RootContent } from 'mdast'

type MarkdownNode = RootContent | PhrasingContent

function safeLink(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

function render(node: MarkdownNode): ReactNode {
  if (node.type === 'listItem') {
    const [first, ...rest] = node.children
    const text = first?.type === 'paragraph' ? first.children[0] : undefined
    const task = text?.type === 'text' ? /^\[([ xX])\](?:\s+|$)/.exec(text.value) : null
    if (task && first?.type === 'paragraph' && text?.type === 'text') {
      const label = { ...first, children: [{ ...text, value: text.value.slice(task[0].length) }, ...first.children.slice(1)] }
      const checked = task[1].toLowerCase() === 'x'
      return <li className="sb-markdown-task">
        <input type="checkbox" checked={checked} disabled aria-label={checked ? 'Completed task' : 'Open task'} />
        <div>{render(label)}{rest.map((child, index) => <Fragment key={index}>{render(child)}</Fragment>)}</div>
      </li>
    }
  }
  const children = 'children' in node ? node.children.map((child, i) => (
    <Fragment key={i}>{render(child)}</Fragment>
  )) : null

  switch (node.type) {
    case 'paragraph': return <p className="whitespace-pre-wrap">{children}</p>
    case 'heading': return <h3 className="font-bold">{children}</h3>
    case 'text': return node.value
    case 'strong': return <strong>{children}</strong>
    case 'emphasis': return <em>{children}</em>
    case 'inlineCode': return <code className="rounded bg-black/8 px-1 text-[0.9em]">{node.value}</code>
    case 'code': return <pre className="overflow-x-auto rounded bg-black/8 p-2"><code>{node.value}</code></pre>
    case 'list': return node.ordered
      ? <ol start={node.start ?? undefined} className="list-decimal pl-5">{children}</ol>
      : <ul className="list-disc pl-5">{children}</ul>
    case 'listItem': return <li>{children}</li>
    case 'blockquote': return <blockquote className="border-l-2 border-current/30 pl-3">{children}</blockquote>
    case 'thematicBreak': return <hr className="border-current/20" />
    case 'break': return <br />
    case 'link': {
      const href = safeLink(node.url)
      return href ? <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a> : children
    }
    case 'html': return node.value
    case 'image':
    case 'imageReference': return node.alt
    case 'definition': return null
    default: return children
  }
}

export const BoardMarkdown = memo(function BoardMarkdown({ source }: { source: string }) {
  return (
    <div className="space-y-2 break-words [overflow-wrap:anywhere]">
      {fromMarkdown(source).children.map((node, i) => <Fragment key={i}>{render(node)}</Fragment>)}
    </div>
  )
})
