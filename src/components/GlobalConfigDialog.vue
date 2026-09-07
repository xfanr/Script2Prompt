<template>
  <el-dialog
    :model-value="modelValue"
    width="900px"
    :show-close="false"
    class="global-config-dialog"
    :before-close="handleBeforeClose"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-tabs v-model="activeTab" class="global-config-tabs">
      <el-tab-pane label="WebDAV" name="webdav">
        <div class="global-config-scroll-pane">
          <el-form class="global-config-form" label-position="top">
            <el-form-item label="WebDAV 地址">
              <el-input v-model="webDavDraft.baseUrl" placeholder="/webdav/" clearable />
            </el-form-item>
            <div class="webdav-credentials-grid">
              <el-form-item label="用户名">
                <el-input v-model="webDavDraft.username" autocomplete="username" clearable />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="webDavDraft.password" type="password" autocomplete="current-password" show-password />
              </el-form-item>
            </div>
            <el-form-item label="同步文件名">
              <el-input v-model="webDavDraft.filename" placeholder="script2prompt-sync.json" clearable />
            </el-form-item>
            <div class="webdav-sync-status">
              <span>最近同步</span>
              <strong>{{ formattedWebDavSyncTime }}</strong>
            </div>
            <div class="webdav-inline-actions">
              <el-button-group class="episode-actions webdav-sync-actions">
                <el-button :icon="Connection" round title="测试连接" aria-label="测试连接" :loading="webDavAction === 'test'" :disabled="Boolean(webDavAction)" @click="runWebDavAction('test')" />
                <el-button :icon="Download" title="从云端下载" aria-label="从云端下载" :loading="webDavAction === 'download'" :disabled="Boolean(webDavAction)" @click="runWebDavAction('download')" />
                <el-popconfirm
                  :visible="webDavUploadConflict"
                  title="云端文件已存在或已被其他设备更新，是否覆盖"
                  confirm-button-text="覆盖"
                  cancel-button-text="取消"
                  icon-color="var(--el-color-warning)"
                  :width="300"
                  @confirm="emit('webdav-overwrite')"
                  @cancel="emit('webdav-upload-conflict-dismiss')"
                >
                  <template #reference>
                    <el-button :icon="Upload" round title="上传到云端" aria-label="上传到云端" :loading="webDavAction === 'upload'" :disabled="Boolean(webDavAction)" @click="runWebDavAction('upload')" />
                  </template>
                </el-popconfirm>
              </el-button-group>
            </div>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="提示词" name="prompt">
        <div class="global-config-scroll-pane">
          <el-form v-if="selectedProfile" class="global-config-form" label-position="top">
            <el-form-item label="基础设定前缀">
              <el-input v-model="selectedProfile.basePrefix" class="global-config-textarea" type="textarea" :rows="7" resize="vertical" />
            </el-form-item>
            <el-form-item label="基础设定后缀">
              <el-input v-model="selectedProfile.baseSuffix" />
              <div class="config-field-help">仅在当前分镜配置的有效人物超过 2 个时追加。</div>
            </el-form-item>
            <el-form-item label="场景与角色设定前缀">
              <el-input v-model="selectedProfile.sceneRolePrefix" />
            </el-form-item>
            <el-form-item label="场景与角色设定后缀">
              <el-input v-model="selectedProfile.sceneRoleSuffix" />
            </el-form-item>
            <el-form-item label="分镜详情前缀">
              <el-input v-model="selectedProfile.shotPrefix" />
            </el-form-item>
          </el-form>

        </div>
      </el-tab-pane>

      <el-tab-pane label="数据收集" name="data">
        <div class="global-config-scroll-pane">
          <el-form class="global-config-form" label-position="top">
            <el-form-item label="推荐时长范围">
              <div class="duration-range-config slider-range-config">
                <span>{{ durationRangeDraft[0].toFixed(1) }}</span>
                <el-slider v-model="durationRangeDraft" range :min="3" :max="25" :step="0.5" :format-tooltip="formatDurationTooltip" />
                <span>{{ durationRangeDraft[1].toFixed(1) }}</span>
              </div>
            </el-form-item>
            <el-form-item label="新建单集默认积分成本">
              <el-input-number
                v-model="draft.dataCollection.defaultPointCost"
                class="global-config-number-input"
                :min="0"
                :precision="4"
                :step="0.0001"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="评分备注前缀">
              <div class="dialogue-rule-config">
                <div class="dialogue-rule-heading">
                  <span>分类与选项将组合为评分备注前缀。</span>
                  <el-button :icon="Plus" text type="primary" @click="addReviewNotePrefixOption">添加选项</el-button>
                </div>
                <div v-if="!draft.dataCollection.reviewNotePrefixOptions.length" class="empty-note">暂无评分备注前缀</div>
                <div v-else class="dialogue-rule-list">
                  <div v-for="option in draft.dataCollection.reviewNotePrefixOptions" :key="option.id" class="dialogue-rule-row">
                    <el-input v-model="option.category" placeholder="输入一级分类" clearable />
                    <el-input v-model="option.label" placeholder="输入二级选项" clearable />
                    <el-button :icon="Delete" text type="danger" aria-label="删除评分备注前缀" @click="removeReviewNotePrefixOption(option.id)" />
                  </div>
                </div>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="提取台词" name="dialogue">
        <div class="global-config-scroll-pane">
          <el-form class="global-config-form" label-position="top">
            <el-form-item label="台词替换规则">
              <div class="dialogue-rule-config">
                <div class="dialogue-rule-heading">
                  <span>所有单集共用，保存后生效；替换内容留空时删除对应词语。</span>
                  <el-button :icon="Plus" text type="primary" @click="addDialogueReplacementRule">添加规则</el-button>
                </div>
                <div v-if="!draft.dialogueExtraction.replacementRules.length" class="empty-note">暂无替换规则</div>
                <div v-else class="dialogue-rule-list">
                  <div v-for="rule in draft.dialogueExtraction.replacementRules" :key="rule.id" class="dialogue-rule-row">
                    <el-input v-model="rule.forbidden" placeholder="输入待替换词语" clearable />
                    <el-input v-model="rule.replacement" placeholder="输入替换内容，可留空" clearable />
                    <el-button :icon="Delete" text type="danger" aria-label="删除替换规则" @click="removeDialogueReplacementRule(rule.id)" />
                  </div>
                </div>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

    </el-tabs>

    <template #footer>
      <div class="global-config-footer" :class="{ 'is-prompt-tab': activeTab === 'prompt' }">
        <div v-if="activeTab === 'prompt'" class="prompt-profile-dock">
          <span class="prompt-profile-label">提示词方案</span>
          <el-segmented
            v-model="selectedProfileId"
            class="prompt-profile-slots"
            :options="promptProfileOptions"
            size="small"
            aria-label="提示词方案"
          />
        </div>
        <div v-if="activeTab === 'webdav'" class="global-config-footer-actions">
          <el-button type="primary" :disabled="Boolean(webDavAction)" @click="saveWebDavSettingsDraft">保存连接设置</el-button>
        </div>
        <div v-else class="global-config-footer-actions">
          <el-button :loading="isResetting" @click="resetFromServer">恢复初始配置</el-button>
          <el-button type="primary" @click="save">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Connection, Delete, Download, Plus, Upload } from '@element-plus/icons-vue'
import { cloneGlobalConfig, loadRuntimeDefaultConfig, normalizeGlobalConfig } from '../config'
import { createDialogueReplacementRule, createReviewNotePrefixOption } from '../defaults'
import type { GlobalConfig } from '../types'
import { notify } from '../notification'
import { normalizeWebDavSettings, type WebDavAction, type WebDavSettings } from '../webdav'

type GlobalConfigTab = 'prompt' | 'data' | 'dialogue' | 'webdav'

const props = defineProps<{
  modelValue: boolean
  config: GlobalConfig
  webDavSettings: WebDavSettings
  webDavAction: WebDavAction | null
  webDavUploadConflict: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [config: GlobalConfig]
  'webdav-save': [settings: WebDavSettings]
  'webdav-test': [settings: WebDavSettings]
  'webdav-upload': [settings: WebDavSettings]
  'webdav-overwrite': []
  'webdav-upload-conflict-dismiss': []
  'webdav-download': [settings: WebDavSettings]
}>()

const activeTab = ref<GlobalConfigTab>('webdav')
const draft = ref<GlobalConfig>(cloneGlobalConfig(props.config))
const selectedProfileId = ref(props.config.prompt.activeProfileId)
const initialSignature = ref('')
const webDavDraft = ref<WebDavSettings>({ ...props.webDavSettings })
const initialWebDavSignature = ref('')
const isResetting = ref(false)

const selectedProfile = computed(() => draft.value.prompt.profiles.find((profile) => profile.id === selectedProfileId.value) ?? null)
const promptProfileOptions = computed(() => draft.value.prompt.profiles.map((profile) => ({
  label: profile.name,
  value: profile.id,
})))
const isGlobalConfigDirty = computed(() => JSON.stringify(draft.value) !== initialSignature.value)
const isWebDavDirty = computed(() => JSON.stringify(webDavDraft.value) !== initialWebDavSignature.value)
const isDirty = computed(() => isGlobalConfigDirty.value || isWebDavDirty.value)
const formattedWebDavSyncTime = computed(() => {
  if (!webDavDraft.value.lastSyncedAt) {
    return '尚未同步'
  }

  const date = new Date(webDavDraft.value.lastSyncedAt)
  return Number.isNaN(date.getTime()) ? '尚未同步' : date.toLocaleString('zh-CN', { hour12: false })
})
const durationRangeDraft = computed<[number, number]>({
  get: (): [number, number] => [
    draft.value.dataCollection.recommendedDurationRange.min,
    draft.value.dataCollection.recommendedDurationRange.max,
  ],
  set: (value: [number, number]) => {
    const [min, max] = value
    draft.value.dataCollection.recommendedDurationRange = { min, max }
  },
})

watch(() => props.modelValue, (visible) => {
  if (visible) {
    initializeDraft(props.config, props.webDavSettings)
  }
})

watch(() => props.webDavSettings, (settings) => {
  webDavDraft.value = { ...settings }
  initialWebDavSignature.value = JSON.stringify(webDavDraft.value)
}, { deep: true })

function initializeDraft(config: GlobalConfig, webDavSettings: WebDavSettings) {
  draft.value = cloneGlobalConfig(config)
  webDavDraft.value = { ...webDavSettings }
  selectedProfileId.value = config.prompt.activeProfileId
  activeTab.value = 'webdav'
  initialSignature.value = JSON.stringify(draft.value)
  initialWebDavSignature.value = JSON.stringify(webDavDraft.value)
}

function addDialogueReplacementRule() {
  draft.value.dialogueExtraction.replacementRules.push(createDialogueReplacementRule())
}

function removeDialogueReplacementRule(id: string) {
  draft.value.dialogueExtraction.replacementRules = draft.value.dialogueExtraction.replacementRules.filter((rule) => rule.id !== id)
}

function addReviewNotePrefixOption() {
  draft.value.dataCollection.reviewNotePrefixOptions.push(createReviewNotePrefixOption())
}

function removeReviewNotePrefixOption(id: string) {
  draft.value.dataCollection.reviewNotePrefixOptions = draft.value.dataCollection.reviewNotePrefixOptions.filter((option) => option.id !== id)
}

function save() {
  const normalized = validateDraft()
  const webDavSettings = isWebDavDirty.value ? validatedWebDavSettings() : null

  if (!normalized || (isWebDavDirty.value && !webDavSettings)) {
    return
  }

  initialSignature.value = JSON.stringify(normalized)
  emit('save', normalized)

  if (webDavSettings) {
    webDavDraft.value = webDavSettings
    initialWebDavSignature.value = JSON.stringify(webDavSettings)
    emit('webdav-save', webDavSettings)
  }

  emit('update:modelValue', false)
}

function saveWebDavSettingsDraft() {
  const settings = validatedWebDavSettings()

  if (!settings) {
    return
  }

  webDavDraft.value = settings
  initialWebDavSignature.value = JSON.stringify(settings)
  emit('webdav-save', settings)
  notify.success('WebDAV 连接设置已保存')
}

function runWebDavAction(action: WebDavAction) {
  const settings = validatedWebDavSettings()

  if (!settings) {
    return
  }

  webDavDraft.value = settings
  initialWebDavSignature.value = JSON.stringify(settings)

  if (action === 'test') {
    emit('webdav-test', settings)
  } else if (action === 'upload') {
    emit('webdav-upload', settings)
  } else {
    emit('webdav-download', settings)
  }
}

function validatedWebDavSettings() {
  try {
    return normalizeWebDavSettings(webDavDraft.value)
  } catch (error) {
    notify.warning(error instanceof Error ? error.message : 'WebDAV 连接设置无效')
    return null
  }
}

function validateDraft() {
  const rules = draft.value.dialogueExtraction.replacementRules
  rules.forEach((rule) => {
    rule.forbidden = rule.forbidden.trim()
  })

  if (rules.some((rule) => !rule.forbidden)) {
    notify.warning('违禁词不能为空')
    activeTab.value = 'dialogue'
    return null
  }

  if (new Set(rules.map((rule) => rule.forbidden)).size !== rules.length) {
    notify.warning('违禁词不能重复')
    activeTab.value = 'dialogue'
    return null
  }

  const options = draft.value.dataCollection.reviewNotePrefixOptions
  options.forEach((option) => {
    option.category = option.category.trim()
    option.label = option.label.trim()
  })

  if (options.some((option) => !option.category || !option.label)) {
    notify.warning('评分备注前缀的分类与选项不能为空')
    activeTab.value = 'data'
    return null
  }

  if (new Set(options.map((option) => `${option.category}→${option.label}`)).size !== options.length) {
    notify.warning('评分备注前缀的分类与选项组合不能重复')
    activeTab.value = 'data'
    return null
  }

  const normalized = normalizeGlobalConfig(draft.value)

  if (!normalized) {
    notify.warning('全局配置中存在无效内容')
    return null
  }

  return normalized
}

async function resetFromServer() {
  try {
    await ElMessageBox.confirm('将重新读取服务器初始配置并替换当前草稿；点击“保存”后生效。', '重置全局配置', {
      type: 'warning',
      confirmButtonText: '重置',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  isResetting.value = true

  try {
    const config = await loadRuntimeDefaultConfig({ fresh: true })
    draft.value = cloneGlobalConfig(config)
    selectedProfileId.value = config.prompt.activeProfileId
    activeTab.value = 'prompt'
    notify.success('已载入服务器初始配置，保存后生效')
  } catch {
    notify.error('服务器初始配置读取失败，当前草稿未改变')
  } finally {
    isResetting.value = false
  }
}

function handleBeforeClose(done: () => void) {
  void canDiscardChanges().then((canClose) => {
    if (canClose) {
      done()
    }
  })
}

async function canDiscardChanges() {
  if (!isDirty.value) {
    return true
  }

  try {
    await ElMessageBox.confirm('设置中存在尚未保存的修改，确认放弃？', '放弃修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑',
    })
    return true
  } catch {
    return false
  }
}

function formatDurationTooltip(value: number) {
  return value.toFixed(1) + ' 秒'
}
</script>
