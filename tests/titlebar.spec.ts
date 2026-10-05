import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const vue = readFileSync(resolve(__dirname, '../src/components/TitleBar.vue'), 'utf-8')

describe('titlebar', () => {
  it('uses lucide icon for logo', () => {
    expect(vue).toContain('lucide-vue-next')
  })
})
