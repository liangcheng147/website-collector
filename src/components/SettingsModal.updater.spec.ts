import { describe, it, expect } from 'vitest'
import { ref, shallowRef, isReactive, isProxy } from 'vue'
import { Resource } from '@tauri-apps/api/core'

// Mirrors Tauri v2's real Resource: a genuine private field accessed via
// __classPrivateFieldGet, which brand-checks `this`. A Proxy wrapper fails
// that check, which is exactly what the updater hit.
class FakeResource extends Resource {
  read() {
    return this.rid
  }
}

describe('SettingsModal update holder', () => {
  it('a deep ref() would break downloadAndInstall (the bug we fixed)', () => {
    const raw = new FakeResource(42)
    expect(raw.read()).toBe(42)

    const r = ref<FakeResource | null>(null)
    r.value = raw

    expect(isReactive(r.value)).toBe(true)
    expect(() => r.value!.read()).toThrow(
      /private member|Cannot read private member/,
    )
  })

  it('shallowRef keeps the Update instance intact', () => {
    const raw = new FakeResource(42)
    const r = shallowRef<FakeResource | null>(null)
    r.value = raw

    expect(isProxy(r.value)).toBe(false)
    expect(r.value!.read()).toBe(42)
  })
})