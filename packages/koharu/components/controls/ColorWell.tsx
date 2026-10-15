'use client'

import { Pipette, Plus, SquareSlash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { useTranslation } from 'react-i18next'

import { useColorSampling } from '@/components/controls/ColorSampling'
import { call } from '@/lib/backend'
import { projectKey, refresh, useProject } from '@/lib/queries'
import { commands } from '@koharu/bridge/protocol'
import { Button } from '@koharu/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@koharu/ui/components/popover'
import { cn } from '@koharu/ui/lib/utils'

type ColorWellProps = {
  label?: string
  size?: 'default' | 'sm'
  disabled?: boolean
} & (
  | {
      value: string
      allowTransparent?: false
      onChange: (color: string) => void
    }
  | {
      value: string | null
      allowTransparent: true
      onChange: (color: string | null) => void
    }
)

export function ColorWell(props: ColorWellProps) {
  const { t } = useTranslation()
  const { value, label, size = 'default', disabled = false, allowTransparent = false } = props
  const [draft, setDraft] = useState(value ?? '#000000')
  const [transparent, setTransparent] = useState(value === null)
  const [open, setOpen] = useState(false)
  const sampling = useColorSampling()
  const accessibleLabel = label ?? t('colorPicker.brushColor')

  useEffect(() => {
    if (value === null) {
      setTransparent(true)
    } else {
      setDraft(value)
      setTransparent(false)
    }
  }, [value])

  const set = (color: string) => {
    const normalized = normalize(color)
    setDraft(normalized)
    setTransparent(false)
    if (props.allowTransparent) props.onChange(normalized)
    else props.onChange(normalized)
  }

  const clear = () => {
    if (!props.allowTransparent) return
    setTransparent(true)
    props.onChange(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={accessibleLabel}
        disabled={disabled}
        className={cn(
          'grid place-items-center border border-input bg-background disabled:cursor-not-allowed disabled:opacity-40',
          size === 'sm' ? 'size-6 rounded-md' : 'size-8 rounded-lg',
        )}
      >
        {transparent ? (
          <SquareSlash
            aria-hidden='true'
            className={cn('text-muted-foreground', size === 'sm' ? 'size-3.5' : 'size-4')}
          />
        ) : (
          <span
            className={cn(
              'rounded-[3px] ring-1 ring-black/15',
              size === 'sm' ? 'size-3' : 'size-4',
            )}
            style={{ backgroundColor: draft }}
          />
        )}
      </PopoverTrigger>
      <PopoverContent side='right' align='start' className='w-60 rounded-xl p-3'>
        <div>
          <HexColorPicker
            color={draft}
            onChange={(color) => setDraft(normalize(color))}
            onChangeEnd={set}
          />
        </div>
        <div className='mt-3 flex gap-2'>
          <HexColorInput
            prefixed
            color={draft}
            aria-label={t('colorPicker.hexCode')}
            className='h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 font-mono text-[11px] uppercase outline-none focus:border-ring'
            onChange={set}
          />
          {sampling && (
            <Button
              size='icon'
              variant='outline'
              aria-label={t('colorPicker.sampleCanvas')}
              onClick={() => {
                setOpen(false)
                sampling.request(set)
              }}
            >
              <Pipette />
            </Button>
          )}
        </div>
        <ProjectPalette current={transparent ? null : draft} onPick={set} />
        {allowTransparent && (
          <Button
            type='button'
            size='sm'
            variant={transparent ? 'secondary' : 'ghost'}
            className='mt-2 w-full justify-start gap-2'
            onClick={clear}
          >
            <SquareSlash aria-hidden='true' className='size-3.5 text-muted-foreground' />
            {t('colorPicker.transparent')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Mirrors `Palette::MAX_COLORS` in koharu-scene.
const PALETTE_LIMIT = 32

// The open project's saved colors: click to apply, right-click to remove.
function ProjectPalette({
  current,
  onPick,
}: {
  current: string | null
  onPick: (color: string) => void
}) {
  const { t } = useTranslation()
  const project = useProject().data
  if (!project) return null
  const colors = project.palette.map(rgbToHex)
  const save = (next: string[]) =>
    void call(commands.setPalette, next.map(hexToRgb))
      .then(() => refresh(projectKey))
      .catch(() => undefined)
  const canAdd = current !== null && !colors.includes(current) && colors.length < PALETTE_LIMIT
  return (
    <div role='group' aria-label={t('colorPicker.palette')} className='mt-3 flex flex-wrap gap-1'>
      {colors.map((color) => (
        <button
          key={color}
          type='button'
          title={t('colorPicker.paletteColor', { color })}
          aria-label={t('colorPicker.paletteColor', { color })}
          aria-pressed={color === current}
          className={cn(
            'size-5 rounded-[3px] ring-1 ring-black/15 outline-none focus-visible:ring-2 focus-visible:ring-ring',
            color === current && 'ring-2 ring-ring',
          )}
          style={{ backgroundColor: color }}
          onClick={() => onPick(color)}
          onContextMenu={(event) => {
            event.preventDefault()
            save(colors.filter((candidate) => candidate !== color))
          }}
        />
      ))}
      {canAdd && (
        <button
          type='button'
          title={t('colorPicker.paletteAdd')}
          aria-label={t('colorPicker.paletteAdd')}
          className='grid size-5 place-items-center rounded-[3px] border border-dashed border-input text-muted-foreground hover:text-foreground'
          onClick={() => save([...colors, current])}
        >
          <Plus className='size-3' />
        </button>
      )}
    </div>
  )
}

function rgbToHex(color: [number, number, number]): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function normalize(value: string): string {
  const digits = value.startsWith('#') ? value.slice(1) : value
  const expanded =
    digits.length === 3 ? [...digits].map((digit) => digit.repeat(2)).join('') : digits
  return `#${expanded}`.toUpperCase()
}
