import React from 'react'
import ReactDOM from 'react-dom/client'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
import { App } from './App'
import { DESKTOP_PRIMARY_COLOR } from './theme'
import './styles.css'

installShadcnThemeVars()
document.documentElement.style.setProperty('--xui-color-primary', DESKTOP_PRIMARY_COLOR)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
