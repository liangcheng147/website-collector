import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'

const componentsDir = resolve(__dirname, '../src/components')

describe('icon unification', () => {
  it('no emoji icons in component templates', () => {
    const files = readdirSync(componentsDir).filter(f => f.endsWith('.vue'))
    const emojiPatterns = ['⚠', '🗑', '＋', '▦', '⚙', '■', '▶', '✕', '↩', '⧉', '⤢', '⤡', '⏹', '▼', '←', '⧈', '→']
    for (const file of files) {
      const content = readFileSync(join(componentsDir, file), 'utf-8')
      for (const emoji of emojiPatterns) {
        // allow emoji in comments or strings that aren't UI icons
        // check for emoji in template section specifically
        const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
        if (templateMatch) {
          expect(templateMatch[1]).not.toContain(emoji, `${file} still uses emoji ${emoji} in template`)
        }
      }
    }
  })
})
