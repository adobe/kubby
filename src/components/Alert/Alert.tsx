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

import classes from './Alert.module.scss'
import {ReactElement} from 'preact/compat'

export type AlertType = 'error' | 'warning' | 'info'

interface ErrorProps {
  /** Type of the alert **/
  type: AlertType
  /** The label shown before the error message (e.g., "Error", "Edit failed") */
  label: string
  /** The error message to display. If null/undefined, nothing is rendered. */
  message: ReactElement | string | null | undefined
}

const COMMAND_PREFIX = '\nCommand: '

function renderMessage(message: ReactElement | string) {
  if (typeof message !== 'string') return message

  const cmdIndex = message.indexOf(COMMAND_PREFIX)
  if (cmdIndex === -1) return message

  const errorText = message.slice(0, cmdIndex)
  const command = message.slice(cmdIndex + COMMAND_PREFIX.length)

  return (
    <>
      <p>{errorText}</p>
      <br/>
      <small>Executed command:</small>
      <code class={classes.command}>{command}</code>
    </>
  )
}

/**
 * Displays an alert message with a styled container.
 * Renders nothing if message is null or undefined.
 */
export function Alert({ type, label, message }: ErrorProps) {
  if (!message) return null

  function props(): { alertClass: string, icon: string } {
    switch (type) {
      case 'error':
        return ({alertClass: classes.error, icon: '🚫'})
      case 'warning':
        return ({alertClass: classes.warning, icon: '⚠️'})
      case 'info':
        return ({alertClass: classes.info, icon: 'ℹ️'})
    }
  }
  const { alertClass, icon } = props()
  return (
    <div class={`${classes.Alert} ${alertClass}`} role="alert">
      <div class={classes.title}>{icon} <strong>{label}</strong></div>
      <div>{renderMessage(message ?? 'Unknown error')}</div>
    </div>
  )
}
