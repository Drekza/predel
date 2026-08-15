import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberStepper } from '../NumberStepper'

describe('NumberStepper', () => {
  it('шагает вверх и вниз ровно на один шаг', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberStepper value={60} onChange={onChange} step={2.5} aria-label="Вес" />)

    await user.click(screen.getByRole('button', { name: 'Увеличить' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(62.5)

    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Уменьшить' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(57.5)
  })

  it('не выпускает значение за границы min/max', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <NumberStepper value={1} onChange={onChange} step={2.5} min={0} max={200} aria-label="Вес" />,
    )

    await user.click(screen.getByRole('button', { name: 'Уменьшить' }))
    expect(onChange).toHaveBeenCalledWith(0)

    rerender(
      <NumberStepper value={0} onChange={onChange} step={2.5} min={0} max={200} aria-label="Вес" />,
    )
    expect(screen.getByRole('button', { name: 'Уменьшить' })).toBeDisabled()

    rerender(
      <NumberStepper
        value={200}
        onChange={onChange}
        step={2.5}
        min={0}
        max={200}
        aria-label="Вес"
      />,
    )
    expect(screen.getByRole('button', { name: 'Увеличить' })).toBeDisabled()
  })

  it('пустое значение показывает прочерк, а ручной ввод принимает запятую', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberStepper value={null} onChange={onChange} step={2.5} aria-label="Вес" />)

    const readout = screen.getByRole('button', { name: 'Вес: —' })
    await user.click(readout)

    const input = screen.getByRole('textbox', { name: 'Вес' })
    await user.type(input, '72,5{Enter}')

    expect(onChange).toHaveBeenCalledExactlyOnceWith(72.5)
  })
})
