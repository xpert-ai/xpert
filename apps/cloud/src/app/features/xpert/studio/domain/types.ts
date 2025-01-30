import * as CryptoJS from 'crypto-js'
import { IXpert, letterStartSUID, TXpertTeamDraft } from 'apps/cloud/src/app/@core'

export interface IStudioStore {
  draft: TXpertTeamDraft
}

export enum EReloadReason {
  INIT = 'init',
  JUST_RELOAD = 'just_reload',
  CONNECTION_CHANGED = 'connection_changed',
  MOVED = 'moved',
  XPERT_ADDED = 'xpert_added',
  XPERT_UPDATED = 'xpert_updated',
  XPERT_REMOVED = 'xpert_removed',
  AGENT_CREATED = 'agent_created',
  AGENT_REMOVED = 'agent_removed',
  KNOWLEDGE_CREATED = 'knowledge_created',
  KNOWLEDGE_REMOVED = 'knowledge_removed',
  TOOLSET_CREATED = 'toolset_created',
  TOOLSET_REMOVED = 'toolset_removed',
  WORKFLOW_REMOVED = 'workflow_removed',
  AUTO_LAYOUT = 'auto_layout',
  RESIZE = 'resize', // Node resize
  CANVAS_CHANGED = 'canvas_changed'
}

export type TStateHistory = {
  reason: EReloadReason
  cursor: number
  createdAt: Date
}

export function getXpertRoleKey(role: IXpert) {
  return role.id
}

export function calculateHash(jsonString: string): string {
  return CryptoJS.SHA256(jsonString).toString(CryptoJS.enc.Hex)
}
