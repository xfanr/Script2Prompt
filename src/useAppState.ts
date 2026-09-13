import { computed, reactive, ref, watch } from 'vue'
import { LocalRepository, type SyncTarget } from './storage'
import { notify } from './notification'
import type { AppState } from './types'

export function useAppState(initialState: AppState, repository: LocalRepository) {
  const state = reactive<AppState>(initialState)
  const saveError = ref('')
  let applying = false
  let lastSignature = signature()

  function signature() {
    const { lastSavedAt, ...data } = state
    return JSON.stringify(data)
  }

  function saveNow() {
    try {
      const nextSignature = signature()
      if (nextSignature !== lastSignature || saveError.value) {
        state.lastSavedAt = repository.save(state)
        lastSignature = nextSignature
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

  function replaceState(next: AppState, syncUpdate: { identity: string; update: (target: SyncTarget) => void }) {
    // Persist before touching the live UI, including the new sync baselines.
    next.lastSavedAt = repository.save(next, syncUpdate)
    applying = true
    Object.assign(state, next)
    lastSignature = signature()
    saveError.value = ''
    applying = false
  }

  const activeEpisode = computed(() =>
    state.episodes.find((episode) => episode.id === state.activeEpisodeId) ?? state.episodes[0],
  )

  watch(state, () => {
    if (!applying) saveNow()
  }, { deep: true })

  return { state, activeEpisode, saveError, saveNow, replaceState }
}
