import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const vue = readFileSync(resolve(__dirname, '../src/components/ContextMenu.vue'), 'utf-8')

describe('context menu', () => {
  it('imports lucide icons', () => {
    expect(vue).toContain('lucide-vue-next')
  })
})
