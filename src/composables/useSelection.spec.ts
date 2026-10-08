import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useSelection } from './useSelection'

describe('useSelection', () => {
  it('toggle after selectAll must not mutate the source list', () => {
    const source = ref(['下载', 'TV', '软件'])
    const sel = useSelection(() => source.value)

    sel.selectAll()
    expect(sel.selected.value).toEqual(['下载', 'TV', '软件'])

    // 取消勾选其中一个标签
    sel.toggle('下载')

    // 关键断言：取消勾选只应改选中态，绝不能改动数据源
    expect(sel.selected.value).toEqual(['TV', '软件'])
    expect(source.value).toEqual(['下载', 'TV', '软件'])
  })

  it('re-selecting all after partial toggle still works', () => {
    const source = ref(['a', 'b', 'c'])
    const sel = useSelection(() => source.value)

    sel.selectAll()
    sel.toggle('b')
    expect(source.value).toEqual(['a', 'b', 'c'])

    sel.toggle('b')
    expect([...sel.selected.value].sort()).toEqual(['a', 'b', 'c'])
    expect(source.value).toEqual(['a', 'b', 'c'])
  })

  it('selectAll toggles off when everything is selected', () => {
    const source = ref(['a', 'b'])
    const sel = useSelection(() => source.value)

    sel.selectAll()
    expect(sel.allSelected.value).toBe(true)

    sel.selectAll()
    expect(sel.selected.value).toEqual([])
    expect(source.value).toEqual(['a', 'b'])
  })

  it('selectRange does not alias the source list', () => {
    const source = ref(['a', 'b', 'c'])
    const sel = useSelection(() => source.value)

    sel.toggle('a')
    sel.selectRange('c')
    expect(sel.selected.value).toEqual(['a', 'b', 'c'])

    sel.toggle('a')
    expect(source.value).toEqual(['a', 'b', 'c'])
  })
})