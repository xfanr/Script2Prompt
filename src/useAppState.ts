import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { LocalRepository, type SyncTarget } from './storage'
import { notify } from './notification'
import type { AppState } from './types'

export function useAppState(initialState: AppState, repository: LocalRepository) {
  const state = reactive<AppState>(initialState)
  const saveError = ref('')
  const isReplacing = ref(false)
  let applying = false
  let lastSignature = signature()
  let saving: Promise<boolean> | null = null

  function signature() {
    const { lastSavedAt, ...data } = state
    return JSON.stringify(data)
  }

  async function drainSaves() {
    try {
      while (signature() !== lastSignature || saveError.value) {
        const nextSignature = signature()
        state.lastSavedAt = await repository.save(JSON.parse(JSON.stringify(state)) as AppState)
        lastSignature = nextSignature
        saveError.value = ''
      }
      saveError.value = ''
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : '浏览器存储空间不足或不可用'
      if (saveError.value !== message) notify.error(`自动保存失败：${message}`)
      saveError.value = message
      return false
    }
  }

  function saveNow(): Promise<boolean> {
    if (!saving) saving = drainSaves().finally(() => { saving = null })
    return saving
  }

  async function replaceState(next: AppState, syncUpdate: { identity: string; update: (target: SyncTarget) => void }) {
    const before = signature()
    if (!await saveNow()) throw new Error(saveError.value)
    if (signature() !== before) throw new Error('保存期间本地数据已变化，请重新下载后确认')
    isReplacing.value = true
    await nextTick()
    // Persist before touching the live UI, including the new sync baselines.
    try {
      next.lastSavedAt = await repository.save(next, syncUpdate)
      applying = true
      Object.assign(state, next)
      lastSignature = signature()
      saveError.value = ''
      await nextTick()
    } finally {
      applying = false
      isReplacing.value = false
      if (signature() !== lastSignature) void saveNow()
    }
  }

  const activeEpisode = computed(() =>
    state.episodes.find((episode) => episode.id === state.activeEpisodeId) ?? state.episodes[0],
  )

  watch(state, () => {
    if (!applying && !isReplacing.value) void saveNow()
  }, { deep: true })

  function beforeUnload(event: BeforeUnloadEvent) {
    if (saving || isReplacing.value || signature() !== lastSignature) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

  return { state, activeEpisode, saveError, saveNow, replaceState, isReplacing }
}
