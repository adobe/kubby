import { useEffect, useState, useRef, useCallback } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { VList, VListHandle } from 'virtua'
import classes from './LogViewer.module.scss'
import { Button } from '../../components/Button/Button.tsx'
import { Alert } from '../../components/Alert/Alert.tsx'
import { isControlModifierPressed } from '../../navigation/keyboardShortcuts.ts'

const MAX_LOG_LINES = 10_000
const LOG_BATCH_INTERVAL_MS = 50 // Batch log updates every 50ms to reduce re-renders

// Helper to escape HTML and prevent XSS
function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Keys that contain stack traces which should have \n and \t expanded
const STACK_TRACE_KEYS = ['stack_trace', 'stackTrace', 'stacktrace', 'exception', 'error_stack']

// Expand \n and \t in a stack trace string value (already HTML-escaped)
// Returns HTML with continuation lines wrapped in spans
function expandStackTraceEscapes(value: string, cls: { stackTraceLine: string }): string {
  // Split by literal \n (the escape sequence appears as \n in HTML)
  const lines = value.split(/\\n/)
  return lines.map((line, i) => {
    // Convert \t to 4 spaces for indentation
    const indented = line.replace(/\\t/g, '    ')
    if (i === 0) {
      return indented
    }
    // Continuation lines get a wrap marker (display: block handles line breaks)
    return `<span class="${cls.stackTraceLine}">${indented}</span>`
  }).join('') // No \n needed - display: block in CSS handles line breaks
}

// Log levels with their CSS class names
type LogLevel = 'FATAL' | 'ERROR' | 'WARN' | 'WARNING' | 'INFO' | 'DEBUG' | 'TRACE'

// Segment types for parsed log messages
type SegmentType = 'timestamp' | 'threadName' | 'level' | 'packageName' | 'json' | 'text'

interface BaseSegment {
  type: Exclude<SegmentType, 'level'>
  value: string
}

interface LevelSegment {
  type: 'level'
  value: string
  level: LogLevel
}

type LogSegment = BaseSegment | LevelSegment

// Quick heuristic to check if string looks like JSON
function looksLikeJson(text: string): boolean {
  const trimmed = text.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

// Parse log message into a list of segments
function parseLogMessageToSegments(text: string): LogSegment[] {
  const segments: LogSegment[] = []
  let remaining = text

  // for the case of single line JSON, just return the JSON as a single segment
  if (looksLikeJson(remaining)) {
    segments.push({ type: 'json', value: remaining })
    return segments
  }

  // 1. Try to match app timestamp at start: YYYY-MM-DD HH:MM:SS.mmm or similar
  const timestampMatch = remaining.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?)\s+/)
  if (timestampMatch) {
    segments.push({ type: 'timestamp', value: timestampMatch[1] })
    remaining = remaining.slice(timestampMatch[0].length)
  }

  // 2. Try to match thread name in square brackets: [thread-name]
  const threadMatch = remaining.match(/^\[([^\]]+)\]\s+/)
  if (threadMatch) {
    segments.push({ type: 'threadName', value: threadMatch[1] })
    remaining = remaining.slice(threadMatch[0].length)
  }

  // 3. Try to match log level
  const levelMatch = remaining.match(/^(FATAL|ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\s+/i)
  if (levelMatch) {
    const level = levelMatch[1] as LogLevel
    segments.push({ type: 'level', value: level, level })
    remaining = remaining.slice(levelMatch[0].length)
  }

  // 4. Try to match package name (dot-separated segments, may have abbreviated form)
  // Pattern: word.word.word... or single-letter abbreviations like c.a.s.g.Foo
  // Followed by " - " separator typically
  const packageMatch = remaining.match(/^((?:[a-zA-Z_$][a-zA-Z0-9_$]*\.)+[a-zA-Z_$][a-zA-Z0-9_$]*)\s+-\s+/)
  if (packageMatch) {
    segments.push({ type: 'packageName', value: packageMatch[1] })
    remaining = remaining.slice(packageMatch[0].length)
  }

  // 5. What remains is the message (JSON or plain text)
  if (remaining.length > 0) {
    if (looksLikeJson(remaining)) {
      segments.push({ type: 'json', value: remaining })
    } else {
      segments.push({ type: 'text', value: remaining })
    }
  }

  return segments
}

// Class names map for log message styling
interface LogMessageClasses {
  timestamp: string
  appTimestamp: string
  threadName: string
  packageName: string
  messageText: string
  jsonContainer: string
  jsonMessage: string
  jsonKey: string
  formatJsonBtn: string
  levelFatal: string
  levelError: string
  levelWarn: string
  levelWarning: string
  levelInfo: string
  levelDebug: string
  levelTrace: string
  logText: string
  stackTraceLine: string
}

// Options for rendering JSON segments
interface JsonRenderOptions {
  lineIdx: number
  isFormatted: boolean
}

// Render a single segment to HTML
function renderSegmentHtml(segment: LogSegment, cls: LogMessageClasses, jsonOptions?: JsonRenderOptions): string {
  switch (segment.type) {
    case 'timestamp':
      return `<span class="${cls.appTimestamp}">${escapeHtml(segment.value)}</span>`

    case 'threadName':
      return `<span class="${cls.threadName}">[${escapeHtml(segment.value)}]</span>`

    case 'level': {
      const levelClassMap: Record<LogLevel, string> = {
        FATAL: cls.levelFatal,
        ERROR: cls.levelError,
        WARN: cls.levelWarn,
        WARNING: cls.levelWarning,
        INFO: cls.levelInfo,
        DEBUG: cls.levelDebug,
        TRACE: cls.levelTrace,
      }
      return `<span class="${levelClassMap[segment.level]}">${escapeHtml(segment.value)}</span>`
    }

    case 'packageName':
      return `<span class="${cls.packageName}">${escapeHtml(segment.value)}</span>`

    case 'json': {
      let jsonText = segment.value
      const isFormatted = jsonOptions?.isFormatted ?? false
      const lineIdx = jsonOptions?.lineIdx ?? -1
      let stackTraceKeys: string[] = [] // Track which keys have stack traces for post-processing
      
      // Try to format JSON if requested
      if (isFormatted) {
        try {
          const parsed = JSON.parse(segment.value)
          jsonText = JSON.stringify(parsed, null, 2)
          
          // Identify which stack trace keys are present for post-processing
          if (typeof parsed === 'object' && parsed !== null) {
            for (const key of STACK_TRACE_KEYS) {
              if (key in parsed && typeof parsed[key] === 'string') {
                stackTraceKeys.push(key)
              }
            }
          }
        } catch {
          // Keep original if parsing fails
        }
      }
      
      // Apply HTML escaping and key highlighting
      let jsonContent = escapeHtml(jsonText).replace(
        /"([^"]+)":/g,
        `<span class="${cls.jsonKey}">"$1"</span>:`
      )
      
      // Post-process: expand \n and \t in stack trace values (after HTML escaping)
      // Pattern matches: <span class="...">"{key}"</span>: "value..."
      for (const key of stackTraceKeys) {
        const pattern = new RegExp(
          `(<span class="${cls.jsonKey}">"${key}"</span>:\\s*")([^"]*)(")`,
          'g'
        )
        jsonContent = jsonContent.replace(pattern, (_, prefix, value, suffix) => {
          const expanded = expandStackTraceEscapes(value, cls)
          return `${prefix}${expanded}${suffix}`
        })
      }
      
      // Build button (hidden by default, shown on hover via CSS)
      const buttonLabel = isFormatted ? 'Collapse' : 'Format'
      const button = lineIdx >= 0
        ? `<button class="${cls.formatJsonBtn}" data-line-idx="${lineIdx}">${buttonLabel}</button>`
        : ''
      
      // Wrap in container for hover behavior
      return `<span class="${cls.jsonContainer}"><span class="${cls.jsonMessage}">${jsonContent}</span>${button}</span>`
    }

    case 'text':
      return `<span class="${cls.messageText}">${escapeHtml(segment.value)}</span>`
  }
}

// Render parsed log message segments to HTML
function renderLogMessageHtml(text: string, cls: LogMessageClasses, jsonOptions?: JsonRenderOptions): string {
  if (!text) return ''
  const segments = parseLogMessageToSegments(text)
  
  // If no segments parsed, treat entire text as either JSON or plain text
  if (segments.length === 0) {
    if (looksLikeJson(text)) {
      return renderSegmentHtml({ type: 'json', value: text }, cls, jsonOptions)
    }
    return `<span class="${cls.logText}">${escapeHtml(text)}</span>`
  }

  return segments.map(seg => {
    // Pass jsonOptions only for json segments
    if (seg.type === 'json') {
      return renderSegmentHtml(seg, cls, jsonOptions)
    }
    return renderSegmentHtml(seg, cls)
  }).join(' ')
}

// Parse a log line into components
// Format with prefix: [pod/pod-name/container-name] 2026-01-11T08:00:39.783922111Z log text
// Format without prefix (single container): 2026-01-11T08:00:39.783922111Z log text
interface ParsedLogLine {
  podName: string       // The pod name (middle segment), empty if no prefix
  containerName: string // The container name (last segment), empty if no prefix
  timestamp: string
  text: string
  hasPrefix: boolean    // Whether the line had a [prefix]
}

function parseLogLine(line: string): ParsedLogLine | null {
  // Try format with prefix first: [prefix] timestamp text
  const prefixMatch = line.match(/^\[([^\]]+)\]\s+(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/)
  if (prefixMatch) {
    const fullPrefix = prefixMatch[1]
    const segments = fullPrefix.split('/')

    // Expected format: "pod/pod-name/container-name" or "deployment/deploy-name/container-name"
    // segments[0] = resource type (pod, deployment, etc.)
    // segments[1] = resource name (pod name for pods, or parent resource name)
    // segments[2] = container name
    let podName = ''
    let containerName = ''

    if (segments.length >= 3) {
      podName = segments[1]
      containerName = segments[2]
    } else if (segments.length === 2) {
      // Fallback: resource-type/name
      podName = segments[1]
      containerName = segments[1]
    } else {
      containerName = fullPrefix
    }

    return {
      podName,
      containerName,
      timestamp: prefixMatch[2],
      text: prefixMatch[3],
      hasPrefix: true,
    }
  }

  // Try format without prefix (single container): timestamp text
  const noPrefixMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/)
  if (noPrefixMatch) {
    return {
      podName: '',
      containerName: '',
      timestamp: noPrefixMatch[1],
      text: noPrefixMatch[2],
      hasPrefix: false,
    }
  }

  return null
}

interface LogViewerProps {
  context: string
  namespace: string
  resourceType: string
  resourceName: string
  /** Optional container name when viewing logs for a specific container */
  containerName?: string
  onBack: () => void
}

export function LogViewer({
  context,
  namespace,
  resourceType,
  resourceName,
  containerName,
  onBack,
}: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrap, setWrap] = useState(true)
  const [timestamps, setTimestamps] = useState(false)
  const [autoscroll, setAutoscroll] = useState(true)
  const [formattedLines, setFormattedLines] = useState<Set<number>>(new Set())

  const listRef = useRef<VListHandle>(null)
  
  // Refs for batching log updates
  const pendingLogsRef = useRef<string[]>([])
  const batchTimeoutRef = useRef<number | null>(null)
  
  // Track if we're doing programmatic scroll to avoid disabling autoscroll
  const isScrollingRef = useRef(false)

  // Helper to refocus log container for keyboard scrolling
  const refocusLogs = useCallback(() => {
    // VList doesn't expose focus directly, but we can scroll to trigger focus
  }, [])

  // Flush pending logs to state (batched update)
  const flushPendingLogs = useCallback(() => {
    if (pendingLogsRef.current.length === 0) return
    
    const newLines = pendingLogsRef.current
    pendingLogsRef.current = []
    
    setLogs((prev) => {
      const combined = [...prev, ...newLines]
      // Cap at MAX_LOG_LINES (FIFO)
      if (combined.length > MAX_LOG_LINES) {
        return combined.slice(combined.length - MAX_LOG_LINES)
      }
      return combined
    })
  }, [])

  // Start log stream - always fetch with timestamps, visibility is controlled in the view
  const startStream = useCallback(async () => {
    setError(null)
    setLogs([]) // Clear logs on restart
    pendingLogsRef.current = []

    try {
      await invoke('start_log_stream', {
        resourceType,
        resourceName,
        context,
        namespace,
        timestamps: true, // Always fetch timestamps, visibility controlled in view
        containerName: containerName || null,
      })
      setIsStreaming(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setIsStreaming(false)
    }
  }, [resourceType, resourceName, context, namespace, containerName])

  // Set up event listeners and start stream on mount
  useEffect(() => {
    let unlistenLine: UnlistenFn | null = null
    let unlistenError: UnlistenFn | null = null
    let unlistenEnd: UnlistenFn | null = null
    let mounted = true

    async function setup() {
      // Listen for log lines - batch them for performance
      unlistenLine = await listen<{ line: string }>('log-line', (event) => {
        if (!mounted) return
        
        pendingLogsRef.current.push(event.payload.line)
        
        // Schedule a batched update if not already scheduled
        if (batchTimeoutRef.current === null) {
          batchTimeoutRef.current = window.setTimeout(() => {
            batchTimeoutRef.current = null
            flushPendingLogs()
          }, LOG_BATCH_INTERVAL_MS)
        }
      })

      // Listen for errors (filter out informational messages)
      unlistenError = await listen<{ error: string }>('log-error', (event) => {
        if (!mounted) return
        const msg = event.payload.error
        // Skip kubectl informational messages that go to stderr
        if (msg.startsWith('Defaulted container')) return
        if (msg.startsWith('Found ') && msg.includes(' pods, using ')) return
        setError(msg)
      })

      // Listen for stream end
      unlistenEnd = await listen<{ reason: string }>('log-end', () => {
        if (!mounted) return
        // Flush any remaining logs
        flushPendingLogs()
        setIsStreaming(false)
      })

      // Start the stream
      if (mounted) {
        startStream()
      }
    }

    setup()

    // Cleanup on unmount
    return () => {
      mounted = false
      unlistenLine?.()
      unlistenError?.()
      unlistenEnd?.()
      if (batchTimeoutRef.current !== null) {
        clearTimeout(batchTimeoutRef.current)
      }
      invoke('stop_log_stream').catch(console.error)
    }
  }, [startStream, flushPendingLogs])

  // Determine what prefix to show based on context:
  // - Container logs (containerName is set): no prefix (single container)
  // - Pod logs: show [container-name]
  // - Deployment/other: show [pod-name/container-name]
  const isPodResource = resourceType === 'pod' || resourceType === 'pods'
  const isContainerView = !!containerName

  // Cast classes to include the log message styling classes
  const logClasses = classes as unknown as LogMessageClasses & typeof classes

  // Render a single log line to HTML
  const renderLogLine = useCallback((line: string, lineIdx: number): string => {
    if (!line) return ''
    
    const jsonOptions: JsonRenderOptions = {
      lineIdx,
      isFormatted: formattedLines.has(lineIdx),
    }
    
    const parsed = parseLogLine(line)
    if (parsed) {
      // Build prefix based on viewing context (only if line has prefix and not container view)
      let prefixPart = ''
      if (parsed.hasPrefix && !isContainerView) {
        const prefixText = isPodResource
          ? parsed.containerName  // Pod: just container name
          : `${parsed.podName}/${parsed.containerName}`  // Deployment: pod/container
        prefixPart = `<span class="${logClasses.containerName}">[${escapeHtml(prefixText)}]</span> `
      }

      const timestampPart = timestamps
        ? `<span class="${logClasses.timestamp}">${escapeHtml(parsed.timestamp)}</span> `
        : ''

      // Use enhanced log message parsing for the text content
      const messagePart = renderLogMessageHtml(parsed.text, logClasses, jsonOptions)

      return prefixPart + timestampPart + messagePart
    }
    // Fallback for lines that don't match the expected format - still check for JSON
    return renderLogMessageHtml(line, logClasses, jsonOptions)
  }, [timestamps, isPodResource, isContainerView, logClasses, formattedLines])

  // Autoscroll effect - scroll to last item when new logs arrive
  useEffect(() => {
    if (autoscroll && logs.length > 0 && listRef.current) {
      // Mark as programmatic scroll to prevent handleScroll from disabling autoscroll
      isScrollingRef.current = true
      
      // Small delay to ensure VList is ready
      const timeoutId = setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollToIndex(logs.length - 1, { align: 'end' })
        }
        // Reset flag after scroll completes
        setTimeout(() => {
          isScrollingRef.current = false
        }, 100)
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [logs.length, autoscroll])

  // Focus log container when streaming starts for keyboard scrolling
  useEffect(() => {
    if (isStreaming) {
      refocusLogs()
    }
  }, [isStreaming, refocusLogs])

  // Track last scroll offset to detect scroll direction
  const lastScrollOffsetRef = useRef(0)
  
  // Handle scroll - only disable autoscroll if user scrolls UP
  const handleScroll = useCallback((offset: number) => {
    // Ignore programmatic scrolls
    if (isScrollingRef.current) return
    if (!autoscroll) return
    
    // Only disable autoscroll if user scrolled UP (offset decreased)
    const scrolledUp = offset < lastScrollOffsetRef.current - 10 // 10px threshold
    lastScrollOffsetRef.current = offset
    
    if (scrolledUp) {
      setAutoscroll(false)
    }
  }, [autoscroll])

  // Handle click on format JSON button (event delegation)
  const handleLogClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains(classes.formatJsonBtn)) {
      const lineIdx = parseInt(target.dataset.lineIdx || '', 10)
      if (!isNaN(lineIdx)) {
        setFormattedLines((prev) => {
          const next = new Set(prev)
          if (next.has(lineIdx)) {
            next.delete(lineIdx)
          } else {
            next.add(lineIdx)
          }
          return next
        })
      }
    }
  }, [])

  // Copy logs to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'))
    } catch (e) {
      console.error('Failed to copy logs:', e)
    }
    refocusLogs()
  }, [logs, refocusLogs])

  // Refresh (restart stream)
  const handleRefresh = useCallback(() => {
    startStream()
    refocusLogs()
  }, [startStream, refocusLogs])

  // Toggle handlers with refocus
  const handleToggleWrap = useCallback(() => {
    setWrap((prev) => !prev)
    refocusLogs()
  }, [refocusLogs])

  const handleToggleTimestamps = useCallback(() => {
    setTimestamps((prev) => !prev)
    refocusLogs()
  }, [refocusLogs])

  const handleToggleAutoscroll = useCallback(() => {
    setAutoscroll((prev) => !prev)
    refocusLogs()
  }, [refocusLogs])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Escape - go back
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }

      if (isInput) return

      // Ctrl+R / Cmd+R - Refresh
      if (e.code === 'KeyR' && isControlModifierPressed(e)) {
        e.preventDefault()
        handleRefresh()
        return
      }

      // W - Toggle wrap
      if (e.code === 'KeyW' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleToggleWrap()
        return
      }

      // T - Toggle timestamps
      if (e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleToggleTimestamps()
        return
      }

      // A - Toggle autoscroll
      if (e.code === 'KeyA' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleToggleAutoscroll()
        return
      }

      // C - Copy logs
      if (e.code === 'KeyC' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleCopy()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onBack, handleRefresh, handleCopy, handleToggleWrap, handleToggleTimestamps, handleToggleAutoscroll])

  return (
    <div class={classes.LogViewer}>
      <header class={classes.header}>
        <div class={classes.headerInfo}>
          <span class={classes.resourceName}>
            {containerName ? `${resourceName} / ${containerName}` : resourceName}
          </span>
          <span class={classes.resourceType}>{containerName ? 'container logs' : `${resourceType} logs`}</span>
          <div class={`${classes.streamingIndicator} ${!isStreaming ? classes.paused : ''}`}>
            <span class={classes.dot} />
            <span>{isStreaming ? 'Streaming' : 'Paused'}</span>
          </div>
        </div>
        <div class={classes.headerButtons}>
          <Button
            label="Refresh"
            shortcut="Ctrl+R"
            onClick={handleRefresh}
            tabIndex={1}
            className={classes.refreshButton}
          />
          <Button
            label="Back"
            shortcut="Esc"
            onClick={onBack}
            tabIndex={2}
            className={classes.backButton}
          />
        </div>
      </header>

      <div class={classes.body}>
        <Alert type="error" label="Alert" message={error} />

        {logs.length === 0 && !isStreaming ? (
          <div class={classes.empty}>No logs available</div>
        ) : logs.length === 0 && isStreaming ? (
          <div class={classes.loading}>Waiting for logs...</div>
        ) : (
          <VList
            ref={listRef}
            className={classes.logContainer}
            onScroll={handleScroll}
            onClick={handleLogClick}
          >
            {logs.map((log, index) => (
              <div
                key={`${index}-${wrap}-${formattedLines.has(index)}`}
                data-index={index}
                class={`${classes.logLine} ${wrap ? classes.wrap : classes.nowrap}`}
                dangerouslySetInnerHTML={{ __html: renderLogLine(log, index) }}
              />
            ))}
          </VList>
        )}
      </div>

      <div class={classes.shortcutsBar}>
        <Button
          label="Wrap"
          shortcut="W"
          onClick={handleToggleWrap}
          tabIndex={0}
          className={wrap ? classes.activeButton : undefined}
        />
        <Button
          label="Timestamps"
          shortcut="T"
          onClick={handleToggleTimestamps}
          tabIndex={0}
          className={timestamps ? classes.activeButton : undefined}
        />
        <Button
          label="Autoscroll"
          shortcut="A"
          onClick={handleToggleAutoscroll}
          tabIndex={0}
          className={autoscroll ? classes.activeButton : undefined}
        />
        <div class={classes.separator} />
        <Button
          label="Copy"
          shortcut="C"
          onClick={handleCopy}
          tabIndex={0}
        />
        <span class={classes.lineCount}>
          {logs.length.toLocaleString()} line{logs.length !== 1 ? 's' : ''}
          {logs.length >= MAX_LOG_LINES ? ' (max)' : ''}
        </span>
      </div>
    </div>
  )
}
