import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DurationStepper } from '../DurationStepper'

async function typeDuration(text: string, onChange: ReturnType<typeof vi.fn>) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Кардио: —:—' }))
  const input = screen.getByRole('textbox', { name: 'Кардио' })
  await user.clear(input)
  await user.type(input, `${text}{Enter}`)
  return onChange
}

describe('DurationStepper', () => {
  it('показывает мм:сс и прочерк для пустого значения', () => {
    const { rerender } = render(
      <DurationStepper valueSec={null} onChange={() => {}} aria-label="Кардио" />,
    )
    expect(screen.getByRole('button', { name: 'Кардио: —:—' })).toBeInTheDocument()

    rerender(<DurationStepper valueSec={630} onChange={() => {}} aria-label="Кардио" />)
    expect(screen.getByRole('button', { name: 'Кардио: 10:30' })).toBeInTheDocument()
  })

  it('разбирает «10:30», «630» и «10.5» одинаково — как 10 мин 30 с', async () => {
    for (const text of ['10:30', '630', '10.5']) {
      const onChange = vi.fn()
      const { unmount } = render(
        <DurationStepper valueSec={null} onChange={onChange} aria-label="Кардио" />,
      )
      await typeDuration(text, onChange)
      expect(onChange, `ввод «${text}»`).toHaveBeenCalledExactlyOnceWith(630)
      unmount()
    }
  })

  it('шагает по 30 секунд и упирается в границы 0 и 36000', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <DurationStepper valueSec={null} onChange={onChange} aria-label="Кардио" />,
    )

    await user.click(screen.getByRole('button', { name: 'Плюс 30 секунд' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(30)

    onChange.mockClear()
    rerender(<DurationStepper valueSec={10} onChange={onChange} aria-label="Кардио" />)
    await user.click(screen.getByRole('button', { name: 'Минус 30 секунд' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(0)

    onChange.mockClear()
    rerender(<DurationStepper valueSec={35990} onChange={onChange} aria-label="Кардио" />)
    await user.click(screen.getByRole('button', { name: 'Плюс 30 секунд' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(36000)

    rerender(<DurationStepper valueSec={36000} onChange={onChange} aria-label="Кардио" />)
    expect(screen.getByRole('button', { name: 'Плюс 30 секунд' })).toBeDisabled()
  })
})
