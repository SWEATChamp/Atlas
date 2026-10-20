import React, { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'

const navigation = vi.hoisted(() => ({ pendingHref: '' }))
// Model only Next's per-Link pending context; actual navigation remains Next Link.
const Pending = createContext(false)
vi.mock('next/link', () => ({
  default: ({ href, children, scroll, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; scroll?: boolean; prefetch?: boolean | null }) => {
    void scroll
    void prefetch
    return <Pending.Provider value={navigation.pendingHref === href}><a href={href} {...props}>{children}</a></Pending.Provider>
  },
  useLinkStatus: () => ({ pending: useContext(Pending) }),
}))
afterEach(() => { cleanup(); navigation.pendingHref = '' })
const subject = { id: 'math & stats', name: 'Mathematics', color_hex: '#00ff00' }

describe('subject navigation feedback', () => {
  it('contains every screen-reader status inside a positioned link in the horizontal scroll region', () => {
    render(<SubjectFilterTabs subjects={[subject, { ...subject, id: 'physics', name: 'Physics' }]} activeId={null} />)
    for (const status of screen.getAllByRole('status')) {
      expect(status.classList.contains('sr-only')).toBe(true)
      const link = status.closest('a')!
      expect(link.style.position).toBe('relative')
      expect(link.closest('nav')?.style.overflowX).toBe('auto')
    }
  })

  it('keeps real URL links, committed selection and reserved feedback without pending text', () => {
    render(<SubjectFilterTabs subjects={[subject]} activeId={null} />)
    const all = screen.getByRole('link', { name: 'All' })
    const math = screen.getByRole('link', { name: 'Mathematics' })
    expect(all.getAttribute('href')).toBe('/past-papers')
    expect(all.getAttribute('aria-current')).toBe('page')
    expect(math.getAttribute('href')).toBe('/past-papers?subject=math%20%26%20stats')
    expect(math.getAttribute('aria-current')).toBeNull()
    expect(math.tagName).toBe('A')
    expect(math.getAttribute('onclick')).toBeNull()
    expect(math.getAttribute('aria-disabled')).toBeNull()
    expect(within(math).getByRole('status').textContent).toBe('')
    const hint = math.querySelector<HTMLElement>('[aria-hidden="true"]')!
    expect(hint.style.position).toBe('absolute')
    expect(hint.style.opacity).toBe('0')
  })

  it('announces only the pending subject and leaves current selection unchanged until navigation commits', () => {
    navigation.pendingHref = '/past-papers?subject=math%20%26%20stats'
    const { rerender } = render(<SubjectFilterTabs subjects={[subject]} activeId={null} />)
    const all = screen.getByRole('link', { name: 'All' })
    const math = screen.getByRole('link', { name: /Mathematics/ })
    expect(within(math).getByRole('status').textContent).toBe('Loading Mathematics…')
    expect(math.querySelector<HTMLElement>('[aria-hidden="true"]')?.style.opacity).toBe('1')
    expect(within(all).getByRole('status').textContent).toBe('')
    expect(all.getAttribute('aria-current')).toBe('page')
    expect(math.getAttribute('aria-current')).toBeNull()
    navigation.pendingHref = ''
    rerender(<SubjectFilterTabs subjects={[subject]} activeId={subject.id} />)
    expect(within(math).getByRole('status').textContent).toBe('')
    expect(math.getAttribute('aria-current')).toBe('page')
  })
})
