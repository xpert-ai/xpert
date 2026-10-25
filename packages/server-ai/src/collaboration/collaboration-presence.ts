import type { ICollaborationPresence } from '@xpert-ai/plugin-sdk'
import { clamp, optionalBase64, optionalText, requiredText } from './collaboration-input'

/** Enforce presence size semantics before data reaches Redis or another client. */
export function sanitizePresence(value: ICollaborationPresence): ICollaborationPresence {
    return {
        clientId: requiredText(value.clientId, 'clientId', 128),
        presenceId: requiredText(value.presenceId, 'presenceId', 128),
        actorType: value.actorType,
        displayName: requiredText(value.displayName, 'displayName', 64),
        color: requiredText(value.color, 'color', 32),
        avatarUrl: optionalText(value.avatarUrl, 2_048) ?? null,
        pageId: optionalText(value.pageId, 256) ?? null,
        pointer:
            value.pointer && Number.isFinite(value.pointer.x) && Number.isFinite(value.pointer.y)
                ? {
                      pageId: optionalText(value.pointer.pageId, 256) ?? null,
                      x: clamp(value.pointer.x, 0, 1),
                      y: clamp(value.pointer.y, 0, 1),
                      visible: value.pointer.visible !== false
                  }
                : null,
        focus: value.focus
            ? {
                  kind: requiredText(value.focus.kind, 'focus kind', 64),
                  key: optionalText(value.focus.key, 512) ?? null,
                  pageId: optionalText(value.focus.pageId, 256) ?? null,
                  elementId: optionalText(value.focus.elementId, 256) ?? null,
                  fieldKey: optionalText(value.focus.fieldKey, 512) ?? null
              }
            : null,
        selection: sanitizeSelection(value.selection),
        viewport:
            value.viewport &&
            Number.isFinite(value.viewport.zoom) &&
            Number.isFinite(value.viewport.width) &&
            Number.isFinite(value.viewport.height)
                ? {
                      zoom: clamp(value.viewport.zoom, 0.05, 16),
                      width: clamp(value.viewport.width, 1, 100_000),
                      height: clamp(value.viewport.height, 1, 100_000)
                  }
                : null,
        mode: optionalText(value.mode, 64) ?? null,
        status: value.status ?? null,
        toolName: optionalText(value.toolName, 160) ?? null,
        operationLabel: optionalText(value.operationLabel, 256) ?? null,
        updatedAt: Date.now()
    }
}

function sanitizeSelection(selection: ICollaborationPresence['selection']) {
    if (!selection) return null
    return {
        kind: selection.kind,
        fieldKey: optionalText(selection.fieldKey, 512) ?? null,
        elementIds: selection.elementIds?.slice(0, 128).map((item) => requiredText(item, 'elementId', 256)) ?? null,
        anchorRelativeBase64: optionalBase64(selection.anchorRelativeBase64, 8_192),
        headRelativeBase64: optionalBase64(selection.headRelativeBase64, 8_192)
    }
}
