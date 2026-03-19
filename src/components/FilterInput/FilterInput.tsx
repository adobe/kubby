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
  const [isFocused, setIsFocused] = useState(false)

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
      onSubmit?.()
    }
    if (e.key === 'Escape') {
      e.stopPropagation() // Prevent global handler from calling onBack
      if (value) {
        onClear()
      }
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
    setPlaceholder('Type to filter')
  }

  const handleBlur = () => {
    setIsFocused(false)
    setPlaceholder('Type / to filter...')
  }

  // Show button when focused (as Esc hint) or when there's a value (as clear button)
  const showButton = isFocused || value

  return (
    <span class={classes.FilterInput}>
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        autocorrect="off"
        autocapitalize="off"
        autocomplete="off"
        spellcheck={false}
        data-form-type="other"
        class={classes.input}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        tabIndex={tabIndex}
      />
      {showButton && (
        <button
          className={classes.clearButton}
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          tabIndex={tabIndex !== undefined ? tabIndex + 1 : undefined}
          aria-label="Clear filter"
        >
          {value && <span className={classes.clearIcon}>×</span>}
          <span className={classes.shortcutKey}>Esc</span>
        </button>
      )}
    </span>
  )
}
