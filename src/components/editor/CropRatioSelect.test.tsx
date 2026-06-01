import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CropRatioSelect } from './CropRatioSelect'

describe('CropRatioSelect', () => {
  it('renders shared crop ratio options', () => {
    const html = renderToStaticMarkup(<CropRatioSelect value="youtube" onChange={vi.fn()} />)

    expect(html).toContain('YouTube 16:9')
    expect(html).toContain('Reels 9:16')
    expect(html).toContain('Wide 21:9')
  })

  it('normalizes unknown values to freeform', () => {
    const html = renderToStaticMarkup(<CropRatioSelect value="bad-ratio" onChange={vi.fn()} />)

    expect(html).toContain('<option value="freeform" selected="">Freeform</option>')
  })
})

