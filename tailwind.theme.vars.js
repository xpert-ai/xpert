const migratedThemeVars = {
  // Custom colors
  'text-primary': 'var(--sys-text-primary)',
  'text-secondary': 'var(--sys-text-secondary)',
  'text-tertiary': 'var(--color-text-tertiary)',
  'text-quaternary': 'var(--color-text-quaternary)',
  'text-destructive': 'var(--color-text-destructive)',
  'text-success': 'var(--color-text-success)',
  'text-warning': 'var(--color-text-warning)',
  'text-accent': 'var(--color-text-accent)',
  'text-accent-secondary': 'var(--color-text-accent-secondary)',
  'text-highlight-bg': 'var(--color-text-highlight-bg)',

  'divider-subtle': 'var(--sys-border)',
  'divider-regular': 'var(--sys-border)',
  'divider-deep': 'var(--sys-border-strong)',
  'hover-bg': 'var(--sys-state-hover)',
  'status-error-bg': 'var(--color-status-error-bg)',
  'components-card-bg': 'var(--sys-surface-elevated)',
  'components-panel-bg': 'var(--sys-surface-overlay)',
  'components-panel-bg-blur': 'var(--color-components-panel-bg-blur)',
  'components-panel-border': 'var(--color-components-panel-border)',
  'components-button-primary-text': 'var(--color-components-button-primary-text)',
  'components-button-primary-border': 'var(--sys-primary)',
  'components-button-primary-bg': 'var(--sys-primary)',
  'components-button-secondary-border': 'var(--sys-border-control)',
  'components-button-secondary-border-hover': 'var(--sys-border-strong)',
  'components-button-secondary-bg': 'var(--color-components-button-secondary-bg)',
  'components-button-secondary-bg-hover': 'var(--color-components-button-secondary-bg-hover)',
  'components-input-bg-disabled': 'var(--sys-surface-field)',
  'components-input-bg-normal': 'var(--color-components-input-bg-normal)',
  'components-input-bg-hover': 'var(--color-components-input-bg-hover)',
  'components-input-bg-active': 'var(--color-components-input-bg-active)',
  'components-input-border-hover': 'var(--color-components-input-border-hover)',
  'components-input-border-active': 'var(--ring)',
  'components-input-text-filled': 'var(--sys-text-primary)',
  'components-input-text-filled-disabled': 'var(--color-components-input-text-filled-disabled)',
  'components-input-text-placeholder': 'var(--color-components-input-text-placeholder)',
  'components-list-option-bg': 'var(--color-components-list-option-bg)',
  'components-list-option-active-bg': 'var(--color-components-list-option-active-bg)',
  'components-toggle-bg': 'var(--color-components-toggle-bg)',
  'components-kbd-bg-white': 'var(--color-components-kbd-bg-white)',
  'background-default-subtle': 'var(--color-background-default-subtle)',
  'border-l2': 'var(--sys-border-control)',
  'input-border': 'var(--color-input-border)',
  'background-body': 'var(--color-background-body)',
  'divider-burn': 'var(--color-divider-burn)',
  'components-dropzone-bg': 'var(--sys-surface-subtle)',
  'components-checkbox-bg': 'var(--sys-primary)',
  'components-option-card-option-selected-border': 'var(--color-components-option-card-option-selected-border)'
}

const themeVars = {
  ...migratedThemeVars,
}

module.exports = themeVars
module.exports.migratedThemeVars = migratedThemeVars
