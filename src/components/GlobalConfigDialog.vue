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
            <el-form-item label="安全时长">
              <div class="duration-range-config slider-range-config">
                <span>{{ durationRangeDraft[0].toFixed(1) }}</span>
                <el-slider v-model="durationRangeDraft" range :min="3" :max="25" :step="0.5" :format-tooltip="formatDurationTooltip" />
                <span>{{ durationRangeDraft[1].toFixed(1) }}</span>
              </div>
            </el-form-item>
            <el-form-item label="新建单集默认成本">
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
                  <span>一级分类与二级选项用于评分备注的快捷前缀。</span>
                  <el-button :icon="Plus" text type="primary" @click="addReviewNotePrefixOption">添加选项</el-button>
                </div>
                <div v-if="!draft.dataCollection.reviewNotePrefixOptions.length" class="empty-note">暂无前缀选项</div>
                <div v-else class="dialogue-rule-list">
                  <div v-for="option in draft.dataCollection.reviewNotePrefixOptions" :key="option.id" class="dialogue-rule-row">
                    <el-input v-model="option.category" placeholder="一级分类" clearable />
                    <el-input v-model="option.label" placeholder="二级选项" clearable />
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
            <el-form-item label="台词违禁词替换">
              <div class="dialogue-rule-config">
                <div class="dialogue-rule-heading">
                  <span>所有单集共用，保存后生效；替换内容留空表示删除违禁词。</span>
                  <el-button :icon="Plus" text type="primary" @click="addDialogueReplacementRule">添加规则</el-button>
                </div>
                <div v-if="!draft.dialogueExtraction.replacementRules.length" class="empty-note">暂无替换规则</div>
                <div v-else class="dialogue-rule-list">
                  <div v-for="rule in draft.dialogueExtraction.replacementRules" :key="rule.id" class="dialogue-rule-row">
                    <el-input v-model="rule.forbidden" placeholder="违禁词" clearable />
                    <el-input v-model="rule.replacement" placeholder="替换内容，可留空" clearable />
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
        <div class="global-config-footer-actions">
          <el-button :loading="isResetting" @click="resetFromServer">重置</el-button>
          <el-button type="primary" @click="save">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { cloneGlobalConfig, loadRuntimeDefaultConfig, normalizeGlobalConfig } from '../config'
import { createDialogueReplacementRule, createReviewNotePrefixOption } from '../defaults'
import type { GlobalConfig } from '../types'
import { notify } from '../notification'

type GlobalConfigTab = 'prompt' | 'data' | 'dialogue'

const props = defineProps<{
  modelValue: boolean
  config: GlobalConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [config: GlobalConfig]
}>()

const activeTab = ref<GlobalConfigTab>('prompt')
const draft = ref<GlobalConfig>(cloneGlobalConfig(props.config))
const selectedProfileId = ref(props.config.prompt.activeProfileId)
const initialSignature = ref('')
const isResetting = ref(false)

const selectedProfile = computed(() => draft.value.prompt.profiles.find((profile) => profile.id === selectedProfileId.value) ?? null)
const promptProfileOptions = computed(() => draft.value.prompt.profiles.map((profile) => ({
  label: profile.name,
  value: profile.id,
})))
const isDirty = computed(() => JSON.stringify(draft.value) !== initialSignature.value)
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
    initializeDraft(props.config)
  }
})

function initializeDraft(config: GlobalConfig) {
  draft.value = cloneGlobalConfig(config)
  selectedProfileId.value = config.prompt.activeProfileId
  activeTab.value = 'prompt'
  initialSignature.value = JSON.stringify(draft.value)
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

  if (!normalized) {
    return
  }

  initialSignature.value = JSON.stringify(normalized)
  emit('save', normalized)
  emit('update:modelValue', false)
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
    await ElMessageBox.confirm('将从服务器重新读取默认配置并替换当前弹窗草稿，仍需点击保存才会生效。', '重置全局配置', {
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
    await ElMessageBox.confirm('存在未保存的全局配置修改，确认放弃？', '放弃修改', {
      type: 'warning',
      confirmButtonText: '放弃',
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
