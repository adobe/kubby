import classes from './KubbyTitle.module.scss'

interface KubbyTitle {
}

export function KubbyTitle({}: KubbyTitle) {
  return (
    <div className={classes.KubbyTitle}>Kubby</div>
  )
}
