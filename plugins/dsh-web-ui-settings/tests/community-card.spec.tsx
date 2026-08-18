/** @vitest-environment jsdom */

/**
 * The community plugin index card contract: it renders the contributor links
 * (pointing at the authors' own repositories) only after the header expands,
 * and explains itself when the index is empty.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CommunityPluginsCard, type CommunityPluginsCardProps } from '../src/client/CommunityPluginsCard.tsx'
import { communityPluginsEn, type CommunityPluginKey } from '../src/client/locales.ts'
import type { CommunityPluginEntry } from '../src/client/generated/community.ts'

afterEach(cleanup)

/** English translate stub (same shape the sibling settings-card tests use). */
const t: CommunityPluginsCardProps['t'] = (key) => {
  return (communityPluginsEn as Record<string, string>)[key] ?? key
}

const SAMPLE: CommunityPluginEntry[] = [
  {
    id: 'dsh-sample',
    name: '示例插件',
    nameEn: 'Sample Plugin',
    author: 'someone',
    description: '一个示例条目。',
    descriptionEn: 'A sample entry.',
    repo: 'https://github.com/someone/dsh-sample',
    npm: '@someone/dsh-sample',
  },
]

describe('CommunityPluginsCard', () => {
  it('renders nothing inside until the header expands', () => {
    render(<CommunityPluginsCard t={t} plugins={SAMPLE} />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /show plugins: community plugins/i }))
    expect(screen.getByRole('link', { name: /repository/i })).toBeTruthy()
  })

  it('links to the contributor repository with the npm name alongside', () => {
    render(<CommunityPluginsCard t={t} plugins={SAMPLE} />)
    fireEvent.click(screen.getByRole('button', { name: /show plugins: community plugins/i }))
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://github.com/someone/dsh-sample')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer')
    expect(screen.getByText('@someone/dsh-sample')).toBeTruthy()
    expect(screen.getByText('Author: someone')).toBeTruthy()
    expect(screen.getByText('A sample entry.')).toBeTruthy()
  })

  it('renders the empty notice when no entries are registered', () => {
    render(<CommunityPluginsCard t={t} plugins={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /show plugins: community plugins/i }))
    expect(screen.getByText(/no community plugins registered yet/i)).toBeTruthy()
  })
})
