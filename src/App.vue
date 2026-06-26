<template>
  <el-config-provider>
    <div class="app-shell">
      <input ref="fileInputRef" class="file-input" type="file" accept="application/json,.json" multiple @change="importEpisode" />

      <div class="workspace">
        <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
          <section class="sidebar-brand">
            <button class="brand-mark" type="button" @click="sidebarCollapsed = !sidebarCollapsed">S2P</button>
            <div v-if="!sidebarCollapsed" class="brand-text">
              <strong>Script2Prompt</strong>
              <span>短剧提示词工作台</span>
            </div>
          </section>

          <template v-if="!sidebarCollapsed">
            <section class="panel episode-panel">
              <div class="episode-header">
                <span>剧本管理</span>
                <el-button-group class="episode-actions">
                  <el-button :icon="Plus" type="primary" title="添加" aria-label="添加" @click="addEpisode" />
                  <el-button :icon="Upload" title="批量导入" aria-label="批量导入" @click="triggerImport" />
                  <el-button :icon="Download" title="批量导出" aria-label="批量导出" @click="exportAllEpisodes" />
                  <el-button :icon="Delete" type="danger" plain title="批量删除" aria-label="批量删除" @click="deleteOtherEpisodes" />
                </el-button-group>
              </div>
              <el-scrollbar max-height="250px">
                <div
                  v-for="episode in state.episodes"
                  :key="episode.id"
                  class="episode-item"
                  :class="{ active: episode.id === state.activeEpisodeId }"
                >
                  <div class="episode-title-area" @click="state.activeEpisodeId = episode.id">
                    <el-input
                      v-if="editingEpisodeId === episode.id"
                      v-model="episode.title"
                      class="episode-title-input"
                      placeholder="本集标题"
                      @click.stop
                      @keyup.enter="editingEpisodeId = null"
                      @blur="editingEpisodeId = null"
                    />
                    <span v-else class="episode-title-text">{{ episode.title }}</span>
                  </div>
                  <div class="episode-row-actions">
                    <el-button-group>
                      <el-button :icon="EditPen" title="修改" aria-label="修改" @click="editingEpisodeId = episode.id" />
                      <el-button :icon="Download" title="单集导出" aria-label="单集导出" @click="exportEpisodeById(episode.id)" />
                      <el-button :icon="Delete" type="danger" plain title="删除" aria-label="删除" @click="deleteEpisodeById(episode.id)" />
                    </el-button-group>
                  </div>
                </div>
              </el-scrollbar>
            </section>

            <el-button class="global-config-entry" type="primary" plain @click="globalDialogVisible = true">全局配置</el-button>

            <div class="sidebar-footer">
              <span>共 {{ state.episodes.length }} 集</span>
              <span>{{ savedText }}</span>
            </div>
          </template>
        </aside>

        <main v-if="activeEpisode" class="main-stage">
          <section class="stage-header">
            <div class="stage-left">
              <div class="stage-title-row">
                <h2>{{ activeEpisode.title }}</h2>
                <div class="stage-summary">{{ completedCount }}/{{ activeEpisode.shots.length }} 分镜</div>
              </div>
              <el-button-group class="shot-create-actions">
                <el-button :icon="Plus" type="primary" @click="addShot">添加分镜</el-button>
                <el-button :icon="DocumentAdd" type="primary" plain @click="openBatchShotDialog">批量分镜</el-button>
              </el-button-group>
            </div>
            <div class="stage-divider" aria-hidden="true"></div>
            <div class="asset-editor">
              <div class="asset-heading">
                <h3>本集基础素材</h3>
              </div>
              <div class="asset-tags">
                <el-tag v-for="item in activeEpisode.characters" :key="`character-${item}`" type="primary" :effect="isCharacterUsed(item) ? 'dark' : 'plain'" closable @close="removeMaterial('characters', item)">
                  人物 · {{ item }}
                </el-tag>
                <el-tag v-for="item in activeEpisode.scenes" :key="`scene-${item}`" type="success" :effect="isSceneUsed(item) ? 'dark' : 'plain'" closable @close="removeMaterial('scenes', item)">
                  场景 · {{ item }}
                </el-tag>
                <el-tag class="add-material-tag" type="warning" effect="dark" @click="openMaterialDialog">+ 添加素材</el-tag>
              </div>
            </div>
          </section>
          <section class="shot-list">
            <article
              v-for="(shot, index) in activeEpisode.shots"
              :key="shot.id"
              class="shot-row"
              :class="{ 'is-complete': shot.status === 'complete', 'is-collapsed-complete': isShotCollapsed(shot) }"
            >

              <div class="shot-meta">
                <div>
                  <span class="shot-index">#{{ index + 1 }}</span>
                  <el-tag :type="shot.status === 'complete' ? 'success' : 'info'" effect="dark">
                    {{ shot.status === 'complete' ? '已完成' : '未完成' }}
                  </el-tag>
                </div>
                <div class="shot-tools">
                  <el-button-group>
                    <el-button
                      :icon="shot.status === 'complete' ? CircleCheckFilled : CircleCheck"
                      :title="shot.status === 'complete' ? '已完成' : '未完成'"
                      :aria-label="shot.status === 'complete' ? '已完成' : '未完成'"
                      @click="setShotStatus(shot, shot.status !== 'complete')"
                    />
                    <el-button :icon="CopyDocument" @click="copyPrompt(shot)">复制</el-button>
                    <el-button :icon="Delete" type="danger" plain @click="deleteShot(shot.id)">删除</el-button>
                  </el-button-group>
                </div>
              </div>

              <div v-if="!isShotCollapsed(shot)" class="shot-grid">
                <section class="shot-cell script-cell">
                  <div class="cell-title">分镜详情</div>
                  <div class="script-input-wrap" :class="{ warn: durationState(shot.text).warn }">
                    <el-input
                      v-model="shot.text"
                      type="textarea"
                      :rows="9"
                      resize="vertical"
                      placeholder="输入或粘贴 40-120 字分段剧本。系统会匹配本集人物，并识别对白格式。"
                      @input="() => handleShotTextInput(shot)"
                    />
                    <div class="script-inline-stats">
                      <span>{{ characterCount(shot.text) }}/140 字</span>
                      <span>推荐 {{ durationText(shot.text) }}</span>
                    </div>
                  </div>
                  <el-alert
                    v-if="shot.autoSyncNotice"
                    class="sync-alert"
                    :title="shot.autoSyncNotice.message"
                    type="success"
                    show-icon
                    :closable="false"
                  >
                    <el-button link type="primary" @click="undoAutoSync(shot)">撤销</el-button>
                  </el-alert>
                  <el-alert
                    v-if="shot.pendingDetection"
                    class="sync-alert"
                    title="检测到人物配置差异"
                    type="warning"
                    show-icon
                    :closable="false"
                  >
                    <div class="detect-diff">
                      <p>当前已有：{{ namesText(shot.pendingDetection.currentNames) }}</p>
                      <p>本次检测：{{ namesText(shot.pendingDetection.replaceNames) }}</p>
                      <p>合并后：{{ namesText(shot.pendingDetection.mergeNames) }}</p>
                      <p>替换后：{{ namesText(shot.pendingDetection.replaceNames) }}</p>
                      <p v-if="shot.pendingDetection.voiceSuggestions.length">
                        音色建议：{{ namesText(shot.pendingDetection.voiceSuggestions) }}
                      </p>
                    </div>
                    <div class="detect-actions">
                      <el-button type="primary" @click="mergeDetected(shot, true)">合并</el-button>
                      <el-button @click="replaceDetected(shot)">替换</el-button>
                      <el-button v-if="shot.pendingDetection.voiceSuggestions.length" @click="mergeDetected(shot, false)">
                        保持原样
                      </el-button>
                      <el-button text @click="cancelDetection(shot)">取消</el-button>
                    </div>
                  </el-alert>
                </section>

                <section class="shot-cell config-cell">
                  <div class="cell-title">
                    <span>第二节交互配置</span>
                    <el-checkbox v-model="shot.usePositionReference">多角色位置参考</el-checkbox>
                  </div>

                  <div class="config-group">
                    <div class="config-heading">
                      <span>场景配置</span>
                      <el-button :icon="Plus" text type="primary" @click="addSceneToShot(shot)">添加场景</el-button>
                    </div>
                    <div v-if="!shot.scenes.length" class="empty-note">暂无场景项</div>
                    <div v-for="scene in shot.scenes" :key="scene.id" class="config-line">
                      <el-select v-model="scene.name" placeholder="选择场景" filterable>
                        <el-option v-for="item in activeEpisode.scenes" :key="item" :label="item" :value="item" />
                      </el-select>
                      <el-radio-group v-model="scene.time">
                        <el-radio-button label="白天" value="白天" />
                        <el-radio-button label="深夜" value="深夜" />
                      </el-radio-group>
                      <el-radio-group v-model="scene.space">
                        <el-radio-button label="室内" value="室内" />
                        <el-radio-button label="室外" value="室外" />
                      </el-radio-group>
                      <el-button :icon="Close" circle text @click="removeSceneFromShot(shot, scene.id)" />
                    </div>
                  </div>

                  <div class="config-group">
                    <div class="config-heading">
                      <span>人物配置</span>
                      <el-button :icon="Plus" text type="primary" @click="addCharacterToShot(shot)">添加人物</el-button>
                    </div>
                    <div v-if="!shot.characters.length" class="empty-note">暂无人物项</div>
                    <div v-for="character in shot.characters" :key="character.id" class="config-line character-line">
                      <el-select v-model="character.name" placeholder="选择人物" filterable>
                        <el-option
                          v-for="item in activeEpisode.characters"
                          :key="item"
                          :label="item"
                          :value="item"
                          :disabled="isCharacterOptionDisabled(shot, character.id, item)"
                        />
                      </el-select>
                      <el-checkbox v-model="character.includeVoice">音色</el-checkbox>
                      <el-checkbox v-model="character.includeState">状态</el-checkbox>
                      <el-input
                        v-model="character.statusText"
                        class="character-status-input"
                        :class="{ 'is-hidden': !character.includeState }"
                        :disabled="!character.includeState"
                        placeholder="状态内容"
                      />
                      <el-button :icon="Close" circle text @click="removeCharacterFromShot(shot, character.id)" />
                    </div>
                  </div>
                </section>

                <section class="shot-cell preview-cell">
                  <div class="cell-title">完整提示词预览</div>
                  <pre>{{ promptFor(shot) }}</pre>
                </section>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>

      <el-dialog v-model="globalDialogVisible" title="全局配置" width="760px" class="global-config-dialog">
        <el-form label-position="top">
          <el-form-item label="基础设定">
            <el-input v-model="state.globalConfig.baseSetting" type="textarea" :rows="7" resize="vertical" />
          </el-form-item>
          <el-form-item label="第二节后缀">
            <el-input v-model="state.globalConfig.sceneRoleSuffix" type="textarea" :rows="4" resize="vertical" />
          </el-form-item>
          <el-form-item label="已完成分镜">
            <el-switch
              v-model="state.globalConfig.autoCollapseCompletedShots"
              active-text="自动折叠已完成分镜"
              inactive-text="保持展开"
            />
          </el-form-item>
          <el-form-item label="章节标题、排序与开关">
            <div class="section-config-list">
              <div v-for="section in state.globalConfig.sections" :key="section.key" class="section-config">
                <el-switch v-model="section.enabled" />
                <el-input v-model="section.title" />
                <el-input-number v-model="section.order" :min="1" :max="9" controls-position="right" />
              </div>
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button type="primary" @click="globalDialogVisible = false">完成</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="batchShotDialogVisible" title="批量分镜" width="620px">
        <el-form label-position="top">
          <el-form-item label="长文本">
            <el-input
              v-model="batchShotDraft"
              type="textarea"
              :rows="10"
              placeholder="用连续三个短横线 --- 分割每条分镜"
            />
          </el-form-item>
          <el-alert
            :title="`已识别 ${batchShotSegments.length} 条分镜`"
            type="info"
            show-icon
            :closable="false"
          />
        </el-form>
        <template #footer>
          <el-button @click="batchShotDialogVisible = false">取消</el-button>
          <el-button type="primary" :disabled="!batchShotSegments.length" @click="confirmBatchShots">批量添加</el-button>
        </template>
      </el-dialog>      <el-dialog v-model="materialDialogVisible" title="添加基础素材" width="420px">
        <el-form label-position="top">
          <el-form-item label="素材类型">
            <el-radio-group v-model="materialKind">
              <el-radio-button label="人物" value="characters" />
              <el-radio-button label="场景" value="scenes" />
            </el-radio-group>
          </el-form-item>
          <el-form-item label="素材名称">
            <el-input
              v-model="materialDraft"
              type="textarea"
              :rows="4"
              placeholder="可输入多个名称，用 、；， 或换行分割"
              @keyup.ctrl.enter="confirmMaterialDialog"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="materialDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMaterialDialog">添加</el-button>
        </template>
      </el-dialog>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, CircleCheckFilled, Close, CopyDocument, Delete, DocumentAdd, Download, EditPen, Plus, Upload } from '@element-plus/icons-vue'
import {
  cloneCharacters,
  createCharacterConfig,
  createEpisode,
  createId,
  createSceneConfig,
  createShot,
} from './defaults'
import {
  buildDetectedCharacters,
  composePrompt,
  countNonPunctuationCharacters,
  detectCharacters,
  formatSeconds,
  mergeDetectedCharacters,
  recommendedSeconds,
} from './prompt'
import type { Episode, ExportPayload, PendingDetection, Shot } from './types'
import { useAppState } from './useAppState'

type MaterialKind = 'characters' | 'scenes'

const { state, activeEpisode } = useAppState()
const materialDialogVisible = ref(false)
const globalDialogVisible = ref(false)
const batchShotDialogVisible = ref(false)
const sidebarCollapsed = ref(false)
const materialDraft = ref('')
const batchShotDraft = ref('')
const materialKind = ref<MaterialKind>('characters')
const editingEpisodeId = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const savedText = computed(() => {
  if (!state.lastSavedAt) {
    return '准备自动保存'
  }

  return `已保存于 ${new Date(state.lastSavedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
})

const completedCount = computed(() => activeEpisode.value?.shots.filter((shot) => shot.status === 'complete').length ?? 0)
const batchShotSegments = computed(() => splitBatchShotText(batchShotDraft.value))

function openMaterialDialog() {
  materialKind.value = 'characters'
  materialDraft.value = ''
  materialDialogVisible.value = true
}

function confirmMaterialDialog() {
  addMaterial(materialKind.value, materialDraft.value)
  materialDraft.value = ''
  materialDialogVisible.value = false
}

function isCharacterUsed(name: string) {
  return activeEpisode.value?.shots.some((shot) => shot.characters.some((character) => character.name === name)) ?? false
}

function isSceneUsed(name: string) {
  return activeEpisode.value?.shots.some((shot) => shot.scenes.some((scene) => scene.name === name)) ?? false
}

function addEpisode() {
  const episode = createEpisode(state.episodes.length + 1)
  state.episodes.push(episode)
  state.activeEpisodeId = episode.id
}

async function deleteEpisode() {
  if (activeEpisode.value) {
    await deleteEpisodeById(activeEpisode.value.id)
  }
}

async function deleteEpisodeById(id: string) {
  if (state.episodes.length === 1) {
    ElMessage.warning('至少保留一集')
    return
  }

  const episode = state.episodes.find((item) => item.id === id)

  if (!episode) {
    return
  }

  try {
    await ElMessageBox.confirm(`确认删除「${episode.title}」？`, '删除单集', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const index = state.episodes.findIndex((item) => item.id === id)
  state.episodes.splice(index, 1)

  if (state.activeEpisodeId === id) {
    state.activeEpisodeId = state.episodes[Math.max(index - 1, 0)].id
  }
}

async function deleteOtherEpisodes() {
  if (state.episodes.length === 1) {
    ElMessage.warning('没有可批量删除的其它剧本')
    return
  }

  try {
    await ElMessageBox.confirm('确认删除当前剧本之外的所有剧本？', '批量删除', {
      type: 'warning',
      confirmButtonText: '删除其它剧本',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  state.episodes = state.episodes.filter((episode) => episode.id === state.activeEpisodeId)
}

function addShot() {
  activeEpisode.value?.shots.push(createShot())
}

function openBatchShotDialog() {
  batchShotDraft.value = ''
  batchShotDialogVisible.value = true
}

function splitBatchShotText(value: string) {
  return value
    .split(/---/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function confirmBatchShots() {
  const episode = activeEpisode.value

  if (!episode || !batchShotSegments.value.length) {
    return
  }

  batchShotSegments.value.forEach((text) => {
    const shot = createShot()
    shot.text = text
    episode.shots.push(shot)
    handleShotTextInput(shot)
  })

  ElMessage.success(`已批量添加 ${batchShotSegments.value.length} 条分镜`)
  batchShotDraft.value = ''
  batchShotDialogVisible.value = false
}

function isShotCollapsed(shot: Shot) {
  return state.globalConfig.autoCollapseCompletedShots && shot.status === 'complete'
}

async function deleteShot(id: string) {
  if (!activeEpisode.value) {
    return
  }

  if (activeEpisode.value.shots.length === 1) {
    ElMessage.warning('至少保留一条分镜')
    return
  }

  try {
    await ElMessageBox.confirm('确认删除这条分镜？', '删除分镜', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  activeEpisode.value.shots = activeEpisode.value.shots.filter((shot) => shot.id !== id)
}

function addMaterial(kind: MaterialKind, value: string) {
  const episode = activeEpisode.value

  if (!episode) {
    return
  }

  const items = splitMaterialInput(value)

  if (!items.length) {
    return
  }

  const added = items.filter((item) => !episode[kind].includes(item))
  const skipped = items.length - added.length

  episode[kind].push(...added)

  if (added.length && skipped) {
    ElMessage.success(`已添加 ${added.length} 项，跳过 ${skipped} 个重复项`)
  } else if (added.length) {
    ElMessage.success(`已添加 ${added.length} 项`)
  } else {
    ElMessage.info('输入的素材已存在')
  }
}

function splitMaterialInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[、；，;,\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function removeMaterial(kind: MaterialKind, value: string) {
  const episode = activeEpisode.value

  if (!episode) {
    return
  }

  episode[kind] = episode[kind].filter((item) => item !== value)
}

function addSceneToShot(shot: Shot) {
  shot.scenes.push(createSceneConfig(activeEpisode.value?.scenes[0] ?? ''))
}

function removeSceneFromShot(shot: Shot, id: string) {
  shot.scenes = shot.scenes.filter((scene) => scene.id !== id)
}

function addCharacterToShot(shot: Shot) {
  const available = activeEpisode.value?.characters.find((name) => !shot.characters.some((character) => character.name === name))

  if (!available) {
    ElMessage.info('没有可添加的人物，或人物已全部加入')
    return
  }

  shot.characters.push(createCharacterConfig(available))
}

function removeCharacterFromShot(shot: Shot, id: string) {
  shot.characters = shot.characters.filter((character) => character.id !== id)
}

function isCharacterOptionDisabled(shot: Shot, currentId: string, name: string) {
  return shot.characters.some((character) => character.id !== currentId && character.name === name)
}

function setShotStatus(shot: Shot, done: boolean) {
  shot.status = done ? 'complete' : 'incomplete'
}

function handleShotTextInput(shot: Shot) {
  const episode = activeEpisode.value

  if (!episode) {
    return
  }

  const detected = detectCharacters(shot.text, episode.characters)

  if (!detected.length) {
    shot.pendingDetection = null
    return
  }

  const currentNames = shot.characters.map((character) => character.name).filter(Boolean)
  const voiceSuggestions = detected
    .filter((character) => character.includeVoice)
    .filter((character) => shot.characters.some((item) => item.name === character.name && !item.includeVoice))
    .map((character) => character.name)

  if (!currentNames.length) {
    shot.undoCharacters = cloneCharacters(shot.characters)
    shot.characters = buildDetectedCharacters(detected)
    shot.pendingDetection = null
    shot.autoSyncNotice = {
      id: createId('notice'),
      message: `已自动添加 ${detected.length} 个人物：${detected.map((character) => character.name).join('、')}。`,
    }
    return
  }

  const mergeNames = Array.from(new Set([...currentNames, ...detected.map((character) => character.name)]))
  const replaceNames = detected.map((character) => character.name)

  if (sameNames(currentNames, replaceNames) && !voiceSuggestions.length) {
    return
  }

  shot.pendingDetection = {
    id: createId('detect'),
    detected,
    currentNames,
    mergeNames,
    replaceNames,
    voiceSuggestions,
  }
  shot.autoSyncNotice = null
}

function mergeDetected(shot: Shot, updateVoiceSuggestions: boolean) {
  if (!shot.pendingDetection) {
    return
  }

  shot.undoCharacters = cloneCharacters(shot.characters)
  shot.characters = mergeDetectedCharacters(shot.characters, shot.pendingDetection.detected, updateVoiceSuggestions)
  shot.autoSyncNotice = {
    id: createId('notice'),
    message: `已合并人物配置：${shot.pendingDetection.mergeNames.join('、')}。`,
  }
  shot.pendingDetection = null
}

function replaceDetected(shot: Shot) {
  if (!shot.pendingDetection) {
    return
  }

  shot.undoCharacters = cloneCharacters(shot.characters)
  shot.characters = buildDetectedCharacters(shot.pendingDetection.detected)
  shot.autoSyncNotice = {
    id: createId('notice'),
    message: `已替换为本次检测人物：${shot.pendingDetection.replaceNames.join('、')}。`,
  }
  shot.pendingDetection = null
}

function cancelDetection(shot: Shot) {
  shot.pendingDetection = null
}

function undoAutoSync(shot: Shot) {
  if (!shot.undoCharacters) {
    return
  }

  shot.characters = cloneCharacters(shot.undoCharacters)
  shot.undoCharacters = null
  shot.autoSyncNotice = null
  ElMessage.success('已撤销自动同步')
}

function promptFor(shot: Shot) {
  return composePrompt(state.globalConfig, shot)
}

async function copyPrompt(shot: Shot) {
  await navigator.clipboard.writeText(promptFor(shot))
  ElMessage.success('已复制当前提示词')
}

function characterCount(text: string) {
  return countNonPunctuationCharacters(text)
}

function durationText(text: string) {
  return formatSeconds(recommendedSeconds(text))
}

function durationState(text: string): { type: 'success' | 'warning' | 'danger'; warn: boolean } {
  const seconds = recommendedSeconds(text)

  if (!text.trim()) {
    return { type: 'warning', warn: false }
  }

  if (seconds < 4 || seconds > 23) {
    return { type: 'danger', warn: true }
  }

  return { type: 'success', warn: false }
}

function namesText(names: string[]) {
  return names.length ? names.join('、') : '无'
}

function sameNames(left: string[], right: string[]) {
  return left.length === right.length && left.every((name) => right.includes(name))
}

function triggerImport() {
  fileInputRef.value?.click()
}

function exportEpisode() {
  if (activeEpisode.value) {
    exportEpisodeById(activeEpisode.value.id)
  }
}

function exportEpisodeById(id: string) {
  const episode = state.episodes.find((item) => item.id === id)

  if (!episode) {
    return
  }

  downloadJson(`${episode.title || 'episode'}.json`, {
    version: state.version,
    exportedAt: new Date().toISOString(),
    episode: JSON.parse(JSON.stringify(episode)) as Episode,
    globalConfigSnapshot: JSON.parse(JSON.stringify(state.globalConfig)),
  })
}

function exportAllEpisodes() {
  downloadJson('script2prompt-episodes.json', {
    version: state.version,
    exportedAt: new Date().toISOString(),
    episodes: JSON.parse(JSON.stringify(state.episodes)) as Episode[],
    globalConfigSnapshot: JSON.parse(JSON.stringify(state.globalConfig)),
  })
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function importEpisode(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''

  if (!files.length) {
    return
  }

  let importedCount = 0

  for (const file of files) {
    try {
      const payload = JSON.parse(await file.text()) as Partial<ExportPayload> & { episodes?: Episode[] }
      const episodes = Array.isArray(payload.episodes) ? payload.episodes : payload.episode ? [payload.episode] : []

      if (!episodes.length) {
        throw new Error('invalid episode')
      }

      episodes.forEach((episode) => {
        const imported = normalizeImportedEpisode(episode)
        state.episodes.push(imported)
        state.activeEpisodeId = imported.id
        importedCount += 1
      })
    } catch {
      ElMessage.error(`导入失败：${file.name} 格式不正确或缺少单集数据`)
    }
  }

  if (importedCount) {
    ElMessage.success(`已导入 ${importedCount} 个剧本`)
  }
}

function normalizeImportedEpisode(episode: Episode): Episode {
  return {
    ...episode,
    id: createId('episode'),
    title: episode.title || '导入单集',
    characters: Array.isArray(episode.characters) ? episode.characters : [],
    scenes: Array.isArray(episode.scenes) ? episode.scenes : [],
    props: [],
    shots: episode.shots.map((shot) => ({
      ...createShot(),
      ...shot,
      id: createId('shot'),
      pendingDetection: null,
      autoSyncNotice: null,
      undoCharacters: null,
      scenes: Array.isArray(shot.scenes) ? shot.scenes.map((scene) => ({ ...scene, id: createId('scene') })) : [],
      characters: Array.isArray(shot.characters)
        ? shot.characters.map((character) => ({ ...character, id: createId('character') }))
        : [],
    })),
  }
}
</script>





