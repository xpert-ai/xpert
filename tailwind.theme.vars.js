const safeThemeVars = {
  'surface-container': 'var(--background)',
  'state-base-hover': 'var(--color-hover-bg)',
  'background-default-hover': 'var(--color-hover-bg)',
  'token-main-surface-primary': 'var(--sys-surface)',
  'token-main-surface-secondary': 'var(--sys-surface-subtle)',
  'token-main-surface-low': 'var(--surface-container-low)',
  'token-text-secondary': 'var(--text-secondary)',
  'token-border-medium': 'var(--border-medium)',
  'token-border-light': 'var(--border-light)',
  'components-card-option-selected-border': 'var(--components-card-option-selected-border)',
  'button-ghost-hover': 'var(--color-hover-bg)',
  'surface-container-bg': 'var(--background)'
}

const migratedThemeVars = {
  // https://daisyui.com/docs/colors/
  'base-content': 'var(--color-base-content)',

  // Custom colors
  'text-primary': 'var(--color-text-primary)',
  'text-secondary': 'var(--color-text-secondary)',
  'text-tertiary': 'var(--color-text-tertiary)',
  'text-quaternary': 'var(--color-text-quaternary)',
  'text-destructive': 'var(--color-text-destructive)',
  'text-success': 'var(--color-text-success)',
  'text-warning': 'var(--color-text-warning)',
  'text-accent': 'var(--color-text-accent)',
  'text-accent-secondary': 'var(--color-text-accent-secondary)',
  'fg-primary': 'var(--color-fg-primary)',
  'fg-secondary': 'var(--color-fg-secondary)',

  'divider-subtle': 'var(--color-divider-subtle)',
  'divider-regular': 'var(--color-divider-regular)',
  'divider-deep': 'var(--color-divider-deep)',
  'hover-bg': 'var(--color-hover-bg)',
  'danger-bg': 'var(--color-danger-bg)',
  'state-destructive-hover': 'var(--color-state-destructive-hover)',
  'state-success-solid': 'var(--color-state-success-solid)',
  'components-card-bg': 'var(--color-components-card-bg)',
  'components-panel-bg': 'var(--color-components-panel-bg)',
  'components-panel-bg-blur': 'var(--color-components-panel-bg-blur)',
  'components-panel-border': 'var(--color-components-panel-border)',
  'components-button-primary-text': 'var(--color-components-button-primary-text)',
  'components-button-primary-border': 'var(--color-components-button-primary-border)',
  'components-button-primary-bg': 'var(--color-components-button-primary-bg)',
  'components-button-secondary-bg': 'var(--color-components-button-secondary-bg)',
  'components-button-secondary-bg-hover': 'var(--color-components-button-secondary-bg-hover)',
  'components-input-bg-disabled': 'var(--color-components-input-bg-disabled)',
  'components-input-bg': 'var(--color-components-input-bg)',
  'components-input-bg-normal': 'var(--color-components-input-bg-normal)',
  'components-input-bg-hover': 'var(--color-components-input-bg-hover)',
  'components-input-bg-active': 'var(--color-components-input-bg-active)',
  'components-input-border-hover': 'var(--color-components-input-border-hover)',
  'components-input-border-active': 'var(--color-components-input-border-active)',
  'components-input-text-filled': 'var(--color-components-input-text-filled)',
  'components-input-text-filled-disabled': 'var(--color-components-input-text-filled-disabled)',
  'components-input-text-placeholder': 'var(--color-components-input-text-placeholder)',
  'components-list-option-bg': 'var(--color-components-list-option-bg)',
  'components-list-option-active-bg': 'var(--color-components-list-option-active-bg)',
  'components-toggle-bg': 'var(--color-components-toggle-bg)',
  'components-toggle-bg-unchecked': 'var(--color-components-toggle-bg-unchecked)',
  'components-toggle-knob': 'var(--color-components-toggle-knob)',
  'components-kbd-bg-white': 'var(--color-components-kbd-bg-white)',
  'button-ghost-active': 'var(--color-button-ghost-active)',
  'background-default-subtle': 'var(--color-background-default-subtle)',
  'surface-l1': 'var(--color-surface-l1)',
  'surface-neutral': 'var(--color-surface-neutral)',
  'border-l2': 'var(--color-border-l2)',
  'input-border': 'var(--color-input-border)',
  'background-body': 'var(--color-background-body)',
  'divider-burn': 'var(--color-divider-burn)',
  'components-dropzone-bg': 'var(--color-components-dropzone-bg)',
  'components-checkbox-bg': 'var(--color-components-checkbox-bg)',
  'components-option-card-option-selected-border': 'var(--color-components-option-card-option-selected-border)'
}

const legacyThemeVars = {
  'text-primary-on-surface': 'var(--color-text-primary-on-surface)',
  'text-text-selected': 'var(--color-text-text-selected)'
}

const themeVars = {
  ...safeThemeVars,
  ...migratedThemeVars,
  ...legacyThemeVars
}

module.exports = themeVars
module.exports.safeThemeVars = safeThemeVars
module.exports.migratedThemeVars = migratedThemeVars
module.exports.legacyThemeVars = legacyThemeVars
