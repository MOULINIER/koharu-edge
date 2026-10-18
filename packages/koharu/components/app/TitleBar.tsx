'use client'

import { openUrl } from '@tauri-apps/plugin-opener'
import { FilePlus2, FolderOpen, LoaderCircle, RotateCcw, Settings } from 'lucide-react'
import Image from 'next/image'
import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { AboutDialog } from '@/components/app/AboutDialog'
import { useMacOS, WindowControls } from '@/components/app/WindowChrome'
import { call } from '@/lib/backend'
import { selectableLayer } from '@/lib/geometry'
import {
  pageKey,
  pagesKey,
  projectKey,
  refresh,
  useCommand,
  useImportPages,
  usePage,
  usePages,
  useProject,
} from '@/lib/queries'
import { useKoharuStore } from '@/lib/store'
import { commands, type Operation, type Scope, type Stage } from '@koharu/bridge/protocol'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@koharu/ui/components/alert-dialog'
import { Checkbox } from '@koharu/ui/components/checkbox'
import {
  Menubar,
  MenubarContent as UiMenubarContent,
  MenubarItem as UiMenubarItem,
  MenubarMenu,
  MenubarSeparator as UiMenubarSeparator,
  MenubarShortcut as UiMenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger as UiMenubarTrigger,
} from '@koharu/ui/components/menubar'
import { cn } from '@koharu/ui/lib/utils'

// A webview preference like the shortcuts, so it persists in the webview's
// storage rather than the native config.
const skipResetAllConfirmKey = 'koharu-skip-reset-all-confirm'

function skipsResetAllConfirm() {
  try {
    return globalThis.localStorage?.getItem(skipResetAllConfirmKey) === 'true'
  } catch {
    return false
  }
}

function skipResetAllConfirm() {
  try {
    globalThis.localStorage?.setItem(skipResetAllConfirmKey, 'true')
  } catch {
    // Storage can be unavailable or full; the dialog then keeps asking.
  }
}

export function TitleBar() {
  const { t } = useTranslation()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [reset, setReset] = useState<{ pages: string[]; all: boolean } | null>(null)
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const macOS = useMacOS()
  const project = useProject().data
  const pagesQuery = usePages(Boolean(project))
  const pageQuery = usePage(Boolean(project))
  const pages = project ? (pagesQuery.data ?? []) : []
  const page = project ? (pageQuery.data ?? null) : null
  const selectedPages = useKoharuStore((state) => state.selectedPages)
  const selectedLayers = useKoharuStore((state) => state.selectedLayers)
  const selectLayers = useKoharuStore((state) => state.selectLayers)
  const setSettingsOpen = useKoharuStore((state) => state.setSettingsOpen)
  const requestCanvasFit = useKoharuStore((state) => state.requestCanvasFit)
  const { importPages, importing } = useImportPages()
  const { run: exportProject, busy: exporting } = useCommand(
    ['export-project'],
    commands.export,
    'menu.export',
  )

  const run = (scope: Scope, operation: Operation = { operation: 'full' }) =>
    void call(commands.process, scope, operation).catch(() => undefined)

  const closeProject = () => void call(commands.closeProject).catch(() => undefined)

  const resetPages = (pages: string[]) => {
    setReset(null)
    void call(commands.resetPages, pages)
      .then(() => {
        selectLayers([])
        return refresh(projectKey, pagesKey, pageKey)
      })
      .catch(() => undefined)
  }

  return (
    <>
      <header
        data-tauri-drag-region='deep'
        className='relative flex h-10 shrink-0 items-center bg-[var(--surface-titlebar)] text-[12px]'
      >
        {macOS ? (
          <div className='w-[84px] shrink-0' />
        ) : (
          <div className='relative z-10 flex h-full w-10 shrink-0 items-center justify-center rounded-br-lg'>
            <Image
              className='pointer-events-none'
              src='/icon.png'
              alt='Koharu Edge'
              width={17}
              height={17}
              draggable={false}
              priority
            />
          </div>
        )}
        <Menubar className='relative z-10 h-full shrink-0 gap-0 border-0 bg-transparent p-0 shadow-none'>
          <MenubarMenu>
            <MenubarTrigger>{t('menu.file')}</MenubarTrigger>
            <MenubarContent>
              <MenubarSub>
                <MenubarSubTrigger
                  disabled={!project || importing}
                  aria-busy={importing}
                  className='min-h-8 gap-1.5 px-2 py-1 text-xs'
                >
                  {importing && <LoaderCircle className='animate-spin' aria-hidden='true' />}
                  {importing ? t('navigator.importing') : t('menu.import')}
                </MenubarSubTrigger>
                <MenubarSubContent className='min-w-40 p-1'>
                  <MenubarItem disabled={importing} onClick={() => importPages('files')}>
                    <FilePlus2 />
                    {t('navigator.importFiles')}
                  </MenubarItem>
                  <MenubarItem disabled={importing} onClick={() => importPages('folder')}>
                    <FolderOpen />
                    {t('navigator.importFolder')}
                  </MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSub>
                <MenubarSubTrigger
                  disabled={!project || pages.length === 0 || exporting}
                  aria-busy={exporting}
                  className='min-h-8 gap-1.5 px-2 py-1 text-xs'
                >
                  {exporting && <LoaderCircle className='animate-spin' aria-hidden='true' />}
                  {t('menu.export')}
                </MenubarSubTrigger>
                <MenubarSubContent className='min-w-40 p-1'>
                  {(['png', 'psd', 'cbz'] as const).map((format) => (
                    <MenubarItem
                      key={format}
                      disabled={exporting}
                      onClick={() => exportProject(format)}
                    >
                      {format.toUpperCase()}…
                    </MenubarItem>
                  ))}
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSeparator />
              <MenubarItem disabled={!project} onClick={closeProject}>
                {t('menu.closeProject')}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setSettingsOpen(true)}>
                <Settings />
                {t('menu.settings')}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>{t('menu.edit')}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={!project?.can_undo}
                onClick={() =>
                  void call(commands.undo)
                    .then(() => refresh(projectKey, pagesKey, pageKey))
                    .catch(() => undefined)
                }
              >
                {t('menu.undo')}
                <MenubarShortcut>Ctrl+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!project?.can_redo}
                onClick={() =>
                  void call(commands.redo)
                    .then(() => refresh(projectKey, pagesKey, pageKey))
                    .catch(() => undefined)
                }
              >
                {t('menu.redo')}
                <MenubarShortcut>Ctrl+Shift+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={!page}
                onClick={() =>
                  selectLayers(page?.layers.filter(selectableLayer).map((layer) => layer.id) ?? [])
                }
              >
                {t('menu.selectAllLayers')}
                <MenubarShortcut>Ctrl+A</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={selectedLayers.length === 0}
                variant='destructive'
                onClick={() =>
                  void call(commands.deleteLayers, selectedLayers)
                    .then(() => refresh(projectKey, pagesKey, pageKey))
                    .catch(() => undefined)
                }
              >
                {t('menu.delete')}
                <MenubarShortcut>Del</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={selectedPages.length === 0}
                onClick={() => setReset({ pages: selectedPages, all: false })}
              >
                {t('menu.resetPages')}
              </MenubarItem>
              <MenubarItem
                disabled={!project || pages.length === 0}
                onClick={() => {
                  const all = pages.map((item) => item.id)
                  if (skipsResetAllConfirm()) {
                    resetPages(all)
                  } else {
                    setDontAskAgain(false)
                    setReset({ pages: all, all: true })
                  }
                }}
              >
                {t('menu.resetAllPages')}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>{t('menu.process')}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={!project || pages.length === 0}
                onClick={() => run({ scope: 'project' })}
              >
                {t('menu.processProject')}
              </MenubarItem>
              <MenubarItem
                disabled={selectedPages.length === 0}
                onClick={() => run({ scope: 'pages', value: selectedPages })}
              >
                {t('menu.processPages')}
              </MenubarItem>
              <MenubarItem
                disabled={selectedLayers.length === 0}
                onClick={() =>
                  run(
                    { scope: 'entities', value: selectedLayers },
                    { operation: 'stages', stages: ['ocr', 'translation'] },
                  )
                }
              >
                {t('menu.processLayers')}
              </MenubarItem>
              <MenubarSeparator />
              {(['detection', 'ocr', 'translation', 'inpainting'] as Stage[]).map((stage) => (
                <MenubarItem
                  key={stage}
                  disabled={!project || pages.length === 0}
                  onClick={() => run({ scope: 'project' }, { operation: 'through', stage })}
                >
                  {t('menu.runPhase', {
                    phase: t(`phase.${stage}`),
                  })}
                </MenubarItem>
              ))}
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>{t('menu.view')}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled={!page} onClick={requestCanvasFit}>
                {t('menu.fit')}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>{t('menu.help')}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                onClick={() => void openUrl('https://discord.gg/mHvHkxGnUY').catch(() => undefined)}
              >
                {t('menu.discord')}
              </MenubarItem>
              <MenubarItem
                onClick={() =>
                  void openUrl('https://github.com/MOULINIER/koharu-edge').catch(() => undefined)
                }
              >
                {t('menu.github')}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setAboutOpen(true)}>{t('menu.about')}</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        <div className='min-w-0 flex-1' />
        <div className='pointer-events-none absolute inset-y-0 left-1/2 flex max-w-[40vw] min-w-16 -translate-x-1/2 items-center justify-center px-3 text-[11px] text-muted-foreground select-none'>
          {project ? (
            <span className='truncate'>
              <span className='font-medium text-foreground'>{project.name}</span>
              {page && (
                <>
                  <span className='mx-2'>/</span>
                  <span>{page.label}</span>
                </>
              )}
            </span>
          ) : (
            <span>Koharu Edge</span>
          )}
        </div>

        {!macOS && <WindowControls />}
      </header>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <AlertDialog
        open={reset !== null}
        onOpenChange={(open) => {
          if (!open) setReset(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className='bg-destructive/10 text-destructive'>
              <RotateCcw className='size-5' />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {reset?.all ? t('menu.resetAllTitle') : t('menu.resetSelectedTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('menu.resetDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          {reset?.all && (
            <label className='flex items-center gap-2 text-xs'>
              <Checkbox checked={dontAskAgain} onCheckedChange={setDontAskAgain} />
              {t('menu.resetDontAskAgain')}
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                if (!reset) return
                if (reset.all && dontAskAgain) skipResetAllConfirm()
                resetPages(reset.pages)
              }}
            >
              {t('menu.resetConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MenubarTrigger({ className, ...props }: ComponentProps<typeof UiMenubarTrigger>) {
  return (
    <UiMenubarTrigger
      className={cn(
        'h-6 px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-muted-foreground aria-expanded:bg-primary/10 aria-expanded:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function MenubarContent({ className, ...props }: ComponentProps<typeof UiMenubarContent>) {
  return <UiMenubarContent className={cn('min-w-44 p-1', className)} {...props} />
}

function MenubarItem({ className, ...props }: ComponentProps<typeof UiMenubarItem>) {
  return (
    <UiMenubarItem
      className={cn(
        "min-h-8 gap-1.5 px-2 py-1 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    />
  )
}

function MenubarShortcut({ className, ...props }: ComponentProps<typeof UiMenubarShortcut>) {
  return <UiMenubarShortcut className={cn('text-[11px]', className)} {...props} />
}

function MenubarSeparator({ className, ...props }: ComponentProps<typeof UiMenubarSeparator>) {
  return <UiMenubarSeparator className={cn('my-0.5', className)} {...props} />
}
