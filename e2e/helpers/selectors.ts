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

/**
 * Centralized selector helpers.
 * Uses text, role, and aria-label — no CSS class or implementation-detail selectors.
 */

export function byText(text: string) {
  return $(`//*[contains(text(),"${text}")]`)
}

export function byExactText(text: string) {
  return $(`//*[text()="${text}"]`)
}

export function byRole(role: string) {
  return $(`[role="${role}"]`)
}

export function allByRole(role: string) {
  return $$(`[role="${role}"]`)
}

export function byRoleAndText(role: string, text: string) {
  return $(`[role="${role}"]//*[contains(text(),"${text}")]`)
}

export function byAriaLabel(label: string) {
  return $(`[aria-label="${label}"]`)
}

export function allByAriaLabel(label: string) {
  return $$(`[aria-label="${label}"]`)
}

export function buttonByLabel(label: string) {
  return $(`button=/^${label}$|button*=${label}`)
}

export function buttonByText(text: string) {
  return $(`//button[contains(.,"${text}")]`)
}

export function modalTitle() {
  return $('#modal-title')
}

export function breadcrumb() {
  return byAriaLabel('Navigation breadcrumb')
}

export function searchbox() {
  return $('[role="searchbox"]')
}

export function selectedRow() {
  return $('tr[aria-selected="true"]')
}

export function rowByIndex(index: number) {
  return $(`[data-testid="row-index-${index}"]`)
}

export function gridRows() {
  return $$('[role="grid"] tbody tr')
}

export function dialogElement() {
  return byRole('dialog')
}

export function alertElement() {
  return byRole('alert')
}

export function toolbar() {
  return byRole('toolbar')
}

export function byTitle(title: string) {
  return $(`[title="${title}"]`)
}

export function byTitleContaining(title: string) {
  return $(`[title*="${title}"]`)
}
