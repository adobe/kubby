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
