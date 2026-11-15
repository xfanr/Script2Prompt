<template>
  <section class="preparation-workspace" aria-label="剧本">
    <header class="preparation-projectbar">
      <div>
        <el-button class="workspace-back-button" :icon="HomeBackIcon" aria-label="返回工作区" @click="emit('close')" /><strong>{{ groupTitle }}</strong>
      </div>
      <nav v-if="current" class="preparation-material-tabs" role="tablist" aria-label="素材核对方式"
        @keydown.left.prevent="moveMaterialTab(-1, $event)" @keydown.right.prevent="moveMaterialTab(1, $event)"
        @keydown.home.prevent="selectMaterialTab('character', $event)" @keydown.end.prevent="selectMaterialTab('shots', $event)">
        <button id="preparation-character-tab" type="button" role="tab" aria-controls="preparation-character-pane" :aria-selected="batch.materialView === 'character'"
          :tabindex="batch.materialView === 'character' ? 0 : -1" data-material-view="character" @click="batch.materialView = 'character'">按角色</button>
        <button id="preparation-unit-tab" type="button" role="tab" aria-controls="preparation-unit-pane" :aria-selected="batch.materialView === 'unit'"
          :tabindex="batch.materialView === 'unit' ? 0 : -1" data-material-view="unit" @click="batch.materialView = 'unit'">按单元</button>
        <button id="preparation-shots-tab" type="button" role="tab" aria-controls="preparation-shots-pane" :aria-selected="batch.materialView === 'shots'"
          :tabindex="batch.materialView === 'shots' ? 0 : -1" data-material-view="shots" @click="batch.materialView = 'shots'">拆分镜</button>
      </nav>
      <div>
        <el-link v-if="pending.length" type="warning" underline="never" @click="showPending">{{ pending.length }} 项服装待分配</el-link>
        <el-button type="primary" round :loading="saving" :disabled="Boolean(pending.length)" @click="emit('apply')">应用</el-button>
      </div>
    </header>
    <div class="preparation-layout">
      <aside class="sidebar preparation-tree" aria-label="单元目录">
        <section class="panel episode-panel material-library-panel">
          <div class="preparation-tree-content">
          <div class="material-library-header preparation-tree-heading">
            <h2 class="material-sidebar-title">单元目录</h2>
            <el-button class="preparation-import-trigger" size="small" round @click="importVisible = true">导入剧本</el-button>
            <div class="preparation-tree-actions">
              <el-button size="small" text round :aria-pressed="multiSelect" :disabled="!allUnits.length" @click="setMultiSelect(!multiSelect)">
                {{ multiSelect ? '取消多选' : '多选' }}
              </el-button>
              <el-popover v-model:visible="createUnitVisible" trigger="click" placement="bottom-start" :width="240"
                @show="nextTick(() => { newUnitInput?.focus(); newUnitInput?.select() })">
                <template #reference><el-button class="preparation-new-unit-trigger" :icon="AddIcon" size="small" text circle aria-label="新建单元" title="新建单元" @click="prepareNewUnit" /></template>
                <el-form class="preparation-create-unit-form" label-position="top" @submit.prevent="createUnit">
                  <el-form-item label="单元号">
                    <el-input ref="newUnitInput" v-model="newUnitNumber" class="joined-primary-input" placeholder="集号-单元号" aria-label="新建单元号" @keydown.enter.stop.prevent="createUnit">
                      <template #append><el-button type="primary" @click="createUnit">新建</el-button></template>
                    </el-input>
                  </el-form-item>
                </el-form>
              </el-popover>
            </div>
          </div>
          <el-scrollbar class="material-management-scrollbar">
            <div class="material-library-folders">
              <div
                v-for="{ episode, unit } in allUnits"
                :key="unit.id"
                class="material-library-folder preparation-unit-row"
                :class="{ active: multiSelect ? checked.includes(unit.id) : unit.id === current?.unit.id, skipped: episode.action === 'skip' }"
              >
                <el-checkbox
                  v-if="multiSelect"
                  :model-value="checked.includes(unit.id)"
                  :aria-label="`选择单元${episode.number}-${unit.unitNumber}`"
                  @change="toggleChecked(unit.id)"
                />
                <button
                  type="button"
                  :data-preparation-unit="unit.id"
                  :aria-label="`${multiSelect ? '选择' : '查看'}单元${episode.number}-${unit.unitNumber}`"
                  :aria-current="unit.id === current?.unit.id ? 'page' : undefined"
                  :aria-pressed="multiSelect ? checked.includes(unit.id) : undefined"
                  @click="multiSelect ? toggleChecked(unit.id) : selectUnit(unit.id)"
                >
                  <span class="unit-number">{{ episode.number }}-{{ unit.unitNumber }}</span>
                  <span class="unit-place">{{ unit.scenes[0]?.name || '待补充场景' }}</span>
                  <el-tag v-if="episode.action === 'skip'" size="small" type="info">跳过</el-tag>
                  <span v-else-if="pending.some((item) => item.unit.id === unit.id)" class="preparation-dot" />
                </button>
                <PreparationUnitActions v-if="!multiSelect" class="preparation-row-actions" :characters="availableCharacters([unit.id])" :scenes="availableScenes([unit.id])" :count="1"
                  @add-material="(kind, anchor) => emit('add-material', kind, [unit.id], anchor)"
                  @select-character="selectCharacter($event, [unit.id])" @select-scene="selectScene($event, [unit.id])" @delete="deleteUnits([unit.id])" />
              </div>
            </div>
            <el-empty v-if="!allUnits.length" description="导入多集剧本开始核对" :image-size="50" />
          </el-scrollbar>
          </div>
          <div v-if="multiSelect" class="preparation-selection-bar" role="toolbar" aria-label="单元批量操作">
            <strong aria-live="polite">已选择 {{ checked.length }} 项</strong>
            <PreparationUnitActions class="preparation-selection-actions" :characters="availableCharacters(checked)" :scenes="availableScenes(checked)" :count="checked.length" cancelable
              @add-material="(kind, anchor) => emit('add-material', kind, [...checked], anchor)"
              @select-character="selectCharacter($event, checked)" @select-scene="selectScene($event, checked)" @delete="deleteUnits([...checked])" @cancel="setMultiSelect(false)" />
          </div>
        </section>
      </aside>
      <main class="preparation-main is-material-review">
        <div v-if="batch.aliases.length" class="preparation-aliases">
          <strong>疑似同一角色</strong>
          <div v-for="alias in batch.aliases" :key="alias.name">
            <span>{{ alias.name }}</span
            ><span>→</span
            ><el-select v-model="alias.targetId" placeholder="选择对应角色" :aria-label="`${alias.name}对应角色`"
              ><el-option
                v-for="asset in batch.characters.filter((asset) => asset.name !== alias.name)"
                :key="asset.id"
                :value="asset.id"
                :label="asset.name" /></el-select
            ><el-link underline="never" @click="mergeAlias(alias)">合并</el-link
            ><el-link underline="never" @click="batch.aliases = batch.aliases.filter((item) => item !== alias)">保留独立角色</el-link>
          </div>
        </div>
        <el-empty v-if="!current" description="尚未导入剧本">
          <div class="preparation-empty-actions">
            <el-button round @click="characterImportVisible = true">添加主角</el-button>
            <el-button type="primary" round @click="importVisible = true">导入剧本</el-button>
          </div>
        </el-empty>
        <template v-else>
          <div class="preparation-columns preparation-review-columns">
            <section class="preparation-surface preparation-script">
              <h2>场次信息</h2>
              <el-form class="preparation-scene-fields" label-position="top">
                <el-form-item label="单元号">
                  <el-input v-model="unitNumberDraft" placeholder="26-1" aria-label="单元号"
                    @blur="updateUnitNumber(unitNumberDraft)" @keydown.enter.prevent="updateUnitNumber(unitNumberDraft)">
                    <template #append><el-button aria-label="还原单元号" title="还原初始识别的单元号" @mousedown.prevent
                      @click="updateUnitNumber(current.unit.initialNumber)">还原</el-button></template>
                  </el-input>
                </el-form-item>
                <el-form-item label="默认场景"
                  >
                  <template #label>
                    <span class="preparation-scene-label">默认场景
                      <el-tooltip v-if="currentIssues.length" placement="top">
                        <template #content><div v-for="issue in currentIssues" :key="issue">{{ issue }}</div></template>
                        <el-icon class="preparation-scene-warning" tabindex="0" aria-label="场次核对警告"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </span>
                  </template>
                  <el-select :model-value="current.unit.defaultSceneKey" clearable placeholder="待选择" aria-label="单元默认场景" @change="setDefaultScene"
                    ><el-option
                      v-for="scene in reviewScenes"
                      :key="sceneAssetKey(scene)"
                      :value="sceneAssetKey(scene)"
                      :label="sceneLabel(scene)" /></el-select
                ></el-form-item>
              </el-form>

              <div class="preparation-section-heading preparation-heading-actions">
                <h2>单元正文</h2>
                <el-link underline="never" @click="current.unit.scriptText = organizeScriptText(current.unit.scriptText); updateSplitShots(current.unit.scriptText); notify.success('已整理剧本文字')">整理</el-link>
              </div>
              <el-input
                v-model="current.unit.scriptText"
                type="textarea"
                class="preparation-unit-text"
                :rows="3"
                aria-label="单元正文"
                placeholder="使用 --- 划分分镜；使用 --- #备注# 添加分镜备注。"
                resize="none"
                @input="updateSplitShots"
              />

            </section>
            <section class="preparation-surface preparation-material-content" aria-label="素材核对内容">
              <div v-show="batch.materialView === 'unit'" id="preparation-unit-pane" role="tabpanel" aria-labelledby="preparation-unit-tab" class="preparation-unit-pane">
                <section class="preparation-roles">
                  <div class="preparation-section-heading">
                    <div class="preparation-unit-title"><h2>本单元角色</h2><span class="secondary">{{ current.episode.number }}-{{ current.unit.unitNumber }}</span></div>
                    <PreparationMaterialMenu kind="characters" :characters="availableCharacters(targets.map(item => item.unit.id))" :scenes="[]" :disabled="!targets.length"
                      @create="emit('add-material', 'characters', targets.map(item => item.unit.id), $event)" @select="selectCharacter($event, targets.map(item => item.unit.id))">
                      <el-link :icon="AddIcon" underline="never" :disabled="!targets.length" aria-label="添加本单元角色">添加</el-link>
                    </PreparationMaterialMenu>
                  </div>
                  <div class="preparation-role-list" aria-label="单元角色列表">
                    <article v-for="usage in unitCharacters" :key="usage.characterId" class="material-card has-references is-compact preparation-role-row">
                      <template v-if="assetFor(usage.characterId)">
                        <div class="material-card-summary">
                          <div class="material-card-meta">
                            <span class="material-card-type" aria-label="角色">🙂</span>
                            <CharacterTypeMenu :character="assetFor(usage.characterId)!" />
                          </div>
                          <div class="material-card-name-area"><span class="material-card-name" :title="assetFor(usage.characterId)!.name">{{ assetFor(usage.characterId)!.name }}</span></div>
                        </div>
                        <div class="preparation-role-choice">
                          <span v-if="assetFor(usage.characterId)!.isEnsemble" class="secondary">群像不分配服装</span
                          ><el-select
                            v-else
                            :disabled="usage.voiceOnly"
                            v-model="usage.outfitId"
                            clearable
                            placeholder="待分配"
                            :aria-label="`${assetFor(usage.characterId)!.name}单元服装`"
                            ><el-option
                              v-for="outfit in outfitOptions(assetFor(usage.characterId)!)"
                              :key="outfit.id"
                              :value="outfit.id"
                              :label="outfit.note || '未命名服装'"
                          /></el-select>
                          <el-checkbox v-model="usage.voiceOnly">仅音色</el-checkbox>
                        </div>
                        <div class="preparation-role-actions">
                          <el-button :icon="Delete" text aria-label="移除单元角色" @click="current!.unit.characters = current!.unit.characters.filter(c => c !== usage)" />
                        </div>
                      </template>
                    </article>
                  </div>
                </section>

              </div>
              <div v-show="batch.materialView === 'character'" id="preparation-character-pane" role="tabpanel" aria-labelledby="preparation-character-tab" class="preparation-person-pane">
                <div class="preparation-character-tabs">
                  <el-button
                    v-for="asset in visibleCharacters"
                    :key="asset.id"
                    :type="selectedCharacter?.id === asset.id ? 'primary' : 'default'"
                    plain
                    round
                    @click="
                      batch.selectedCharacterId = asset.id;
                      assignment = []
                    "
                    >{{ asset.name }}<span class="secondary">{{ roleType(asset) }}</span></el-button
                  >
                </div>

                <template v-if="selectedCharacter">
                  <section class="material-card has-references preparation-person-card">
                    <div class="material-card-summary">
                      <div class="material-card-meta">
                        <span class="material-card-type" aria-label="角色">🙂</span>
                        <CharacterTypeMenu :character="selectedCharacter" />
                      </div>
                      <div class="material-card-name-area"><span class="material-card-name" :title="selectedCharacter.name">{{ selectedCharacter.name }}</span></div>
                    </div>
                    <el-button class="preparation-person-edit" :icon="EditPen" text size="small" aria-label="修改角色资料" @click="emit('edit-character', selectedCharacter.id)">修改</el-button>
                    <el-form class="preparation-person-fields" label-position="top">
                      <CharacterUnitAssignment v-model="assignment" class="preparation-character-assignment" button-size="default" :units="assignmentUnits" :outfits="outfitOptions(selectedCharacter).map(outfit => ({ id: outfit.id, note: outfit.note || '未命名服装' }))"
                        :disabled="selectedCharacter.isEnsemble" @assign="assignOutfit" @add-outfit="emit('edit-character', selectedCharacter.id, true)" />
                    </el-form>
                  </section>

                </template>
              </div>
              <div v-show="batch.materialView === 'shots'" id="preparation-shots-pane" role="tabpanel" aria-labelledby="preparation-shots-tab" class="preparation-shot-pane">
                <aside class="preparation-shot-preview">
                  <div class="preparation-section-heading preparation-heading-actions"><h2>分镜列表</h2>
                    <el-popconfirm title="清除分镜分隔，将当前单元合并为一条分镜？" confirm-button-text="重置" cancel-button-text="取消" @confirm="resetSplitDraft">
                      <template #reference><el-link underline="never">重置</el-link></template>
                    </el-popconfirm>
                  </div>
                  <div class="preparation-shot-preview-list" aria-label="分镜列表">
                    <button v-for="item in shotPreviews" :key="item.shot.id" type="button" class="material-card preparation-role-row preparation-shot-preview-card" :class="{ selected: selectedShot?.id === item.shot.id }"
                      :aria-pressed="selectedShot?.id === item.shot.id" :aria-label="`选择分镜${current.episode.number}-${current.unit.unitNumber}-${item.index + 1}`" @click="selectedShotId = item.shot.id">
                      <span class="preparation-shot-preview-head"><span class="preparation-shot-preview-number">{{ current.episode.number }}-{{ current.unit.unitNumber }}-{{ item.index + 1 }}</span><span class="secondary">{{ item.shot.thirtySecondMode ? 'SD2.5' : 'SD' }}</span>
                        <span class="preparation-shot-preview-stat">{{ item.characters }} 人 · {{ item.timing.dialogueCharacters }} / {{ item.timing.totalCharacters }} 字 · {{ item.timing.totalSeconds.toFixed(1) }} 秒</span></span>
                      <span class="preparation-shot-preview-content">
                        <span v-if="item.shot.remark" class="secondary preparation-shot-preview-remark">{{ item.shot.remark }}</span>
                        <span class="preparation-shot-preview-text">{{ item.shot.text }}</span>
                      </span>
                    </button>
                    <p v-if="!shotPreviews.length" class="empty-note">使用 --- 划分分镜，实时预览拆分结果。</p>
                  </div>
                </aside>
                <section v-if="selectedShot" class="preparation-shot-config">
                  <div class="preparation-section-heading preparation-heading-actions"><h2>分镜 {{ current.episode.number }}-{{ current.unit.unitNumber }}-{{ current.unit.shots.indexOf(selectedShot) + 1 }}</h2><el-link underline="never" @click="followUnit">全部跟随</el-link></div>
                  <div class="preparation-role-list" aria-label="分镜场景角色列表">
                    <article class="material-card has-references is-compact preparation-role-row">
                      <span class="preparation-shot-scene-name">📍 场景</span>
                      <el-select :model-value="selectedShot.scenes[0]?.name ? sceneAssetKey(selectedShot.scenes[0]) : ''" :empty-values="[null, undefined]" placeholder="跟随单元" aria-label="准备分镜场景" @change="setShotScene">
                        <el-option value="" label="跟随单元" />
                        <el-option v-for="scene in current.unit.scenes" :key="sceneAssetKey(scene)" :value="sceneAssetKey(scene)" :label="sceneLabel(scene)" />
                      </el-select>
                    </article>
                    <article v-for="usage in unitCharacters" :key="usage.characterId" class="material-card has-references is-compact preparation-role-row">
                      <div class="material-card-summary">
                        <div class="material-card-meta"><span class="material-card-type" aria-label="角色">🙂</span><CharacterTypeMenu :character="assetFor(usage.characterId)!" /></div>
                        <div class="material-card-name-area"><span class="material-card-name" :title="assetFor(usage.characterId)!.name">{{ assetFor(usage.characterId)!.name }}</span></div>
                      </div>
                      <span v-if="assetFor(usage.characterId)!.isEnsemble" class="secondary">群像不分配服装</span>
                      <el-select v-else :disabled="usage.voiceOnly" :model-value="selectedShot.characters.find(c => c.characterId === usage.characterId)?.outfitId ?? ''" :empty-values="[null, undefined]" placeholder="跟随单元" :aria-label="`${assetFor(usage.characterId)!.name}分镜服装`" @change="id => setShotOutfit(usage.characterId, id)">
                        <el-option value="" label="跟随单元" />
                        <el-option v-for="outfit in outfitOptions(assetFor(usage.characterId)!)" :key="outfit.id" :value="outfit.id" :label="outfit.note || '未命名服装'" />
                      </el-select>
                      <span v-if="usage.voiceOnly" class="secondary">仅音色</span>
                    </article>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </template>
      </main>
    </div>
    <el-dialog v-model="characterImportVisible" title="添加主角" width="720px" align-center append-to-body class="app-modal" @closed="characterImportText = ''">
      <el-input v-model="characterImportText" type="textarea" :rows="14" aria-label="人物小传" placeholder="苏禾（女主）&#10;沈家二小姐，冷静果决。&#10;&#10;陆远：男主，苏禾的学长。" />
      <div v-if="characterImportText.trim()" class="preparation-character-import-preview" aria-live="polite">
        <span class="secondary">识别到 {{ biographyNames.length }} 个角色，可新增 {{ newBiographyNames.length }} 个主角</span>
        <div><el-tag v-for="name in biographyNames" :key="name" :type="newBiographyNames.includes(name) ? 'primary' : 'info'">{{ name }}{{ newBiographyNames.includes(name) ? '' : '（已存在）' }}</el-tag></div>
      </div>
      <template #footer><el-button type="primary" round :disabled="!newBiographyNames.length" @click="importMainCharacters">添加主角</el-button></template>
    </el-dialog>
    <el-dialog v-model="importVisible" title="整段导入剧本" width="720px" align-center append-to-body class="app-modal">
      <el-input
        v-model="batch.sourceText"
        type="textarea"
        :rows="18"
        aria-label="批量剧本"
        placeholder="第1集&#10;1-1 日 内 客厅&#10;人物：……"
      />
      <template #footer>
        <el-button class="preparation-organize-toggle" :icon="OrganizeScriptIcon" text circle :bg="organizeOnImport" :aria-pressed="organizeOnImport" aria-label="导入时自动整理" :title="organizeOnImport ? '自动整理正文：已开启' : '自动整理正文：已关闭'" @click="organizeOnImport = !organizeOnImport" />
        <el-button type="primary" round @click="analyze">识别分集</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { InputInstance } from 'element-plus'
import {
  createCharacterAsset,
  createCharacterConfig,
  createEpisode,
  createId,
  createSceneConfig,
  createShot,
  sceneAssetKey,
} from '../defaults'
import { analyzeScript, legacyEpisodeUnits, outfitOptions, parseCharacterBiographies, preparationPending, setPreparedUnitScript } from '../scriptPreparation'
import { normalizeSplitScriptText, organizeScriptText, splitBatchShotText } from '../episodeScript'
import { detectCharacters } from '../prompt'
import { analyzeTimingRange } from '../timing'
import { HomeBackIcon, AddIcon, EditPen, Delete, OrganizeScriptIcon, WarningFilled } from '../icons'
import PreparationUnitActions from './PreparationUnitActions.vue'
import PreparationMaterialMenu from './PreparationMaterialMenu.vue'
import CharacterUnitAssignment from './CharacterUnitAssignment.vue'
import CharacterTypeMenu from './CharacterTypeMenu.vue'
import { compareCharacterAssets, mapCharacterUnitReferences, referencedCharacterNames } from '../characterScopes'
import { notify } from '../notification'
import type { AppState, CharacterAsset, PreparedEpisode, SceneAsset, ScriptPreparation, Shot } from '../types'

const batch = defineModel<ScriptPreparation>({ required: true })
const props = defineProps<{ state: AppState; groupId: string | null; groupTitle: string; saving: boolean }>()
const emit = defineEmits<{ close: []; apply: []; 'add-material': [kind: 'characters' | 'scenes', unitIds: string[], anchor: HTMLElement]; 'edit-character': [characterId: string, addOutfit?: boolean] }>()
const importVisible = ref(false)
const organizeOnImport = ref(false)
const characterImportVisible = ref(false)
const characterImportText = ref('')
const biographyNames = computed(() => parseCharacterBiographies(characterImportText.value))
const newBiographyNames = computed(() => biographyNames.value.filter(name => !batch.value.characters.some(character => character.name === name)))
const createUnitVisible = ref(false)
const newUnitNumber = ref('')
const newUnitInput = ref<InputInstance>()
const multiSelect = ref(false)
const checked = ref<string[]>([]),
  assignment = ref<string[]>([])
const selectedShotId = ref<string | null>(null)
const unitNumberDraft = ref('')
let splitShotPool: Shot[] = []
const allUnits = computed(() => batch.value.episodes.flatMap((episode) => episode.units.map((unit) => ({ episode, unit }))))
const current = computed(() => allUnits.value.find((item) => item.unit.id === batch.value.selectedUnitId) ?? allUnits.value[0])
const currentIssues = computed(() => current.value ? [...new Set([...current.value.episode.issues, ...current.value.unit.issues])] : [])
const targets = computed(() =>
  checked.value.length ? allUnits.value.filter((item) => checked.value.includes(item.unit.id)) : current.value ? [current.value] : [],
)
const pending = computed(() => preparationPending(batch.value))
const reviewScenes = computed(() => [...new Map(allUnits.value.flatMap(({ unit }) => unit.scenes).map(scene => [sceneAssetKey(scene), scene])).values()])
const unitCharacters = computed(() => [...current.value?.unit.characters ?? []].sort((a, b) =>
  Number(assetFor(b.characterId)!.isMain) - Number(assetFor(a.characterId)!.isMain) ||
  Number(assetFor(a.characterId)!.isEnsemble) - Number(assetFor(b.characterId)!.isEnsemble),
))
const selectedCharacter = computed(
  () => batch.value.characters.find((asset) => asset.id === batch.value.selectedCharacterId) ?? visibleCharacters.value[0],
)
const visibleCharacters = computed(() =>
  batch.value.characters
    .filter((asset) => allUnits.value.some((item) => item.unit.characters.some((c) => c.characterId === asset.id)))
    .sort(
      (a, b) =>
        Number(b.isMain) - Number(a.isMain) ||
        Number(a.isEnsemble) - Number(b.isEnsemble) ||
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
    ),
)
const characterUnits = computed(() =>
  selectedCharacter.value
    ? allUnits.value.flatMap((item) => {
        const usage = item.unit.characters.find((c) => c.characterId === selectedCharacter.value!.id)
        return usage ? [{ ...item, usage }] : []
      })
    : [],
)
const assignmentUnits = computed(() => characterUnits.value.map(item => ({
  id: item.unit.id,
  label: `${item.episode.number}-${item.unit.unitNumber}`,
  note: item.usage.voiceOnly ? '仅音色' : selectedCharacter.value!.isEnsemble ? '群像' : outfitOptions(selectedCharacter.value!).find(outfit => outfit.id === item.usage.outfitId)?.note || '待分配',
  pending: !item.usage.outfitId && !item.usage.voiceOnly,
  disabled: item.usage.voiceOnly,
})))
const selectedShot = computed(
  () => current.value?.unit.shots.find((shot) => shot.id === selectedShotId.value) ?? current.value?.unit.shots[0],
)
watch(() => current.value ? `${current.value.episode.number}-${current.value.unit.unitNumber}` : '', value => {
  unitNumberDraft.value = value
}, { immediate: true })
watch(() => current.value?.unit, unit => {
  splitShotPool = [...(unit?.shots ?? [])]
  selectedShotId.value = unit?.shots[0]?.id ?? null
  if (unit && (unit.shots.length > 1 || unit.shots.some(shot => shot.remark.trim())) && !/^\s*---/m.test(unit.scriptText)) {
    unit.scriptText = normalizeSplitScriptText(undefined, unit.shots) ?? unit.scriptText
  }
  if (unit && !unit.shots.some(shot => shot.text.trim()) && unit.scriptText.trim()) updateSplitShots(unit.scriptText)
}, { immediate: true })
const shotPreviews = computed(() => {
  const names = batch.value.characters.map(asset => asset.name)
  return current.value?.unit.shots.map((shot, index) => ({ shot, index,
    characters: detectCharacters(shot.text, names).length,
    timing: analyzeTimingRange(shot.text, names, []),
  })).filter(item => item.shot.text.trim()) ?? []
})
const assetFor = (id: string) => batch.value.characters.find((asset) => asset.id === id)
const roleType = (asset: CharacterAsset) => (asset.isMain ? '主角' : asset.isEnsemble ? '群像' : '配角')
const sceneLabel = (scene: SceneAsset) => `${scene.time} · ${scene.space} · ${scene.name}`
function moveMaterialTab(offset: number, event: KeyboardEvent) {
  const views = ['character', 'unit', 'shots'] as const
  selectMaterialTab(views[(views.indexOf(batch.value.materialView) + offset + views.length) % views.length], event)
}
function selectMaterialTab(view: ScriptPreparation['materialView'], event: KeyboardEvent) {
  batch.value.materialView = view
  const tabs = event.currentTarget as HTMLElement
  tabs.querySelector<HTMLButtonElement>(`[data-material-view="${view}"]`)!.focus()
}
function setDefaultScene(key: string) {
  const unit = current.value!.unit
  unit.defaultSceneKey = key || null
  const scene = reviewScenes.value.find(item => sceneAssetKey(item) === key)
  if (scene && !unit.scenes.some(item => sceneAssetKey(item) === key)) unit.scenes.push({ ...scene })
}
function selectUnit(id: string) {
  batch.value.selectedUnitId = id
}
function setMultiSelect(value: boolean) {
  multiSelect.value = value
  if (!value) checked.value = []
}
function toggleChecked(id: string) {
  checked.value = checked.value.includes(id) ? checked.value.filter((value) => value !== id) : [...checked.value, id]
}

function availableCharacters(unitIds: string[]) {
  const selected = allUnits.value.filter(item => unitIds.includes(item.unit.id))
  const episodes = batch.value.episodes.filter(episode => selected.some(item => item.episode === episode))
  const referenced = new Set(episodes.flatMap(episode => [
    ...referencedCharacterNames({ shots: episode.units.flatMap(unit => unit.shots) }),
    ...episode.units.flatMap(unit => unit.characters.map(usage => assetFor(usage.characterId)!.name)),
  ]))
  return batch.value.characters.filter(asset => selected.some(({ unit }) => !unit.characters.some(usage => usage.characterId === asset.id)))
    .sort((a, b) => compareCharacterAssets(a, b, referenced))
}
function availableScenes(unitIds: string[]) {
  const selected = allUnits.value.filter(item => unitIds.includes(item.unit.id))
  return reviewScenes.value.filter(scene => selected.some(({ unit }) => !unit.scenes.some(item => sceneAssetKey(item) === sceneAssetKey(scene))))
}
function selectScene(key: string, unitIds: string[]) {
  const scene = reviewScenes.value.find(item => sceneAssetKey(item) === key)!
  for (const { unit } of allUnits.value.filter(item => unitIds.includes(item.unit.id))) {
    if (unit.scenes.some(item => sceneAssetKey(item) === key)) continue
    unit.scenes.push({ ...scene })
    if (unit.scenes.length === 1) unit.defaultSceneKey = key
  }
}
function selectCharacter(name: string, unitIds: string[]) {
  const asset = batch.value.characters.find(asset => asset.name === name)!
  for (const { episode, unit } of allUnits.value.filter(item => unitIds.includes(item.unit.id))) {
    if (unit.characters.some(usage => usage.characterId === asset.id)) continue
    unit.characters.push({ characterId: asset.id, voiceOnly: false, sourceNames: [], outfitId: asset.isMain || asset.outfits.length > 1 ? null : 'original' })
    if (!asset.isMain && !asset.availableUnits?.some(item => item.episodeId === episode.episodeId && item.unitNumber === unit.unitNumber))
      (asset.availableUnits ??= []).push({ episodeId: episode.episodeId, unitNumber: unit.unitNumber })
  }
}
function deleteUnits(unitIds: string[]) {
  const selectedId = current.value?.unit.id
  const selectedIndex = allUnits.value.findIndex(item => item.unit.id === selectedId)
  const before = new Map(allUnits.value.map(({ episode, unit }) => [unit.id, { episodeId: episode.episodeId, unitNumber: unit.unitNumber }]))
  const affected = new Set(allUnits.value.filter(item => unitIds.includes(item.unit.id)).map(item => item.episode.episodeId))
  for (const episode of batch.value.episodes) if (affected.has(episode.episodeId)) {
    episode.units = episode.units.filter(unit => !unitIds.includes(unit.id))
    if (episode.existing) episode.action = 'update'
  }
  syncUnitNumbers()
  const mapped = new Map(allUnits.value.map(({ episode, unit }) => {
    const previous = before.get(unit.id)!
    return [`${previous.episodeId}:${previous.unitNumber}`, { episodeId: episode.episodeId, unitNumber: unit.unitNumber }] as const
  }))
  for (const asset of batch.value.characters) mapCharacterUnitReferences(asset, units => units.flatMap(unit =>
    !affected.has(unit.episodeId) ? [unit] : mapped.has(`${unit.episodeId}:${unit.unitNumber}`) ? [mapped.get(`${unit.episodeId}:${unit.unitNumber}`)!] : [],
  ))
  checked.value = checked.value.filter(id => !unitIds.includes(id))
  assignment.value = assignment.value.filter(id => !unitIds.includes(id))
  if (selectedId && unitIds.includes(selectedId)) batch.value.selectedUnitId = allUnits.value[Math.min(selectedIndex, allUnits.value.length - 1)]?.unit.id ?? null
}

function importMainCharacters() {
  const names = newBiographyNames.value
  batch.value.characters.push(...names.map(name => ({ ...createCharacterAsset(name, '', '', false), isMain: true, note: '原皮' })))
  characterImportVisible.value = false
  notify.success(`已添加 ${names.length} 个主角`)
}
function analyze() {
  if (!batch.value.sourceText.trim()) {
    notify.warning('请先粘贴剧本')
    return
  }
  const next = analyzeScript(batch.value.sourceText, props.state, props.groupId, batch.value.characters, current.value?.episode.number ?? 1)
  for (const ep of next.episodes)
    for (let index = 0; index < ep.units.length; index++) {
      const previous = batch.value.episodes.find((item) => item.number === ep.number)?.units[index]
      if (previous?.scriptText === ep.units[index].scriptText) ep.units[index] = JSON.parse(JSON.stringify(previous))
      if (organizeOnImport.value) {
        const unit = ep.units[index]
        const text = unit.shots.length > 1 ? normalizeSplitScriptText(undefined, unit.shots) ?? unit.scriptText : unit.scriptText
        setPreparedUnitScript(unit, organizeScriptText(text))
      }
    }
  next.selectedUnitId = next.episodes[0]?.units[0]?.id ?? null
  batch.value = next
  setMultiSelect(false)
  importVisible.value = false
  notify.success(`已识别 ${next.episodes.length} 集、${next.episodes.reduce((n, ep) => n + ep.units.length, 0)} 个单元`)
}
function showPending() {
  batch.value.materialView = 'character'
  if (pending.value[0]) {
    batch.value.selectedCharacterId = pending.value[0].asset.id
    assignment.value = pending.value.filter((item) => item.asset.id === batch.value.selectedCharacterId).map((item) => item.unit.id)
  }
}
function assignOutfit(id: string) {
  for (const item of characterUnits.value) if (assignment.value.includes(item.unit.id)) item.usage.outfitId = id
}



function mergeAlias(alias: ScriptPreparation['aliases'][number]) {
  const source = batch.value.characters.find((asset) => asset.name === alias.name),
    target = assetFor(alias.targetId ?? '')
  if (!source || !target) return
  for (const { unit } of allUnits.value) {
    const from = unit.characters.find((c) => c.characterId === source.id),
      to = unit.characters.find((c) => c.characterId === target.id)
    if (from && to) {
      to.voiceOnly = to.voiceOnly && from.voiceOnly
      to.sourceNames = [...new Set([...to.sourceNames, ...from.sourceNames])]
      unit.characters = unit.characters.filter((c) => c !== from)
    } else if (from) from.characterId = target.id
    for (const shot of unit.shots)
      for (const c of shot.characters)
        if (c.characterId === source.id) {
          c.characterId = target.id
          c.name = target.name
        }
  }
  batch.value.characters = batch.value.characters.filter((c) => c.id !== source.id)
  batch.value.aliases = batch.value.aliases.filter((item) => item !== alias)
}
function syncUnitNumbers() {
  for (const ep of batch.value.episodes) {
    ep.units.sort((a, b) => a.unitNumber - b.unitNumber)
    ep.units.forEach(unit => {
      unit.shots.forEach((shot) => {
        shot.unitNumber = unit.unitNumber
        shot.unitId = unit.id
      })
    })
  }
}
function preparedEpisodeForNumber(number: number): PreparedEpisode {
  const target = batch.value.episodes.find(ep => ep.number === number)
  if (target) return target
  const formal = props.state.episodes.find(ep => ep.groupId === props.groupId && Number(ep.title.match(/\d+/)?.[0]) === number)
  return {
    id: createId('prepared-episode'), episodeId: formal?.id ?? createId('episode'), number,
    scriptText: formal?.scriptText ?? '', existing: Boolean(formal), action: formal ? 'update' : 'new', issues: [],
    units: formal ? (formal.units.length ? formal.units : legacyEpisodeUnits(formal, batch.value.characters)).map(item => ({
      ...JSON.parse(JSON.stringify(item)), shots: JSON.parse(JSON.stringify(formal.shots.filter(shot => shot.unitNumber === item.unitNumber))), issues: [],
    })) : [],
  }
}
function prepareNewUnit() {
  const episode = current.value?.episode ?? batch.value.episodes[0]
  newUnitNumber.value = `${episode?.number ?? 1}-${Math.max(0, ...(episode?.units.map(unit => unit.unitNumber) ?? [])) + 1}`
}
function createUnit() {
  const match = newUnitNumber.value.trim().match(/^(\d+)\s*[-－‐‑‒–—−]\s*(\d+)$/)
  const number = Number(match?.[1]), unitNumber = Number(match?.[2])
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(unitNumber) || unitNumber < 1) {
    notify.warning('单元号请输入“集号-单元号”，两部分均为正整数')
    return
  }
  const target = preparedEpisodeForNumber(number)
  if (target.units.some(unit => unit.unitNumber === unitNumber)) { notify.warning(`单元 ${number}-${unitNumber} 已存在`); return }
  const id = createId('unit')
  target.units.push({
    id, unitNumber, initialNumber: `${number}-${unitNumber}`, sourceHeading: '', scriptText: '',
    scenes: [], defaultSceneKey: null, characters: [], shots: [createShot(unitNumber)], issues: [],
  })
  if (!batch.value.episodes.includes(target)) batch.value.episodes.push(target)
  if (target.existing) target.action = 'update'
  batch.value.episodes.sort((a, b) => a.number - b.number)
  syncUnitNumbers()
  batch.value.selectedUnitId = id
  batch.value.materialView = 'unit'
  assignment.value = []
  setMultiSelect(false)
  createUnitVisible.value = false
}
function updateUnitNumber(value: string) {
  if (!current.value) return
  const { episode, unit } = current.value
  const previous = `${episode.number}-${unit.unitNumber}`
  const match = value.trim().match(/^(\d+)\s*[-－‐‑‒–—−]\s*(\d+)$/)
  const number = Number(match?.[1]), unitNumber = Number(match?.[2])
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(unitNumber) || unitNumber < 1) {
    notify.warning('单元号请输入“集号-单元号”，两部分均为正整数')
    unitNumberDraft.value = previous
    return
  }
  if (`${number}-${unitNumber}` === previous) { unitNumberDraft.value = previous; return }
  const target = preparedEpisodeForNumber(number)
  if (target.units.some(item => item.id !== unit.id && item.unitNumber === unitNumber)) {
    notify.warning(`单元 ${number}-${unitNumber} 已存在`)
    unitNumberDraft.value = previous
    return
  }
  const oldNumber = unit.unitNumber
  if (target !== episode) {
    episode.units = episode.units.filter(item => item.id !== unit.id)
    target.units.push(unit)
    if (!batch.value.episodes.includes(target)) batch.value.episodes.push(target)
    if (!episode.existing && episode.action === 'new' && !episode.scriptText.trim() && !episode.units.length)
      batch.value.episodes = batch.value.episodes.filter(item => item.id !== episode.id)
  }
  unit.unitNumber = unitNumber
  for (const asset of batch.value.characters) mapCharacterUnitReferences(asset, units => units.map(item =>
    item.episodeId === episode.episodeId && item.unitNumber === oldNumber ? { episodeId: target!.episodeId, unitNumber } : item,
  ))
  if (episode.existing) episode.action = 'update'
  if (target.existing) target.action = 'update'
  batch.value.episodes.sort((a, b) => a.number - b.number)
  syncUnitNumbers()
  unitNumberDraft.value = `${number}-${unitNumber}`
}
function updateSplitShots(text: string) {
  const unit = current.value!.unit
  setPreparedUnitScript(unit, text, splitShotPool)
  if (!unit.shots.some(shot => shot.id === selectedShotId.value)) selectedShotId.value = unit.shots[0]?.id ?? null
}
function resetSplitDraft() {
  const unit = current.value!.unit
  unit.scriptText = unit.scriptText.replace(/---(?:[ \t]*#[^#\r\n]*#)?/g, '').trim()
  updateSplitShots(unit.scriptText)
}
function followUnit() {
  const shot = selectedShot.value!
  shot.scenes = [createSceneConfig()]
  shot.characters.forEach(character => { character.outfitId = null })
}
function setShotScene(key: string) {
  if (!selectedShot.value || !current.value) return
  const scene = current.value.unit.scenes.find((s) => sceneAssetKey(s) === key)
  selectedShot.value.scenes = [scene ? createSceneConfig(scene.name, scene.time, scene.space) : createSceneConfig()]
}
function setShotOutfit(characterId: string, outfitId: string) {
  const shot = selectedShot.value
  if (!shot) return
  let character = shot.characters.find((c) => c.characterId === characterId)
  if (!character) {
    character = { ...createCharacterConfig(assetFor(characterId)!.name), characterId }
    shot.characters.push(character)
  }
  character.outfitId = outfitId || null
}
</script>

<style scoped>
.preparation-workspace {
  grid-column: 1;
  grid-row: 1 / -1;
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}
.preparation-projectbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  height: 68px;
  padding: 0 16px;
  background: var(--el-bg-color);
  flex-shrink: 0;
}
.preparation-projectbar > div {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.preparation-projectbar > div:last-child { grid-column: 3; justify-self: end; }
.preparation-projectbar strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.secondary {
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}
.preparation-empty-actions { display: flex; justify-content: center; gap: 12px; }
.preparation-empty-actions .el-button { margin: 0; }
.preparation-character-import-preview { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.preparation-character-import-preview > div { display: flex; max-height: 120px; flex-wrap: wrap; gap: 8px; overflow-y: auto; }
.preparation-organize-toggle.el-button {
  --el-button-hover-text-color: var(--el-text-color-regular);
  --el-button-hover-bg-color: var(--el-fill-color-dark);
  --el-button-active-text-color: var(--el-text-color-regular);
  --el-button-active-bg-color: var(--el-fill-color-dark);
  color: var(--el-text-color-regular);
}
.preparation-layout {
  display: grid;
  grid-template-columns: var(--workspace-sidebar-width) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: 'aside main';
  min-height: 0;
  flex: 1;
  padding: 16px 24px;
  gap: 24px;
}
.preparation-tree {
  min-width: 0;
  padding: 0;
  background: transparent;
}
.preparation-tree .material-library-panel,
.preparation-main {
  margin: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-round);
}
.preparation-tree .material-library-panel {
  padding: 0;
  gap: 0;
  overflow: hidden;
}
.preparation-tree-content,
.preparation-main {
  padding: 16px;
}
.preparation-tree-content {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
}
.preparation-tree-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.preparation-tree-heading { justify-content: flex-start; gap: 8px; }
.preparation-tree-heading .material-sidebar-title { flex-shrink: 0; }
.preparation-tree-heading .preparation-import-trigger { margin: 0; padding: 0 10px; }
.preparation-tree-actions .el-button.is-text {
  --el-button-hover-text-color: var(--el-text-color-regular);
  --el-button-hover-bg-color: var(--el-fill-color-dark);
  --el-button-hover-border-color: transparent;
  --el-button-active-text-color: var(--el-text-color-regular);
  padding: 5px 11px;
  border: 0;
  color: var(--el-button-text-color);
}
.preparation-tree-actions .preparation-new-unit-trigger {
  width: 24px;
  padding: 5px;
}
.preparation-create-unit-form .el-form-item {
  margin-bottom: 0;
}
.preparation-selection-bar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  padding: 6px 12px;
  border-radius: 0;
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  font-size: var(--el-font-size-small);
}
.preparation-selection-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.preparation-selection-actions :deep(.el-button) {
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  color: var(--el-text-color-secondary);
}
.preparation-unit-row {
  position: relative;
  height: 44px;
}
.preparation-row-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  padding: 0 2px 0 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.preparation-unit-row:hover .preparation-row-actions,
.preparation-unit-row:focus-within .preparation-row-actions,
.preparation-row-actions.is-open {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.preparation-unit-row.active .preparation-row-actions {
  background: var(--el-color-primary-light-9);
}
.preparation-unit-row .el-checkbox {
  height: 28px;
  flex-shrink: 0;
}
.preparation-unit-row.skipped {
  opacity: 0.6;
}
.preparation-unit-row.active {
  background: var(--el-color-primary-light-9);
}
.preparation-unit-row > button {
  border: 0;
  background: none;
  color: inherit;
  display: flex;
  gap: 8px;
  align-items: center;
  font: inherit;
  min-width: 0;
  text-align: left;
  flex: 1;
  cursor: pointer;
  padding: 0;
  height: 100%;
}
.unit-number {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.preparation-unit-row.active > button {
  color: var(--el-color-primary);
}
.unit-place {
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.preparation-dot {
  width: 5px;
  height: 5px;
  background: var(--el-color-warning);
  border-radius: 50%;
  flex-shrink: 0;
}
.preparation-main {
  grid-area: main;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--el-fill-color);
}
.preparation-main.is-material-review {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.is-material-review > .preparation-aliases {
  flex-shrink: 0;
}
.preparation-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}
.preparation-review-columns {
  grid-template-columns: minmax(0, 7fr) minmax(0, 13fr);
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.preparation-review-columns > .preparation-script {
  display: flex;
  min-height: 0;
  flex-direction: column;
  margin-bottom: 0;
  overflow: hidden;
}
.preparation-script > :not(.preparation-unit-text) {
  flex-shrink: 0;
}
.preparation-scene-fields {
  display: grid;
  grid-template-columns: calc(6ch + 84px) minmax(0, 1fr);
  gap: 12px;
}
.preparation-scene-fields .el-form-item {
  min-width: 0;
}
.preparation-unit-text {
  flex: 1;
  min-height: 0;
}
.preparation-unit-text :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 0 !important;
  font-size: var(--el-font-size-base);
  line-height: 1.5;
}
.preparation-script .el-select {
  width: 100%;
}
.preparation-review-columns > .preparation-material-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  margin-bottom: 0;
}
.preparation-material-tabs {
  display: flex;
  flex-shrink: 0;
  gap: 28px;
  margin: 0;
}
.preparation-material-tabs button {
  position: relative;
  padding: 0 0 10px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  cursor: pointer;
}
.preparation-material-tabs button[aria-selected='true'] {
  color: var(--el-text-color-primary);
}
.preparation-material-tabs button[aria-selected='true']::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: currentColor;
  content: '';
}
.preparation-material-tabs button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 4px;
}
.preparation-unit-pane {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
.preparation-roles {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.preparation-roles > .preparation-section-heading {
  flex-shrink: 0;
}
.preparation-role-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}
.preparation-person-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.preparation-columns > div {
  min-width: 0;
}
.preparation-surface {
  background: transparent;
  border-radius: 0;
  padding: 0;
  margin-bottom: 18px;
  min-width: 0;
}
.preparation-surface h2 {
  font-size: 16px;
  margin: 0 0 16px;
}
.preparation-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.preparation-section-heading > .preparation-unit-title {
  gap: 8px;
}
.preparation-section-heading h2 {
  margin: 0;
}
.preparation-heading-actions { justify-content: flex-start; gap: 12px; }
.preparation-section-heading > div {
  display: flex;
  gap: 16px;
  align-items: center;
}
.preparation-scene-label { display: inline-flex; align-items: center; gap: 6px; }
.preparation-scene-warning { color: var(--el-color-warning); cursor: help; }
.preparation-role-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 18px;
  padding: 12px;
  border: 0;
  flex-shrink: 0;
}
.preparation-role-row > .material-card-summary {
  flex: 0 1 auto;
}
.preparation-role-row .material-card-name-area {
  width: 10em;
  flex: 0 1 10em;
}
.preparation-role-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.preparation-role-actions .el-button {
  width: 22px;
  height: 22px;
  padding: 0;
  margin: 0;
}
.preparation-person-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  padding: 16px;
}
.preparation-person-card:hover {
  background: var(--el-fill-color-extra-light);
}
.preparation-person-fields {
  min-width: 0;
}
.preparation-person-fields :deep(.character-unit-assignment) {
  margin-top: 0;
  margin-bottom: 0;
}
.preparation-person-edit {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
}
.preparation-role-choice {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  align-items: center;
}
.preparation-role-choice .el-select {
  width: 140px;
}
.preparation-role-choice > .secondary {
  width: 140px;
}
.preparation-role-row > .secondary {
  min-width: 0;
}
.preparation-character-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}
.preparation-character-tabs .el-button {
  margin: 0;
}
.preparation-character-tabs .secondary {
  margin-left: 8px;
}
.preparation-character-assignment :deep(.character-assignment-grid button) {
  font-size: var(--el-font-size-base);
}
.preparation-character-assignment :deep(.character-assignment-grid small) {
  font-size: var(--el-font-size-small);
}
.preparation-shot-pane {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  flex: 1;
  min-height: 0;
}
.preparation-shot-preview,
.preparation-shot-config {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.preparation-shot-preview > .preparation-section-heading,
.preparation-shot-config > .preparation-section-heading { flex-shrink: 0; }
.preparation-shot-config .preparation-role-row { display: grid; grid-template-columns: minmax(0, 15em) minmax(0, 1fr); gap: 8px 12px; }
.preparation-shot-config .material-card-summary { min-width: 0; }
.preparation-shot-config .material-card-name-area { width: 10em; flex: 0 1 10em; }
.preparation-shot-config .el-select { width: 100%; min-width: 0; }
.preparation-shot-config .preparation-role-row > .secondary { grid-column: 2; }
.preparation-shot-scene-name { white-space: nowrap; }
.preparation-shot-preview-list { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
.preparation-shot-preview-card {
  flex-shrink: 0;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  height: calc(6em + 56px);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: var(--el-font-size-base);
  text-align: left;
  cursor: pointer;
}
.preparation-shot-preview-card:hover { background: var(--el-fill-color); }
.preparation-shot-preview-card.selected { background: var(--el-color-primary-light-9); }
.preparation-shot-preview-head { display: flex; height: 24px; flex-shrink: 0; align-items: center; gap: 8px; white-space: nowrap; }
.preparation-shot-preview-number { color: var(--el-color-primary); font-weight: 600; }
.preparation-shot-preview-stat { margin-left: auto; overflow: hidden; color: var(--el-text-color-primary); font-weight: 600; text-overflow: ellipsis; }
.preparation-shot-preview-content { display: -webkit-box; height: 6em; flex-shrink: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.preparation-shot-preview-remark { display: block; }
.preparation-shot-preview-card .secondary { font-size: inherit; }
.preparation-aliases {
  border-radius: 12px;
  background: var(--el-color-warning-light-9);
  padding: 16px;
  margin-bottom: 20px;
}
.preparation-aliases > div {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 10px;
}
.preparation-aliases .el-select {
  width: 200px;
}
.preparation-outfit-editor {
  padding: 18px;
  border-radius: 16px;
  background: var(--el-fill-color-light);
  margin-bottom: 14px;
}
@media (max-width: 1100px) {
  .preparation-columns {
    grid-template-columns: minmax(0, 1fr) 250px;
  }
  .preparation-role-row {
    flex-wrap: wrap;
  }
}
@media (max-width: 800px) {
  .preparation-shot-pane { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .preparation-shot-preview,
  .preparation-shot-config { min-height: 260px; }
  .preparation-main.is-material-review {
    display: block;
    overflow: auto;
  }
  .preparation-review-columns {
    display: flex;
    flex-direction: column;
  }
  .preparation-script,
  .preparation-material-content {
    height: 560px;
    flex-shrink: 0;
  }
  .preparation-layout {
    grid-template-columns: 150px minmax(0, 1fr);
  }
  .preparation-columns {
    grid-template-columns: 1fr;
  }
  .preparation-role-choice {
    width: 100%;
    justify-content: flex-end;
  }
  .preparation-aliases > div {
    flex-wrap: wrap;
  }
}
</style>
