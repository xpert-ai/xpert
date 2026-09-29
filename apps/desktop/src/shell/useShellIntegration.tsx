import { useState } from 'react'
import type { ChatKitOptions } from '@xpert-ai/chatkit-types'
import { parsePreparation } from '@xpert-ai/desktop-protocol'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@xpert-ai/shadcn-ui'
import { invoke } from '../host'
import { t } from '../i18n'
import { ShellSettings } from './ShellSettings'

export function useShellIntegration() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const handlers: Pick<ChatKitOptions, 'onClientTool' | 'approvals'> = {
    onClientTool: async ({ name, params, id, tool_call_id }) => {
      const callId = tool_call_id || id
      if (name !== 'desktop_shell_prepare') throw new Error('Unsupported client tool')
      try {
        const request = parsePreparation(params)
        const result = await invoke('shellPrepare', request)
        return { tool_call_id: callId, name, status: 'success', content: JSON.stringify(result) }
      } catch (error) {
        return {
          tool_call_id: callId,
          name,
          status: 'error',
          content: error instanceof Error ? error.message : t('Could not authorize Desktop Shell.')
        }
      }
    },
    approvals: {
      placement: 'inline',
      onDecision: async ({ request, decisions }) => {
        if (request.host?.kind !== 'desktop-shell' || decisions.length !== 1) throw new Error('Unsupported approval')
        const decision = decisions[0].type
        if (decision !== 'approve' && decision !== 'reject') throw new Error('Unsupported decision')
        return invoke('shellDecide', { id: request.host.id, decision })
      },
      onAction: async ({ request, action }) => {
        if (request.host?.kind !== 'desktop-shell' || action !== 'settings')
          throw new Error('Unsupported approval action')
        setSettingsOpen(true)
      }
    }
  }
  return {
    handlers,
    dialog: (
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('Local execution permissions')}</DialogTitle>
          </DialogHeader>
          <ShellSettings />
        </DialogContent>
      </Dialog>
    )
  }
}
