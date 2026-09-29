import { useState } from 'react'
import { Check, CheckCircle2, ChevronRight, QrCode, ExternalLink, LoaderCircle } from 'lucide-react'
import type { AssistantTriggerCategory } from '@xpert-ai/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea
} from '../../ui'
import { t, useLocale, localizeValidation, clearValidation } from '../../i18n'
import { invoke } from '../../host'
import { localizedText } from '../../../electron/i18n/index.mjs'
import {
  automationKinds,
  channelProviders,
  editableFields,
  initialConfig,
  needsAdvancedEditor,
  type AssistantTriggerProvider,
  type AssistantTriggerSettings,
  type AssistantTriggerItem
} from './model'
import { TriggerQrConnect } from './TriggerQrConnect'
import { ProviderIcon } from './ProviderIcon'
import { TriggerFields } from './TriggerFields'
import { ScheduleFields, scheduleSummary } from './ScheduleFields'

export function TriggerWizard({
  botId,
  category,
  data,
  initialProvider,
  item,
  onClose,
  onSaved
}: {
  botId: string
  category: AssistantTriggerCategory
  data: AssistantTriggerSettings
  initialProvider?: AssistantTriggerProvider
  item?: AssistantTriggerItem
  onClose: () => void
  onSaved: () => void
}) {
  const locale = useLocale()
  const [provider, setProvider] = useState(initialProvider)
  const [step, setStep] = useState(item && category === 'automation' ? 1 : 0)
  const [kind, setKind] = useState(initialProvider?.presentation.kind ?? 'schedule')
  const [config, setConfig] = useState(initialProvider ? initialConfig(initialProvider, item) : {})
  const [title, setTitle] = useState(item?.title ?? '')
  const [instructions, setInstructions] = useState(
    typeof item?.config.additionalInstructions === 'string' ? item.config.additionalInstructions : ''
  )
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [qr, setQr] = useState(false)
  const channel = category === 'channel'
  const used = (provider: AssistantTriggerProvider) =>
    data.items.some((entry) => entry.provider === provider.name && entry.key !== item?.key)
  const steps = channel
    ? ['Connect account', 'Response settings', 'Test & finish']
    : ['Trigger', 'Conditions', 'Additional Instructions', 'Review']
  const selected = (next: AssistantTriggerProvider) => {
    if (provider?.name !== next.name) {
      setConfig(initialConfig(next))
      setTitle(channel ? localizedText(next.label, locale) : '')
    }
    setProvider(next)
    setVerified(false)
    setStep(channel ? 0 : 1)
    setError('')
  }
  const fields = provider ? editableFields(provider) : []
  const schedule = provider?.name === 'schedule'
  const accountFields = fields.filter(([key]) => provider?.presentation.accountFields?.includes(key))
  const scenarioFields = fields.filter(([key]) => !provider?.presentation.accountFields?.includes(key))
  const showPicker = !provider || (!channel && step === 0)
  const advanced = provider && needsAdvancedEditor(provider)
  const change = () => ({
    revision: data.revision,
    provider: provider!.name,
    operation: 'save' as const,
    title: title.trim() || localizedText(provider!.label, locale),
    config: {
      ...config,
      additionalInstructions: instructions,
      ...(provider?.presentation.instructionField
        ? { [provider.presentation.instructionField]: config[provider.presentation.instructionField] || title.trim() }
        : {})
    }
  })
  const manage = async () => {
    try {
      const result = await invoke('assistantTriggerManageUrl', { botId })
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    }
  }
  const submit = async () => {
    if (!provider || advanced || busy) return
    setError('')
    const currentFields = channel ? (step === 0 ? accountFields : scenarioFields) : fields
    if (
      step < steps.length - 1 &&
      currentFields.some(
        ([key]) =>
          provider.schema.required?.includes(key) &&
          (config[key] === undefined || config[key] === null || config[key] === '')
      )
    ) {
      setError(t('Complete the required fields before continuing.'))
      return
    }
    if (step < steps.length - 1) {
      setStep(step + 1)
      return
    }
    setBusy(true)
    try {
      if (channel && !verified) {
        const result = await invoke('validateAssistantTrigger', { botId, change: change() })
        setVerified(result.valid)
      } else {
        await invoke('saveAssistantTrigger', { botId, change: change() })
        setSaved(true)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          if (saved) onSaved()
          else onClose()
        }
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>
            {t(item ? (channel ? 'Manage channel' : 'Edit automation') : channel ? 'Add channel' : 'Create automation')}
          </DialogTitle>
          <DialogDescription>
            {t(
              channel
                ? 'Talk to this assistant from the apps you already use.'
                : 'Start work automatically with this assistant’s existing instructions, skills, tools and connectors.'
            )}
          </DialogDescription>
        </DialogHeader>
        {!showPicker && !saved && !qr && (
          <ol aria-label={t('Configuration steps')} className="flex shrink-0 gap-2 border-b px-6 py-4">
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? 'step' : undefined}
                className={`flex min-w-0 flex-1 items-center gap-1.5 text-[10px] ${index === step ? 'font-medium text-primary' : 'text-muted-foreground'}`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${index <= step ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                >
                  {index < step ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="truncate" title={t(label)}>
                  {t(label)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <form
          className="flex min-h-0 flex-1 flex-col"
          onInvalid={localizeValidation}
          onInput={clearValidation}
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {saved ? (
              <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="size-12 text-primary" />
                <h3 className="text-lg font-semibold">
                  {t(channel ? 'Channel configuration saved' : 'Automation saved')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    channel
                      ? 'Send a message in the connected app to try your assistant.'
                      : 'This automation uses the current assistant’s published configuration.'
                  )}
                </p>
              </div>
            ) : qr && provider ? (
              <TriggerQrConnect
                botId={botId}
                provider={provider.name}
                onBusy={setBusy}
                onConnected={() => {
                  setSaved(true)
                  setQr(false)
                  setBusy(false)
                }}
              />
            ) : showPicker ? (
              <div className="space-y-4">
                {channel ? (
                  channelProviders(data.providers).map((option) => (
                    <button
                      type="button"
                      key={option.name}
                      disabled={!option.available || used(option)}
                      onClick={() => selected(option)}
                      className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <ProviderIcon provider={option.presentation.channel} />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{localizedText(option.label, locale)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(
                            used(option)
                              ? 'Already configured'
                              : option.available
                                ? 'Connect an account to start chatting.'
                                : 'Provider plugin required'
                          )}
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </button>
                  ))
                ) : (
                  <>
                    <h3 className="text-sm font-medium">{t('What should trigger this automation?')}</h3>
                    {automationKinds.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setKind(option.id)}
                        aria-pressed={kind === option.id}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${kind === option.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      >
                        <ProviderIcon kind={option.id} />
                        <span className="flex-1">
                          <span className="block text-sm font-medium">{t(option.label)}</span>
                          <span className="text-xs text-muted-foreground">{t(option.description)}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </button>
                    ))}
                    <div className="space-y-2 border-t pt-3">
                      {data.providers
                        .filter(
                          (option) => option.presentation.category === 'automation' && option.presentation.kind === kind
                        )
                        .map((option) => (
                          <Button
                            key={option.name}
                            type="button"
                            variant="outline"
                            className="w-full justify-between"
                            disabled={used(option)}
                            onClick={() => selected(option)}
                          >
                            {localizedText(option.label, locale)}
                            {used(option) && (
                              <span className="text-xs text-muted-foreground">{t('Already configured')}</span>
                            )}
                            <ChevronRight className="size-4" />
                          </Button>
                        ))}
                      {!data.providers.some(
                        (option) => option.presentation.category === 'automation' && option.presentation.kind === kind
                      ) && (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {t('Install a provider for this trigger type in Xpert to continue.')}
                        </p>
                      )}
                    </div>
                    {data.items.some((entry) =>
                      data.providers.some(
                        (option) => option.name === entry.provider && option.presentation.kind === kind
                      )
                    ) && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t(
                          'This provider supports one trigger per assistant. Edit the existing trigger to change its settings.'
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              provider && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <ProviderIcon provider={provider.presentation.channel} kind={provider.presentation.kind} />
                    <h3 className="font-semibold">{localizedText(provider.label, locale)}</h3>
                  </div>
                  {channel && step === 0 && provider.quickConnect?.method === 'qr' && (
                    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm">{t('Connect by scanning a QR code. No app credentials to enter.')}</p>
                      <Button type="button" onClick={() => setQr(true)}>
                        <QrCode className="size-4" />
                        {t('Connect with QR code')}
                      </Button>
                    </div>
                  )}
                  {advanced ? (
                    <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                      {t('This provider needs advanced configuration. Manage it in Xpert.')}
                    </p>
                  ) : channel && step < 2 ? (
                    <>
                      <h4 className="text-sm font-medium">
                        {t(step === 0 ? 'Choose the account for this channel' : 'When should this assistant respond?')}
                      </h4>
                      <TriggerFields
                        botId={botId}
                        provider={provider}
                        fields={step === 0 ? accountFields : scenarioFields}
                        config={config}
                        disabled={busy}
                        onChange={(next) => {
                          setConfig(next)
                          setVerified(false)
                        }}
                      />
                      {(step === 0 ? accountFields : scenarioFields).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t('This provider uses its existing connection and default response settings.')}
                        </p>
                      )}
                      {step === 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => void manage()}>
                          <ExternalLink className="size-3.5" />
                          {t('Manage accounts in Xpert')}
                        </Button>
                      )}
                    </>
                  ) : !channel && step === 1 ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="automation-name">{t('Automation name')}</Label>
                        <Input
                          id="automation-name"
                          value={title}
                          maxLength={120}
                          required
                          disabled={busy}
                          placeholder={t('e.g. Daily project briefing')}
                          onChange={(event) => setTitle(event.target.value)}
                        />
                      </div>
                      <TriggerFields
                        botId={botId}
                        provider={provider}
                        fields={schedule ? fields.filter(([key]) => key !== 'cron') : fields}
                        config={config}
                        disabled={busy}
                        onChange={setConfig}
                      />
                      {schedule && (
                        <ScheduleFields
                          value={typeof config.cron === 'string' ? config.cron : '0 8 * * 1-5'}
                          disabled={busy}
                          onChange={(cron) => setConfig({ ...config, cron })}
                        />
                      )}
                    </>
                  ) : !channel && step === 2 ? (
                    <div className="space-y-2">
                      <Label htmlFor="automation-instructions">{t('Additional Instructions')}</Label>
                      <Textarea
                        id="automation-instructions"
                        className="min-h-32"
                        value={instructions}
                        maxLength={8000}
                        placeholder={t(
                          'Optional context for this automation, such as what to summarize or where to focus.'
                        )}
                        onChange={(event) => setInstructions(event.target.value)}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t('The assistant’s role, skills, tools and connectors are inherited automatically.')}
                      </p>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-sm font-medium">
                        {channel ? t('Test the configuration before finishing.') : title}
                      </h4>
                      <dl className="divide-y text-xs">
                        {fields.map(([key, field]) => (
                          <div key={key} className="flex gap-4 py-2">
                            <dt className="text-muted-foreground">{localizedText(field.title, locale) || key}</dt>
                            <dd className="ml-auto max-w-[60%] break-words text-right">
                              {typeof config[key] === 'boolean'
                                ? t(config[key] ? 'Enabled' : 'Disabled')
                                : schedule && key === 'cron'
                                  ? scheduleSummary(String(config[key] ?? ''))
                                  : String(config[key] ?? t('Not configured'))}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {instructions && (
                        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs leading-5">
                          {instructions}
                        </p>
                      )}
                      {channel && (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {t('Testing validates the provider configuration. Finish saves and activates the channel.')}
                        </p>
                      )}
                      {verified && (
                        <p role="status" className="flex items-center gap-2 text-sm text-primary">
                          <CheckCircle2 className="size-4" />
                          {t('Configuration verified')}
                        </p>
                      )}
                    </>
                  )}
                  {advanced && (
                    <Button type="button" variant="outline" onClick={() => void manage()}>
                      <ExternalLink className="size-4" />
                      {t('Manage in Xpert')}
                    </Button>
                  )}
                </div>
              )
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4">
            {saved ? (
              <Button type="button" className="ml-auto" onClick={onSaved}>
                {t('Done')}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setError('')
                    if (qr) setQr(false)
                    else if (step > (item && !channel ? 1 : 0)) setStep(step - 1)
                    else if (provider && !item) setProvider(undefined)
                    else onClose()
                  }}
                >
                  {t(qr || step > (item && !channel ? 1 : 0) || (provider && !item) ? 'Back' : 'Cancel')}
                </Button>
                {!showPicker && !qr && (
                  <Button type="submit" disabled={busy || !!advanced}>
                    {busy && <LoaderCircle className="size-4 animate-spin" />}
                    {t(
                      step < steps.length - 1
                        ? 'Continue'
                        : channel && !verified
                          ? 'Test configuration'
                          : item
                            ? 'Save changes'
                            : channel
                              ? 'Finish connection'
                              : 'Create automation'
                    )}
                  </Button>
                )}
              </>
            )}
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
