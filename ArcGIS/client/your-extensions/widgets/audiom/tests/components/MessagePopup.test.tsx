import { render } from '@testing-library/react'
import MessagePopup, { MessageType, MessagePosition } from '../../src/runtime/components/MessagePopup'

describe('MessagePopup', () => {
  it('renders nothing when show=false', () => {
    const { container } = render(<MessagePopup show={false} message="hi" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders an alert with role+aria-live and the message text', () => {
    const { getByRole, getByText } = render(
      <MessagePopup show={true} message="Map changes detected." />
    )
    const alert = getByRole('alert')
    expect(alert.getAttribute('aria-live')).toBe('polite')
    expect(getByText('Map changes detected.')).toBeTruthy()
  })

  it('uses the variant icon by default and a custom icon when supplied', () => {
    const { getByRole, rerender } = render(
      <MessagePopup show={true} message="warn me" variant={MessageType.Warning} />
    )
    expect(getByRole('alert').textContent).toContain('⚠️')
    rerender(<MessagePopup show={true} message="warn me" variant={MessageType.Warning} icon="🔥" />)
    expect(getByRole('alert').textContent).toContain('🔥')
    expect(getByRole('alert').textContent).not.toContain('⚠️')
  })

  it('honors position prop (top vs bottom)', () => {
    const { getByRole, rerender } = render(
      <MessagePopup show={true} message="m" position={MessagePosition.Top} />
    )
    const top = getByRole('alert') as HTMLElement
    expect(top.style.top).toBe('10px')
    expect(top.style.bottom).toBe('')

    rerender(<MessagePopup show={true} message="m" position={MessagePosition.Bottom} />)
    const bottom = getByRole('alert') as HTMLElement
    expect(bottom.style.bottom).toBe('10px')
    expect(bottom.style.top).toBe('')
  })

  it.each([MessageType.Warning, MessageType.Notification, MessageType.Error])(
    'applies the %s variant background', (variant) => {
      const { getByRole } = render(<MessagePopup show={true} message="m" variant={variant} />)
      const el = getByRole('alert') as HTMLElement
      expect(el.style.backgroundColor).not.toBe('')
    }
  )

  it('does not allow HTML injection in the message (text-only render)', () => {
    const { getByRole } = render(
      <MessagePopup show={true} message={'<img src=x onerror="x">' as any} />
    )
    const el = getByRole('alert') as HTMLElement
    // React escapes by default; assert no <img> child element was created
    expect(el.querySelector('img')).toBeNull()
  })
})
