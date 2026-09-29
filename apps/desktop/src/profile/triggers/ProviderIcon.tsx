import { AlarmClock, AtSign, Hash, Mail, MessageCircle, Send, Webhook, Zap } from 'lucide-react'

export function ProviderIcon({ provider, kind }: { provider?: string; kind?: string }) {
  const Icon =
    provider === 'telegram'
      ? Send
      : provider === 'linear'
        ? AtSign
        : provider === 'slack'
          ? Hash
          : provider
            ? MessageCircle
            : kind === 'schedule'
              ? AlarmClock
              : kind === 'webhook'
                ? Webhook
                : kind === 'email'
                  ? Mail
                  : Zap
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Icon className="size-5" />
    </span>
  )
}
