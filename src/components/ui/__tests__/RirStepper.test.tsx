import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RirStepper } from '../RirStepper'

describe('RirStepper', () => {
  it('даёт шесть сегментов с русскими подписями и склонением', () => {
    render(<RirStepper value={null} onChange={() => {}} />)

    const segments = screen.getAllByRole('radio')
    expect(segments).toHaveLength(6)
    expect(segments.map((el) => el.getAttribute('aria-label'))).toEqual([
      'запас 0 повторов',
      'запас 1 повтор',
      'запас 2 повтора',
      'запас 3 повтора',
      'запас 4 повтора',
      'запас 5 повторов',
    ])
  })

  it('выбирает значение, а повторный тап по выбранному сбрасывает его', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<RirStepper value={null} onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'запас 2 повтора' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2)

    onChange.mockClear()
    rerender(<RirStepper value={2} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'запас 2 повтора' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'запас 2 повтора' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('показывает целевой RIR подписью', () => {
    render(<RirStepper value={null} onChange={() => {}} targetRir={2} />)
    expect(screen.getByText('цель — запас 2')).toBeInTheDocument()
  })
})
