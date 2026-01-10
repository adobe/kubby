import { LabelFilterChip } from './LabelFilterChip.tsx'
import type { LabelSelector } from '../kubectl/resourceTypes'
import classes from './FilterChipBar.module.scss'

interface FilterChipBarProps {
  labelSelectors: LabelSelector[];
  onRemoveFilter: (index: number) => void;
}

export function FilterChipBar({ labelSelectors, onRemoveFilter }: FilterChipBarProps) {
  // if (!labelSelectors || labelSelectors.length === 0) {
  //   return null
  // }

  return (
    <div class={classes.chipBar}>
      <div class={classes.chips}>
        {labelSelectors.map((selector, index) => (
          <LabelFilterChip
            key={`${selector.key}-${selector.value}-${index}`}
            labelKey={selector.key}
            labelValue={selector.value}
            onRemove={() => onRemoveFilter(index)}
          />
        ))}
      </div>
    </div>
  )
}
