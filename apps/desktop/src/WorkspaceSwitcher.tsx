import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@xpert-ai/shadcn-ui'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from './i18n'
import type { DiscoveryWorkspace } from './catalog-types'
import type { Profile } from './types'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const wideCharacter =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u3000-\u303f\uff01-\uff60]/u

function compactOrganizationName(name: string) {
  const label = name.trim()
  let width = 0
  for (const { segment, index } of graphemes.segment(label)) {
    width += wideCharacter.test(segment) ? 2 : 1
    if (width > 8) return label.slice(0, index).trimEnd() + '…'
  }
  return label
}

function OrganizationLogo({ organization }: { organization: Profile['organizations'][number] }) {
  return (
    <Avatar aria-hidden="true" className="size-5 rounded-md after:rounded-md">
      {organization.imageUrl && (
        <AvatarImage
          src={organization.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="rounded-md object-contain"
        />
      )}
      <AvatarFallback className="rounded-md text-xs font-medium">
        {graphemes.segment(organization.name.trim()).containing(0)?.segment.toLocaleUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

function OrganizationMenu({ profile, onSelect }: { profile: Profile; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const exit = useRef<{ x: number; y: number; destination: HTMLElement } | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  function cancelHover() {
    clearTimeout(timer.current)
    timer.current = undefined
    exit.current = null
  }
  useEffect(() => {
    if (!open) return cancelHover
    const close = () => {
      cancelHover()
      setOpen(false)
    }
    const track = (event: globalThis.PointerEvent) => {
      const from = exit.current
      if (!from || event.pointerType !== 'mouse') return
      // Interpolate the triangle from the exit point to the facing edge of the other menu.
      const to = from.destination.getBoundingClientRect()
      const edgeX = from.x < to.left ? to.left : to.right
      const progress = (event.clientX - from.x) / (edgeX - from.x)
      const inside =
        progress >= 0 &&
        progress <= 1 &&
        event.clientY >= from.y + (to.top - from.y) * progress - 5 &&
        event.clientY <= from.y + (to.bottom - from.y) * progress + 5
      if (inside) {
        clearTimeout(timer.current)
        timer.current = setTimeout(close, 350)
      }
    }
    const controller = new AbortController()
    const options = { signal: controller.signal, capture: true }
    document.addEventListener('pointermove', track, options)
    document.addEventListener(
      'pointerout',
      (event) => {
        if (!event.relatedTarget) close()
      },
      options
    )
    window.addEventListener('blur', close, { signal: controller.signal })
    return () => {
      controller.abort()
      cancelHover()
    }
  }, [open])

  function changeOpen(next: boolean) {
    cancelHover()
    previousFocus.current = null
    setOpen(next)
  }

  function enterTrigger(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    cancelHover()
    if (!open) {
      timer.current = setTimeout(() => {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setOpen(true)
      }, 120)
    }
  }

  function leave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    cancelHover()
    if (!open) return
    const source = event.currentTarget.getBoundingClientRect()
    const destination = (event.currentTarget === trigger.current ? menu : trigger).current
    if (!destination) return
    exit.current = {
      x: Math.max(source.left, Math.min(event.clientX, source.right)),
      y: Math.max(source.top, Math.min(event.clientY, source.bottom)),
      destination
    }
    timer.current = setTimeout(() => setOpen(false), 250)
  }

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          className="h-8 w-full justify-between px-2 font-normal data-[state=open]:bg-accent"
          onPointerEnter={enterTrigger}
          onPointerLeave={leave}
          onPointerDown={(event) => {
            if (open && event.button === 0 && !event.ctrlKey) event.preventDefault()
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              changeOpen(true)
            }
          }}
        >
          {t('Switch organization')}
          <ChevronRight className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={menu}
        side="right"
        align="end"
        className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-(--radix-dropdown-menu-content-available-width) overflow-y-auto"
        onPointerEnter={cancelHover}
        onPointerLeave={leave}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && trigger.current?.contains(event.target)) event.preventDefault()
        }}
        onKeyDown={(event) => {
          cancelHover()
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            changeOpen(false)
          }
        }}
        onCloseAutoFocus={(event) => {
          if (previousFocus.current?.isConnected) {
            event.preventDefault()
            previousFocus.current.focus({ preventScroll: true })
          }
        }}
      >
        <DropdownMenuRadioGroup value={profile.organizationId ?? ''} onValueChange={onSelect}>
          {profile.organizations.map((org) => (
            <DropdownMenuRadioItem value={org.id} key={org.id} textValue={org.name} className="gap-2">
              <OrganizationLogo organization={org} />
              <span className="truncate" title={org.name}>
                {org.name}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceSwitcher({
  profile,
  workspaces,
  workspaceId,
  pending,
  error,
  onWorkspace,
  onOrganization,
  onRefreshOrganizations,
  onRefreshWorkspaces
}: {
  profile: Profile
  workspaces: DiscoveryWorkspace[]
  workspaceId: string
  pending: boolean
  error: string
  onWorkspace: (id: string) => void
  onOrganization: (id: string) => void
  onRefreshOrganizations: () => void
  onRefreshWorkspaces: () => void
}) {
  const organization = profile.organizations.find((item) => item.id === profile.organizationId)
  const workspace = workspaces.find((item) => item.id === workspaceId)
  const workspaceName = workspace?.name ?? t('All assistants')
  const scopeLabel = `${organization?.name ?? t('No organization')} / ${workspaceName}`
  const [open, setOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  function selectWorkspace(id: string) {
    onWorkspace(id)
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        setOpen(open)
        if (open) {
          onRefreshOrganizations()
          onRefreshWorkspaces()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={pending}
          className="min-w-0 max-w-full gap-1.5 px-2"
          aria-label={t('Switch organization or workspace')}
          aria-description={scopeLabel}
          title={scopeLabel}
        >
          {organization && <OrganizationLogo organization={organization} />}
          <span className="min-w-0 truncate text-base font-semibold">
            {organization ? compactOrganizationName(organization.name) : t('No organization')}
          </span>
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">{workspaceName}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        aria-label={t('Switch organization or workspace')}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchInput.current?.focus()
        }}
        className="max-h-(--radix-popover-content-available-height) w-72 max-w-(--radix-popover-content-available-width) gap-0 overflow-hidden p-1"
      >
        <Command
          label={t('Search workspaces')}
          filter={(_value, query, keywords) =>
            keywords?.[0]?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? 1 : 0
          }
          className="h-auto min-h-0 p-0"
        >
          <CommandInput ref={searchInput} placeholder={t('Search workspaces')} aria-label={t('Search workspaces')} />
          <Button
            variant="ghost"
            aria-pressed={!workspaceId}
            className="mt-1 h-8 w-full shrink-0 justify-start px-2 font-normal"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
            }}
            onClick={() => selectWorkspace('')}
          >
            {t('All assistants')}
            {!workspaceId && <Check className="ml-auto size-4" />}
          </Button>
          <CommandList className="mt-1 min-h-0 max-h-64 overflow-y-auto overscroll-contain border-t py-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:block">
            {!error && <CommandEmpty>{t('No matching results')}</CommandEmpty>}
            {workspaces.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                keywords={[item.name]}
                data-checked={workspaceId === item.id}
                onSelect={() => selectWorkspace(item.id)}
              >
                <span className="min-w-0 truncate" title={item.name}>
                  {item.name}
                </span>
                {!item.canWrite && <span className="shrink-0 text-xs text-muted-foreground">{t('Read only')}</span>}
                {workspaceId === item.id && <span className="sr-only">{t('Selected')}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        {error && (
          <Button variant="ghost" className="h-8 justify-start" title={error} onClick={onRefreshWorkspaces}>
            {t('Retry')}
          </Button>
        )}
        <div className="shrink-0 border-t pt-1">
          <OrganizationMenu
            profile={profile}
            onSelect={(id) => {
              setOpen(false)
              if (id !== profile.organizationId) onOrganization(id)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
