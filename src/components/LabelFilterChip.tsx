import classes from './LabelFilterChip.module.scss'

interface LabelFilterChipProps {
  labelKey: string;
  labelValue: string;
  onRemove: () => void;
}

export function LabelFilterChip({ labelKey, labelValue, onRemove }: LabelFilterChipProps) {
  return (
    <div class={classes.LabelFilterChip}>
      <span class={classes.labelKey}>{labelKey}</span>
      <span class={classes.equals}>=</span>
      <span class={classes.labelValue}>{labelValue}</span>
      <button 
        class={classes.removeButton} 
        onClick={onRemove}
        aria-label={`Remove filter ${labelKey}=${labelValue}`}
      >
        ×
      </button>
    </div>
  )
}
