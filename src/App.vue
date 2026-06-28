<template>
  <el-config-provider>
    <div class="app-shell">
      <input ref="fileInputRef" class="file-input" type="file" accept="application/json,.json" multiple @change="importEpisode" />

      <div class="workspace">
        <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
          <section class="sidebar-brand">
            <div class="brand-mark"><img :src="brandIconUrl" alt="Script2Prompt" /></div>
            <div v-if="!sidebarCollapsed" class="brand-text">
              <strong>短剧提示词工作台</strong>
              <span>Script2Prompt</span>
            </div>
            <el-button
              v-if="!sidebarCollapsed"
              class="global-config-icon"
              :icon="Setting"
              circle
              title="全局配置"
              aria-label="全局配置"
              @click="openGlobalDialog"
            />
          </section>

          <template v-if="!sidebarCollapsed">
            <section class="panel episode-panel">
              <div class="episode-header">
                <span>剧本管理</span>
                <el-button-group class="episode-actions">
                  <el-button :icon="Plus" title="添加单集" aria-label="添加单集" @click="addEpisode" />
                  <el-button :icon="FolderAdd" title="新建分组" aria-label="新建分组" @click="addEpisodeGroup" />
                  <el-button :icon="Download" title="导入数据" aria-label="导入数据" @click="triggerImport" />
                  <el-button :icon="MostlyCloudy" title="导出数据" aria-label="导出数据" @click="exportAllEpisodes" />
                </el-button-group>
              </div>
              <el-scrollbar class="episode-scrollbar">
                <div class="episode-tree">
                  <section class="episode-group-block">
                    <div class="episode-group-row default-group" role="button" tabindex="0" @contextmenu.prevent.stop @click="toggleGroup('ungrouped')" @keyup.enter="toggleGroup('ungrouped')">
                      <el-icon class="group-caret" :class="{ expanded: isGroupExpanded('ungrouped') }"><ArrowRight /></el-icon>
                      <span>未分组</span>
                      <em>{{ sortedUngroupedEpisodes.length }}</em>
                    </div>
                    <div v-if="isGroupExpanded('ungrouped')" class="episode-children">
                      <el-dropdown
                        :ref="(dropdown) => setEpisodeDropdownRef(episode.id, dropdown)"
                        v-for="episode in sortedUngroupedEpisodes"
                        :key="episode.id"
                        trigger="contextmenu"
                        :visible="openEpisodeMenuId === episode.id"
                        @visible-change="(visible) => handleEpisodeMenuVisibleChange(visible, episode.id)"
                        @command="(command) => handleEpisodeCommand(command, episode)"
                      >
                        <div class="episode-tree-item" :class="{ active: episode.id === state.activeEpisodeId }" @click="state.activeEpisodeId = episode.id">
                          <div v-if="editingEpisodeId === episode.id" class="rename-inline" @click.stop @keydown.stop>
                            <el-input v-model="episode.title" class="episode-title-input" placeholder="本集标题" @keydown.space.stop @keyup.enter.stop="finishEpisodeRename" />
                            <el-button class="rename-confirm" :icon="Check" circle text @click="finishEpisodeRename" />
                            <el-button class="rename-cancel" :icon="Close" circle text @click="cancelEpisodeRename(episode)" />
                          </div>
                          <span v-else class="episode-title-display"><span class="episode-title-text">{{ episode.title }}</span><span v-if="episode.starred" class="episode-star">⭐️</span></span>
                        </div>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="edit">重命名</el-dropdown-item>
                            <el-dropdown-item command="toggleStar">{{ episode.starred ? '取消星标' : '星标' }}</el-dropdown-item>
                            <el-dropdown-item command="delete">删除</el-dropdown-item>
                            <el-dropdown-item v-for="(group, groupIndex) in sortedEpisodeGroups" :key="group.id" :divided="groupIndex === 0" :command="{ action: 'move', groupId: group.id }">移至 {{ group.title }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </section>

                  <section v-for="group in sortedEpisodeGroups" :key="group.id" class="episode-group-block">
                    <el-dropdown :ref="(dropdown) => setGroupDropdownRef(group.id, dropdown)" trigger="contextmenu" :visible="openGroupMenuId === group.id" @visible-change="(visible) => handleGroupMenuVisibleChange(visible, group.id)" @command="(command) => handleGroupCommand(command, group.id)">
                      <div class="episode-group-row" role="button" tabindex="0" @click="toggleGroup(group.id)" @keyup.enter="toggleGroup(group.id)">
                        <el-icon class="group-caret" :class="{ expanded: isGroupExpanded(group.id) }"><ArrowRight /></el-icon>
                        <div v-if="editingGroupId === group.id" class="rename-inline" @click.stop @keydown.stop>
                          <el-input v-model="group.title" class="episode-title-input" placeholder="分组名称" @keydown.space.stop @keyup.enter.stop="finishGroupRename" />
                          <el-button class="rename-confirm" :icon="Check" circle text @click="finishGroupRename" />
                          <el-button class="rename-cancel" :icon="Close" circle text @click="cancelGroupRename(group)" />
                        </div>
                        <span v-else>{{ group.title }}</span>
                        <em v-if="editingGroupId !== group.id">{{ episodesForGroup(group.id).length }}</em>
                      </div>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="edit">重命名</el-dropdown-item>
                          <el-dropdown-item command="delete">删除</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <div v-if="isGroupExpanded(group.id)" class="episode-children">
                      <el-dropdown
                        :ref="(dropdown) => setEpisodeDropdownRef(episode.id, dropdown)"
                        v-for="episode in episodesForGroup(group.id)"
                        :key="episode.id"
                        trigger="contextmenu"
                        :visible="openEpisodeMenuId === episode.id"
                        @visible-change="(visible) => handleEpisodeMenuVisibleChange(visible, episode.id)"
                        @command="(command) => handleEpisodeCommand(command, episode)"
                      >
                        <div class="episode-tree-item" :class="{ active: episode.id === state.activeEpisodeId }" @click="state.activeEpisodeId = episode.id">
                          <div v-if="editingEpisodeId === episode.id" class="rename-inline" @click.stop @keydown.stop>
                            <el-input v-model="episode.title" class="episode-title-input" placeholder="本集标题" @keydown.space.stop @keyup.enter.stop="finishEpisodeRename" />
                            <el-button class="rename-confirm" :icon="Check" circle text @click="finishEpisodeRename" />
                            <el-button class="rename-cancel" :icon="Close" circle text @click="cancelEpisodeRename(episode)" />
                          </div>
                          <span v-else class="episode-title-display"><span class="episode-title-text">{{ episode.title }}</span><span v-if="episode.starred" class="episode-star">⭐️</span></span>
                        </div>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="edit">重命名</el-dropdown-item>
                            <el-dropdown-item command="toggleStar">{{ episode.starred ? '取消星标' : '星标' }}</el-dropdown-item>
                            <el-dropdown-item command="delete">删除</el-dropdown-item>
                            <el-dropdown-item divided :command="{ action: 'move', groupId: null }">移至未分组</el-dropdown-item>
                            <el-dropdown-item v-for="targetGroup in sortedEpisodeGroups" :key="targetGroup.id" :command="{ action: 'move', groupId: targetGroup.id }">移至 {{ targetGroup.title }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </section>
                </div>
              </el-scrollbar>
            </section>

            <div class="sidebar-footer">
              <span>共 {{ state.episodes.length }} 集，{{ state.episodeGroups.length }} 分组</span>
              <span>{{ savedText }}</span>
            </div>
          </template>
        </aside>

        <main v-if="activeEpisode" class="main-stage">
          <section class="stage-header">
            <div class="stage-topline">
              <div class="asset-heading">
                <h3>本集基础素材</h3>
                <el-button class="add-material-button" type="primary" text @click="openMaterialDialog">添加素材</el-button>
              </div>
              <div class="stage-actions">
                <el-button :icon="DataAnalysis" plain @click="openReviewSummary">评分汇总</el-button>
                <el-dropdown class="shot-create-actions" split-button type="primary" @click="openBatchShotDialog" @command="handleAddShotCommand">
                  添加分镜
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="start">添至开头</el-dropdown-item>
                      <el-dropdown-item command="end">添至末尾</el-dropdown-item>
                      <el-dropdown-item v-for="(_, shotIndex) in activeEpisode.shots" :key="shotIndex" :command="{ action: 'after', index: shotIndex }">
                        添至 #{{ shotIndex + 1 }} 后
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            <div class="asset-editor">
              <div class="asset-tags">
                <el-tag size="large" v-for="item in activeEpisode.characters" :key="`character-${item}`" type="primary" :effect="isCharacterUsed(item) ? 'light' : 'plain'" closable @close="removeMaterial('characters', item)">
                  人物 · {{ item }}
                </el-tag>
                <el-tag size="large" v-for="item in activeEpisode.scenes" :key="`scene-${item.name}`" type="success" :effect="isSceneUsed(item.name) ? 'light' : 'plain'" closable @close="removeMaterial('scenes', item.name)">
                  场景 · {{ item.name }} · {{ item.time }} · {{ item.space }}
                </el-tag>
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
                      class="shot-status-button"
                      :icon="shot.status === 'complete' ? CircleCheckFilled : CircleCheck"
                      :type="shot.status === 'complete' ? 'success' : undefined"
                      :title="shot.status === 'complete' ? '完成' : '待办'"
                      :aria-label="shot.status === 'complete' ? '完成' : '待办'"
                      @click="setShotStatus(shot, shot.status !== 'complete')"
                    >
                      {{ shot.status === 'complete' ? '完成' : '待办' }}
                    </el-button>
                    <el-button :icon="CopyDocument" @click="copyPrompt(shot)">复制</el-button>
                    <el-popconfirm title="确认删除这条分镜？" confirm-button-text="删除" cancel-button-text="取消" @confirm="deleteShot(shot.id)">
                      <template #reference>
                        <el-button :icon="Delete" type="danger" plain>删除</el-button>
                      </template>
                    </el-popconfirm>
                  </el-button-group>
                </div>
              </div>

              <div v-if="!isShotCollapsed(shot)" class="shot-grid">
                <section class="shot-cell script-cell">
                  <div class="cell-title script-title">
                    <span>{{ sectionTitle('shot') }}</span>
                    <el-button :icon="Search" text type="primary" @click="detectShotCharacters(shot)">识别</el-button>
                  </div>
                  <div class="script-input-wrap" :class="{ warn: durationState(shot.text).warn }">
                    <div class="script-highlight-layer" v-html="highlightedShotText(shot)"></div>
                    <el-input
                      v-model="shot.text"
                      type="textarea"
                      :rows="9"
                      resize="vertical"
                      placeholder="输入或粘贴 40-120 字分段剧本。系统会匹配本集人物，并识别对白格式。"
                    />
                    <div class="script-inline-stats">
                      <span>{{ characterCount(shot.text) }}/140 字</span>
                      <span>推荐 {{ durationText(shot.text) }}</span>
                    </div>
                  </div>
                </section>

                <section class="shot-cell config-cell">
                  <div class="config-group">
                    <div class="config-heading">
                      <span>场景配置</span>
                      <el-button :icon="Plus" text type="primary" @click="addSceneToShot(shot)">添加场景</el-button>
                    </div>
                    <div v-if="!shot.scenes.length" class="empty-note">暂无场景项</div>
                    <div v-for="scene in shot.scenes" :key="scene.id" class="config-line scene-line">
                      <el-select v-model="scene.name" placeholder="选择场景" filterable @change="syncSceneFromAsset(scene)">
                        <el-option v-for="item in activeEpisode.scenes" :key="item.name" :label="item.name" :value="item.name" />
                      </el-select>
                      <span class="scene-config-meta">{{ scene.time }} · {{ scene.space }}</span>
                      <el-popconfirm title="确认删除这个场景配置？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeSceneFromShot(shot, scene.id)">
                        <template #reference>
                          <el-button :icon="Close" circle text />
                        </template>
                      </el-popconfirm>
                    </div>
                  </div>

                  <div class="config-group character-config-group">
                    <div class="config-heading character-heading">
                      <div class="character-heading-title">
                        <span>人物配置</span>
                        <el-checkbox v-model="shot.usePositionReference">多角色位置参考</el-checkbox>
                      </div>
                      <el-button :icon="Plus" text type="primary" @click="addCharacterToShot(shot)">添加人物</el-button>
                    </div>
                    <div class="character-config-list">
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
                      <el-checkbox v-model="character.includeVoice" border :class="{ 'is-voice-overflow': isVoiceOverflow(shot) && character.includeVoice }">音色</el-checkbox>
                      <el-input
                        v-model="character.statusText"
                        class="character-status-input"
                        placeholder="状态内容"
                      />
                      <el-popconfirm title="确认删除这个人物配置？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeCharacterFromShot(shot, character.id)">
                          <template #reference>
                            <el-button :icon="Close" circle text />
                          </template>
                        </el-popconfirm>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="shot-cell preview-cell">
                  <div class="cell-title preview-title">
                    <span>完整提示词预览</span>
                    <el-button
                      class="review-trigger"
                      :icon="isShotReviewed(shot) ? StarFilled : Star"
                      type="warning"
                      text
                      @click="openReviewDialog(shot)"
                    >
                      评分
                    </el-button>
                  </div>
                  <pre>{{ promptFor(shot) }}</pre>
                </section>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>

      <el-dialog v-model="globalDialogVisible" title="全局配置" width="760px" class="global-config-dialog" @close="cancelGlobalDialog">
        <el-form label-position="top">
          <el-form-item label="章节设置">
            <div class="section-config-list">
              <div v-for="section in globalConfigDraft.sections" :key="section.key" class="section-config">
                <el-switch v-model="section.enabled" />
                <el-input v-model="section.title" />
                <el-input-number v-model="section.order" :min="1" :max="9" />
              </div>
            </div>
          </el-form-item>
          <el-form-item :label="draftSectionTitle('base')">
            <el-input v-model="globalConfigDraft.baseSetting" type="textarea" :rows="7" resize="vertical" />
          </el-form-item>
          <el-form-item :label="draftSectionTitle('sceneRole') + ' 后缀'">
            <el-input v-model="globalConfigDraft.sceneRoleSuffix" type="textarea" :rows="4" resize="vertical" />
          </el-form-item>
          <el-form-item label="分镜折叠">
            <el-switch v-model="globalConfigDraft.autoCollapseCompletedShots" />
          </el-form-item>
          <el-form-item label="安全时长">
            <div class="duration-range-config slider-range-config">
              <span>{{ durationRangeDraft[0].toFixed(1) }}</span>
              <el-slider v-model="durationRangeDraft" range :min="0" :max="30" :step="0.1" :format-tooltip="formatDurationTooltip" />
              <span>{{ durationRangeDraft[1].toFixed(1) }}</span>
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="cancelGlobalDialog">取消</el-button>
          <el-button type="primary" @click="saveGlobalDialog">保存</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="detectionDialogVisible" title="人物识别冲突" width="520px" class="detection-dialog" @closed="cancelActiveDetection">
        <div v-if="detectionConflict" class="detect-diff dialog-detect-diff">
          <p>当前已有：{{ namesText(detectionConflict.currentNames) }}</p>
          <p>本次识别：{{ namesText(detectionConflict.replaceNames) }}</p>
          <p>合并后：{{ namesText(detectionConflict.mergeNames) }}</p>
          <p v-if="detectionConflict.voiceSuggestions.length">音色建议：{{ namesText(detectionConflict.voiceSuggestions) }}</p>
        </div>
        <template #footer>
          <el-button @click="cancelActiveDetection">取消</el-button>
          <el-button type="primary" @click="mergeActiveDetection">合并</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="batchShotDialogVisible" title="批量分镜" width="960px" class="batch-shot-dialog">
        <el-form label-position="top">
          <el-input
              v-model="batchShotDraft"
              type="textarea"
              :rows="10"
              placeholder="用连续三个短横线 --- 分割每条分镜"
            />

          <div v-if="batchShotSegments.length" class="batch-shot-preview">
            <div
              v-for="(text, index) in batchShotSegments"
              :key="`${index}-${text.length}`"
              class="batch-shot-preview-item"
              :class="{ warn: durationState(text).warn }"
            >
              <span class="batch-shot-index">#{{ index + 1 }}</span>
              <p>{{ text }}</p>
              <span class="batch-shot-stat">{{ characterCount(text) }} 字</span>
              <span class="batch-shot-stat">推荐 {{ durationText(text) }}</span>
            </div>
          </div>
        </el-form>
        <template #footer>
          <div class="batch-shot-footer">
            <el-alert
              class="batch-shot-count-alert"
              :title="`已识别 ${batchShotSegments.length} 条分镜`"
              type="success"
              show-icon
              :closable="false"
            />
            <div class="batch-shot-footer-actions">
              <el-button @click="batchShotDialogVisible = false">取消</el-button>
              <el-button type="primary" :disabled="!batchShotSegments.length" @click="confirmBatchShots">批量添加</el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="reviewDialogVisible" title="提示词评分" width="520px" class="review-dialog" @closed="activeReviewShotId = null">
        <el-form label-position="top">
          <el-form-item label="评分">
            <el-rate
              v-model="reviewDraft.rating"
              clearable
              show-text
              :texts="reviewRateTexts"
              :low-threshold="2"
            />
          </el-form-item>
          <el-form-item label="无字幕">
            <el-checkbox v-model="reviewDraft.noSubtitle" class="review-subtitle-checkbox" border>
              无字幕
            </el-checkbox>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="reviewDraft.note" type="textarea" :rows="4" resize="vertical" placeholder="输入评分备注" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="reviewDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveReviewDialog">保存</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="reviewSummaryVisible" title="评分汇总" width="760px" class="review-summary-dialog">
        <div class="review-summary-stats">
          <div>
            <strong>{{ reviewSummary.total }}</strong>
            <span>总分镜</span>
          </div>
          <div>
            <strong>{{ reviewSummary.reviewedRate }}</strong>
            <span>已评分率</span>
          </div>
          <div>
            <strong>{{ reviewSummary.average }}</strong>
            <span>平均评分</span>
          </div>
          <div>
            <strong>{{ reviewSummary.noSubtitleRate }}</strong>
            <span>无字幕率</span>
          </div>
        </div>
        <el-table :data="reviewSummaryRows" max-height="430" empty-text="暂无分镜">
          <el-table-column prop="index" label="#" width="64" />
          <el-table-column label="状态" width="96">
            <template #default="{ row }">
              <el-tag :type="row.reviewed ? 'warning' : 'info'" effect="light">{{ row.reviewed ? '已评分' : '未评分' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="评分" width="110">
            <template #default="{ row }">{{ row.ratingText }}</template>
          </el-table-column>
          <el-table-column label="无字幕" width="86">
            <template #default="{ row }">
              <el-tag :type="row.noSubtitle ? 'success' : 'danger'" effect="light">{{ row.noSubtitle ? '无' : '有' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="noteText" label="备注" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="84" fixed="right" align="center" header-align="center">
            <template #default="{ row }">
              <el-button text type="primary" @click="openReviewDialog(row.shot)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-dialog>
      <el-dialog v-model="materialDialogVisible" title="添加基础素材" width="420px">
        <el-form label-position="top">
          <el-form-item label="素材类型">
            <el-radio-group v-model="materialKind">
              <el-radio-button label="人物" value="characters" />
              <el-radio-button label="场景" value="scenes" />
            </el-radio-group>
          </el-form-item>
          <el-form-item label="素材名称">
            <el-input
              v-if="materialKind === 'characters'"
              v-model="materialDraft"
              type="textarea"
              :rows="4"
              placeholder="可输入多个名称，用 、；， 或换行分割"
              @keyup.ctrl.enter="confirmMaterialDialog"
            />
            <el-input
              v-else
              v-model="materialDraft"
              placeholder="输入单个场景名称"
              @keyup.enter="confirmMaterialDialog"
            />
          </el-form-item>
          <template v-if="materialKind === 'scenes'">
            <el-form-item label="时间">
              <el-radio-group v-model="materialSceneTime">
                <el-radio-button label="白天" value="白天" />
                <el-radio-button label="深夜" value="深夜" />
              </el-radio-group>
            </el-form-item>
            <el-form-item label="空间">
              <el-radio-group v-model="materialSceneSpace">
                <el-radio-button label="室内" value="室内" />
                <el-radio-button label="室外" value="室外" />
              </el-radio-group>
            </el-form-item>
          </template>
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
import brandIconUrl from './assets/angry-cat-brand.jpg'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Check, CircleCheck, CircleCheckFilled, Close, CopyDocument, DataAnalysis, Delete, Download, FolderAdd, MostlyCloudy, Plus, Search, Setting, Star, StarFilled } from '@element-plus/icons-vue'
import {
  createCharacterConfig,
  createEpisode,
  createEpisodeGroup,
  createId,
  createPromptReview,
  createSceneAsset,
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
import type { Episode, EpisodeGroup, ExportPayload, GlobalConfig, PendingDetection, PromptReview, SceneAsset, SceneConfig, SceneSpace, SceneTime, SectionKey, Shot } from './types'
import { useAppState } from './useAppState'

type MaterialKind = 'characters' | 'scenes'

const { state, activeEpisode } = useAppState()
const materialDialogVisible = ref(false)
const globalDialogVisible = ref(false)
const globalConfigDraft = ref<GlobalConfig>(cloneGlobalConfig(state.globalConfig))
const durationRangeDraft = ref<[number, number]>([
  state.globalConfig.recommendedDurationRange.min,
  state.globalConfig.recommendedDurationRange.max,
])
const batchShotDialogVisible = ref(false)
const detectionDialogVisible = ref(false)
const detectionConflictShotId = ref<string | null>(null)
const sidebarCollapsed = ref(false)
const materialDraft = ref('')
const materialSceneTime = ref<SceneTime>('白天')
const materialSceneSpace = ref<SceneSpace>('室内')
const batchShotDraft = ref('')
const materialKind = ref<MaterialKind>('characters')
const editingEpisodeId = ref<string | null>(null)
const editingEpisodeOriginalTitle = ref('')
const editingGroupId = ref<string | null>(null)
const editingGroupOriginalTitle = ref('')
const expandedGroupIds = ref<string[]>(['ungrouped'])
const openEpisodeMenuId = ref<string | null>(null)
const openGroupMenuId = ref<string | null>(null)
const episodeDropdownRefs = new Map<string, { handleClose?: () => void }>()
const groupDropdownRefs = new Map<string, { handleClose?: () => void }>()
const fileInputRef = ref<HTMLInputElement | null>(null)
const reviewDialogVisible = ref(false)
const reviewSummaryVisible = ref(false)
const activeReviewShotId = ref<string | null>(null)
const reviewDraft = ref<PromptReview>(createPromptReview())
const reviewRateTexts = ['拉完了', 'NPC', '人上人', '顶级', '夯']

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
const sortedEpisodeGroups = computed(() => state.episodeGroups.slice().sort((a, b) => groupSortTitle(a).localeCompare(groupSortTitle(b), 'zh-CN', { numeric: true })))
const sortedUngroupedEpisodes = computed(() => sortEpisodesForDisplay(state.episodes.filter((episode) => !episode.groupId)))
const batchShotSegments = computed(() => splitBatchShotText(batchShotDraft.value))
const detectionConflictShot = computed(() => activeEpisode.value?.shots.find((shot) => shot.id === detectionConflictShotId.value) ?? null)
const detectionConflict = computed(() => detectionConflictShot.value?.pendingDetection ?? null)
const activeReviewShot = computed(() => activeEpisode.value?.shots.find((shot) => shot.id === activeReviewShotId.value) ?? null)
const reviewSummaryRows = computed(() => activeEpisode.value?.shots.map((shot, index) => ({
  shot,
  index: `#${index + 1}`,
  reviewed: isShotReviewed(shot),
  rating: shot.review.rating,
  ratingText: shot.review.rating ? `${shot.review.rating} 星` : '未评分',
  noSubtitle: shot.review.noSubtitle,
  noteText: shot.review.note.trim() || '无',
})) ?? [])
const reviewSummary = computed(() => {
  const rows = reviewSummaryRows.value
  const ratedRows = rows.filter((row) => row.rating > 0)
  const ratingTotal = ratedRows.reduce((total, row) => total + row.rating, 0)
  const percent = (value: number) => `${rows.length ? Math.round((value / rows.length) * 100) : 0}%`

  return {
    total: rows.length,
    reviewedRate: percent(rows.filter((row) => row.reviewed).length),
    average: ratedRows.length ? (ratingTotal / ratedRows.length).toFixed(1) : '0.0',
    noSubtitleRate: percent(rows.filter((row) => row.noSubtitle).length),
  }
})

function sectionTitle(key: SectionKey) {
  return titleFromSections(state.globalConfig.sections, key)
}

function draftSectionTitle(key: SectionKey) {
  return titleFromSections(globalConfigDraft.value.sections, key)
}

function titleFromSections(sections: GlobalConfig['sections'], key: SectionKey) {
  const fallback: Record<SectionKey, string> = {
    base: '基础设定',
    sceneRole: '场景与角色设定',
    shot: '分镜详情',
  }

  return sections.find((section) => section.key === key)?.title.trim() || fallback[key]
}

function cloneGlobalConfig(config: GlobalConfig): GlobalConfig {
  return JSON.parse(JSON.stringify(config)) as GlobalConfig
}

function openGlobalDialog() {
  globalConfigDraft.value = cloneGlobalConfig(state.globalConfig)
  durationRangeDraft.value = [
    state.globalConfig.recommendedDurationRange.min,
    state.globalConfig.recommendedDurationRange.max,
  ]
  globalDialogVisible.value = true
}

function saveGlobalDialog() {
  const [min, max] = durationRangeDraft.value
  state.globalConfig = {
    ...cloneGlobalConfig(globalConfigDraft.value),
    recommendedDurationRange: {
      min: Math.min(min, max),
      max: Math.max(min, max),
    },
  }
  globalDialogVisible.value = false
}

function cancelGlobalDialog() {
  globalDialogVisible.value = false
}

function formatDurationTooltip(value: number) {
  return value.toFixed(1) + ' 秒'
}

function isGroupExpanded(id: string) {
  return expandedGroupIds.value.includes(id)
}

function toggleGroup(id: string) {
  expandedGroupIds.value = isGroupExpanded(id)
    ? expandedGroupIds.value.filter((item) => item !== id)
    : [...expandedGroupIds.value, id]
}


function groupSortTitle(group: EpisodeGroup) {
  return editingGroupId.value === group.id ? editingGroupOriginalTitle.value : group.title
}

function episodeSortTitle(episode: Episode) {
  return editingEpisodeId.value === episode.id ? editingEpisodeOriginalTitle.value : episode.title
}

function sortEpisodesForDisplay(episodes: Episode[]) {
  return episodes.slice().sort((a, b) => episodeSortTitle(a).localeCompare(episodeSortTitle(b), 'zh-CN', { numeric: true }))
}

function episodesForGroup(groupId: string) {
  return sortEpisodesForDisplay(state.episodes.filter((episode) => episode.groupId === groupId))
}

function finishEpisodeRename() {
  editingEpisodeId.value = null
  editingEpisodeOriginalTitle.value = ''
}

function cancelEpisodeRename(episode: Episode) {
  episode.title = editingEpisodeOriginalTitle.value || episode.title
  finishEpisodeRename()
}

function finishGroupRename() {
  editingGroupId.value = null
  editingGroupOriginalTitle.value = ''
}

function cancelGroupRename(group: { title: string }) {
  group.title = editingGroupOriginalTitle.value || group.title
  finishGroupRename()
}

function addEpisodeGroup() {
  const group = createEpisodeGroup(state.episodeGroups.length + 1)
  state.episodeGroups.push(group)
  expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, group.id]))
}

function setEpisodeDropdownRef(id: string, dropdown: unknown) {
  if (dropdown && typeof dropdown === 'object') {
    episodeDropdownRefs.set(id, dropdown as { handleClose?: () => void })
  } else {
    episodeDropdownRefs.delete(id)
  }
}

function setGroupDropdownRef(id: string, dropdown: unknown) {
  if (dropdown && typeof dropdown === 'object') {
    groupDropdownRefs.set(id, dropdown as { handleClose?: () => void })
  } else {
    groupDropdownRefs.delete(id)
  }
}

function closeDropdownsExcept(type: 'episode' | 'group', id: string) {
  episodeDropdownRefs.forEach((dropdown, key) => {
    if (type !== 'episode' || key !== id) {
      dropdown.handleClose?.()
    }
  })
  groupDropdownRefs.forEach((dropdown, key) => {
    if (type !== 'group' || key !== id) {
      dropdown.handleClose?.()
    }
  })
}

function handleEpisodeMenuVisibleChange(visible: boolean, episodeId: string) {
  openEpisodeMenuId.value = visible ? episodeId : openEpisodeMenuId.value === episodeId ? null : openEpisodeMenuId.value
  if (visible) {
    openGroupMenuId.value = null
    closeDropdownsExcept('episode', episodeId)
  }
}

function handleGroupMenuVisibleChange(visible: boolean, groupId: string) {
  openGroupMenuId.value = visible ? groupId : openGroupMenuId.value === groupId ? null : openGroupMenuId.value
  if (visible) {
    openEpisodeMenuId.value = null
    closeDropdownsExcept('group', groupId)
  }
}

function handleEpisodeCommand(command: string | { action: 'move'; groupId: string | null }, episode: Episode) {
  openEpisodeMenuId.value = null
  if (typeof command !== 'string') {
    if (command.action === 'move') {
      episode.groupId = command.groupId
    }
    return
  }

  if (command === 'edit') {
    editingEpisodeOriginalTitle.value = episode.title
    editingEpisodeId.value = episode.id
    return
  }

  if (command === 'toggleStar') {
    episode.starred = !episode.starred
    return
  }

  if (command === 'delete') {
    void deleteEpisodeById(episode.id)
  }
}

async function handleGroupCommand(command: string, groupId: string) {
  openGroupMenuId.value = null
  if (command === 'edit') {
    const group = state.episodeGroups.find((item) => item.id === groupId)
    editingGroupOriginalTitle.value = group?.title ?? ''
    editingGroupId.value = groupId
    return
  }

  if (command !== 'delete') {
    return
  }

  const group = state.episodeGroups.find((item) => item.id === groupId)

  if (!group) {
    return
  }

  try {
    await ElMessageBox.confirm('删除分组后，组内剧本会移至未分组。', '删除分组', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  state.episodes.forEach((episode) => {
    if (episode.groupId === groupId) {
      episode.groupId = null
    }
  })
  state.episodeGroups = state.episodeGroups.filter((item) => item.id !== groupId)
  expandedGroupIds.value = expandedGroupIds.value.filter((id) => id !== groupId)
}

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
  episode.groupId = activeEpisode.value?.groupId ?? null
  state.episodes.push(episode)
  state.activeEpisodeId = episode.id

  if (episode.groupId) {
    expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, episode.groupId]))
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


function addShotAt(index: number) {
  const episode = activeEpisode.value

  if (!episode) {
    return
  }

  const safeIndex = Math.max(0, Math.min(index, episode.shots.length))
  episode.shots.splice(safeIndex, 0, createShot())
}

function handleAddShotCommand(command: 'start' | 'end' | { action: 'after'; index: number }) {
  if (command === 'start') {
    addShotAt(0)
    return
  }

  if (command === 'end') {
    addShotAt(activeEpisode.value?.shots.length ?? 0)
    return
  }

  addShotAt(command.index + 1)
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
  const segments = batchShotSegments.value

  if (!episode || !segments.length) {
    return
  }

  const firstShot = episode.shots[0]
  const shouldReuseFirstShot = episode.shots.length === 1 && firstShot && !firstShot.text.trim()

  if (shouldReuseFirstShot) {
    firstShot.text = segments[0]
    detectShotCharacters(firstShot, { silent: true, showConflict: false })

    segments.slice(1).forEach((text) => {
      const shot = createShot()
      shot.text = text
      episode.shots.push(shot)
      detectShotCharacters(shot, { silent: true, showConflict: false })
    })
  } else {
    segments.forEach((text) => {
      const shot = createShot()
      shot.text = text
      episode.shots.push(shot)
      detectShotCharacters(shot, { silent: true, showConflict: false })
    })
  }

  ElMessage.success('已批量添加 ' + segments.length + ' 条分镜')
  batchShotDraft.value = ''
  batchShotDialogVisible.value = false
}

function isShotCollapsed(shot: Shot) {
  return state.globalConfig.autoCollapseCompletedShots && shot.status === 'complete'
}

function deleteShot(id: string) {
  if (!activeEpisode.value) {
    return
  }

  if (activeEpisode.value.shots.length === 1) {
    ElMessage.warning('至少保留一条分镜')
    return
  }

  activeEpisode.value.shots = activeEpisode.value.shots.filter((shot) => shot.id !== id)
}

function addMaterial(kind: MaterialKind, value: string) {
  const episode = activeEpisode.value

  if (!episode) {
    return
  }

  if (kind === 'characters') {
    const items = splitMaterialInput(value)

    if (!items.length) {
      return
    }

    const added = items.filter((item) => !episode.characters.includes(item))
    const skipped = items.length - added.length

    episode.characters.push(...added)

    if (added.length && skipped) {
      ElMessage.success(`已添加 ${added.length} 项，跳过 ${skipped} 个重复项`)
    } else if (added.length) {
      ElMessage.success(`已添加 ${added.length} 项`)
    } else {
      ElMessage.info('输入的素材已存在')
    }
    return
  }

  const name = value.trim()

  if (!name) {
    return
  }

  if (episode.scenes.some((scene) => scene.name === name)) {
    ElMessage.info('输入的场景已存在')
    return
  }

  episode.scenes.push(createSceneAsset(name, materialSceneTime.value, materialSceneSpace.value))
  ElMessage.success('已添加 1 项')
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

  if (kind === 'characters') {
    episode.characters = episode.characters.filter((item) => item !== value)
    return
  }

  episode.scenes = episode.scenes.filter((item) => item.name !== value)
}

function addSceneToShot(shot: Shot) {
  const firstScene = activeEpisode.value?.scenes[0]
  shot.scenes.push(createSceneConfig(firstScene?.name ?? '', firstScene?.time ?? '白天', firstScene?.space ?? '室内'))
}

function syncSceneFromAsset(scene: SceneConfig) {
  const selected = activeEpisode.value?.scenes.find((item) => item.name === scene.name)

  if (!selected) {
    return
  }

  scene.time = selected.time
  scene.space = selected.space
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

function isVoiceOverflow(shot: Shot) {
  return shot.characters.filter((character) => character.includeVoice).length > 3
}

function highlightedShotText(shot: Shot) {
  const text = shot.text || ' '
  const characters = shot.characters
    .map((character) => ({ name: character.name.trim(), includeVoice: character.includeVoice }))
    .filter((character, index, list) => character.name && list.findIndex((item) => item.name === character.name) === index)
    .sort((a, b) => b.name.length - a.name.length)

  if (!characters.length) {
    return escapeHtml(text)
  }

  const pattern = new RegExp(characters.map((character) => escapeRegExp(character.name)).join('|'), 'g')
  const rawParts: string[] = []
  let cursor = 0

  text.replace(pattern, (match, offset: number) => {
    rawParts.push(escapeHtml(text.slice(cursor, offset)))
    const character = characters.find((item) => item.name === match)
    const className = character?.includeVoice ? 'matched-character with-voice' : 'matched-character without-voice'
    rawParts.push('<mark class="' + className + '">' + escapeHtml(match) + '</mark>')
    cursor = offset + match.length
    return match
  })

  rawParts.push(escapeHtml(text.slice(cursor)))
  return rawParts.join('')
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
function setShotStatus(shot: Shot, done: boolean) {
  shot.status = done ? 'complete' : 'incomplete'
}

function detectShotCharacters(shot: Shot, options: { silent?: boolean; showConflict?: boolean } = {}) {
  const episode = activeEpisode.value
  const showConflict = options.showConflict ?? true

  if (!episode) {
    return false
  }

  const detected = detectCharacters(shot.text, episode.characters)
  shot.autoSyncNotice = null

  if (!detected.length) {
    shot.pendingDetection = null
    if (!options.silent) {
      ElMessage.info('未识别到本集人物')
    }
    return false
  }

  const currentNames = shot.characters.map((character) => character.name).filter(Boolean)
  const voiceSuggestions = detected
    .filter((character) => character.includeVoice)
    .filter((character) => shot.characters.some((item) => item.name === character.name && !item.includeVoice))
    .map((character) => character.name)

  if (!currentNames.length) {
    shot.characters = buildDetectedCharacters(detected)
    shot.pendingDetection = null
    if (!options.silent) {
      ElMessage.success('已识别并添加人物配置')
    }
    return true
  }

  const mergeNames = Array.from(new Set([...currentNames, ...detected.map((character) => character.name)]))
  const replaceNames = detected.map((character) => character.name)

  if (sameNames(currentNames, replaceNames) && !voiceSuggestions.length) {
    if (!options.silent) {
      ElMessage.success('人物配置已匹配')
    }
    return true
  }

  shot.pendingDetection = {
    id: createId('detect'),
    detected,
    currentNames,
    mergeNames,
    replaceNames,
    voiceSuggestions,
  }

  if (!showConflict) {
    shot.characters = mergeDetectedCharacters(shot.characters, detected, true)
    shot.pendingDetection = null
    return true
  }

  detectionConflictShotId.value = shot.id
  detectionDialogVisible.value = true
  return false
}

function mergeActiveDetection() {
  const shot = detectionConflictShot.value

  if (!shot?.pendingDetection) {
    detectionDialogVisible.value = false
    return
  }

  shot.characters = mergeDetectedCharacters(shot.characters, shot.pendingDetection.detected, true)
  ElMessage.success('已合并人物配置')
  shot.pendingDetection = null
  detectionConflictShotId.value = null
  detectionDialogVisible.value = false
}

function cancelActiveDetection() {
  const shot = detectionConflictShot.value

  if (shot?.pendingDetection) {
    shot.pendingDetection = null
  }

  detectionConflictShotId.value = null
  detectionDialogVisible.value = false
}

function normalizePromptReview(review: unknown): PromptReview {
  if (!review || typeof review !== 'object') {
    return createPromptReview()
  }

  const value = review as Partial<PromptReview>
  const rating = typeof value.rating === 'number' && Number.isFinite(value.rating)
    ? Math.max(0, Math.min(5, Math.round(value.rating)))
    : 0

  return {
    rating,
    noSubtitle: Boolean(value.noSubtitle),
    note: typeof value.note === 'string' ? value.note : '',
  }
}

function isShotReviewed(shot: Shot) {
  return shot.review.rating > 0 || shot.review.noSubtitle || Boolean(shot.review.note.trim())
}

function openReviewDialog(shot: Shot) {
  activeReviewShotId.value = shot.id
  reviewDraft.value = { ...normalizePromptReview(shot.review) }
  reviewDialogVisible.value = true
}

function saveReviewDialog() {
  const shot = activeReviewShot.value

  if (!shot) {
    reviewDialogVisible.value = false
    return
  }

  shot.review = normalizePromptReview(reviewDraft.value)
  reviewDialogVisible.value = false
  ElMessage.success('已保存评分')
}

function openReviewSummary() {
  reviewSummaryVisible.value = true
}

function promptFor(shot: Shot) {
  return composePrompt(state.globalConfig, shot)
}

async function copyPrompt(shot: Shot) {
  const copied = await copyText(promptFor(shot))

  if (copied) {
    ElMessage.success('已复制当前提示词')
    return
  }

  ElMessage.error('复制失败，请手动选择文本复制')
}

async function copyText(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy copy path for restricted browser contexts.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function characterCount(text: string) {
  return countNonPunctuationCharacters(text)
}

function durationText(text: string) {
  return formatSeconds(recommendedSeconds(text))
}

function durationState(text: string): { type: 'success' | 'warning' | 'danger'; warn: boolean } {
  const seconds = recommendedSeconds(text)
  const min = Math.min(state.globalConfig.recommendedDurationRange.min, state.globalConfig.recommendedDurationRange.max)
  const max = Math.max(state.globalConfig.recommendedDurationRange.min, state.globalConfig.recommendedDurationRange.max)

  if (!text.trim()) {
    return { type: 'warning', warn: false }
  }

  if (seconds < min || seconds > max) {
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


function exportAllEpisodes() {
  downloadJson('script2prompt-episodes.json', {
    version: state.version,
    exportedAt: new Date().toISOString(),
    episodeGroups: JSON.parse(JSON.stringify(state.episodeGroups)) as EpisodeGroup[],
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

      const importedGroups = normalizeImportedEpisodeGroups(payload.episodeGroups)
      const groupIdMap = new Map(importedGroups.map((group) => [group.sourceId, group.group.id]))

      importedGroups.forEach(({ group }) => {
        state.episodeGroups.push(group)
        expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, group.id]))
      })

      episodes.forEach((episode) => {
        const imported = normalizeImportedEpisode(episode, groupIdMap)
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

function normalizeSceneAsset(scene: unknown): SceneAsset | null {
  if (typeof scene === 'string') {
    const name = scene.trim()
    return name ? createSceneAsset(name) : null
  }

  if (!scene || typeof scene !== 'object') {
    return null
  }

  const value = scene as Partial<SceneAsset>
  const name = typeof value.name === 'string' ? value.name.trim() : ''

  if (!name) {
    return null
  }

  return createSceneAsset(
    name,
    value.time === '深夜' ? '深夜' : '白天',
    value.space === '室外' ? '室外' : '室内',
  )
}

function normalizeSceneAssets(scenes: unknown): SceneAsset[] {
  if (!Array.isArray(scenes)) {
    return []
  }

  const normalized = scenes.map(normalizeSceneAsset).filter((scene): scene is SceneAsset => Boolean(scene))
  return normalized.filter((scene, index, list) => list.findIndex((item) => item.name === scene.name) === index)
}

function normalizeImportedShotScene(scene: unknown, assets: SceneAsset[]): SceneConfig | null {
  if (!scene || typeof scene !== 'object') {
    return null
  }

  const value = scene as Partial<SceneConfig>
  const name = typeof value.name === 'string' ? value.name.trim() : ''

  if (!name) {
    return null
  }

  const asset = assets.find((item) => item.name === name)

  return createSceneConfig(
    name,
    value.time ?? asset?.time ?? '白天',
    value.space ?? asset?.space ?? '室内',
  )
}

function normalizeImportedEpisodeGroups(groups: unknown): Array<{ sourceId: string; group: EpisodeGroup }> {
  if (!Array.isArray(groups)) {
    return []
  }

  return groups
    .map((group, index) => {
      if (!group || typeof group !== 'object') {
        return null
      }

      const value = group as Partial<EpisodeGroup>
      const sourceId = typeof value.id === 'string' ? value.id : ''
      const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim() : `导入分组 ${index + 1}`

      if (!sourceId) {
        return null
      }

      return {
        sourceId,
        group: {
          id: createId('group'),
          title,
        },
      }
    })
    .filter((group): group is { sourceId: string; group: EpisodeGroup } => Boolean(group))
}

function normalizeImportedEpisode(episode: Episode, groupIdMap = new Map<string, string>()): Episode {
  const scenes = normalizeSceneAssets(episode.scenes)
  const shots = Array.isArray(episode.shots) ? episode.shots : []
  const groupId = typeof episode.groupId === 'string' ? groupIdMap.get(episode.groupId) ?? null : null

  return {
    ...episode,
    id: createId('episode'),
    title: episode.title || '导入单集',
    groupId,
    starred: Boolean(episode.starred),
    characters: Array.isArray(episode.characters) ? episode.characters : [],
    scenes,
    props: [],
    shots: shots.map((shot) => ({
      ...createShot(),
      ...shot,
      id: createId('shot'),
      pendingDetection: null,
      autoSyncNotice: null,
      undoCharacters: null,
      review: normalizePromptReview(shot.review),
      scenes: Array.isArray(shot.scenes)
        ? shot.scenes.map((scene) => normalizeImportedShotScene(scene, scenes)).filter((scene): scene is SceneConfig => Boolean(scene))
        : [],
      characters: Array.isArray(shot.characters)
        ? shot.characters.map((character) => ({ ...character, id: createId('character') }))
        : [],
    })),
  }
}
</script>
