import { describe, it, expect, beforeEach, vi } from 'vitest'

const { readFaviconMock } = vi.hoisted(() => ({ readFaviconMock: vi.fn() }))
vi.mock('../api', () => ({ readFavicon: readFaviconMock }))

import { faviconDataUrl } from './useFavicon'

describe('useFavicon', () => {
  beforeEach(() => {
    readFaviconMock.mockReset()
  })

  it('caches successful reads per path', async () => {
    readFaviconMock.mockResolvedValue('data:image/png;base64,AAAA')
    const path = 'C:/data/favicons/cache-hit.png'
    await expect(faviconDataUrl(path)).resolves.toBe('data:image/png;base64,AAAA')
    await expect(faviconDataUrl(path)).resolves.toBe('data:image/png;base64,AAAA')
    expect(readFaviconMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache failures so a later call can retry', async () => {
    readFaviconMock
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce('data:image/png;base64,BBBB')
    const path = 'C:/data/favicons/retry.png'
    await expect(faviconDataUrl(path)).resolves.toBeNull()
    await expect(faviconDataUrl(path)).resolves.toBe('data:image/png;base64,BBBB')
    expect(readFaviconMock).toHaveBeenCalledTimes(2)
  })
})
