import type { Ref } from 'preact'
import classes from './FilterInput.module.scss'
import {useState} from 'preact/hooks'

interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit?: () => void;
  tabIndex?: number;
  inputRef?: Ref<HTMLInputElement>;
}

export function FilterInput({
  value,
  onChange,
  onClear,
  onSubmit,
  tabIndex,
  inputRef,
}: FilterInputProps) {
  const [placeholder, setPlaceholder] = useState<string>('Type / to filter...')
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
      onSubmit?.()
    }
    if (e.key === 'Escape') {
      // Blur the input so keyboard navigation works on the list
      // The global Esc handler will clear the filter or go back
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <span class={classes.FilterInput}>
      <input
        ref={inputRef}
        type="text"
        autocorrect="off"
        autocapitalize="off"
        autocomplete="off"
        class={classes.input}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setPlaceholder('Type to filter')}
        onBlur={() => setPlaceholder('Type / to filter...')}
        placeholder={placeholder}
        tabIndex={tabIndex}
      />
      {value && (
        <button
          className={classes.clearButton}
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          tabIndex={tabIndex !== undefined ? tabIndex + 1 : undefined}
          aria-label="Clear filter"
        >
          <span className={classes.clearIcon}>×</span>
          <span className={classes.shortcutKey}>Esc</span>
        </button>
      )}
    </span>
  )
}
