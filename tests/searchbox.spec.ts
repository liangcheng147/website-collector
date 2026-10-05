import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const vue = readFileSync(resolve(__dirname, '../src/components/TopBar.vue'), 'utf-8')

describe('search box', () => {
  it('has search icon', () => {
    expect(vue).toContain('Search')
  })
})
