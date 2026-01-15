import classes from './BarLabel.module.scss'

interface BarLabelProps {
  children?: preact.ComponentChildren;
}

export function BarLabel({children}: BarLabelProps) {
  return (
    <label className={classes.BarLabel}>
      {children}
    </label>
  )
}
