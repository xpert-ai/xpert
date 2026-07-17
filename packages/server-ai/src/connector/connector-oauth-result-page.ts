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
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f8fb;
      color: #15171c;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 15% 15%, rgba(78, 102, 255, 0.13), transparent 34%),
        radial-gradient(circle at 85% 85%, rgba(72, 187, 145, 0.12), transparent 32%),
        #f7f8fb;
    }
    main {
      width: min(100%, 520px);
      padding: 38px;
      border: 1px solid rgba(21, 23, 28, 0.09);
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 24px 70px rgba(23, 31, 56, 0.12);
      backdrop-filter: blur(12px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 34px;
      color: #4e66ff;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      color: white;
      background: linear-gradient(145deg, #6175ff, #4057ec);
      box-shadow: 0 8px 18px rgba(64, 87, 236, 0.28);
    }
    .status-icon {
      display: grid;
      place-items: center;
      width: 58px;
      height: 58px;
      margin-bottom: 22px;
      border-radius: 18px;
      color: ${isSuccess ? '#16845b' : '#c43b48'};
      background: ${isSuccess ? '#e7f8f0' : '#fff0f1'};
    }
    h1 {
      margin: 0;
      font-size: clamp(26px, 5vw, 34px);
      line-height: 1.15;
      letter-spacing: -0.035em;
    }
    .description {
      margin: 14px 0 0;
      color: #626773;
      font-size: 15px;
      line-height: 1.7;
    }
    .error-detail {
      margin: 20px 0 0;
      padding: 13px 15px;
      border: 1px solid rgba(196, 59, 72, 0.15);
      border-radius: 12px;
      color: #9f2f3b;
      background: #fff7f7;
      font-size: 13px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }
    .actions { margin-top: 30px; }
    .primary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 20px;
      border-radius: 12px;
      color: white;
      background: #4057ec;
      font-size: 14px;
      font-weight: 650;
      text-decoration: none;
      box-shadow: 0 10px 24px rgba(64, 87, 236, 0.24);
      transition: transform 140ms ease, background 140ms ease;
    }
    .primary-action:hover { background: #3449d5; transform: translateY(-1px); }
    .primary-action:focus-visible { outline: 3px solid rgba(64, 87, 236, 0.28); outline-offset: 3px; }
    .hint {
      margin: 16px 0 0;
      color: #8a8f99;
      font-size: 12px;
      line-height: 1.5;
    }
    @media (prefers-color-scheme: dark) {
      :root { background: #111318; color: #f4f5f7; }
      body {
        background:
          radial-gradient(circle at 15% 15%, rgba(97, 117, 255, 0.18), transparent 34%),
          radial-gradient(circle at 85% 85%, rgba(72, 187, 145, 0.12), transparent 32%),
          #111318;
      }
      main { border-color: rgba(255, 255, 255, 0.09); background: rgba(27, 30, 37, 0.9); box-shadow: 0 24px 70px rgba(0, 0, 0, 0.36); }
      .description { color: #aeb2bc; }
      .status-icon { color: ${isSuccess ? '#58c99a' : '#ff8490'}; background: ${isSuccess ? 'rgba(36, 139, 99, 0.2)' : 'rgba(196, 59, 72, 0.18)'}; }
      .error-detail { border-color: rgba(255, 132, 144, 0.18); color: #ff9aa4; background: rgba(196, 59, 72, 0.1); }
      .hint { color: #888d97; }
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">A</span>
      <span>Xpert AI</span>
    </div>
    <div class="status-icon" aria-hidden="true">
      ${isSuccess ? successIcon() : errorIcon()}
    </div>
    <h1>${escapeHtml(copy.heading)}</h1>
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

function successIcon() {
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>'
}

function errorIcon() {
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
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
