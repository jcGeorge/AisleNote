import { describe, expect, it } from 'vitest'
import { normalizeExternalWebUrl } from './external-links'

describe('external web links', () => {
  it('accepts http and https links', () => {
    expect(normalizeExternalWebUrl('https://www.apheresis.org/page/ASFA_Membership')).toBe(
      'https://www.apheresis.org/page/ASFA_Membership',
    )
    expect(normalizeExternalWebUrl('http://example.com/path')).toBe('http://example.com/path')
  })

  it('normalizes www links to https links', () => {
    expect(normalizeExternalWebUrl('www.example.com/path')).toBe('https://www.example.com/path')
  })

  it('normalizes bare .com and .org links to https links', () => {
    expect(normalizeExternalWebUrl('example.com')).toBe('https://example.com/')
    expect(normalizeExternalWebUrl('apheresis.org/page/ASFA_Membership')).toBe(
      'https://apheresis.org/page/ASFA_Membership',
    )
  })

  it('rejects non-web links', () => {
    expect(normalizeExternalWebUrl('tabs://note/body-1')).toBeNull()
    expect(normalizeExternalWebUrl('mailto:test@example.com')).toBeNull()
    expect(normalizeExternalWebUrl('normal text')).toBeNull()
    expect(normalizeExternalWebUrl('example .com')).toBeNull()
    expect(normalizeExternalWebUrl('example. com')).toBeNull()
    expect(normalizeExternalWebUrl('exam ple.com')).toBeNull()
  })
})
