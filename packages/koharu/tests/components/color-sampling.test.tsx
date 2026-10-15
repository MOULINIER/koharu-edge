import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render as testingRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ColorSamplingProvider, useColorSampling } from '@/components/controls/ColorSampling'
import { ColorWell } from '@/components/controls/ColorWell'
import { projectKey, queryClient } from '@/lib/queries'
import { useKoharuStore } from '@/lib/store'
import { commands, type ProjectInfo } from '@koharu/bridge/protocol'

function render(ui: ReactElement) {
  return testingRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function openProject(palette: ProjectInfo['palette']) {
  queryClient.setQueryData<ProjectInfo>(projectKey, {
    name: 'Manga',
    revision: 1,
    active_page: null,
    can_undo: false,
    can_redo: false,
    palette,
  })
}

describe('canvas color sampling', () => {
  beforeEach(() => {
    useKoharuStore.setState({ tool: 'text' })
    queryClient.setQueryData(projectKey, null)
  })

  it('applies a canvas sample to the requesting color well and restores the previous tool', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ColorSamplingProvider>
        <ColorWell value='#111111' onChange={onChange} />
        <CompleteSample />
      </ColorSamplingProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Brush color' }))
    await user.click(screen.getByRole('button', { name: 'Pick color from canvas' }))
    expect(useKoharuStore.getState().tool).toBe('color_picker')

    await user.click(screen.getByRole('button', { name: 'Complete sample' }))
    expect(onChange).toHaveBeenCalledWith('#123456')
    expect(useKoharuStore.getState().tool).toBe('text')
  })

  it('commits shorthand white as a full RGB color', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorWell value='#111111' onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Brush color' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Hex color code' }), {
      target: { value: '#FFF' },
    })

    expect(onChange).toHaveBeenCalledWith('#FFFFFF')
  })

  it('commits the final picker color when its window-level drag ends', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorWell value='#111111' onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Brush color' }))
    const picker = screen.getByRole('slider', { name: 'Color' })
    Object.defineProperty(picker, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 160 }),
    })
    fireEvent.mouseDown(picker, { buttons: 1, clientX: 0, clientY: 0 })
    await waitFor(() =>
      expect(picker).toHaveAttribute('aria-valuetext', 'Saturation 0%, Brightness 100%'),
    )
    fireEvent.mouseUp(window)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('#FFFFFF'))
  })

  it('saves, applies and removes project palette colors', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const setPalette = vi.spyOn(commands, 'setPalette').mockResolvedValue(null)
    openProject([[255, 0, 0]])
    render(<ColorWell value='#111111' onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Brush color' }))
    await user.click(screen.getByRole('button', { name: 'Save this color to the project' }))
    expect(setPalette).toHaveBeenLastCalledWith([
      [255, 0, 0],
      [17, 17, 17],
    ])

    const saved = screen.getByRole('button', { name: '#FF0000 (right-click to remove)' })
    await user.click(saved)
    expect(onChange).toHaveBeenLastCalledWith('#FF0000')

    fireEvent.contextMenu(saved)
    expect(setPalette).toHaveBeenLastCalledWith([])
  })

  it('hides the palette without an open project', async () => {
    const user = userEvent.setup()
    render(<ColorWell value='#111111' onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Brush color' }))
    expect(screen.queryByRole('group', { name: 'Project colors' })).not.toBeInTheDocument()
  })
})

function CompleteSample() {
  const sampling = useColorSampling()
  return (
    <button type='button' onClick={() => sampling?.complete('#123456')}>
      Complete sample
    </button>
  )
}
