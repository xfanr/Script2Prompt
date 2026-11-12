<template>
  <el-dialog
    :model-value="modelValue"
    title="全局设置"
    width="900px"
    align-center
    class="global-config-dialog app-modal"
    :before-close="handleBeforeClose"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">全局设置</span>
      <nav class="app-modal-sections" aria-label="全局设置分类">
        <el-link v-for="tab in configTabs" :key="tab.value" :type="activeTab === tab.value ? 'primary' : 'default'" underline="never" href="#" :aria-current="activeTab === tab.value ? 'page' : undefined" @click.prevent="activeTab = tab.value">{{ tab.label }}</el-link>
      </nav>
    </template>
    <el-tabs v-model="activeTab" class="global-config-tabs">
      <el-tab-pane label="提示词" name="prompt">
        <div class="global-config-scroll-pane">
          <el-form v-if="selectedProfile" class="global-config-form" label-position="top">
            <el-form-item>
              <el-select
                ref="profileSelectRef"
                v-model="selectedProfileId"
                class="prompt-profile-select"
                aria-label="提示词方案"
              >
                <template #prefix><span class="group-summary-select-prefix prompt-profile-select-prefix">提示词方案</span></template>
                <template #header>
                  <button type="button" class="prompt-profile-select-header" @click.stop="openProfileManager('prompt')">
                    <el-icon><CategoryManagementIcon /></el-icon>方案管理
                  </button>
                </template>
                <el-option v-for="profile in draft.prompt.profiles" :key="profile.id" :label="profile.name" :value="profile.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="基础设定前缀">
              <el-input v-model="selectedProfile.basePrefix" class="global-config-textarea" type="textarea" :rows="7" resize="vertical" />
            </el-form-item>
            <el-form-item label="基础设定后缀">
              <el-input v-model="selectedProfile.baseSuffix" />
              <div class="config-field-help">仅在当前分镜配置的有效角色超过 2 个时追加。</div>
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
            <el-divider />
            <el-form-item>
              <el-select ref="templateSelectRef" v-model="draft.prompt.activeEnsembleAppearanceTemplateId" class="prompt-profile-select" aria-label="群像模板">
                <template #prefix><span class="group-summary-select-prefix prompt-profile-select-prefix">群像模板</span></template>
                <template #header>
                  <button type="button" class="prompt-profile-select-header" @click.stop="openProfileManager('ensemble')">
                    <el-icon><CategoryManagementIcon /></el-icon>模板管理
                  </button>
                </template>
                <el-option v-for="template in draft.prompt.ensembleAppearanceTemplates" :key="template.id" :label="template.name" :value="template.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="群像描述模板">
              <el-input v-model="selectedTemplate.content" type="textarea" :rows="3" resize="vertical" />
            </el-form-item>
          </el-form>

        </div>
      </el-tab-pane>

      <el-tab-pane label="数据收集" name="data">
        <div class="global-config-scroll-pane">
          <el-form class="global-config-form" label-position="top">
            <el-form-item>
              <div class="dialogue-rule-config">
                <div class="dialogue-rule-heading">
                  <span>对接人选项</span>
                  <el-button :icon="Plus" text type="primary" @click="addContactPersonOption">添加人员</el-button>
                </div>
                <div v-if="!draft.dataCollection.contactPersonOptions.length" class="empty-note">暂无对接人选项</div>
                <VueDraggable v-else v-model="draft.dataCollection.contactPersonOptions" class="dialogue-rule-list" :animation="150" :bubble-scroll="false" handle=".config-option-drag-handle" ghost-class="character-drag-ghost">
                  <div v-for="option in draft.dataCollection.contactPersonOptions" :key="option.id" class="contact-person-option-row">
                    <el-button class="config-option-drag-handle" :icon="Sort" text type="primary" :aria-label="`拖拽排序人员${option.label}`" title="拖拽排序" />
                    <el-input v-model="option.label" placeholder="输入对接人名称" aria-label="对接人名称" clearable />
                    <el-button :icon="Delete" text type="danger" aria-label="删除对接人选项" @click="removeContactPersonOption(option.id)" />
                  </div>
                </VueDraggable>
              </div>
            </el-form-item>
            <el-form-item>
              <div class="dialogue-rule-config">
                <div class="dialogue-rule-heading">
                  <span>评分备注前缀</span>
                  <el-button :icon="Plus" text type="primary" @click="addReviewNotePrefixOption">添加选项</el-button>
                </div>
                <div v-if="!draft.dataCollection.reviewNotePrefixOptions.length" class="empty-note">暂无评分备注前缀</div>
                <VueDraggable v-else v-model="draft.dataCollection.reviewNotePrefixOptions" class="dialogue-rule-list" :animation="150" :bubble-scroll="false" handle=".config-option-drag-handle" ghost-class="character-drag-ghost">
                  <div v-for="option in draft.dataCollection.reviewNotePrefixOptions" :key="option.id" class="dialogue-rule-row">
                    <el-button class="config-option-drag-handle" :icon="Sort" text type="primary" :aria-label="`拖拽排序评分备注${option.category}→${option.label}`" title="拖拽排序" />
                    <el-input v-model="option.category" placeholder="输入一级分类" clearable />
                    <el-input v-model="option.label" placeholder="输入二级选项" clearable />
                    <el-button :icon="Delete" text type="danger" aria-label="删除评分备注前缀" @click="removeReviewNotePrefixOption(option.id)" />
                  </div>
                </VueDraggable>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="提取台词" name="dialogue">
        <div class="global-config-scroll-pane">
          <el-form class="global-config-form" label-position="top">
            <el-form-item>
              <div class="dialogue-rule-config">
                <div class="dialogue-rule-heading">
                  <span>台词替换规则</span>
                  <el-button :icon="Plus" text type="primary" @click="addDialogueReplacementRule">添加规则</el-button>
                </div>
                <div v-if="!draft.dialogueExtraction.replacementRules.length" class="empty-note">暂无替换规则</div>
                <VueDraggable v-else v-model="draft.dialogueExtraction.replacementRules" class="dialogue-rule-list" :animation="150" :bubble-scroll="false" handle=".config-option-drag-handle" ghost-class="character-drag-ghost">
                  <div v-for="rule in draft.dialogueExtraction.replacementRules" :key="rule.id" class="dialogue-rule-row">
                    <el-button class="config-option-drag-handle" :icon="Sort" text type="primary" :aria-label="`拖拽排序替换规则${rule.forbidden}`" title="拖拽排序" />
                    <el-input v-model="rule.forbidden" placeholder="输入待替换词语" clearable />
                    <el-input v-model="rule.replacement" placeholder="输入替换内容，可留空" clearable />
                    <el-button :icon="Delete" text type="danger" aria-label="删除替换规则" @click="removeDialogueReplacementRule(rule.id)" />
                  </div>
                </VueDraggable>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="WebDAV" name="webdav">
        <div class="global-config-scroll-pane">
          <el-form id="webdav-settings-form" name="webdav-settings" method="post" class="global-config-form" autocomplete="on" label-position="top" :disabled="Boolean(webDavAction)" @submit.prevent="saveWebDavSettingsDraft">
            <el-form-item label="WebDAV 地址">
              <el-input v-model="webDavDraft.baseUrl" placeholder="/webdav/" clearable />
            </el-form-item>
            <div class="webdav-credentials-grid">
              <el-form-item label="用户名" for="webdav-settings-username">
                <el-input id="webdav-settings-username" v-model="webDavDraft.username" name="username" autocomplete="username" clearable />
              </el-form-item>
              <el-form-item label="密码" for="webdav-settings-password">
                <el-input id="webdav-settings-password" v-model="webDavDraft.password" name="password" type="password" autocomplete="current-password" show-password />
              </el-form-item>
            </div>
            <div class="webdav-sync-status">
              <span>最近完整同步</span>
              <strong>{{ formattedWebDavSyncTime }}</strong>
            </div>
            <el-collapse class="webdav-legacy-settings">
              <el-collapse-item title="迁移旧版单文件" name="legacy">
                <el-form-item label="旧同步文件名">
                  <el-input v-model="webDavDraft.legacyFilename" placeholder="script2prompt-sync.json" />
                </el-form-item>
                <el-button :loading="webDavAction === 'migrate'" :disabled="Boolean(webDavAction)" @click="runWebDavAction('migrate')">迁移为多文件</el-button>
                <div class="config-field-help">直接拆分到当前同步目录，保留旧文件和本地数据。迁移完成后点击下载载入。</div>
              </el-collapse-item>
            </el-collapse>
          </el-form>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <template v-if="activeTab === 'webdav'">
        <el-button :loading="webDavAction === 'test'" :disabled="Boolean(webDavAction)" @click="runWebDavAction('test')">测试</el-button>
        <el-button type="primary" native-type="submit" form="webdav-settings-form" :disabled="Boolean(webDavAction)">保存</el-button>
      </template>
      <template v-else>
        <el-button :loading="isResetting" @click="resetFromServer">恢复初始配置</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </template>
  </el-dialog>
  <SchemeManagerDrawer
    v-model="profileManagerVisible"
    :title="managerKind === 'prompt' ? '方案管理' : '模板管理'"
    :item-label="managerKind === 'prompt' ? '方案' : '模板'"
    :items="managedSchemes"
    @add="addManagedScheme"
    @remove="removeManagedScheme"
    @rename="renameManagedScheme"
    @select="selectManagedScheme"
    @reorder="reorderManagedSchemes"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { ElMessageBox, type SelectInstance } from 'element-plus'
import { CategoryManagementIcon, Delete, Plus, Sort } from '../icons'
import SchemeManagerDrawer from './SchemeManagerDrawer.vue'
import { activeEnsembleAppearanceTemplate, cloneGlobalConfig, loadRuntimeDefaultConfig, normalizeGlobalConfig } from '../config'
import { createContactPersonOption, createDialogueReplacementRule, createId, createReviewNotePrefixOption } from '../defaults'
import type { GlobalConfig } from '../types'
import { notify } from '../notification'
import { normalizeWebDavSettings, type WebDavAction, type WebDavSettings } from '../webdav'

type GlobalConfigTab = 'prompt' | 'data' | 'dialogue' | 'webdav'
type SchemeKind = 'prompt' | 'ensemble'

const props = defineProps<{
  modelValue: boolean
  config: GlobalConfig
  webDavSettings: WebDavSettings
  webDavAction: WebDavAction | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [config: GlobalConfig]
  'webdav-save': [settings: WebDavSettings]
  'webdav-test': [settings: WebDavSettings]
  'webdav-migrate': [settings: WebDavSettings]
}>()

const activeTab = ref<GlobalConfigTab>('prompt')
const configTabs: { value: GlobalConfigTab; label: string }[] = [
  { value: 'prompt', label: '提示词' },
  { value: 'data', label: '数据收集' },
  { value: 'dialogue', label: '提取台词' },
  { value: 'webdav', label: 'WebDAV' },
]
const draft = ref<GlobalConfig>(cloneGlobalConfig(props.config))
const selectedProfileId = ref(props.config.prompt.activeProfileId)
const profileSelectRef = ref<SelectInstance | null>(null)
const templateSelectRef = ref<SelectInstance | null>(null)
const profileManagerVisible = ref(false)
const managerKind = ref<SchemeKind>('prompt')
const initialSignature = ref('')
const webDavDraft = ref<WebDavSettings>({ ...props.webDavSettings })
const initialWebDavSignature = ref('')
const isResetting = ref(false)

const selectedProfile = computed(() => draft.value.prompt.profiles.find((profile) => profile.id === selectedProfileId.value) ?? null)
const selectedTemplate = computed(() => activeEnsembleAppearanceTemplate(draft.value))
const managedSchemes = computed(() => managerKind.value === 'prompt' ? draft.value.prompt.profiles : draft.value.prompt.ensembleAppearanceTemplates)
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

watch(() => props.modelValue, (visible) => {
  if (visible) {
    initializeDraft(props.config, props.webDavSettings)
  } else {
    profileManagerVisible.value = false
  }
})

watch(() => props.webDavSettings, (settings) => {
  webDavDraft.value = { ...settings }
  initialWebDavSignature.value = JSON.stringify(webDavDraft.value)
}, { deep: true })

watch(() => props.config, (config) => {
  draft.value = cloneGlobalConfig(config)
  selectedProfileId.value = config.prompt.activeProfileId
  initialSignature.value = JSON.stringify(draft.value)
})

function initializeDraft(config: GlobalConfig, webDavSettings: WebDavSettings) {
  profileManagerVisible.value = false
  draft.value = cloneGlobalConfig(config)
  webDavDraft.value = { ...webDavSettings }
  selectedProfileId.value = config.prompt.activeProfileId
  activeTab.value = 'prompt'
  initialSignature.value = JSON.stringify(draft.value)
  initialWebDavSignature.value = JSON.stringify(webDavDraft.value)
}

function openProfileManager(kind: SchemeKind) {
  managerKind.value = kind
  if (kind === 'prompt') profileSelectRef.value?.blur()
  else templateSelectRef.value?.blur()
  profileManagerVisible.value = true
}

function addManagedScheme() {
  const baseName = managerKind.value === 'prompt' ? '新方案' : '新模板'
  let name = baseName
  let number = 2
  while (managedSchemes.value.some((scheme) => scheme.name.trim() === name)) {
    name = `${baseName} ${number++}`
  }
  const id = createId(managerKind.value === 'prompt' ? 'prompt-profile' : 'ensemble-template')
  if (managerKind.value === 'prompt') {
    draft.value.prompt.profiles.push({ id, name, basePrefix: '', baseSuffix: '', sceneRolePrefix: '', sceneRoleSuffix: '', shotPrefix: '' })
  } else {
    draft.value.prompt.ensembleAppearanceTemplates.push({ id, name, content: '' })
  }
  selectManagedScheme(id)
}

function selectManagedScheme(id: string) {
  if (managerKind.value === 'prompt') selectedProfileId.value = id
  else draft.value.prompt.activeEnsembleAppearanceTemplateId = id
}

function renameManagedScheme(id: string, name: string) {
  managedSchemes.value.find((scheme) => scheme.id === id)!.name = name
}

function reorderManagedSchemes(ids: string[]) {
  const order = new Map(ids.map((id, index) => [id, index]))
  managedSchemes.value.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
}

function removeManagedScheme(id: string) {
  const prompt = draft.value.prompt
  if (managerKind.value === 'prompt') {
    prompt.profiles = prompt.profiles.filter((profile) => profile.id !== id)
    if (prompt.activeProfileId === id) prompt.activeProfileId = prompt.profiles[0].id
    if (selectedProfileId.value === id) selectedProfileId.value = prompt.activeProfileId
  } else {
    prompt.ensembleAppearanceTemplates = prompt.ensembleAppearanceTemplates.filter((template) => template.id !== id)
    if (prompt.activeEnsembleAppearanceTemplateId === id) prompt.activeEnsembleAppearanceTemplateId = prompt.ensembleAppearanceTemplates[0].id
  }
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

function addContactPersonOption() {
  draft.value.dataCollection.contactPersonOptions.push(createContactPersonOption())
}

function removeContactPersonOption(id: string) {
  draft.value.dataCollection.contactPersonOptions = draft.value.dataCollection.contactPersonOptions.filter((option) => option.id !== id)
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

function saveWebDavSettingsDraft(event: SubmitEvent) {
  const form = new FormData(event.target as HTMLFormElement)
  webDavDraft.value.username = String(form.get('username') ?? '')
  webDavDraft.value.password = String(form.get('password') ?? '')
  const settings = validatedWebDavSettings()

  if (!settings) {
    return
  }

  webDavDraft.value = settings
  initialWebDavSignature.value = JSON.stringify(settings)
  emit('webdav-save', settings)
}

function runWebDavAction(action: 'test' | 'migrate') {
  const settings = validatedWebDavSettings()

  if (!settings) {
    return
  }

  webDavDraft.value = settings
  initialWebDavSignature.value = JSON.stringify(settings)

  if (action === 'test') {
    emit('webdav-test', settings)
  } else {
    emit('webdav-migrate', settings)
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
  for (const kind of ['prompt', 'ensemble'] as const) {
    const schemes = kind === 'prompt' ? draft.value.prompt.profiles : draft.value.prompt.ensembleAppearanceTemplates
    schemes.forEach((scheme) => { scheme.name = scheme.name.trim() })
    if (schemes.some((scheme) => !scheme.name) || new Set(schemes.map((scheme) => scheme.name)).size !== schemes.length) {
      notify.warning(`${kind === 'prompt' ? '方案' : '模板'}名称不能为空或重复`)
      activeTab.value = 'prompt'
      openProfileManager(kind)
      return null
    }
  }
  const contacts = draft.value.dataCollection.contactPersonOptions
  contacts.forEach((option) => { option.label = option.label.trim() })
  if (contacts.some((option) => !option.label)) {
    notify.warning('对接人名称不能为空')
    activeTab.value = 'data'
    return null
  }
  if (new Set(contacts.map((option) => option.label)).size !== contacts.length) {
    notify.warning('对接人名称不能重复')
    activeTab.value = 'data'
    return null
  }

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
  if (props.webDavAction) return
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

</script>
