export type ConnectorOAuthResultPageInput = {
    status: 'success' | 'error'
    locale: 'en' | 'zh'
    returnUrl: string
    hasWorkspace: boolean
    errorMessage?: string | null
}

export function renderConnectorOAuthResultPage(input: ConnectorOAuthResultPageInput) {
    const copy = oauthResultCopy(input)
    const isSuccess = input.status === 'success'
    const safeReturnUrl = escapeHtml(input.returnUrl)
    const safeErrorMessage = input.errorMessage ? escapeHtml(input.errorMessage) : ''

    return `<!doctype html>
<html lang="${input.locale === 'zh' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>${escapeHtml(copy.pageTitle)}</title>
  <style>
    /* Standalone defaults mirror Cloud's packages/ui/src/styles.css tokens.
       Keep the callback self-contained: no scripts or external asset requests. */
    :root {
      color-scheme: light dark;
      --radius: 0.625rem;
      --font-xp-sans: Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", ui-sans-serif, system-ui, sans-serif;
      --background: light-dark(oklch(1 0 0), oklch(0.141 0 0));
      --foreground: light-dark(oklch(0.141 0 0), oklch(0.985 0 0));
      --card: light-dark(oklch(1 0 0), oklch(0.21 0.006 285.885));
      --primary: light-dark(oklch(0.21 0.006 285.885), oklch(0.92 0.004 286.32));
      --primary-foreground: light-dark(oklch(0.985 0 0), oklch(0.21 0.006 285.885));
      --muted-foreground: light-dark(oklch(0.552 0.016 285.938), oklch(0.705 0.015 286.067));
      --border: light-dark(oklch(0.92 0.004 286.32), oklch(0.35 0.006 286));
      --ring: light-dark(oklch(0.705 0.015 286.067), oklch(0.552 0.016 285.938));
      --success: light-dark(oklch(0.622 0.136 160.184), oklch(0.684 0.137 160.226));
      --destructive: light-dark(oklch(0.577 0.245 27.325), oklch(0.704 0.191 22.216));
      --status-color: var(${isSuccess ? '--success' : '--destructive'});
      font-family: var(--font-xp-sans);
      background: var(--background);
      color: var(--foreground);
    }
    :root[data-theme="light"] { color-scheme: light; }
    :root[data-theme="dark"] { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    main {
      width: min(100%, 480px);
      padding: 32px;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) + 6px);
      background: var(--card);
      box-shadow: 0 2px 8px color-mix(in oklab, var(--foreground) 5%, transparent);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 32px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .brand-mark { width: 28px; height: 28px; flex-shrink: 0; }
    .status-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin-bottom: 20px;
      border-radius: var(--radius);
      color: var(--status-color);
      background: color-mix(in oklab, var(--status-color) 12%, var(--card));
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.025em;
      overflow-wrap: anywhere;
    }
    .description {
      margin: 12px 0 0;
      color: var(--muted-foreground);
      font-size: 14px;
      line-height: 1.7;
    }
    .error-detail {
      margin: 20px 0 0;
      padding: 12px;
      border: 1px solid color-mix(in oklab, var(--destructive) 24%, var(--border));
      border-radius: var(--radius);
      color: var(--destructive);
      background: color-mix(in oklab, var(--destructive) 6%, var(--card));
      font-size: 13px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .actions { margin-top: 24px; }
    .primary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 10px 16px;
      border-radius: calc(var(--radius) - 2px);
      color: var(--primary-foreground);
      background: var(--primary);
      font-size: 14px;
      font-weight: 500;
      line-height: 1.5;
      text-align: center;
      text-decoration: none;
      transition: background-color 150ms ease;
    }
    .primary-action:hover { background: color-mix(in oklab, var(--primary) 90%, var(--card)); }
    .primary-action:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
    .hint {
      margin: 16px 0 0;
      color: var(--muted-foreground);
      font-size: 12px;
      line-height: 1.6;
    }
    @media (max-width: 480px) {
      body { padding: 16px; }
      main { padding: 24px; }
      .primary-action { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .primary-action { transition: none; }
    }
  </style>
</head>
<body>
  <main aria-labelledby="oauth-result-title">
    <div class="brand">
      ${brandIcon()}
      <span>Xpert AI</span>
    </div>
    <div class="status-icon" aria-hidden="true">
      ${isSuccess ? successIcon() : errorIcon()}
    </div>
    <h1 id="oauth-result-title">${escapeHtml(copy.heading)}</h1>
    <p class="description">${escapeHtml(copy.description)}</p>
    ${safeErrorMessage ? `<p class="error-detail">${safeErrorMessage}</p>` : ''}
    <div class="actions">
      <a class="primary-action" href="${safeReturnUrl}">${escapeHtml(copy.action)}</a>
    </div>
    <p class="hint">${escapeHtml(copy.hint)}</p>
  </main>
</body>
</html>`
}

function oauthResultCopy(input: ConnectorOAuthResultPageInput) {
    if (input.locale === 'zh') {
        return input.status === 'success'
            ? {
                  pageTitle: '授权完成 · Xpert AI',
                  heading: '授权成功',
                  description: '连接器已经准备就绪，你可以返回工作空间继续使用。',
                  action: input.hasWorkspace ? '返回工作空间连接器' : '返回工作空间',
                  hint: '也可以直接关闭此页面。'
              }
            : {
                  pageTitle: '授权未完成 · Xpert AI',
                  heading: '授权未完成',
                  description: '连接器授权过程中出现了问题，请返回工作空间后重试。',
                  action: input.hasWorkspace ? '返回工作空间连接器' : '返回工作空间',
                  hint: '如果问题持续出现，请检查系统集成配置。'
              }
    }

    return input.status === 'success'
        ? {
              pageTitle: 'Authorization complete · Xpert AI',
              heading: 'Authorization complete',
              description: 'Your connector is ready. Return to the workspace to continue.',
              action: input.hasWorkspace ? 'Return to workspace connectors' : 'Return to workspace',
              hint: 'You can also close this page.'
          }
        : {
              pageTitle: 'Authorization incomplete · Xpert AI',
              heading: 'Authorization incomplete',
              description:
                  'Something went wrong while authorizing the connector. Return to the workspace and try again.',
              action: input.hasWorkspace ? 'Return to workspace connectors' : 'Return to workspace',
              hint: 'If the problem persists, check the system integration configuration.'
          }
}

// Cloud logo geometry from apps/cloud/src/assets/logo.svg.
function brandIcon() {
    return '<svg class="brand-mark" aria-hidden="true" viewBox="0 0 1920 1920" fill="currentColor"><polygon points="1707.19 324.74 1473.39 602.73 1473.39 1333.64 1707.19 1613.58 1707.19 324.74"/><polygon points="442.67 202.43 218.14 202.43 196.95 202.43 131.54 202.43 202.59 279.79 409.67 527.35 409.94 527.12 724.51 903.74 773.81 962.68 773.77 962.73 920.36 1138.24 926.49 1145.27 926.52 1145.26 1406.57 1719.16 1709.86 1719.16 1620.14 1611.63 763.42 585.89 442.67 202.43"/><polygon points="1161.01 871.25 1158.32 869 1715.19 200 1691 200 1646.47 200 1416.97 200 975.2 729.1 1127.4 911.53 1161.01 871.25"/><polygon points="148.27 1716.73 453.07 1716.73 884.93 1199.29 732.73 1016.86 148.27 1716.73"/></svg>'
}

function successIcon() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>'
}

function errorIcon() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&':
                return '&amp;'
            case '<':
                return '&lt;'
            case '>':
                return '&gt;'
            case '"':
                return '&quot;'
            default:
                return '&#39;'
        }
    })
}
