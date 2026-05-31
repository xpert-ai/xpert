export interface RenderRemoteReactIframeHtmlOptions {
  title: string
  reactUmd: string
  reactDomUmd: string
  appScript: string
  appCss?: string
  lang?: string
}

const XPERT_REMOTE_UI_CSS = `
:root {
  color-scheme: light;
  --xui-font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --xui-color-background: #fff;
  --xui-color-foreground: #18181b;
  --xui-color-card: #fff;
  --xui-color-card-foreground: #18181b;
  --xui-color-muted: #f4f4f5;
  --xui-color-muted-foreground: #71717a;
  --xui-color-border: #e4e4e7;
  --xui-color-input: #d4d4d8;
  --xui-color-primary: #18181b;
  --xui-color-primary-foreground: #fff;
  --xui-color-destructive: #dc2626;
  --xui-color-destructive-background: #fef2f2;
  --xui-color-success: #047857;
  --xui-color-success-background: #ecfdf5;
  --xui-radius-sm: 6px;
  --xui-radius-md: 8px;
  --xui-radius-lg: 10px;
  --xui-font-size-xs: 0.75rem;
  --xui-font-size-sm: 0.8125rem;
  --xui-font-size-md: 0.875rem;
  --xui-font-size-lg: 1rem;
  --xui-font-size-control: var(--xui-font-size-sm);
  --xui-font-size-button: var(--xui-font-size-sm);
  --xui-font-size-table: var(--xui-font-size-sm);
  --xui-control-height: 2rem;
  --xui-button-height: 2rem;
  --xui-button-height-sm: 1.75rem;
  --xui-shadow-dialog: 0 20px 50px rgba(24, 24, 27, 0.22);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--xui-color-background);
  color: var(--xui-color-foreground);
  font-family: var(--xui-font-family);
  font-size: var(--xui-font-size-md);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled,
input:disabled,
select:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.xui-app {
  min-height: 420px;
  padding: 2px;
}

.xui-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 240px) minmax(160px, 240px) minmax(180px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.xui-control,
.xui-input,
.xui-textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--xui-color-input);
  border-radius: var(--xui-radius-md);
  background: var(--xui-color-card);
  color: var(--xui-color-card-foreground);
  outline: none;
}

.xui-control,
.xui-input {
  height: var(--xui-control-height);
  padding: 0 10px;
  font-size: var(--xui-font-size-control);
}

.xui-textarea {
  min-height: 84px;
  padding: 8px 10px;
  resize: vertical;
  font-size: var(--xui-font-size-control);
}

.xui-button {
  display: inline-flex;
  height: var(--xui-button-height);
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--xui-color-input);
  border-radius: var(--xui-radius-md);
  background: var(--xui-color-card);
  color: var(--xui-color-card-foreground);
  padding: 0 12px;
  font-size: var(--xui-font-size-button);
  white-space: nowrap;
}

.xui-button-primary {
  border-color: var(--xui-color-primary);
  background: var(--xui-color-primary);
  color: var(--xui-color-primary-foreground);
}

.xui-button-danger {
  border-color: color-mix(in srgb, var(--xui-color-destructive) 32%, transparent);
  color: var(--xui-color-destructive);
}

.xui-button-sm {
  height: var(--xui-button-height-sm);
  padding: 0 8px;
  font-size: var(--xui-font-size-xs);
}

.xui-notice {
  display: flex;
  align-items: center;
  min-height: 36px;
  margin-bottom: 12px;
  border: 1px solid var(--xui-color-border);
  border-radius: var(--xui-radius-md);
  padding: 8px 10px;
  color: var(--xui-color-muted-foreground);
  background: var(--xui-color-muted);
  font-size: var(--xui-font-size-sm);
}

.xui-notice-error {
  border-color: color-mix(in srgb, var(--xui-color-destructive) 32%, transparent);
  color: var(--xui-color-destructive);
  background: var(--xui-color-destructive-background);
}

.xui-table-wrap {
  overflow: auto;
  border: 1px solid var(--xui-color-border);
  border-radius: var(--xui-radius-md);
}

.xui-table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
}

.xui-table th,
.xui-table td {
  border-bottom: 1px solid var(--xui-color-border);
  padding: 10px;
  text-align: left;
  vertical-align: middle;
  font-size: var(--xui-font-size-table);
}

.xui-table th {
  background: var(--xui-color-muted);
  color: var(--xui-color-muted-foreground);
  font-weight: 600;
}

.xui-table tr:last-child td {
  border-bottom: 0;
}

.xui-muted {
  color: var(--xui-color-muted-foreground);
}

.xui-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--xui-color-border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: var(--xui-font-size-xs);
  color: var(--xui-color-muted-foreground);
  background: var(--xui-color-muted);
}

.xui-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.xui-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  color: var(--xui-color-muted-foreground);
  font-size: var(--xui-font-size-sm);
}

.xui-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: var(--xui-color-muted-foreground);
  font-size: var(--xui-font-size-md);
}

.xui-modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(24, 24, 27, 0.32);
  padding: 16px;
}

.xui-modal {
  width: min(720px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  border-radius: var(--xui-radius-lg);
  background: var(--xui-color-card);
  color: var(--xui-color-card-foreground);
  box-shadow: var(--xui-shadow-dialog);
}

.xui-modal-header,
.xui-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--xui-color-border);
}

.xui-modal-footer {
  border-top: 1px solid var(--xui-color-border);
  border-bottom: 0;
}

.xui-modal-title {
  margin: 0;
  font-size: var(--xui-font-size-lg);
  font-weight: 700;
}

.xui-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
}

.xui-field {
  display: grid;
  gap: 6px;
}

.xui-field-full {
  grid-column: 1 / -1;
}

.xui-field label {
  color: var(--xui-color-muted-foreground);
  font-size: var(--xui-font-size-xs);
  font-weight: 600;
}

.xui-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--xui-color-card-foreground);
  font-size: var(--xui-font-size-sm);
}

@media (max-width: 760px) {
  .xui-toolbar,
  .xui-form {
    grid-template-columns: 1fr;
  }
}
`

const XPERT_REMOTE_UI_BOOTSTRAP = `
(function () {
  var CHANNEL = 'xpertai.remote_component'
  var VERSION = 1
  var TOKEN_MAP = {
    fontFamily: '--xui-font-family',
    colorBackground: '--xui-color-background',
    colorForeground: '--xui-color-foreground',
    colorCard: '--xui-color-card',
    colorCardForeground: '--xui-color-card-foreground',
    colorMuted: '--xui-color-muted',
    colorMutedForeground: '--xui-color-muted-foreground',
    colorBorder: '--xui-color-border',
    colorInput: '--xui-color-input',
    colorPrimary: '--xui-color-primary',
    colorPrimaryForeground: '--xui-color-primary-foreground',
    colorDestructive: '--xui-color-destructive',
    colorDestructiveBackground: '--xui-color-destructive-background',
    colorSuccess: '--xui-color-success',
    colorSuccessBackground: '--xui-color-success-background',
    radiusSm: '--xui-radius-sm',
    radiusMd: '--xui-radius-md',
    radiusLg: '--xui-radius-lg',
    fontSizeXs: '--xui-font-size-xs',
    fontSizeSm: '--xui-font-size-sm',
    fontSizeMd: '--xui-font-size-md',
    fontSizeLg: '--xui-font-size-lg',
    fontSizeControl: '--xui-font-size-control',
    fontSizeButton: '--xui-font-size-button',
    fontSizeTable: '--xui-font-size-table',
    controlHeight: '--xui-control-height',
    buttonHeight: '--xui-button-height',
    buttonHeightSm: '--xui-button-height-sm'
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function applyTheme(theme) {
    var mode = typeof theme === 'string' ? theme : isObject(theme) ? theme.mode : null
    var tokens = isObject(theme) && isObject(theme.tokens) ? theme.tokens : {}
    if (mode === 'dark') {
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.style.colorScheme = 'dark'
    } else {
      document.documentElement.dataset.theme = 'light'
      document.documentElement.style.colorScheme = 'light'
    }
    Object.keys(TOKEN_MAP).forEach(function (key) {
      var value = tokens[key]
      if (typeof value === 'string' && value.trim()) {
        document.documentElement.style.setProperty(TOKEN_MAP[key], value.trim())
      }
    })
  }

  window.XpertRemoteUI = {
    applyTheme: applyTheme
  }

  window.addEventListener('message', function (event) {
    var message = event.data
    if (
      !isObject(message) ||
      message.channel !== CHANNEL ||
      message.protocolVersion !== VERSION ||
      message.type !== 'init'
    ) {
      return
    }
    applyTheme(message.theme)
  })
})()
`

export function renderRemoteReactIframeHtml(options: RenderRemoteReactIframeHtmlOptions) {
  return `<!doctype html>
<html lang="${escapeHtmlAttribute(options.lang ?? 'en')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>
${XPERT_REMOTE_UI_CSS}
${options.appCss ?? ''}
    </style>
    <script>
${options.reactUmd}
    </script>
    <script>
${options.reactDomUmd}
    </script>
    <script>
${XPERT_REMOTE_UI_BOOTSTRAP}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script>
${options.appScript}
    </script>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}
