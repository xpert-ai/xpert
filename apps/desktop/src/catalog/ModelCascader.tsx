import { useRef, useState } from 'react'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@xpert-ai/shadcn-ui'
import { Brain, Check, ChevronDown, ChevronRight, Eye, ScanText, Sparkles, Wrench } from 'lucide-react'
import { t } from '../i18n'
import { isComputerModel, matchesModel, modelTags, providerGroups, rankModels, type ModelOption } from './model-options'

export function ModelCascader({
  id,
  models,
  value,
  onChange,
  disabled,
  computer = false,
  defaultModelId
}: {
  id: string
  models: ModelOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  computer?: boolean
  defaultModelId?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [providerId, setProviderId] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const selected = models.find((model) => model.id === value)
  const matching = rankModels(
    models.filter((model) => matchesModel(model, query)),
    computer,
    defaultModelId
  )
  const groups = providerGroups(matching)
  const visible = providerId === null ? groups : groups.filter((group) => group.id === providerId)
  const chooseProvider = (provider: string | null) => setProviderId(provider)
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('Model')}</Label>
      <Popover
        open={open && !disabled}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            setQuery('')
            setProviderId(selected?.provider?.id ?? null)
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={trigger}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={selected ? t('Selected model: {{name}}', { name: selected.label }) : t('Select a model')}
            className="h-auto min-h-14 w-full justify-between gap-3 rounded-xl px-3 py-2.5 text-left font-normal"
          >
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{selected?.label || t('Select a model')}</span>
                {selected?.id === defaultModelId && (
                  <span className="shrink-0 text-xs text-muted-foreground">{t('Organization default')}</span>
                )}
              </span>
              {selected && (
                <>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[selected.provider?.label, selected.connectionName].filter(Boolean).join(' / ')}
                  </span>
                  <ModelBadges model={selected} />
                </>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          aria-label={t('Choose a model')}
          className="flex w-[min(38rem,calc(100vw-2rem))] max-h-[min(30rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-xl p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            search.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        >
          <Command shouldFilter={false} className="min-h-0" label={t('Choose a model')}>
            <CommandInput
              ref={search}
              value={query}
              aria-label={t('Search models or providers')}
              placeholder={t('Search models or providers')}
              onValueChange={(next) => {
                setQuery(next)
                setProviderId(null)
              }}
            />
            {computer && (
              <div className="flex shrink-0 items-start gap-2 border-b bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Eye className="mt-0.5 size-4 shrink-0 text-primary" />
                {t('Cloud computer works best with vision and tool calling. Compatible models are recommended below.')}
              </div>
            )}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(100px,0.7fr)_minmax(0,2fr)]">
              <div
                role="group"
                aria-label={t('Model providers')}
                className="max-h-80 space-y-1 overflow-y-auto overscroll-contain border-r bg-muted/30 p-1.5"
              >
                {[
                  { id: null, label: t('All providers'), count: matching.length },
                  ...groups.map((group) => ({
                    id: group.id,
                    label: group.label || t('Other providers'),
                    count: group.models.length
                  }))
                ].map((group) => (
                  <button
                    key={group.id ?? '__all'}
                    type="button"
                    aria-pressed={providerId === group.id}
                    onClick={() => chooseProvider(group.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowRight') {
                        event.preventDefault()
                        search.current?.focus()
                      }
                    }}
                    className={`flex w-full items-center gap-1 rounded-lg px-2 py-2.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${providerId === group.id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'}`}
                  >
                    <span className="min-w-0 flex-1 break-words">{group.label}</span>
                    <span className="text-[10px] tabular-nums opacity-70">{group.count}</span>
                    <ChevronRight className="size-3 shrink-0" />
                  </button>
                ))}
              </div>
              <CommandList className="max-h-80 min-h-32 min-w-0 overscroll-contain p-1" aria-label={t('Models')}>
                <CommandEmpty>{t('No matching models')}</CommandEmpty>
                {visible.map((group) => (
                  <CommandGroup key={group.id} heading={group.label || t('Other providers')}>
                    {group.models.map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => {
                          onChange(model.id)
                          setOpen(false)
                        }}
                        className="cursor-pointer items-start rounded-lg px-2 py-2.5"
                      >
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="block break-words font-medium">{model.label}</span>
                          {model.connectionName && (
                            <span className="block truncate text-xs text-muted-foreground">{model.connectionName}</span>
                          )}
                          <ModelBadges model={model} />
                          {((computer && isComputerModel(model)) || model.id === defaultModelId) && (
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-primary">
                              {computer && isComputerModel(model) && (
                                <span className="inline-flex items-center gap-1">
                                  <Sparkles className="size-3" />
                                  {t('Recommended for cloud computer')}
                                </span>
                              )}
                              {model.id === defaultModelId && <span>{t('Organization default')}</span>}
                            </span>
                          )}
                        </span>
                        {model.id === value && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      {computer && (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
          <Eye className="mt-0.5 size-3.5 shrink-0" />
          {t('Vision models can understand screenshots and operate the cloud computer.')}
        </p>
      )}
    </div>
  )
}

function ModelBadges({ model }: { model: ModelOption }) {
  const tags = modelTags(model)
  if (!tags.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const Icon =
          tag.key === 'vision' ? Eye : tag.key === 'reasoning' ? Brain : tag.key === 'tools' ? Wrench : ScanText
        return (
          <span
            key={tag.key}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-normal leading-4 text-muted-foreground"
          >
            <Icon className="size-3" aria-hidden="true" />
            {t(tag.label, { size: tag.value ?? '' })}
          </span>
        )
      })}
    </span>
  )
}
