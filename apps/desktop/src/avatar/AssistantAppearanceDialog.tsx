import { useEffect, useRef, useState } from 'react'
import type { TAssistantAppearance, TAvatar } from '@xpert-ai/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label
} from '@xpert-ai/shadcn-ui'
import { ArrowLeft, LoaderCircle, Palette, Upload } from 'lucide-react'
import { invoke } from '../host'
import { t } from '../i18n'
import { AppearancePreview } from './AppearancePreview'
import { CharacterEditor } from './CharacterEditor'
import { CharacterSettings } from './CharacterSettings'
import { ActivityPicker } from './ActivityPicker'
import { ImageAvatarPicker } from './ImageAvatarPicker'
import { CharacterPresetPicker } from './CharacterPresetPicker'
import { isImageAvatarPreset, type ImageAvatarPreset } from './image-avatar-presets'
import { defaultCharacterConfig } from './custom-character'
import { preparePet, usePetCatalog } from './pet-assets'
import { avatarPng, characterColors, characterSvg } from './character-presets'
import type { HostMethods } from '../types'

export function AssistantAppearanceDialog({
  botId,
  onClose,
  onSaved
}: {
  botId: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [profile, setProfile] = useState<HostMethods['assistantAppearance']['output']>()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<TAvatar>({})
  const [preview, setPreview] = useState('')
  const [source, setSource] = useState('')
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const [changed, setChanged] = useState(false)
  const [pending, setPending] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pets = usePetCatalog(botId)
  const [petSource, setPetSource] = useState('')
  const [petUpload, setPetUpload] = useState<Awaited<ReturnType<typeof preparePet>>>()
  const [previewState, setPreviewState] = useState('idle')
  const [designing, setDesigning] = useState(false)
  const uploadPet = useRef<HTMLInputElement>(null)
  const petType = useRef<'sprite-atlas' | 'animated-image'>('animated-image')
  const [reload, setReload] = useState(0)
  const upload = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    invoke('assistantAppearance', { botId })
      .then((result) => {
        if (!active) return
        setProfile(result)
        setName(result.name)
        setAvatar(result.avatar)
        setDesigning(result.avatar.appearance?.kind === 'character' && !!result.avatar.appearance.config)
        setPreview(result.avatar.url || '')
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : t('Could not load the assistant.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      generation.current++
    }
  }, [botId, reload])
  useEffect(() => {
    let active = true
    const appearance = profile?.avatar.appearance
    const version = generation.current
    if (appearance?.kind === 'pet' && !appearance.asset) {
      void pets
        .load(appearance.id)
        .then((asset) => {
          if (active && version === generation.current) {
            setPetSource(asset.src)
            setAvatar((current) => ({
              ...current,
              appearance: { ...appearance, spriteVersionNumber: asset.spriteVersionNumber }
            }))
          }
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [profile, pets.load])
  useEffect(() => {
    if (!source) {
      setCropping(false)
      return
    }
    let active = true
    setCropping(true)
    void avatarPng(source, { zoom, x, y, fit: isImageAvatarPreset(source) ? 'contain' : 'cover' })
      .then((png) => {
        if (active) setPreview(png)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? t(reason.message) : t('Could not load the image.'))
      })
      .finally(() => {
        if (active) setCropping(false)
      })
    return () => {
      active = false
    }
  }, [source, zoom, x, y])
  const chooseImage = (preset: ImageAvatarPreset) => {
    generation.current++
    setError('')
    setPetSource('')
    setPetUpload(undefined)
    setSource(preset.src)
    setZoom(1)
    setX(50)
    setY(50)
    setAvatar({ appearance: { version: 1, kind: 'image' } })
    setPreview(preset.src)
    setChanged(true)
  }
  const choose = async (appearance: Exclude<TAssistantAppearance, { kind: 'image' }>) => {
    const version = ++generation.current
    setError('')
    setSource('')
    if (appearance.kind === 'character') {
      setPetUpload(undefined)
      setPetSource('')
      setAvatar({ appearance })
      setPreview(characterSvg(appearance))
      setChanged(true)
      return
    }
    setPending(true)
    try {
      const asset = await pets.load(appearance.id)
      const png = asset.preview
      if (version !== generation.current) return
      setPetSource(asset?.src ?? '')
      setPetUpload(undefined)
      setAvatar({ appearance: { ...appearance, spriteVersionNumber: asset.spriteVersionNumber } })
      setPreview(png)
      setChanged(true)
    } catch (reason) {
      if (version === generation.current)
        setError(reason instanceof Error ? t(reason.message) : t('Could not load the image.'))
    } finally {
      if (version === generation.current) setPending(false)
    }
  }
  const save = async () => {
    if (pending || cropping || !profile?.canEdit || !name.trim()) return
    setPending(true)
    setError('')
    try {
      let next = avatar
      if (petUpload && avatar.appearance?.kind === 'pet') {
        const resource = await invoke('uploadAssistantPet', { botId, data: petUpload.data })
        next = { ...avatar, appearance: { ...avatar.appearance, asset: { type: petUpload.type, url: resource.url } } }
        // Retain a completed upload when a later save needs to be retried.
        setAvatar(next)
        setPetUpload(undefined)
      }
      if (changed) {
        const png = preview.startsWith('data:image/png;base64,')
          ? preview
          : await avatarPng(preview, { fit: isImageAvatarPreset(preview) ? 'contain' : 'cover' })
        const image = await invoke('uploadAssistantAvatar', { botId, data: png.split(',')[1] })
        next = { ...next, url: image.url }
      }
      await invoke('saveAssistantAppearance', { botId, revision: profile.revision, name: name.trim(), avatar: next })
      await onSaved()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Could not save the assistant.'))
    } finally {
      setPending(false)
    }
  }
  const studio =
    designing && avatar.appearance?.kind === 'character' && avatar.appearance.config ? avatar.appearance : undefined
  const disabled = loading || pending || !profile?.canEdit
  const currentColor = avatar.appearance?.kind === 'character' ? avatar.appearance.color : characterColors[0]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent
        className={`max-h-[90vh] overflow-auto p-0 ${studio ? 'sm:max-w-5xl' : 'sm:max-w-4xl'}`}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <div className={`grid ${studio ? 'md:grid-cols-[minmax(0,1fr)_340px]' : 'sm:grid-cols-[1.4fr_1fr]'}`}>
          <div className="min-w-0 space-y-6 p-7">
            <DialogHeader>
              <DialogTitle>{t('Customize your assistant')}</DialogTitle>
              <DialogDescription>
                {t('Everyone who uses this assistant can see its name and appearance.')}
              </DialogDescription>
            </DialogHeader>
            {loading && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <LoaderCircle className="size-4 animate-spin" />
                {t('Loading…')}
              </p>
            )}
            {profile && !profile.canEdit && (
              <p className="text-sm text-muted-foreground">
                {t('You can view this appearance. Workspace edit access is required to save changes.')}
              </p>
            )}
            {studio && (
              <button
                type="button"
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDesigning(false)}
              >
                <ArrowLeft className="size-3.5" />
                {t('Back to appearances')}
              </button>
            )}
            <fieldset disabled={disabled} className="min-w-0 space-y-6">
              {studio ? (
                <CharacterEditor
                  value={studio}
                  onChange={(value) => void choose(value)}
                  state={previewState}
                  onStateChange={setPreviewState}
                />
              ) : (
                <>
                  <ImageAvatarPicker
                    selectedSrc={avatar.appearance?.kind === 'image' ? source : ''}
                    onSelect={chooseImage}
                  />
                  <CharacterPresetPicker
                    value={avatar.appearance}
                    color={currentColor}
                    onSelect={(value) => {
                      void choose(value)
                      setPreviewState('idle')
                    }}
                  />
                  <div>
                    <h3 className="mb-3 text-sm text-muted-foreground">{t('Colors')}</h3>
                    <div className="flex flex-wrap gap-3">
                      {characterColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={color}
                          aria-pressed={color === currentColor}
                          className="size-8 rounded-full ring-offset-2 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-foreground"
                          style={{ backgroundColor: color }}
                          onClick={() =>
                            void choose({
                              ...(avatar.appearance?.kind === 'character' ? avatar.appearance : { id: 'bosi' }),
                              version: 1,
                              kind: 'character',
                              color
                            })
                          }
                        />
                      ))}
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        {t('Custom color')}
                        <input
                          aria-label={t('Custom color')}
                          type="color"
                          value={currentColor}
                          className="size-8 cursor-pointer rounded border-0 bg-transparent"
                          onChange={(event) =>
                            void choose({
                              ...(avatar.appearance?.kind === 'character'
                                ? avatar.appearance
                                : { id: 'custom', config: defaultCharacterConfig }),
                              version: 1,
                              kind: 'character',
                              color: event.target.value
                            })
                          }
                        />
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setDesigning(true)
                        void choose({
                          version: 1,
                          kind: 'character',
                          id:
                            avatar.appearance?.kind === 'character' && avatar.appearance.config
                              ? avatar.appearance.id
                              : 'custom',
                          color: currentColor,
                          config:
                            avatar.appearance?.kind === 'character'
                              ? (avatar.appearance.config ?? defaultCharacterConfig)
                              : defaultCharacterConfig
                        })
                      }}
                    >
                      <Palette className="size-4" />
                      {t('Design a character')}
                    </Button>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm text-muted-foreground">{t('Virtual pets')}</h3>
                    {pets.loading && <p className="text-xs text-muted-foreground">{t('Loading…')}</p>}
                    {pets.error && (
                      <div role="alert" className="mb-3 text-xs text-destructive">
                        {pets.error}{' '}
                        <button type="button" className="underline" onClick={pets.retry}>
                          {t('Retry')}
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-5 gap-2">
                      {pets.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={avatar.appearance?.kind === 'pet' && avatar.appearance.id === item.id}
                          className="flex aspect-square flex-col items-center justify-center rounded-2xl p-1 hover:bg-muted aria-pressed:ring-2 aria-pressed:ring-primary disabled:opacity-50"
                          onClick={() => void choose({ version: 1, kind: 'pet', id: item.id })}
                        >
                          {pets.previews[item.id] ? (
                            <img src={pets.previews[item.id]} alt="" className="aspect-square w-full object-contain" />
                          ) : (
                            <span className="py-4 text-xs text-muted-foreground">◇</span>
                          )}
                          <span className="text-[10px]">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          petType.current = 'animated-image'
                          uploadPet.current?.click()
                        }}
                      >
                        <Upload className="size-4" />
                        {t('Upload pet animation')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          petType.current = 'sprite-atlas'
                          uploadPet.current?.click()
                        }}
                      >
                        {t('Import sprite sheet / ZIP')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('GIF / WebP / PNG / ZIP, up to 8 MB. Sprite versions are detected automatically.')}
                    </p>
                    {petUpload?.spriteVersionNumber && (
                      <p role="status" className="text-xs text-muted-foreground">
                        {petUpload.displayName && `${petUpload.displayName} · `}
                        {t('Detected sprite format')}: v{petUpload.spriteVersionNumber}
                        {petUpload.spriteVersionNumber === 2 && ` · ${t('16 look directions')}`}
                      </p>
                    )}
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">{t('Sprite sheet format')}</summary>
                      <p className="mt-2">{t('Use a 1536 × 1872 (v1) or 1536 × 2288 (v2) sprite sheet.')}</p>
                      <p className="mt-1">
                        {t(
                          'ZIP supports pet.json with its sprite sheet, or a single sprite sheet. v2 adds 16 look directions.'
                        )}
                      </p>
                      <p className="mt-1">
                        {t(
                          'Rows: idle, run right, run left, wave, jump, failed, waiting, working, review. Frames: 6, 8, 8, 4, 5, 8, 6, 6, 6.'
                        )}
                      </p>
                    </details>
                    <input
                      ref={uploadPet}
                      hidden
                      type="file"
                      accept="image/png,image/webp,image/gif,.zip,application/zip"
                      onChange={async (event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (!file) return
                        const version = ++generation.current
                        setPending(true)
                        setError('')
                        try {
                          const asset = await preparePet(file, petType.current)
                          if (version !== generation.current) return
                          setSource('')
                          setPetUpload(asset)
                          setPetSource(asset.src)
                          setPreview(asset.preview)
                          setAvatar({
                            appearance: {
                              version: 1,
                              kind: 'pet',
                              id: `pet-${crypto.randomUUID()}`,
                              spriteVersionNumber: asset.spriteVersionNumber,
                              asset: { type: asset.type, url: asset.src }
                            }
                          })
                          setChanged(true)
                        } catch (reason) {
                          if (version === generation.current)
                            setError(reason instanceof Error ? t(reason.message) : t('Could not load the image.'))
                        } finally {
                          if (version === generation.current) setPending(false)
                        }
                      }}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => upload.current?.click()}>
                    <Upload className="size-4" />
                    {t('Upload image')}
                  </Button>
                  <input
                    ref={upload}
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) {
                        setError(t('Choose an image smaller than 10 MB.'))
                        return
                      }
                      const version = ++generation.current
                      setPending(true)
                      setError('')
                      const local = URL.createObjectURL(file)
                      try {
                        const image = await avatarPng(local)
                        const source = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader()
                          reader.onload = () =>
                            typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error())
                          reader.onerror = () => reject(reader.error)
                          reader.readAsDataURL(file)
                        })
                        if (version !== generation.current) return
                        setPetSource('')
                        setPetUpload(undefined)
                        setSource(source)
                        setZoom(1)
                        setX(50)
                        setY(50)
                        setAvatar({ appearance: { version: 1, kind: 'image' } })
                        setPreview(image)
                        setChanged(true)
                      } catch {
                        if (version === generation.current) setError(t('Could not load the image.'))
                      } finally {
                        URL.revokeObjectURL(local)
                        if (version === generation.current) setPending(false)
                      }
                    }}
                  />
                </>
              )}
            </fieldset>
          </div>
          <div
            className={`flex flex-col gap-5 bg-muted/40 p-6 ${studio ? 'md:sticky md:top-0 md:max-h-[90vh] md:border-l' : 'sm:sticky sm:top-0 sm:max-h-[90vh] sm:border-l'}`}
          >
            <Label htmlFor="assistant-public-name">{t('Name')}</Label>
            <Input
              id="assistant-public-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              disabled={disabled}
              className="h-12 shrink-0 text-xl"
            />
            {studio ? (
              <fieldset disabled={disabled} className="min-h-0 min-w-0 overflow-y-auto pr-1">
                <CharacterSettings
                  value={studio}
                  onChange={(value) => {
                    void choose(value)
                    setPreviewState('idle')
                  }}
                />
              </fieldset>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1">
                <div className="flex min-h-48 flex-1 shrink-0 items-center justify-center">
                  <div className="size-44 text-primary">
                    <AppearancePreview
                      appearance={avatar.appearance}
                      preview={preview}
                      petSource={petSource}
                      state={previewState}
                      name={name}
                    />
                  </div>
                </div>
                {source && avatar.appearance?.kind === 'image' && (
                  <fieldset disabled={disabled} className="shrink-0 space-y-3">
                    {(
                      [
                        ['Zoom', zoom, 1, 3, 0.01, setZoom],
                        ['Horizontal position', x, 0, 100, 1, setX],
                        ['Vertical position', y, 0, 100, 1, setY]
                      ] as const
                    ).map(([label, value, min, max, step, setter]) => (
                      <label key={label} className="block text-xs text-muted-foreground">
                        {t(label)}
                        <input
                          className="mt-2 w-full accent-primary"
                          type="range"
                          min={min}
                          max={max}
                          step={step}
                          value={value}
                          onChange={(event) => setter(Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </fieldset>
                )}
                {avatar.appearance && avatar.appearance.kind !== 'image' && (
                  <ActivityPicker
                    appearance={avatar.appearance}
                    preview={preview}
                    petSource={petSource}
                    value={previewState}
                    onChange={setPreviewState}
                  />
                )}
              </div>
            )}
            {error && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{error}</p>
                {!profile && (
                  <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
                    {t('Retry')}
                  </Button>
                )}
              </div>
            )}
            <Button
              className="h-11 rounded-full"
              disabled={disabled || cropping || !name.trim()}
              onClick={() => void save()}
            >
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
