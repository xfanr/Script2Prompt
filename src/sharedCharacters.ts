import { createCharacterAsset } from './defaults'
import type { AppState, CharacterAsset, Episode, Shot } from './types'

export function characterAssetsFor(state: AppState, episode: Episode): CharacterAsset[] {
  return state.episodeGroups.find(group => group.id === episode.groupId)?.characters ?? episode.characters
}

export function initializeSharedCharacters(state: AppState, episode: Episode) {
  const group = state.episodeGroups.find(group => group.id === episode.groupId)
  const episodes = group ? state.episodes.filter(item => item.groupId === group.id) : [episode]
  if (group && group.characters === null) {
    const sources = [episode, ...episodes.filter(item => item.id !== episode.id).sort((a, b) => Number(a.title.match(/\d+/)?.[0] ?? 0) - Number(b.title.match(/\d+/)?.[0] ?? 0))]
    group.characters = []
    for (const source of sources) {
      for (const asset of source.characters) {
        if (!group.characters.some(item => item.name === asset.name)) group.characters.push(asset)
      }
    }
  }
  const assets = characterAssetsFor(state, episode)
  for (const item of episodes) {
    for (const asset of item.characters) {
      if (!assets.some(existing => existing.name === asset.name)) assets.push(asset)
    }
    for (const shot of item.shots) {
      for (const character of shot.characters) {
        let asset = assets.find(asset => asset.id === character.characterId) ?? assets.find(asset => asset.name === character.name)
        if (!asset && character.name.trim()) {
          asset = createCharacterAsset(character.name.trim())
          assets.push(asset)
        }
        character.characterId = asset?.id ?? null
        if (asset) character.name = asset.name
      }
    }
    if (group) item.characters = []
  }
}

export function characterAppearance(asset: CharacterAsset, episodeId: string, shot: Shot) {
  const outfit = asset.outfits?.find(outfit => outfit.units.some(unit => unit.episodeId === episodeId && unit.unitNumber === shot.unitNumber))
  return {
    description: asset.outfits?.length > 1 ? outfit?.appearanceDescription ?? '' : asset.appearanceDescription,
    referenceName: outfit ? `${asset.name}（${outfit.note}）` : null,
  }
}

export function characterUnits(state: AppState, episode: Episode, asset: CharacterAsset) {
  const episodes = state.episodes.filter(item => episode.groupId ? item.groupId === episode.groupId : item.id === episode.id)
    .sort((a, b) => Number(a.title.match(/\d+/)?.[0] ?? 0) - Number(b.title.match(/\d+/)?.[0] ?? 0))
  return episodes.flatMap(item => [...new Set(item.shots.filter(shot => shot.characters.some(character => character.characterId === asset.id || character.name === asset.name)).map(shot => shot.unitNumber))]
    .sort((a, b) => a - b).map(unitNumber => ({ episodeId: item.id, unitNumber, label: `${Number(item.title.match(/\d+/)?.[0] ?? 0)}-${unitNumber}` })))
}

export function validateCharacterOutfits(state: AppState, episode: Episode, asset: CharacterAsset): string {
  if (asset.outfits.length < 2) return ''
  const notes = asset.outfits.map(outfit => outfit.note.trim())
  if (notes.some(note => !note)) return '请填写每套服装的备注'
  if (new Set(notes).size !== notes.length) return '同一角色的服装备注不能重复'
  for (const unit of characterUnits(state, episode, asset)) {
    const count = asset.outfits.filter(outfit => outfit.units.some(item => item.episodeId === unit.episodeId && item.unitNumber === unit.unitNumber)).length
    if (count !== 1) return `请为单元 ${unit.label} 分配一套服装`
  }
  return ''
}
