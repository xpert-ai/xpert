export type InstallShadcnThemeVarsOptions = {
  density?: 'default' | 'compact'
  styleId?: string
}

export function installShadcnThemeVars(options: InstallShadcnThemeVarsOptions = {}) {
  const styleId = options.styleId ?? 'xpert-shadcn-ui-theme-vars'
  if (typeof document === 'undefined') {
    return
  }

  if (options.density === 'compact') {
    document.documentElement.dataset.xuiDensity = 'compact'
  } else if (options.density === 'default') {
    delete document.documentElement.dataset.xuiDensity
  }

  let style = document.getElementById(styleId) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }

  style.textContent = `
    :root {
      --background: var(--xui-color-background, #ffffff);
      --foreground: var(--xui-color-foreground, #18181b);
      --card: var(--xui-color-card, var(--background));
      --card-foreground: var(--xui-color-card-foreground, var(--foreground));
      --popover: var(--xui-color-popover, var(--card));
      --popover-foreground: var(--xui-color-popover-foreground, var(--foreground));
      --primary: var(--xui-color-primary, #0f766e);
      --primary-foreground: var(--xui-color-primary-foreground, #ffffff);
      --secondary: var(--xui-color-secondary, var(--xui-color-muted, #f4f4f5));
      --secondary-foreground: var(--xui-color-secondary-foreground, var(--foreground));
      --muted: var(--xui-color-muted, #f4f4f5);
      --muted-foreground: var(--xui-color-muted-foreground, #71717a);
      --accent: var(--xui-color-accent, oklch(0.58 0.18 255));
      --accent-foreground: var(--xui-color-accent-foreground, oklch(0.985 0 0));
      --destructive: var(--xui-color-destructive, #dc2626);
      --destructive-foreground: var(--xui-color-destructive-foreground, #ffffff);
      --border: var(--xui-color-border, #e4e4e7);
      --input: var(--xui-color-input, var(--border));
      --ring: var(--xui-color-ring, var(--primary));
      --chart-1: var(--xui-color-chart-1, #0f766e);
      --chart-2: var(--xui-color-chart-2, #2563eb);
      --chart-3: var(--xui-color-chart-3, #f59e0b);
      --chart-4: var(--xui-color-chart-4, #dc2626);
      --chart-5: var(--xui-color-chart-5, #7c3aed);
      --radius: var(--xui-radius-md, 0.5rem);
      --font-sans: var(--xui-font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    }

    .dark,
    [data-theme='dark'] {
      --background: var(--xui-color-background, #09090b);
      --foreground: var(--xui-color-foreground, #fafafa);
      --card: var(--xui-color-card, #18181b);
      --card-foreground: var(--xui-color-card-foreground, var(--foreground));
      --popover: var(--xui-color-popover, var(--card));
      --popover-foreground: var(--xui-color-popover-foreground, var(--foreground));
      --secondary: var(--xui-color-secondary, #27272a);
      --secondary-foreground: var(--xui-color-secondary-foreground, var(--foreground));
      --muted: var(--xui-color-muted, #27272a);
      --muted-foreground: var(--xui-color-muted-foreground, #a1a1aa);
      --accent: var(--xui-color-accent, oklch(0.58 0.18 255));
      --accent-foreground: var(--xui-color-accent-foreground, oklch(0.985 0 0));
      --border: var(--xui-color-border, #27272a);
      --input: var(--xui-color-input, var(--border));
    }
  `
}
