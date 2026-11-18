import { createCharacterAsset, DEFAULT_OUTFIT_NAME } from './defaults'
import { initializeCharacterScopes } from './characterScopes'
import type { AppState, CharacterAsset, CharacterOutfit, Episode, Shot, UnitCharacter } from './types'

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
          asset.availableUnits = null
          assets.push(asset)
        }
        character.characterId = asset?.id ?? null
        if (asset) character.name = asset.name
      }
    }
    if (group) item.characters = []
  }
  initializeCharacterScopes(state, episode, assets)
}

export function characterAppearance(asset: CharacterAsset, episodeId: string, shot: Shot, unitCharacters: UnitCharacter[] = []) {
  const character = shot.characters.find(c => c.characterId === asset.id || c.name === asset.name)
  const selection = unitCharacters.find(c => c.characterId === asset.id)?.outfitId
  const unitOutfit = selection ? asset.outfits.find(outfit => outfit.id === selection) ?? (selection === 'original' ? asset.outfits[0] : undefined)
    : asset.outfits?.find(outfit => outfit.units.some(unit => unit.episodeId === episodeId && unit.unitNumber === shot.unitNumber))
  const outfit = character?.outfitId ? asset.outfits.find(outfit => outfit.id === character.outfitId) ?? (character.outfitId === 'original' ? asset.outfits[0] : undefined) : unitOutfit
  const appearance = asset.outfits.length > 1 ? outfit : asset
  const appearanceEnabled = appearance?.appearanceDescriptionEnabled === true
  const includeAppearance = !character?.voiceOnly && appearanceEnabled && character?.includeAppearance !== false
  return {
    appearanceEnabled,
    includeAppearance,
    outfitId: outfit?.id ?? null,
    unitOutfitId: unitOutfit?.id ?? null,
    unitOutfitName: asset.outfits.length > 1 ? unitOutfit?.note || '待分配' : asset.note || DEFAULT_OUTFIT_NAME,
    outfitName: appearance ? appearance.note || DEFAULT_OUTFIT_NAME : '',
    description: includeAppearance ? appearance?.appearanceDescription ?? '' : '',
    referenceName: asset.outfits.length < 2 ? (asset.note ? `${asset.name}（${asset.note}）` : asset.name) : outfit ? `${asset.name}（${outfit.note}）` : null,
  }
}

export function shotOutfitSelection(outfits: CharacterOutfit[], unitOutfitId: string | null, shotOutfitId?: string | null) {
  const findOutfit = (id: string | null | undefined) => outfits.find(outfit => outfit.id === id) ?? (id === 'original' ? outfits[0] : undefined)
  const unitOutfit = findOutfit(unitOutfitId)
  const fixedOutfit = findOutfit(shotOutfitId)
  const selectedOutfit = shotOutfitId ? fixedOutfit : unitOutfit
  const value = fixedOutfit?.id ?? shotOutfitId ?? ''
  const options = outfits.map(outfit => ({
    value: outfit === unitOutfit ? '' : outfit.id,
    label: outfit.note || '未命名服装',
  }))
  if (!unitOutfit) options.push({ value: '', label: '待分配' })
  return {
    value,
    label: selectedOutfit ? selectedOutfit.note || '未命名服装' : '待分配',
    options: options.map(option => ({ ...option, disabled: option.value === value })),
  }
}

export function characterUnits(state: AppState, episode: Episode, asset: CharacterAsset) {
  const episodes = state.episodes.filter(item => episode.groupId ? item.groupId === episode.groupId : item.id === episode.id)
    .sort((a, b) => Number(a.title.match(/\d+/)?.[0] ?? 0) - Number(b.title.match(/\d+/)?.[0] ?? 0))
  return episodes.flatMap(item => [...new Set([...item.units?.filter(unit => unit.characters.some(c => c.characterId === asset.id && !c.voiceOnly)).map(unit => unit.unitNumber) ?? [], ...item.shots.filter(shot => shot.characters.some(character => !character.voiceOnly && (character.characterId === asset.id || character.name === asset.name))).map(shot => shot.unitNumber)])]
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
