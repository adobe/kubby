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

import classes from './Label.module.scss'
import {formatShortcut} from '../../navigation/keyboardShortcuts.ts'

interface LabelProps {
  label: string;
  value?: string;
  shortcut?: string; // e.g., 'Cmd+K' or 'Ctrl+K' - will auto-switch based on platform
  className?: string;
  children?: preact.ComponentChildren;
}

export function Label({label, value, shortcut, className, children}: LabelProps) {
  return (
    <span className={`${classes.Label} ${className || ''}`}>
      <span className={classes.labelText}>
        {label}
        {shortcut && (
          <span className={classes.shortcutHint}>{formatShortcut(shortcut)}</span>
        )}
      </span>
      {value && <span className={classes.value}>{value}</span>}
      {children}
    </span>
  )
}
