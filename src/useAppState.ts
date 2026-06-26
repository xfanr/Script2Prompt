import { computed, reactive, watch } from 'vue'
import { APP_VERSION, createEpisode, createInitialState, STORAGE_KEY } from './defaults'
import type { AppState } from './types'

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return createInitialState()
  }

  try {
    const parsed = JSON.parse(raw) as AppState

    if (parsed.version !== APP_VERSION || !Array.isArray(parsed.episodes) || !parsed.globalConfig) {
      return createInitialState()
    }

    parsed.globalConfig.autoCollapseCompletedShots ??= true

    parsed.episodes.forEach((episode) => {
      episode.characters ??= []
      episode.scenes ??= []
      episode.props ??= []
      episode.shots?.forEach((shot) => {
        shot.characters ??= []
        shot.characters.forEach((character) => {
          character.statusText ??= ''
        })
      })
    })

    if (!parsed.episodes.length) {
      const episode = createEpisode(1)
      parsed.episodes = [episode]
      parsed.activeEpisodeId = episode.id
    }

    return parsed
  } catch {
    return createInitialState()
  }
}

export function useAppState() {
  const state = reactive<AppState>(loadState())
  let isSaving = false

  const activeEpisode = computed(() => {
    const found = state.episodes.find((episode) => episode.id === state.activeEpisodeId)

    if (found) {
      return found
    }

    state.activeEpisodeId = state.episodes[0]?.id ?? ''
    return state.episodes[0]
  })

  watch(
    state,
    () => {
      if (isSaving) {
        return
      }

      isSaving = true
      state.lastSavedAt = new Date().toISOString()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      queueMicrotask(() => {
        isSaving = false
      })
    },
    { deep: true },
  )

  return {
    state,
    activeEpisode,
  }
}


