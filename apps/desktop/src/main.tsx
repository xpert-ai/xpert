import React from 'react'
import ReactDOM from 'react-dom/client'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
import { App } from './App'
import { t } from './i18n'
import { startLaunch } from './branding/launch-motion'
import { DESKTOP_PRIMARY_COLOR } from './theme'
import './styles.css'

const root = document.getElementById('root')!
const splash = document.querySelector<HTMLElement>('.bosi-launch')!
const revealWhenReady = startLaunch(root, splash)
installShadcnThemeVars()
function localizeLaunch() {
  document.getElementById('launch-status')!.textContent = t('Opening Bosi…')
  document.getElementById('launch-tagline')!.textContent = t('You set the goal. Bosi leads the team.')
}
localizeLaunch()
const onLaunchReady = (failed: boolean) => {
  if (splash.isConnected) localizeLaunch()
  revealWhenReady(failed)
}
document.documentElement.style.setProperty('--xui-color-primary', DESKTOP_PRIMARY_COLOR)
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App onLaunchReady={onLaunchReady} />
  </React.StrictMode>
)
