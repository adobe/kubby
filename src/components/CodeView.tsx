import { useEffect, useState } from 'preact/hooks'
import { codeToHtml } from 'shiki'
import classes from './CodeView.module.scss'

interface CodeViewProps {
  code: string
  language: 'yaml' | 'json'
}

/**
 * Syntax-highlighted code view using Shiki
 */
export function CodeView({ code, language }: CodeViewProps) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    
    codeToHtml(code, {
      lang: language,
      theme: 'dark-plus', // 'github-dark',
    }).then((result) => {
      if (!cancelled) {
        setHtml(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, language])

  if (!html) {
    // Show plain text while loading
    return <pre class={classes.CodeView}>{code}</pre>
  }

  return (
    <div 
      class={classes.codeViewHighlighted} 
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  )
}
