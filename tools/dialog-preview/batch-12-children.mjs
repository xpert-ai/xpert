// Local content adapters only; Dialog frames, forms, buttons and skill list templates are production code.
import { Component, Pipe } from '@angular/core'
export function batchTwelveChildren(imports) {
  const types = []
  function child(selector, template, inputs = []) {
    class Content {}
    Component({ standalone: true, selector, imports, inputs, template, host: { class: 'block min-w-0' } })(Content)
    types.push(Content)
  }
  child('xp-countdown', '<span class="font-mono text-muted-foreground">00:10</span>', ['config'])
  child('emoji-avatar', '<span class="flex size-10 items-center justify-center rounded-xl bg-muted">🤖</span>', [
    'avatar'
  ])
  child('xp-icon', '<span class="inline-flex items-center justify-center text-primary"><z-icon zType="box" /></span>', [
    'icon',
    'size'
  ])
  child(
    'xp-settings-basic',
    '<div class="space-y-4"><label class="block space-y-2"><span>{{"XP.KEY_WORDS.Name" | translate:{Default:"Name"} }}</span><input z-input class="w-full" value="Research assistant" /></label><label class="block space-y-2"><span>{{"XP.KEY_WORDS.Description" | translate:{Default:"Description"} }}</span><textarea z-input class="w-full" rows="4">Find sources, summarize research and prepare reports.</textarea></label></div>',
    ['page']
  )
  child(
    'xp-file-preview-content',
    '<div class="flex min-h-80 h-full items-center justify-center bg-muted/40"><article class="max-w-lg space-y-4 bg-background p-8 shadow-sm"><h3 class="text-xl font-medium">Research report</h3><p class="text-muted-foreground">Local preview content · PDF renderer and remote files are verified by existing component tests.</p><div class="h-2 w-full bg-muted"></div><div class="h-2 w-3/4 bg-muted"></div></article></div>',
    ['content', 'documentBlob', 'downloadable', 'error', 'fileName', 'loading', 'previewKind', 'spreadsheet', 'url']
  )
  class Relative {
    transform() {
      return '2 hours ago'
    }
  }
  Pipe({ name: 'relative', standalone: true })(Relative)
  types.push(Relative)
  return types
}
