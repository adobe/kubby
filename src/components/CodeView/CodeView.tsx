/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { useEffect, useState, useMemo } from 'preact/hooks'
import { codeToHtml } from 'shiki'
import classes from './CodeView.module.scss'

interface CodeViewProps {
  code: string
  language: 'yaml' | 'json'
  highlightText?: string
}

/**
 * Process Shiki HTML output to add highlight/muted classes to lines
 * Note: Uses global class names (lineHighlighted, lineMuted) defined in SCSS
 */
function processHtmlWithHighlight(html: string, highlightText: string): string {
  if (!highlightText.trim()) {
    return html
  }
  
  const lowerHighlight = highlightText.trim().toLowerCase()
  
  // Parse the HTML to find and modify .line spans
  // Shiki outputs: <span class="line">...</span> for each line
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const lines = doc.querySelectorAll('.line')
  
  lines.forEach(line => {
    const lineText = line.textContent?.toLowerCase() || ''
    if (lineText.includes(lowerHighlight)) {
      // Use global class names (not CSS module classes)
      line.classList.add('lineHighlighted')
      line.setAttribute('data-highlight-match', 'true')
    } else {
      line.classList.add('lineMuted')
    }
  })
  
  // Get the processed pre element (Shiki wraps everything in pre > code)
  const pre = doc.querySelector('pre')
  return pre?.outerHTML || html
}

/**
 * Syntax-highlighted code view using Shiki with optional text highlighting
 */
export function CodeView({ code, language, highlightText }: CodeViewProps) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    
    codeToHtml(code, {
      lang: language,
      theme: 'github-dark-default', // 'github-dark',
    }).then((result) => {
      if (!cancelled) {
        setHtml(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, language])

  // Process HTML to add highlight classes
  const processedHtml = useMemo(() => {
    if (!html) return null
    if (!highlightText?.trim()) return html
    return processHtmlWithHighlight(html, highlightText)
  }, [html, highlightText])

  if (!processedHtml) {
    // Show plain text while loading, with highlight support
    if (highlightText?.trim()) {
      const lowerHighlight = highlightText.trim().toLowerCase()
      const lines = code.split('\n')
      return (
        <pre class={classes.CodeView}>
          {lines.map((line, i) => {
            const isMatch = line.toLowerCase().includes(lowerHighlight)
            return (
              <span 
                key={i} 
                class={isMatch ? 'lineHighlighted' : 'lineMuted'}
                data-highlight-match={isMatch ? 'true' : undefined}
              >
                {line}{'\n'}
              </span>
            )
          })}
        </pre>
      )
    }
    return <pre class={classes.CodeView}>{code}</pre>
  }

  return (
    <div 
      class={classes.codeViewHighlighted} 
      dangerouslySetInnerHTML={{ __html: processedHtml }} 
    />
  )
}
