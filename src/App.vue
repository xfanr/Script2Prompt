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
                  <el-button :icon="Files" title="新建分组" aria-label="新建分组" @click="addEpisodeGroup" />
                  <el-button :icon="Upload" title="导入备份" aria-label="导入备份" @click="triggerImport" />
                  <el-button :icon="Download" title="保存备份" aria-label="保存备份" @click="exportAllEpisodes" />
                </el-button-group>
              </div>
              <el-scrollbar class="episode-scrollbar">
                <div class="episode-tree">
                  <section class="episode-group-block">
                    <div class="episode-group-row default-group" :class="{ empty: isGroupEmpty('ungrouped') }" role="button" tabindex="0" @contextmenu.prevent.stop @click="selectGroupAndToggleIfNotEmpty('ungrouped')" @keyup.enter="selectGroupAndToggleIfNotEmpty('ungrouped')">
                      <span v-if="isGroupEmpty('ungrouped')" class="group-dot">•</span>
                      <el-icon v-else class="group-caret" :class="{ expanded: isGroupExpanded('ungrouped') }"><ArrowRight /></el-icon>
                      <span class="group-title-text">未分组</span>
                      <em>{{ sortedUngroupedEpisodes.length }}</em>
                    </div>
                    <div v-if="!isGroupEmpty('ungrouped') && isGroupExpanded('ungrouped')" class="episode-children">
                      <el-dropdown
                        :ref="(dropdown) => setEpisodeDropdownRef(episode.id, dropdown)"
                        v-for="episode in sortedUngroupedEpisodes"
                        :key="episode.id"
                        trigger="contextmenu"
                        :visible="openEpisodeMenuId === episode.id"
                        @visible-change="(visible) => handleEpisodeMenuVisibleChange(visible, episode.id)"
                        @command="(command) => handleEpisodeCommand(command, episode)"
                      >
                        <div class="episode-tree-item" :class="{ active: episode.id === state.activeEpisodeId }" @click="selectEpisode(episode)">
                          <div v-if="editingEpisodeId === episode.id" class="rename-inline" @click.stop @keydown.stop>
                            <el-input v-model="episode.title" class="episode-title-input" placeholder="本集标题" @keydown.space.stop @keyup.enter.stop="finishEpisodeRename" />
                            <el-button class="rename-confirm" :icon="Check" circle type="success" @click="finishEpisodeRename" />
                            <el-button class="rename-cancel" :icon="Close" circle type="danger" @click="cancelEpisodeRename(episode)" />
                          </div>
                          <span v-else class="episode-title-display"><span class="episode-title-text">{{ episode.title }}</span><span v-if="isEpisodeAutoStarred(episode)" class="episode-star">⭐️</span></span>
                        </div>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="summary" :icon="DataAnalysis">数据</el-dropdown-item>
                            <el-dropdown-item command="edit" :icon="EditPen">命名</el-dropdown-item>
                            <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                            <el-dropdown-item v-for="(group, groupIndex) in sortedEpisodeGroups" :key="group.id" :divided="groupIndex === 0" :command="{ action: 'move', groupId: group.id }">移至 {{ group.title }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </section>

                  <section class="episode-group-block archive-group-block">
                    <div class="episode-group-row archive-group-row" :class="{ empty: isGroupEmpty(archivedTreeId) }" role="button" tabindex="0" @contextmenu.prevent.stop @click="toggleArchivedGroupsIfNotEmpty" @keyup.enter="toggleArchivedGroupsIfNotEmpty">
                      <span v-if="isGroupEmpty(archivedTreeId)" class="group-dot">•</span>
                      <el-icon v-else class="group-caret" :class="{ expanded: isGroupExpanded(archivedTreeId) }"><ArrowRight /></el-icon>
                      <span class="group-title-text">已归档</span>
                      <em>{{ sortedArchivedEpisodeGroups.length }}</em>
                    </div>
                    <div v-if="!isGroupEmpty(archivedTreeId) && isGroupExpanded(archivedTreeId)" class="episode-children archived-group-children">
                      <section v-for="group in sortedArchivedEpisodeGroups" :key="group.id" class="episode-group-block archived-nested-group">
                        <el-dropdown :ref="(dropdown) => setGroupDropdownRef(group.id, dropdown)" trigger="contextmenu" :visible="openGroupMenuId === group.id" @visible-change="(visible) => handleGroupMenuVisibleChange(visible, group.id)" @command="(command) => handleGroupCommand(command, group.id)">
                          <div class="episode-group-row" :class="{ empty: isGroupEmpty(group.id) }" role="button" tabindex="0" @click="selectGroupAndToggleIfNotEmpty(group.id)" @keyup.enter="selectGroupAndToggleIfNotEmpty(group.id)">
                            <span v-if="isGroupEmpty(group.id)" class="group-dot">•</span>
                            <el-icon v-else class="group-caret" :class="{ expanded: isGroupExpanded(group.id) }"><ArrowRight /></el-icon>
                            <div v-if="editingGroupId === group.id" class="rename-inline" @click.stop @keydown.stop>
                              <el-input v-model="group.title" class="episode-title-input" placeholder="分组名称" @keydown.space.stop @keyup.enter.stop="finishGroupRename" />
                              <el-button class="rename-confirm" :icon="Check" circle type="success" @click="finishGroupRename" />
                              <el-button class="rename-cancel" :icon="Close" circle type="danger" @click="cancelGroupRename(group)" />
                            </div>
                            <span v-else class="group-title-text">{{ group.title }}</span>
                            <span v-if="editingGroupId !== group.id && isGroupAutoStarred(group.id)" class="episode-star group-star">⭐️</span>
                            <span v-else-if="editingGroupId !== group.id" class="group-star-placeholder" aria-hidden="true"></span>
                          </div>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="summary" :icon="DataLine">数据</el-dropdown-item>
                              <el-dropdown-item command="edit" :icon="EditPen">命名</el-dropdown-item>
                              <el-dropdown-item command="archive" :icon="Files">取消归档</el-dropdown-item>
                              <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                        <div v-if="!isGroupEmpty(group.id) && isGroupExpanded(group.id)" class="episode-children">
                          <el-dropdown
                            :ref="(dropdown) => setEpisodeDropdownRef(episode.id, dropdown)"
                            v-for="episode in episodesForGroup(group.id)"
                            :key="episode.id"
                            trigger="contextmenu"
                            :visible="openEpisodeMenuId === episode.id"
                            @visible-change="(visible) => handleEpisodeMenuVisibleChange(visible, episode.id)"
                            @command="(command) => handleEpisodeCommand(command, episode)"
                          >
                            <div class="episode-tree-item" :class="{ active: episode.id === state.activeEpisodeId }" @click="selectEpisode(episode)">
                              <div v-if="editingEpisodeId === episode.id" class="rename-inline" @click.stop @keydown.stop>
                                <el-input v-model="episode.title" class="episode-title-input" placeholder="本集标题" @keydown.space.stop @keyup.enter.stop="finishEpisodeRename" />
                                <el-button class="rename-confirm" :icon="Check" circle type="success" @click="finishEpisodeRename" />
                                <el-button class="rename-cancel" :icon="Close" circle type="danger" @click="cancelEpisodeRename(episode)" />
                              </div>
                              <span v-else class="episode-title-display"><span class="episode-title-text">{{ episode.title }}</span><span v-if="isEpisodeAutoStarred(episode)" class="episode-star">⭐️</span></span>
                            </div>
                            <template #dropdown>
                              <el-dropdown-menu>
                                <el-dropdown-item command="summary" :icon="DataAnalysis">数据</el-dropdown-item>
                                <el-dropdown-item command="edit" :icon="EditPen">命名</el-dropdown-item>
                                <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                                <el-dropdown-item divided :command="{ action: 'move', groupId: null }">移至未分组</el-dropdown-item>
                                <el-dropdown-item v-for="targetGroup in sortedEpisodeGroups" :key="targetGroup.id" :command="{ action: 'move', groupId: targetGroup.id }">移至 {{ targetGroup.title }}
                                </el-dropdown-item>
                              </el-dropdown-menu>
                            </template>
                          </el-dropdown>
                        </div>
                      </section>
                    </div>
                  </section>

                  <section v-for="group in sortedEpisodeGroups" :key="group.id" class="episode-group-block">
                    <el-dropdown :ref="(dropdown) => setGroupDropdownRef(group.id, dropdown)" trigger="contextmenu" :visible="openGroupMenuId === group.id" @visible-change="(visible) => handleGroupMenuVisibleChange(visible, group.id)" @command="(command) => handleGroupCommand(command, group.id)">
                      <div class="episode-group-row" :class="{ empty: isGroupEmpty(group.id) }" role="button" tabindex="0" @click="selectGroupAndToggleIfNotEmpty(group.id)" @keyup.enter="selectGroupAndToggleIfNotEmpty(group.id)">
                        <span v-if="isGroupEmpty(group.id)" class="group-dot">•</span>
                        <el-icon v-else class="group-caret" :class="{ expanded: isGroupExpanded(group.id) }"><ArrowRight /></el-icon>
                        <div v-if="editingGroupId === group.id" class="rename-inline" @click.stop @keydown.stop>
                          <el-input v-model="group.title" class="episode-title-input" placeholder="分组名称" @keydown.space.stop @keyup.enter.stop="finishGroupRename" />
                          <el-button class="rename-confirm" :icon="Check" circle type="success" @click="finishGroupRename" />
                          <el-button class="rename-cancel" :icon="Close" circle type="danger" @click="cancelGroupRename(group)" />
                        </div>
                        <span v-else class="group-title-text">{{ group.title }}</span>
                        <span v-if="editingGroupId !== group.id && isGroupAutoStarred(group.id)" class="episode-star group-star">⭐️</span>
                        <span v-else-if="editingGroupId !== group.id" class="group-star-placeholder" aria-hidden="true"></span>
                      </div>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="summary" :icon="DataLine">数据</el-dropdown-item>
                          <el-dropdown-item command="edit" :icon="EditPen">命名</el-dropdown-item>
                          <el-dropdown-item command="archive" :icon="Files">归档</el-dropdown-item>
                          <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <div v-if="!isGroupEmpty(group.id) && isGroupExpanded(group.id)" class="episode-children">
                      <el-dropdown
                        :ref="(dropdown) => setEpisodeDropdownRef(episode.id, dropdown)"
                        v-for="episode in episodesForGroup(group.id)"
                        :key="episode.id"
                        trigger="contextmenu"
                        :visible="openEpisodeMenuId === episode.id"
                        @visible-change="(visible) => handleEpisodeMenuVisibleChange(visible, episode.id)"
                        @command="(command) => handleEpisodeCommand(command, episode)"
                      >
                        <div class="episode-tree-item" :class="{ active: episode.id === state.activeEpisodeId }" @click="selectEpisode(episode)">
                          <div v-if="editingEpisodeId === episode.id" class="rename-inline" @click.stop @keydown.stop>
                            <el-input v-model="episode.title" class="episode-title-input" placeholder="本集标题" @keydown.space.stop @keyup.enter.stop="finishEpisodeRename" />
                            <el-button class="rename-confirm" :icon="Check" circle type="success" @click="finishEpisodeRename" />
                            <el-button class="rename-cancel" :icon="Close" circle type="danger" @click="cancelEpisodeRename(episode)" />
                          </div>
                          <span v-else class="episode-title-display"><span class="episode-title-text">{{ episode.title }}</span><span v-if="isEpisodeAutoStarred(episode)" class="episode-star">⭐️</span></span>
                        </div>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="summary" :icon="DataAnalysis">数据</el-dropdown-item>
                            <el-dropdown-item command="edit" :icon="EditPen">命名</el-dropdown-item>
                            <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
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

            <div class="weekly-report-row">
              <span>复制周报</span>
              <el-date-picker
                v-model="weeklyReportWeek"
                class="weekly-report-picker"
                type="week"
                size="small"
                format="[第] ww [周]"
                value-format="YYYY-MM-DD"
                placeholder="选择周"
                :clearable="false"
                @change="copyWeeklyReport"
              >
                <template #default="cell">
                  <div class="el-date-table-cell weekly-report-date-cell" :class="{ 'has-production': hasProductionOnPickerCell(cell) }">
                    <span class="el-date-table-cell__text">
                      {{ cell.text }}
                      <i v-if="hasProductionOnPickerCell(cell)" aria-hidden="true"></i>
                    </span>
                  </div>
                </template>
              </el-date-picker>
            </div>

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
                <el-button-group class="stage-action-group">
                  <el-button plain @click="openMaterialDialog">添加素材</el-button>
                  <el-dropdown class="shot-create-actions" split-button type="primary" @click="openEpisodeScriptDialog" @command="handleAddShotCommand">
                    导入分镜
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
                </el-button-group>
              </div>
            </div>
            <div class="asset-editor">
              <div class="asset-tags">
                <el-tag
                  v-for="item in activeEpisode.characters"
                  :key="`character-${item}`"
                  size="large"
                  type="primary"
                  :effect="isCharacterUsed(item) ? 'light' : 'plain'"
                >
                  <span>{{ item }}</span>
                  <el-popconfirm title="确认删除这个人物素材？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeMaterial('characters', item)">
                    <template #reference>
                      <el-button class="asset-tag-close" :icon="Close" circle text aria-label="删除人物素材" @click.stop />
                    </template>
                  </el-popconfirm>
                </el-tag>
                <el-tag
                  v-for="item in activeEpisode.scenes"
                  :key="`scene-${item.name}`"
                  size="large"
                  type="success"
                  :effect="isSceneUsed(item.name) ? 'light' : 'plain'"
                >
                  <span>{{ item.name }} · {{ item.time }} · {{ item.space }}</span>
                  <el-popconfirm title="确认删除这个场景素材？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeMaterial('scenes', item.name)">
                    <template #reference>
                      <el-button class="asset-tag-close" :icon="Close" circle text aria-label="删除场景素材" @click.stop />
                    </template>
                  </el-popconfirm>
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
              @dblclick="copyPromptFromShotBlank($event, shot)"
            >

              <div class="shot-meta">
                <div class="shot-index-area" :class="{ 'has-remark': hasShotRemark(shot) }">
                  <span class="shot-index">#{{ index + 1 }}</span>
                  <template v-if="editingShotRemarkId === shot.id">
                    <el-input
                      v-model="shotRemarkDraft"
                      class="shot-remark-input"
                      size="small"
                      maxlength="80"
                      placeholder="输入备注"
                      @click.stop
                      @keydown.enter.prevent="saveShotRemark(shot)"
                      @keydown.esc.prevent="cancelShotRemarkEdit"
                    />
                    <el-button class="shot-remark-button is-visible" :icon="Check" circle text type="primary" aria-label="保存分镜备注" @click.stop="saveShotRemark(shot)" />
                    <el-button class="shot-remark-button is-visible" :icon="Close" circle text aria-label="取消编辑分镜备注" @click.stop="cancelShotRemarkEdit" />
                  </template>
                  <template v-else>
                    <span v-if="hasShotRemark(shot)" class="shot-remark-text" :title="shot.remark">{{ shot.remark }}</span>
                    <el-button
                      class="shot-remark-button"
                      :icon="EditPen"
                      circle
                      text
                      :type="hasShotRemark(shot) ? 'primary' : undefined"
                      :aria-label="hasShotRemark(shot) ? '修改分镜备注' : '添加分镜备注'"
                      @click.stop="startShotRemarkEdit(shot)"
                    />
                    <el-button
                      v-if="hasShotRemark(shot)"
                      class="shot-remark-button shot-remark-delete"
                      :icon="Close"
                      circle
                      text
                      aria-label="删除分镜备注"
                      @click.stop="deleteShotRemark(shot)"
                    />
                  </template>
                </div>
                <div class="shot-tools">
                  <el-button-group>
                    <el-button
                      class="shot-status-button"
                      :icon="shot.status === 'complete' ? CircleCheckFilled : CircleCheck"
                      :type="shot.status === 'complete' ? 'success' : undefined"
                      plain
                      :title="shot.status === 'complete' ? '完成' : '待办'"
                      :aria-label="shot.status === 'complete' ? '完成' : '待办'"
                      @click="setShotStatus(shot, shot.status !== 'complete')"
                    >
                      {{ shot.status === 'complete' ? '完成' : '待办' }}
                    </el-button>
                    <el-button
                      class="shot-review-button"
                      :icon="isShotReviewed(shot) ? StarFilled : Star"
                      :type="isShotReviewed(shot) ? 'warning' : undefined"
                      plain
                      @click="openReviewDialog(shot)"
                    >
                      {{ isShotReviewed(shot) ? '已评' : '待评' }}
                    </el-button>
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
                    <div class="script-title-left">
                      <span>{{ sectionTitle('shot') }}</span>
                      <div class="script-title-actions">
                        <el-checkbox :model-value="shot.connectPrevious && !isConnectPreviousDisabled(index)" :disabled="isConnectPreviousDisabled(index)" @update:model-value="shot.connectPrevious = Boolean($event)">承上</el-checkbox>
                        <el-checkbox :model-value="shot.connectNext && !isConnectNextDisabled(index)" :disabled="isConnectNextDisabled(index)" @update:model-value="shot.connectNext = Boolean($event)">启下</el-checkbox>
                        <el-button :icon="Search" text type="primary" @click="detectShotCharacters(shot)">识别</el-button>
                      </div>
                    </div>
                    <div class="script-title-stats">
                      <span>{{ characterCount(effectiveShotText(shot)) }}/140 字</span>
                      <span>推荐 {{ durationText(effectiveShotText(shot)) }}</span>
                    </div>
                  </div>
                  <div class="script-input-wrap" :class="{ warn: durationState(effectiveShotText(shot)).warn }">
                    <div v-if="connectedPreviousText(shot, index)" class="script-context-line is-previous" aria-readonly="true">
                      <el-tooltip :content="connectedPreviousText(shot, index)" placement="top" popper-class="script-context-tooltip">
                        <el-icon class="script-context-preview" color="#409eff" aria-label="查看完整衔接上文">
                          <InfoFilled />
                        </el-icon>
                      </el-tooltip>
                      <span class="script-context-text">{{ connectedPreviousText(shot, index) }}</span>
                    </div>
                    <div class="script-textarea-stack">
                      <div :ref="(element) => setScriptHighlightRef(shot.id, element)" class="script-highlight-layer" v-html="highlightedShotText(shot)"></div>
                      <el-input
                        :ref="(input) => setScriptInputRef(shot.id, input)"
                        v-model="shot.text"
                        type="textarea"
                        :rows="9"
                        resize="vertical"
                        placeholder="输入或粘贴 40-120 字分段剧本。系统会匹配本集人物，并识别对白格式。"
                      />
                    </div>
                    <div v-if="connectedNextText(shot, index)" class="script-context-line is-next" aria-readonly="true">
                      <span class="script-context-text">{{ connectedNextText(shot, index) }}</span>
                      <el-tooltip :content="connectedNextText(shot, index)" placement="bottom" popper-class="script-context-tooltip">
                        <el-icon class="script-context-preview" color="#409eff" aria-label="查看完整衔接下文">
                          <InfoFilled />
                        </el-icon>
                      </el-tooltip>
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
                        <template #label="{ label }">
                          {{ sceneSelectLabel(label) }}
                        </template>
                        <el-option v-for="item in activeEpisode.scenes" :key="item.name" :label="sceneAssetLabel(item)" :value="item.name" />
                      </el-select>
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
                    <span class="preview-title-label">
                      完整提示词预览
                      <el-tooltip :content="promptPreviewStatus(shot).htmlMessage" placement="top" raw-content>
                        <el-icon
                          class="prompt-preview-status"
                          :class="promptPreviewStatus(shot).type"
                          :aria-label="promptPreviewStatus(shot).message"
                        >
                          <WarningFilled v-if="promptPreviewStatus(shot).type === 'warning'" />
                          <CircleCheckFilled v-else />
                        </el-icon>
                      </el-tooltip>
                    </span>
                    <div class="preview-copy-actions">
                      <el-button :icon="CopyDocument" text type="primary" @click="copyShotDetail(shot)">详情</el-button>
                      <el-button :icon="CopyDocument" text type="primary" @click="copyPrompt(shot)">完整</el-button>
                    </div>
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
                <el-input v-model="section.title" class="global-config-title-input" />
                <el-input-number v-model="section.order" :min="1" :max="9" />
              </div>
            </div>
          </el-form-item>
          <el-form-item :label="draftSectionTitle('base')">
            <el-input v-model="globalConfigDraft.baseSetting" class="global-config-textarea" type="textarea" :rows="7" resize="vertical" />
          </el-form-item>
          <el-form-item :label="draftSectionTitle('base') + ' 后缀'">
            <el-input v-model="globalConfigDraft.baseSettingSuffix" class="global-config-textarea" type="textarea" :rows="3" resize="vertical" />
          </el-form-item>
          <el-form-item :label="draftSectionTitle('sceneRole') + ' 后缀'">
            <el-input v-model="globalConfigDraft.sceneRoleSuffix" class="global-config-textarea" type="textarea" :rows="4" resize="vertical" />
          </el-form-item>
          <el-form-item label="分镜折叠">
            <el-switch v-model="globalConfigDraft.autoCollapseCompletedShots" />
          </el-form-item>
          <el-form-item label="安全时长">
            <div class="duration-range-config slider-range-config">
              <span>{{ durationRangeDraft[0].toFixed(1) }}</span>
              <el-slider v-model="durationRangeDraft" range :min="3" :max="25" :step="0.5" :format-tooltip="formatDurationTooltip" />
              <span>{{ durationRangeDraft[1].toFixed(1) }}</span>
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="resetGlobalDialog">重置</el-button>
          <el-button type="primary" @click="saveGlobalDialog">保存</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="detectionDialogVisible" title="人物识别冲突" width="520px" class="detection-dialog" @closed="cancelActiveDetection">
        <div v-if="detectionConflict" class="detection-compare">
          <div class="detection-compare-row">
            <span>当前已有</span>
            <div>
              <el-tag v-for="name in detectionConflict.currentNames" :key="`current-${name}`" effect="plain" type="info">{{ name }}</el-tag>
              <span v-if="!detectionConflict.currentNames.length" class="empty-note">无</span>
            </div>
          </div>
          <div class="detection-compare-row">
            <span>本次识别</span>
            <div>
              <el-tag v-for="name in detectionConflict.replaceNames" :key="`replace-${name}`" :type="detectionConflict.voiceSuggestions.includes(name) ? 'warning' : 'primary'" effect="light">
                {{ name }}{{ detectionConflict.voiceSuggestions.includes(name) ? ' · 音色' : '' }}
              </el-tag>
            </div>
          </div>
          <div v-if="detectionMergeChanged()" class="detection-compare-row">
            <span>合并后</span>
            <div>
              <el-tag v-for="name in detectionConflict.mergeNames" :key="`merge-${name}`" :type="detectionConflict.voiceSuggestions.includes(name) ? 'warning' : detectionConflict.currentNames.includes(name) ? 'info' : 'success'" effect="light">
                {{ name }}{{ detectionConflict.voiceSuggestions.includes(name) ? ' · 音色' : '' }}
              </el-tag>
            </div>
          </div>
          <div v-if="detectionReplaceChanged()" class="detection-compare-row">
            <span>替换后</span>
            <div>
              <el-tag v-for="name in detectionConflict.replaceNames" :key="`final-${name}`" :type="detectionConflict.voiceSuggestions.includes(name) ? 'warning' : 'primary'" effect="light">
                {{ name }}{{ detectionConflict.voiceSuggestions.includes(name) ? ' · 音色' : '' }}
              </el-tag>
            </div>
          </div>
        </div>
        <template #footer>
          <el-button :disabled="!detectionMergeChanged()" @click="mergeActiveDetection">合并</el-button>
          <el-button type="primary" :disabled="!detectionReplaceChanged()" @click="replaceActiveDetection">替换</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="reviewDialogVisible" title="提示词评分" width="520px" class="review-dialog" @closed="activeReviewShot = null">
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
          <el-form-item label="抽卡次数">
            <div class="review-slider-line">
              <el-slider v-model="reviewDraft.drawCount" :min="1" :max="8" :step="1" show-stops @input="syncNoSubtitleCount" />
              <span>{{ reviewDraft.drawCount }} 次</span>
            </div>
          </el-form-item>
          <el-form-item label="无字幕">
            <div class="review-slider-line">
              <el-slider v-model="reviewDraft.noSubtitleCount" :min="0" :max="reviewDraft.drawCount" :step="1" show-stops />
              <span>{{ reviewDraft.noSubtitleCount }} 次</span>
            </div>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="reviewDraft.note" type="textarea" :rows="4" resize="vertical" placeholder="输入评分备注" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button type="primary" @click="saveReviewDialog">保存</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="reviewSummaryVisible" :title="reviewSummaryTitle" width="820px" class="review-summary-dialog" @closed="reviewSummaryEpisodeId = null">
        <div class="review-summary-stats">
          <div>
            <strong>{{ reviewSummary.total }}</strong>
            <span>总分镜</span>
          </div>
          <div>
            <strong>{{ reviewSummary.reviewedRate }}</strong>
            <span>已评分率</span>
          </div>
          <div class="summary-average-card">
            <el-rate
              class="summary-average-rate"
              :class="{ muted: reviewSummary.averageValue <= 2 }"
              :model-value="reviewSummary.averageValue"
              disabled
              allow-half
              :max="5"
            />
            <span>平均分</span>
          </div>
          <div>
            <strong>{{ reviewSummary.averageDrawRate }}</strong>
            <span>平均抽卡率</span>
          </div>
          <div>
            <strong>{{ reviewSummary.noSubtitleRate }}</strong>
            <span>无字幕率</span>
          </div>
        </div>
        <div v-if="reviewSummaryEpisode" class="episode-data-panel">
          <section class="episode-data-card cost-card">
            <div class="episode-data-heading">本集成本</div>
            <div class="episode-data-field">
              <el-input
                class="compact-cost-input"
                v-model="productionPointUsageDraft"
                maxlength="8"
                inputmode="numeric"
                @input="updateProductionNumber('pointUsage', productionPointUsageDraft)"
                @blur="normalizeActiveEpisodeProductionData"
              >
                <template #prepend>积分</template>
              </el-input>
            </div>
            <div class="episode-data-field">
              <el-input
                class="compact-cost-input"
                v-model="productionPointCostDraft"
                maxlength="8"
                inputmode="decimal"
                @input="updateProductionNumber('pointCost', productionPointCostDraft)"
                @blur="normalizeActiveEpisodeProductionData"
              >
                <template #prepend>成本</template>
              </el-input>
            </div>
            <div class="episode-data-field total-cost-field">
              <strong>{{ episodeTotalCost }}</strong>
            </div>
          </section>
          <section class="episode-data-card date-card">
            <div class="episode-data-heading">制作日期</div>
            <div class="episode-data-field">
              <el-date-picker v-model="reviewSummaryEpisode.productionData.productionDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
            </div>
          </section>
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
          <el-table-column label="抽卡" width="86">
            <template #default="{ row }">{{ row.drawCount }} 次</template>
          </el-table-column>
          <el-table-column label="无字幕" width="96">
            <template #default="{ row }">
              <el-tag :type="row.noSubtitleCount === row.drawCount ? 'success' : 'danger'" effect="light">
                {{ row.noSubtitleCount }}/{{ row.drawCount }}
              </el-tag>
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
      <el-dialog v-model="groupSummaryVisible" title="整组数据" width="820px" class="group-summary-dialog" @closed="activeGroupSummaryId = null">
        <p class="group-summary-subtitle">{{ groupSummarySubtitle }}</p>
        <div class="review-summary-stats group-summary-stats">
          <div>
            <strong>{{ groupSummaryStats.total }}</strong>
            <span>总分镜</span>
          </div>
          <div class="summary-average-card">
            <el-rate
              class="summary-average-rate"
              :class="{ muted: groupSummaryStats.averageValue <= 2 }"
              :model-value="groupSummaryStats.averageValue"
              disabled
              allow-half
              :max="5"
            />
            <span>平均分</span>
          </div>
          <div>
            <strong>{{ groupSummaryStats.averageDrawRate }}</strong>
            <span>平均抽卡率</span>
          </div>
        </div>
        <div class="episode-data-panel group-data-panel">
          <section class="episode-data-card cost-card group-cost-card">
            <div class="episode-data-field total-cost-field">
              <strong>{{ groupProductionSummary.totalCost }}</strong>
              <span>整组费用</span>
            </div>
          </section>
          <section class="episode-data-card date-card group-date-card">
            <div class="episode-data-field">
              <strong>{{ groupProductionSummary.dateRange }}</strong>
              <span>制作日期</span>
            </div>
          </section>
          <section class="episode-data-card date-card group-date-card">
            <div class="episode-data-field production-days-field">
              <strong>{{ groupProductionSummary.productionDays }}</strong>
              <span>总制作天数</span>
            </div>
          </section>
        </div>
        <el-table :data="groupSummaryRows" max-height="430" empty-text="暂无单集" show-summary :summary-method="getGroupSummaryTableSummary">
          <el-table-column prop="title" label="标题" min-width="130" show-overflow-tooltip />
          <el-table-column prop="total" label="总分镜" width="86" />
          <el-table-column prop="reviewedRate" label="已评分率" width="94" />
          <el-table-column prop="averageText" label="平均分" width="90" />
          <el-table-column prop="averageDrawRate" label="平均抽卡率" width="110" />
          <el-table-column prop="noSubtitleRate" label="无字幕率" width="94" />
          <el-table-column prop="pointUsageText" label="积分" width="92" />
          <el-table-column prop="pointCost" label="成本" width="94" />
          <el-table-column prop="totalCost" label="总费用" width="98" />
          <el-table-column prop="productionDate" label="制作日期" width="116" />
          <el-table-column label="操作" width="84" fixed="right" align="center" header-align="center">
            <template #default="{ row }">
              <el-button text type="primary" @click="openReviewSummary(row.episode)">打开</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-dialog>
      <el-dialog v-model="episodeScriptDialogVisible" title="本集剧本" width="960px" class="episode-script-dialog">
        <el-input
          v-model="episodeScriptDraft"
          type="textarea"
          :rows="16"
          resize="vertical"
          placeholder="粘贴或输入本集完整剧本文字；使用 --- 分段后可保存为分镜"
          @input="autoRecognizeEpisodeScriptShots"
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
        <template #footer>
          <div class="batch-shot-footer">
            <el-alert
              v-if="batchShotSegments.length"
              class="batch-shot-count-alert"
              :title="`已识别 ${batchShotSegments.length} 条分镜`"
              type="success"
              show-icon
              :closable="false"
            />
            <div class="batch-shot-footer-actions">
              <el-button @click="organizeEpisodeScriptDraft">整理</el-button>
              <el-button plain @click="saveEpisodeScriptDialog">保存</el-button>
              <el-popconfirm
                v-if="activeEpisode && hasModifiedShots(activeEpisode)"
                title="当前分镜已有修改，确认导入分镜？"
                confirm-button-text="导入"
                cancel-button-text="取消"
                @confirm="importEpisodeScriptShots"
              >
                <template #reference>
                  <el-button type="primary">导入分镜</el-button>
                </template>
              </el-popconfirm>
              <el-button v-else type="primary" @click="importEpisodeScriptShots">导入分镜</el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="materialDialogVisible" title="添加基础素材" width="680px" class="material-dialog">
        <el-form class="material-form" label-position="top">
          <el-form-item label="人物">
            <el-input
              v-model="materialCharacterDraft"
              clearable
              placeholder="可输入多个人物名称，用逗号、顿号、分号或换行分割"
              @keyup.enter="confirmMaterialDialog"
            />
          </el-form-item>
          <el-form-item label="场景">
            <div class="material-scene-list">
              <div v-for="(scene, index) in materialSceneDrafts" :key="index" class="material-scene-row">
                <el-input
                  v-model="scene.name"
                  clearable
                  :placeholder="`场景 ${index + 1}`"
                  @keyup.enter="confirmMaterialDialog"
                />
                <el-segmented
                  v-model="scene.time"
                  :options="materialSceneTimeOptions"
                  block
                  aria-label="场景时间"
                  class="material-scene-segmented"
                >
                  <template #default="{ item }">
                    <el-icon class="material-segment-icon" :aria-label="segmentedOptionLabel(item)">
                      <component :is="segmentedOptionIcon(item)" />
                    </el-icon>
                  </template>
                </el-segmented>
                <el-segmented
                  v-model="scene.space"
                  :options="materialSceneSpaceOptions"
                  block
                  aria-label="场景空间"
                  class="material-scene-segmented"
                >
                  <template #default="{ item }">
                    <el-icon class="material-segment-icon" :aria-label="segmentedOptionLabel(item)">
                      <component :is="segmentedOptionIcon(item)" />
                    </el-icon>
                  </template>
                </el-segmented>
              </div>
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button type="primary" @click="confirmMaterialDialog">添加</el-button>
        </template>
      </el-dialog>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import brandIconUrl from './assets/angry-cat-brand.jpg'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Check, CircleCheck, CircleCheckFilled, Close, CopyDocument, DataAnalysis, DataLine, Delete, Download, EditPen, Files, House, InfoFilled, MapLocation, Moon, Plus, Search, Setting, Star, StarFilled, Sunny, Upload, WarningFilled } from '@element-plus/icons-vue'
import {
  createCharacterConfig,
  createEpisode,
  createEpisodeGroup,
  createEpisodeProductionData,
  createGlobalConfig,
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
  normalizeCharacterNameForMatch,
  recommendedSeconds,
} from './prompt'
import type { CharacterConfig, Episode, EpisodeGroup, EpisodeProductionData, ExportPayload, GlobalConfig, PendingDetection, PromptReview, SceneAsset, SceneConfig, SceneSpace, SceneTime, SectionKey, Shot } from './types'
import { useAppState } from './useAppState'

type MaterialKind = 'characters' | 'scenes'
type MaterialSceneDraft = {
  name: string
  time: SceneTime
  space: SceneSpace
}
type SaveFilePickerWritable = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}
type SaveFilePickerHandle = {
  createWritable: () => Promise<SaveFilePickerWritable>
}
type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<SaveFilePickerHandle>
}
type MaterialSegmentedOption<T extends string> = {
  label: string
  value: T
  icon: Component
}
type MaterialAddResult = {
  added: number
  skipped: number
}
type ImportMode = 'replace' | 'merge'
type WeeklyReportPickerCell = {
  dayjs?: {
    format: (pattern: string) => string
  }
}
type WeeklyReportEntry = {
  date: string
  dateLabel: string
  groupId: string | null
  groupTitle: string
  episodeNumber: string
}
type WeeklyReportRange = {
  start: string
  end: string
}

const { state, activeEpisode } = useAppState()
const materialDialogVisible = ref(false)
const globalDialogVisible = ref(false)
const globalConfigDraft = ref<GlobalConfig>(cloneGlobalConfig(state.globalConfig))
const durationRangeDraft = ref<[number, number]>([
  state.globalConfig.recommendedDurationRange.min,
  state.globalConfig.recommendedDurationRange.max,
])
const detectionDialogVisible = ref(false)
const detectionConflictShotId = ref<string | null>(null)
const sidebarCollapsed = ref(false)
const materialCharacterDraft = ref('')
const materialSceneDrafts = ref<MaterialSceneDraft[]>(createMaterialSceneDrafts())
const batchShotSegments = ref<string[]>([])
const selectedEpisodeGroupId = ref<string | null>(activeEpisode.value?.groupId ?? null)
const editingEpisodeId = ref<string | null>(null)
const editingEpisodeOriginalTitle = ref('')
const editingGroupId = ref<string | null>(null)
const editingGroupOriginalTitle = ref('')
const expandedGroupIds = ref<string[]>(['ungrouped'])
const openEpisodeMenuId = ref<string | null>(null)
const openGroupMenuId = ref<string | null>(null)
const materialSceneTimeOptions: MaterialSegmentedOption<SceneTime>[] = [
  { label: '白天', value: '白天', icon: Sunny },
  { label: '深夜', value: '深夜', icon: Moon },
]
const materialSceneSpaceOptions: MaterialSegmentedOption<SceneSpace>[] = [
  { label: '室内', value: '室内', icon: House },
  { label: '室外', value: '室外', icon: MapLocation },
]
const episodeDropdownRefs = new Map<string, { handleClose?: () => void }>()
const groupDropdownRefs = new Map<string, { handleClose?: () => void }>()
const scriptInputRefs = new Map<string, { textarea: HTMLTextAreaElement; handler: () => void }>()
const scriptHighlightRefs = new Map<string, HTMLElement>()
const fileInputRef = ref<HTMLInputElement | null>(null)
const reviewDialogVisible = ref(false)
const reviewSummaryVisible = ref(false)
const groupSummaryVisible = ref(false)
const episodeScriptDialogVisible = ref(false)
const activeReviewShot = ref<Shot | null>(null)
const reviewSummaryEpisodeId = ref<string | null>(null)
const activeGroupSummaryId = ref<string | null>(null)
const editingShotRemarkId = ref<string | null>(null)
const shotRemarkDraft = ref('')
const reviewDraft = ref<PromptReview>(createPromptReview())
const episodeScriptDraft = ref('')
const productionPointUsageDraft = ref('0')
const productionPointCostDraft = ref('0.0000')
const weeklyReportWeek = ref<Date | string | null>(null)
const archivedTreeId = 'archived'
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
const sortedEpisodeGroups = computed(() => state.episodeGroups.filter((group) => !group.archived).sort((a, b) => groupSortTitle(a).localeCompare(groupSortTitle(b), 'zh-CN', { numeric: true })))
const sortedArchivedEpisodeGroups = computed(() => state.episodeGroups.filter((group) => group.archived).sort((a, b) => groupSortTitle(a).localeCompare(groupSortTitle(b), 'zh-CN', { numeric: true })))
const sortedUngroupedEpisodes = computed(() => sortEpisodesForDisplay(state.episodes.filter((episode) => !episode.groupId)))
const productionDateSet = computed(() => new Set(state.episodes.map((episode) => normalizeDateString(episode.productionData.productionDate)).filter((date): date is string => Boolean(date))))
const detectionConflictShot = computed(() => activeEpisode.value?.shots.find((shot) => shot.id === detectionConflictShotId.value) ?? null)
const detectionConflict = computed(() => detectionConflictShot.value?.pendingDetection ?? null)
const reviewSummaryEpisode = computed(() => state.episodes.find((episode) => episode.id === reviewSummaryEpisodeId.value) ?? activeEpisode.value ?? null)
const activeGroupSummary = computed(() => state.episodeGroups.find((group) => group.id === activeGroupSummaryId.value) ?? null)
const groupSummaryEpisodes = computed(() => activeGroupSummaryId.value ? episodesForGroup(activeGroupSummaryId.value) : [])
const reviewSummaryTitle = computed(() => {
  const episode = reviewSummaryEpisode.value

  if (!episode) {
    return '《未分组》本集数据'
  }

  return `《${getEpisodeGroupTitle(episode.groupId ?? null)}》${episode.title}数据`
})
const reviewSummaryRows = computed(() => reviewSummaryEpisode.value?.shots.map((shot, index) => ({
  shot,
  index: `#${index + 1}`,
  reviewed: isShotReviewed(shot),
  rating: shot.review.rating,
  ratingText: shot.review.rating ? `${shot.review.rating} 星` : '未评分',
  drawCount: shot.review.drawCount,
  noSubtitleCount: shot.review.noSubtitleCount,
  noteText: shot.review.note.trim() || '无',
})) ?? [])
const reviewSummary = computed(() => summarizeShots(reviewSummaryEpisode.value?.shots ?? []))
const episodeTotalCost = computed(() => {
  const data = reviewSummaryEpisode.value?.productionData ?? createEpisodeProductionData()
  return (data.pointUsage * data.pointCost).toFixed(4)
})
const groupSummarySubtitle = computed(() => {
  const title = activeGroupSummary.value?.title ?? ''
  const episodeNumbers = groupSummaryEpisodes.value.map(formatEpisodeSummaryNumber).join('/')
  return `《${title}》${episodeNumbers || '无'}，共${groupSummaryEpisodes.value.length}集`
})
const groupSummaryStats = computed(() => summarizeShots(groupSummaryEpisodes.value.flatMap((episode) => episode.shots)))
const groupProductionSummary = computed(() => summarizeProductionData(groupSummaryEpisodes.value))
const groupSummaryRows = computed(() => groupSummaryEpisodes.value.map((episode) => {
  const summary = summarizeShots(episode.shots)
  const data = episode.productionData ?? createEpisodeProductionData()
  const productionDate = normalizeDateString(data.productionDate)

  return {
    isSummary: false,
    episode,
    episodeNumber: formatEpisodeSummaryNumber(episode),
    title: episode.title,
    total: summary.total,
    reviewedRate: summary.reviewedRate,
    averageText: summary.averageValue ? `${summary.averageValue} 星` : '未评分',
    averageDrawRate: summary.averageDrawRate,
    noSubtitleRate: summary.noSubtitleRate,
    pointUsageText: formatIntegerWithCommas(data.pointUsage),
    pointCost: formatPointCost(data.pointCost),
    totalCost: formatPointCost(data.pointUsage * data.pointCost),
    productionDate: productionDate ?? '未设置',
  }
}))
function getGroupSummaryTableSummary({ columns }: { columns: Array<{ property?: string }> }) {
  const values: Record<string, string> = {
    episodeNumber: '汇总',
    title: `共 ${groupSummaryEpisodes.value.length} 集`,
    total: String(groupSummaryStats.value.total),
    reviewedRate: groupSummaryStats.value.reviewedRate,
    averageText: groupSummaryStats.value.averageValue ? `${groupSummaryStats.value.averageValue} 星` : '未评分',
    averageDrawRate: groupSummaryStats.value.averageDrawRate,
    noSubtitleRate: groupSummaryStats.value.noSubtitleRate,
    pointUsageText: groupProductionSummary.value.pointUsageText,
    pointCost: groupProductionSummary.value.averagePointCost,
    totalCost: groupProductionSummary.value.totalCost,
    productionDate: groupProductionSummary.value.productionDays,
  }

  return columns.map((column) => column.property ? values[column.property] ?? '' : '')
}

function summarizeShots(shots: Shot[]) {
  const ratedShots = shots.filter((shot) => shot.review.rating > 0)
  const ratingTotal = ratedShots.reduce((total, shot) => total + shot.review.rating, 0)
  const drawTotal = shots.reduce((total, shot) => total + shot.review.drawCount, 0)
  const noSubtitleTotal = shots.reduce((total, shot) => total + shot.review.noSubtitleCount, 0)
  const percent = (value: number) => `${shots.length ? Math.round((value / shots.length) * 100) : 0}%`

  return {
    total: shots.length,
    reviewedRate: percent(shots.filter(isShotReviewed).length),
    averageValue: ratedShots.length ? Number((ratingTotal / ratedShots.length).toFixed(1)) : 0,
    drawTotal,
    averageDrawRate: `${drawTotal ? Math.round((shots.length / drawTotal) * 100) : 0}%`,
    noSubtitleRate: `${drawTotal ? Math.round((noSubtitleTotal / drawTotal) * 100) : 0}%`,
  }
}

function summarizeProductionData(episodes: Episode[]) {
  const pointUsage = episodes.reduce((total, episode) => total + episode.productionData.pointUsage, 0)
  const pointCostTotal = episodes.reduce((total, episode) => total + episode.productionData.pointCost, 0)
  const totalCost = episodes.reduce((total, episode) => total + episode.productionData.pointUsage * episode.productionData.pointCost, 0)
  const dates = Array.from(new Set(episodes
    .map((episode) => normalizeDateString(episode.productionData.productionDate))
    .filter((date): date is string => Boolean(date))))
    .sort()

  return {
    pointUsageText: formatIntegerWithCommas(pointUsage),
    averagePointCost: formatPointCost(episodes.length ? pointCostTotal / episodes.length : 0),
    totalCost: formatPointCost(totalCost),
    dateRange: dates.length ? `${formatMonthDayWithSeparator(dates[0])} 至 ${formatMonthDayWithSeparator(dates[dates.length - 1])}` : '未设置',
    productionDays: `${dates.length} 天`,
  }
}

function formatPointCost(value: number) {
  return Math.max(0, value).toFixed(4)
}

function parseProductionNumber(value: string | number) {
  const parsed = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function updateProductionNumber(field: 'pointUsage' | 'pointCost', value: string | number) {
  const data = reviewSummaryEpisode.value?.productionData

  if (!data) {
    return
  }

  if (field === 'pointUsage') {
    data.pointUsage = Math.max(0, Math.round(parseProductionNumber(value)))
    return
  }

  data.pointCost = Math.max(0, parseProductionNumber(value))
}

function normalizeActiveEpisodeProductionData() {
  const data = reviewSummaryEpisode.value?.productionData

  if (!data) {
    return
  }

  data.pointUsage = Math.max(0, Math.round(data.pointUsage))
  data.pointCost = Math.max(0, Number(data.pointCost.toFixed(4)))
  productionPointUsageDraft.value = formatIntegerWithCommas(data.pointUsage)
  productionPointCostDraft.value = data.pointCost.toFixed(4)
}

function hydrateProductionDrafts(episode = reviewSummaryEpisode.value) {
  const data = episode?.productionData ?? createEpisodeProductionData()
  productionPointUsageDraft.value = formatIntegerWithCommas(data.pointUsage)
  productionPointCostDraft.value = data.pointCost.toFixed(4)
}

function formatIntegerWithCommas(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}

function formatMonthDayWithSeparator(value: string) {
  const [, month, day] = value.split('-')
  return `${month}-${day}`
}

function formatEpisodeSummaryNumber(episode: Episode) {
  const number = parseEpisodeNumber(episode.title)
  return number ? pad2(number) : episode.title
}

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

function resetGlobalDialog() {
  globalConfigDraft.value = createGlobalConfig()
  durationRangeDraft.value = [
    globalConfigDraft.value.recommendedDurationRange.min,
    globalConfigDraft.value.recommendedDurationRange.max,
  ]
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

function groupEpisodeCount(id: string) {
  if (id === archivedTreeId) {
    return sortedArchivedEpisodeGroups.value.length
  }

  return id === 'ungrouped' ? sortedUngroupedEpisodes.value.length : episodesForGroup(id).length
}

function isGroupEmpty(id: string) {
  return groupEpisodeCount(id) === 0
}

function normalizeEpisodeGroupId(id: string | null) {
  return id === 'ungrouped' ? null : id
}

function isExistingEpisodeGroupId(id: string | null) {
  return id === null || state.episodeGroups.some((group) => group.id === id)
}

function isArchivedEpisodeGroupId(id: string | null) {
  return Boolean(id && state.episodeGroups.some((group) => group.id === id && group.archived))
}

function getSelectedEpisodeGroupId() {
  if (isExistingEpisodeGroupId(selectedEpisodeGroupId.value) && !isArchivedEpisodeGroupId(selectedEpisodeGroupId.value)) {
    return selectedEpisodeGroupId.value
  }

  const activeGroupId = activeEpisode.value?.groupId ?? null
  return isArchivedEpisodeGroupId(activeGroupId) ? null : activeGroupId
}

function selectEpisode(episode: Episode) {
  state.activeEpisodeId = episode.id
  selectedEpisodeGroupId.value = episode.groupId ?? null
}

function selectGroup(id: string | null) {
  selectedEpisodeGroupId.value = normalizeEpisodeGroupId(id)
}

function selectGroupAndToggleIfNotEmpty(id: string) {
  selectGroup(id)
  toggleGroupIfNotEmpty(id)
}

function toggleArchivedGroupsIfNotEmpty() {
  toggleGroupIfNotEmpty(archivedTreeId)
}

function toggleGroupIfNotEmpty(id: string) {
  if (!isGroupEmpty(id)) {
    toggleGroup(id)
  }
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

function normalizeDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const date = parseDateString(value)
  return date && formatDateString(date) === value ? value : null
}

function parseDateString(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return Number.isFinite(date.getTime()) ? date : null
}

function formatDateString(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatMonthDay(value: string) {
  const [, month, day] = value.split('-')
  return `${month}${day}`
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function getMonday(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  return date
}

function addDays(value: Date, days: number) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  date.setDate(date.getDate() + days)
  return date
}

function getIsoWeekMonday(year: number, week: number) {
  const januaryFourth = new Date(year, 0, 4)
  const weekOneMonday = getMonday(januaryFourth)
  return addDays(weekOneMonday, (week - 1) * 7)
}

function normalizeWeekValue(value: Date | string | null) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }

  if (typeof value === 'string') {
    const date = parseDateString(value)

    if (date) {
      return date
    }

    const weekMatch = value.match(/^(\d{4})\s*w\s*(\d{1,2})$/i)

    if (weekMatch) {
      const year = Number(weekMatch[1])
      const week = Number(weekMatch[2])
      return Number.isFinite(year) && Number.isFinite(week) && week >= 1 && week <= 53 ? getIsoWeekMonday(year, week) : null
    }
  }

  return null
}

function createWeeklyReportRange(selectedDate: Date): WeeklyReportRange {
  const start = getMonday(selectedDate)
  const end = addDays(start, 6)

  return {
    start: formatDateString(start),
    end: formatDateString(end),
  }
}

function getWeeklyReportRanges(value: Date | string | null) {
  const selectedDate = normalizeWeekValue(value)

  if (!selectedDate) {
    return []
  }

  const ranges = [createWeeklyReportRange(selectedDate)]

  if (selectedDate.getDay() === 0) {
    const nextWeekRange = createWeeklyReportRange(addDays(selectedDate, 1))

    if (nextWeekRange.start !== ranges[0].start) {
      ranges.push(nextWeekRange)
    }
  }

  return ranges
}

function hasProductionOnPickerCell(cell: WeeklyReportPickerCell | undefined) {
  const date = cell?.dayjs?.format('YYYY-MM-DD')
  return typeof date === 'string' && productionDateSet.value.has(date)
}

function parseEpisodeNumber(title: string) {
  const match = title.match(/\d+/)
  const value = match ? Number(match[0]) : 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

function getEpisodeNumber(title: string) {
  return pad2(parseEpisodeNumber(title))
}

function getEpisodeGroupTitle(groupId: string | null) {
  if (!groupId) {
    return '未分组'
  }

  return state.episodeGroups.find((group) => group.id === groupId)?.title ?? '未分组'
}

function sceneAssetLabel(scene: SceneAsset) {
  return `${scene.name} · ${scene.time} · ${scene.space}`
}

function sceneSelectLabel(label: string) {
  const scene = activeEpisode.value?.scenes.find((item) => item.name === label)
  return scene ? sceneAssetLabel(scene) : label
}

function collectWeeklyReportEntries(range: WeeklyReportRange) {
  return state.episodes
    .map((episode): WeeklyReportEntry | null => {
      const date = normalizeDateString(episode.productionData.productionDate)

      if (!date || date < range.start || date > range.end) {
        return null
      }

      const groupId = episode.groupId ?? null
      return {
        date,
        dateLabel: formatMonthDay(date),
        groupId,
        groupTitle: getEpisodeGroupTitle(groupId),
        episodeNumber: getEpisodeNumber(episode.title),
      }
    })
    .filter((entry): entry is WeeklyReportEntry => Boolean(entry))
    .sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date)

      if (dateDiff !== 0) {
        return dateDiff
      }

      const groupDiff = a.groupTitle.localeCompare(b.groupTitle, 'zh-CN', { numeric: true })
      return groupDiff !== 0 ? groupDiff : a.episodeNumber.localeCompare(b.episodeNumber, 'zh-CN', { numeric: true })
    })
}

function buildWeeklyReportEntries(value: Date | string | null) {
  const ranges = getWeeklyReportRanges(value)

  for (const range of ranges) {
    const entries = collectWeeklyReportEntries(range)

    if (entries.length) {
      return entries
    }
  }

  return []
}

function buildWeeklyReport(value: Date | string | null) {
  const entries = buildWeeklyReportEntries(value)

  if (!entries.length) {
    return ''
  }

  const lines = [`${entries[0].dateLabel} - ${entries[entries.length - 1].dateLabel}`]
  const entriesByDate = new Map<string, WeeklyReportEntry[]>()

  entries.forEach((entry) => {
    entriesByDate.set(entry.date, [...(entriesByDate.get(entry.date) ?? []), entry])
  })

  Array.from(entriesByDate.entries()).forEach(([date, dateEntries]) => {
    const groups = new Map<string, WeeklyReportEntry[]>()
    dateEntries.forEach((entry) => {
      groups.set(entry.groupId ?? 'ungrouped', [...(groups.get(entry.groupId ?? 'ungrouped') ?? []), entry])
    })

    const segments = Array.from(groups.values()).map((groupEntries) => {
      const firstEntry = groupEntries[0]
      const episodeNumbers = Array.from(new Set(groupEntries.map((entry) => entry.episodeNumber))).join('/')
      return `制作《${firstEntry.groupTitle}》${episodeNumbers}集`
    })

    lines.push(`${formatMonthDay(date)} ${segments.join('、')}`)
  })

  return lines.join('\n')
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
  const group = createEpisodeGroup()
  state.episodeGroups.push(group)
  selectedEpisodeGroupId.value = group.id
  expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, group.id]))
  editingGroupOriginalTitle.value = group.title
  editingGroupId.value = group.id
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

function setScriptHighlightRef(id: string, element: unknown) {
  if (element instanceof HTMLElement) {
    scriptHighlightRefs.set(id, element)
    syncScriptHighlightScroll(id)
    return
  }

  scriptHighlightRefs.delete(id)
}

function setScriptInputRef(id: string, input: unknown) {
  const existing = scriptInputRefs.get(id)

  if (!input || typeof input !== 'object') {
    existing?.textarea.removeEventListener('scroll', existing.handler)
    scriptInputRefs.delete(id)
    return
  }

  const candidate = input as { textarea?: HTMLTextAreaElement; $el?: HTMLElement }
  const textarea = candidate.textarea ?? candidate.$el?.querySelector('textarea') ?? null

  if (!textarea || existing?.textarea === textarea) {
    syncScriptHighlightScroll(id)
    return
  }

  existing?.textarea.removeEventListener('scroll', existing.handler)
  const handler = () => syncScriptHighlightScroll(id)
  textarea.addEventListener('scroll', handler, { passive: true })
  scriptInputRefs.set(id, { textarea, handler })
  syncScriptHighlightScroll(id)
}

function syncScriptHighlightScroll(id: string) {
  const inputRef = scriptInputRefs.get(id)
  const highlight = scriptHighlightRefs.get(id)

  if (!inputRef || !highlight) {
    return
  }

  highlight.scrollTop = inputRef.textarea.scrollTop
  highlight.scrollLeft = inputRef.textarea.scrollLeft
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
      if (isArchivedEpisodeGroupId(command.groupId)) {
        return
      }

      episode.groupId = command.groupId
      if (episode.id === state.activeEpisodeId) {
        selectedEpisodeGroupId.value = command.groupId
      }
      expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, command.groupId ?? 'ungrouped']))
    }
    return
  }

  if (command === 'edit') {
    editingEpisodeOriginalTitle.value = episode.title
    editingEpisodeId.value = episode.id
    return
  }

  if (command === 'summary') {
    selectEpisode(episode)
    openReviewSummary(episode)
    return
  }

  if (command === 'delete') {
    void deleteEpisodeById(episode.id)
  }
}

async function handleGroupCommand(command: string, groupId: string) {
  openGroupMenuId.value = null
  if (command === 'summary') {
    openGroupSummary(groupId)
    return
  }

  if (command === 'edit') {
    const group = state.episodeGroups.find((item) => item.id === groupId)
    editingGroupOriginalTitle.value = group?.title ?? ''
    editingGroupId.value = groupId
    return
  }

  if (command === 'archive') {
    const group = state.episodeGroups.find((item) => item.id === groupId)

    if (!group) {
      return
    }

    group.archived = !group.archived
    expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, group.archived ? archivedTreeId : group.id]))

    if (group.archived && selectedEpisodeGroupId.value === groupId) {
      selectedEpisodeGroupId.value = null
    }

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
  if (selectedEpisodeGroupId.value === groupId) {
    selectedEpisodeGroupId.value = null
  }
  state.episodeGroups = state.episodeGroups.filter((item) => item.id !== groupId)
  expandedGroupIds.value = expandedGroupIds.value.filter((id) => id !== groupId)
}

function openMaterialDialog() {
  resetMaterialDrafts()
  materialDialogVisible.value = true
}

function confirmMaterialDialog() {
  addMaterialDrafts()
  resetMaterialDrafts()
  materialDialogVisible.value = false
}

function createMaterialSceneDraft(): MaterialSceneDraft {
  return {
    name: '',
    time: '白天',
    space: '室内',
  }
}

function createMaterialSceneDrafts() {
  return Array.from({ length: 5 }, () => createMaterialSceneDraft())
}

function resetMaterialDrafts() {
  materialCharacterDraft.value = ''
  materialSceneDrafts.value = createMaterialSceneDrafts()
}

function segmentedOptionLabel(item: unknown) {
  if (item && typeof item === 'object' && 'label' in item) {
    return String((item as { label?: unknown }).label ?? '')
  }

  return ''
}

function segmentedOptionIcon(item: unknown) {
  if (item && typeof item === 'object' && 'icon' in item) {
    return (item as { icon: Component }).icon
  }

  return Sunny
}

function isCharacterUsed(name: string) {
  return activeEpisode.value?.shots.some((shot) => shot.characters.some((character) => character.name === name)) ?? false
}

function isSceneUsed(name: string) {
  return activeEpisode.value?.shots.some((shot) => shot.scenes.some((scene) => scene.name === name)) ?? false
}

function addEpisode() {
  const targetGroupId = getSelectedEpisodeGroupId()
  const targetTreeId = targetGroupId ?? 'ungrouped'
  const episode = createEpisode(groupEpisodeCount(targetTreeId) + 1)
  episode.groupId = targetGroupId
  state.episodes.push(episode)
  state.activeEpisodeId = episode.id
  selectedEpisodeGroupId.value = targetGroupId
  expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, targetTreeId]))
  editingEpisodeOriginalTitle.value = episode.title
  editingEpisodeId.value = episode.id
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
    selectEpisode(state.episodes[Math.max(index - 1, 0)])
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

function splitBatchShotText(value: string) {
  return value
    .split(/---/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function insertBatchShots(episode: Episode, segments: string[]) {
  if (!episode || !segments.length) {
    return 0
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

  return segments.length
}

function isShotCollapsed(shot: Shot) {
  return state.globalConfig.autoCollapseCompletedShots && shot.status === 'complete'
}

function hasModifiedShots(episode: Episode) {
  return episode.shots.some((shot) => (
    Boolean(shot.text.trim())
    || Boolean(shot.remark.trim())
    || shot.connectPrevious
    || shot.connectNext
    || hasConfiguredScenes(shot)
    || shot.characters.length > 0
    || shot.usePositionReference
    || shot.status !== 'incomplete'
    || !isReviewDefault(shot.review)
  ))
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

function addMaterialDrafts() {
  const episode = activeEpisode.value

  if (!episode) {
    return
  }

  const characterResult = addCharacterMaterials(episode, materialCharacterDraft.value)
  const sceneResult = addSceneMaterials(episode, materialSceneDrafts.value)
  const added = characterResult.added + sceneResult.added
  const skipped = characterResult.skipped + sceneResult.skipped

  if (added && skipped) {
    ElMessage.success(`已添加 ${added} 项，跳过 ${skipped} 个重复项`)
  } else if (added) {
    ElMessage.success(`已添加 ${added} 项`)
  } else if (skipped) {
    ElMessage.info('输入的素材已存在')
  }
}

function addCharacterMaterials(episode: Episode, value: string): MaterialAddResult {
  const items = splitMaterialInput(value)

  if (!items.length) {
    return { added: 0, skipped: 0 }
  }

  const added = items.filter((item) => !episode.characters.includes(item))

  episode.characters.push(...added)

  return {
    added: added.length,
    skipped: items.length - added.length,
  }
}

function addSceneMaterials(episode: Episode, drafts: MaterialSceneDraft[]): MaterialAddResult {
  const existingNames = new Set(episode.scenes.map((scene) => scene.name))
  const draftNames = new Set<string>()
  let skipped = 0

  const added = drafts
    .map((draft) => ({ ...draft, name: draft.name.trim() }))
    .filter((draft) => {
      if (!draft.name) {
        return false
      }

      if (existingNames.has(draft.name) || draftNames.has(draft.name)) {
        skipped += 1
        return false
      }

      draftNames.add(draft.name)
      return true
    })

  episode.scenes.push(...added.map((scene) => createSceneAsset(scene.name, scene.time, scene.space)))

  return {
    added: added.length,
    skipped,
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

  if (kind === 'characters') {
    episode.characters = episode.characters.filter((item) => item !== value)
    return
  }

  episode.scenes = episode.scenes.filter((item) => item.name !== value)
}

function addSceneToShot(shot: Shot) {
  const episodeScenes = activeEpisode.value?.scenes ?? []
  const blankScene = shot.scenes.find((scene) => !scene.name.trim())

  if (episodeScenes.length === 1) {
    const [scene] = episodeScenes
    if (blankScene) {
      blankScene.name = scene.name
      blankScene.time = scene.time
      blankScene.space = scene.space
      return
    }

    shot.scenes.push(createSceneConfig(scene.name, scene.time, scene.space))
    return
  }

  shot.scenes.push(createSceneConfig())
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

  if (!shot.scenes.length) {
    shot.scenes.push(createSceneConfig())
  }
}

function addCharacterToShot(shot: Shot) {
  const available = activeEpisode.value?.characters.filter((name) => !shot.characters.some((character) => character.name === name)) ?? []

  if (!available.length) {
    ElMessage.info('没有可添加的人物，或人物已全部加入')
    return
  }

  shot.characters.push(createCharacterConfig(available.length === 1 ? available[0] : ''))
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

function hasConfiguredScenes(shot: Shot) {
  return shot.scenes.some((scene) => scene.name.trim())
}

function promptPreviewWarnings(shot: Shot) {
  const warnings: string[] = []
  const configuredCharacters = shot.characters.filter((character) => character.name.trim())
  const text = effectiveShotText(shot)

  if (!configuredCharacters.length) {
    warnings.push('未配置人物')
  }

  if (!hasConfiguredScenes(shot)) {
    warnings.push('未配置场景')
  }

  if (isVoiceOverflow(shot)) {
    warnings.push('音色超过 3 个')
  }

  if (configuredCharacters.length > 3 && !shot.usePositionReference) {
    warnings.push('多角色建议勾选位置参考')
  }

  const seconds = recommendedSeconds(text)
  const min = Math.min(state.globalConfig.recommendedDurationRange.min, state.globalConfig.recommendedDurationRange.max)
  const max = Math.max(state.globalConfig.recommendedDurationRange.min, state.globalConfig.recommendedDurationRange.max)

  if (text && (seconds < min || seconds > max)) {
    warnings.push(`推荐时长 ${formatSeconds(seconds)}，超出安全范围 ${formatSeconds(min)}-${formatSeconds(max)}`)
  }

  return warnings
}

function formatPromptPreviewWarnings(warnings: string[]) {
  return warnings.map((warning, index) => `${index + 1}.${warning}`)
}

function promptPreviewStatus(shot: Shot): { type: 'success' | 'warning'; message: string; htmlMessage: string } {
  const warnings = promptPreviewWarnings(shot)

  if (warnings.length) {
    const numberedWarnings = formatPromptPreviewWarnings(warnings)

    return {
      type: 'warning',
      message: numberedWarnings.join('\n'),
      htmlMessage: numberedWarnings.map(escapeHtml).join('<br>'),
    }
  }

  return {
    type: 'success',
    message: '提示词检查通过',
    htmlMessage: '提示词检查通过',
  }
}

function highlightedShotText(shot: Shot) {
  const text = shot.text || ' '
  const characters = shot.characters
    .map((character) => {
      const name = character.name.trim()
      return {
        name,
        matchName: normalizeCharacterNameForMatch(name),
        includeVoice: character.includeVoice,
      }
    })
    .filter((character, index, list) => character.name && character.matchName && list.findIndex((item) => item.matchName === character.matchName) === index)
    .sort((a, b) => b.matchName.length - a.matchName.length)

  if (!characters.length) {
    return escapeHtml(text)
  }

  const pattern = new RegExp(characters.map((character) => escapeRegExp(character.matchName)).join('|'), 'g')
  const rawParts: string[] = []
  let cursor = 0

  text.replace(pattern, (match, offset: number) => {
    rawParts.push(escapeHtml(text.slice(cursor, offset)))
    const character = characters.find((item) => item.matchName === match)
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

function nonEmptyLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function firstSentenceText(line: string) {
  const match = line.match(/[。！？.!?]/)

  if (!match || match.index === undefined) {
    return line
  }

  return line.slice(0, match.index + match[0].length).trim()
}

function lastSentenceText(line: string) {
  const trimmed = line.trim()
  const speakerPrefix = trimmed.match(/^([^：:\r\n]+[：:])/)?.[1] ?? ''
  const content = speakerPrefix ? trimmed.slice(speakerPrefix.length).trim() : trimmed
  const sentences = content.match(/[^\u3002\uff01\uff1f!?]+[\u3002\uff01\uff1f!?]?/g)
  const sentence = sentences?.at(-1)?.trim() ?? content

  return speakerPrefix && sentence ? `${speakerPrefix}${sentence}` : sentence
}

function shotIndex(shot: Shot) {
  return activeEpisode.value?.shots.findIndex((item) => item.id === shot.id) ?? -1
}

function previousShotTail(index: number) {
  const previous = activeEpisode.value?.shots[index - 1]
  const lines = previous ? nonEmptyLines(previous.text) : []
  return lastSentenceText(lines.at(-1) ?? '')
}

function nextShotHead(index: number) {
  const next = activeEpisode.value?.shots[index + 1]
  return firstSentenceText(next ? nonEmptyLines(next.text)[0] ?? '' : '')
}

function isConnectPreviousDisabled(index: number) {
  return !previousShotTail(index)
}

function isConnectNextDisabled(index: number) {
  return !nextShotHead(index)
}

function connectedPreviousText(shot: Shot, index: number) {
  return shot.connectPrevious ? previousShotTail(index) : ''
}

function connectedNextText(shot: Shot, index: number) {
  return shot.connectNext ? nextShotHead(index) : ''
}

function effectiveShotText(shot: Shot) {
  const index = shotIndex(shot)
  const lines = [
    shot.connectPrevious && index > -1 ? previousShotTail(index) : '',
    shot.text.trim(),
    shot.connectNext && index > -1 ? nextShotHead(index) : '',
  ].filter(Boolean)

  return lines.join('\n').trim()
}

function hasShotRemark(shot: Shot) {
  return Boolean(shot.remark.trim())
}

function startShotRemarkEdit(shot: Shot) {
  editingShotRemarkId.value = shot.id
  shotRemarkDraft.value = shot.remark
}

function saveShotRemark(shot: Shot) {
  const remark = shotRemarkDraft.value.trim()
  shot.remark = remark
  editingShotRemarkId.value = null
  shotRemarkDraft.value = ''
  ElMessage.success(remark ? '已保存分镜备注' : '已删除分镜备注')
}

function cancelShotRemarkEdit() {
  editingShotRemarkId.value = null
  shotRemarkDraft.value = ''
}

function deleteShotRemark(shot: Shot) {
  shot.remark = ''
  cancelShotRemarkEdit()
  ElMessage.success('已删除分镜备注')
}

function detectShotCharacters(shot: Shot, options: { silent?: boolean; showConflict?: boolean } = {}) {
  const episode = activeEpisode.value
  const showConflict = options.showConflict ?? true

  if (!episode) {
    return false
  }

  const detected = detectCharacters(effectiveShotText(shot), episode.characters)
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

function characterConfigSignature(characters: CharacterConfig[]) {
  return characters
    .map((character) => `${character.name.trim()}::${character.includeVoice ? '1' : '0'}`)
    .join('\n')
}

function detectionMergeChanged() {
  const shot = detectionConflictShot.value
  const pending = shot?.pendingDetection

  if (!shot || !pending) {
    return false
  }

  return characterConfigSignature(shot.characters) !== characterConfigSignature(mergeDetectedCharacters(shot.characters, pending.detected, true))
}

function detectionReplaceChanged() {
  const shot = detectionConflictShot.value
  const pending = shot?.pendingDetection

  if (!shot || !pending) {
    return false
  }

  return characterConfigSignature(shot.characters) !== characterConfigSignature(buildDetectedCharacters(pending.detected))
}

function mergeActiveDetection() {
  const shot = detectionConflictShot.value

  if (!shot?.pendingDetection) {
    detectionDialogVisible.value = false
    return
  }

  if (!detectionMergeChanged()) {
    return
  }

  shot.characters = mergeDetectedCharacters(shot.characters, shot.pendingDetection.detected, true)
  ElMessage.success('已合并人物配置')
  shot.pendingDetection = null
  detectionConflictShotId.value = null
  detectionDialogVisible.value = false
}

function replaceActiveDetection() {
  const shot = detectionConflictShot.value

  if (!shot?.pendingDetection) {
    detectionDialogVisible.value = false
    return
  }

  if (!detectionReplaceChanged()) {
    return
  }

  shot.characters = buildDetectedCharacters(shot.pendingDetection.detected)
  ElMessage.success('已替换人物配置')
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
  const drawCount = typeof value.drawCount === 'number' && Number.isFinite(value.drawCount)
    ? Math.max(1, Math.min(8, Math.round(value.drawCount)))
    : 1
  const legacyNoSubtitle = 'noSubtitle' in value ? Boolean((value as Partial<PromptReview> & { noSubtitle?: boolean }).noSubtitle) : false
  const noSubtitleCount = typeof value.noSubtitleCount === 'number' && Number.isFinite(value.noSubtitleCount)
    ? Math.max(0, Math.min(drawCount, Math.round(value.noSubtitleCount)))
    : legacyNoSubtitle ? drawCount : 0

  return {
    rating,
    drawCount,
    noSubtitleCount,
    note: typeof value.note === 'string' ? value.note : '',
  }
}

function normalizeEpisodeProductionData(data: unknown): EpisodeProductionData {
  if (!data || typeof data !== 'object') {
    return createEpisodeProductionData()
  }

  const value = data as Partial<EpisodeProductionData>

  return {
    pointUsage: typeof value.pointUsage === 'number' && Number.isFinite(value.pointUsage) ? Math.max(0, Math.round(value.pointUsage)) : 0,
    pointCost: typeof value.pointCost === 'number' && Number.isFinite(value.pointCost) ? Math.max(0, Number(value.pointCost.toFixed(4))) : 0,
    productionDate: typeof value.productionDate === 'string' ? value.productionDate : '',
  }
}

function isShotReviewed(shot: Shot) {
  return shot.review.rating > 0 || shot.review.drawCount !== 1 || shot.review.noSubtitleCount !== 0 || Boolean(shot.review.note.trim())
}

function isEpisodeAutoStarred(episode: Episode) {
  return episode.shots.length > 0 && episode.shots.every(isShotReviewed)
}

function isGroupAutoStarred(groupId: string) {
  const episodes = episodesForGroup(groupId)
  return episodes.length > 0 && episodes.every(isEpisodeAutoStarred)
}

function isReviewDefault(review: PromptReview) {
  return review.rating === 0 && review.drawCount === 1 && review.noSubtitleCount === 0 && !review.note.trim()
}

function syncNoSubtitleCount() {
  reviewDraft.value.noSubtitleCount = Math.min(reviewDraft.value.noSubtitleCount, reviewDraft.value.drawCount)
}

function openReviewDialog(shot: Shot) {
  activeReviewShot.value = shot
  reviewDraft.value = { ...normalizePromptReview(shot.review) }
  reviewDialogVisible.value = true
}

function saveReviewDialog() {
  const shot = activeReviewShot.value

  if (!shot) {
    reviewDialogVisible.value = false
    return
  }

  const normalizedReview = normalizePromptReview(reviewDraft.value)

  if (isReviewDefault(normalizedReview)) {
    ElMessage.warning('请至少填写一项评分内容')
    return
  }

  shot.review = normalizedReview
  reviewDialogVisible.value = false
  ElMessage.success('已保存评分')
}

function openReviewSummary(episode = activeEpisode.value) {
  reviewSummaryEpisodeId.value = episode?.id ?? null
  hydrateProductionDrafts(episode)
  reviewSummaryVisible.value = true
}

function openGroupSummary(groupId: string) {
  if (!state.episodeGroups.some((group) => group.id === groupId)) {
    return
  }

  activeGroupSummaryId.value = groupId
  groupSummaryVisible.value = true
}

function openEpisodeScriptDialog() {
  episodeScriptDraft.value = activeEpisode.value?.scriptText ?? ''
  autoRecognizeEpisodeScriptShots()
  episodeScriptDialogVisible.value = true
}

function organizeEpisodeScriptDraft() {
  episodeScriptDraft.value = episodeScriptDraft.value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*---[ \t]*/g, '\n---\n')
    .replace(/[△▲][ \t]*/g, '')
    .replace(/\.{3,}/g, '…')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  autoRecognizeEpisodeScriptShots()
  ElMessage.success('已整理剧本文字')
}

function autoRecognizeEpisodeScriptShots() {
  batchShotSegments.value = splitBatchShotText(episodeScriptDraft.value)
}

function refreshBatchShotSegments() {
  batchShotSegments.value = splitBatchShotText(episodeScriptDraft.value)

  if (!batchShotSegments.value.length) {
    ElMessage.warning('没有识别到可用分镜')
    return false
  }

  return true
}

function saveEpisodeScriptDialog() {
  const episode = activeEpisode.value

  if (!episode) {
    episodeScriptDialogVisible.value = false
    return
  }

  episode.scriptText = episodeScriptDraft.value
  episodeScriptDialogVisible.value = false
  batchShotSegments.value = []
  ElMessage.success('已保存本集剧本')
}

function importEpisodeScriptShots() {
  const episode = activeEpisode.value

  if (!episode || !refreshBatchShotSegments()) {
    return
  }

  episode.scriptText = episodeScriptDraft.value
  const insertedCount = insertBatchShots(episode, batchShotSegments.value)
  episodeScriptDialogVisible.value = false
  batchShotSegments.value = []
  ElMessage.success(`已导入 ${insertedCount} 条分镜`)
}

function promptFor(shot: Shot) {
  return composePrompt(state.globalConfig, { ...shot, text: effectiveShotText(shot) })
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function isShortcutBlocked() {
  return materialDialogVisible.value
    || globalDialogVisible.value
    || detectionDialogVisible.value
    || reviewDialogVisible.value
    || reviewSummaryVisible.value
    || groupSummaryVisible.value
    || episodeScriptDialogVisible.value
}

function handleShotCopyShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) {
    return
  }

  if (!/^[1-9]$/.test(event.key) || isShortcutBlocked() || isEditableShortcutTarget(event.target)) {
    return
  }

  const shot = activeEpisode.value?.shots[Number(event.key) - 1]

  if (!shot) {
    return
  }

  event.preventDefault()
  void copyPrompt(shot)
}

function shotCopyLabel(shot: Shot) {
  const index = activeEpisode.value?.shots.findIndex((item) => item.id === shot.id) ?? -1
  return index >= 0 ? `#${index + 1}` : '当前'
}

function isBlankShotCopyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (isEditableShortcutTarget(target)) {
    return false
  }

  return !target.closest([
    'button',
    'a',
    'pre',
    '.el-button',
    '.el-input',
    '.el-textarea',
    '.el-select',
    '.el-checkbox',
    '.el-tag',
    '.cell-title',
    '.config-line',
    '.empty-note',
    '.script-highlight-layer',
    '.script-inline-stats',
    '.shot-index',
    '.shot-index-area',
    '.shot-tools',
  ].join(','))
}

function copyPromptFromShotBlank(event: MouseEvent, shot: Shot) {
  if (!isBlankShotCopyTarget(event.target)) {
    return
  }

  event.preventDefault()
  void copyPrompt(shot)
}

async function copyPrompt(shot: Shot) {
  const copied = await copyText(promptFor(shot))

  if (copied) {
    const status = promptPreviewStatus(shot)
    const message = `已复制 ${shotCopyLabel(shot)} 提示词`

    if (status.type === 'warning') {
      ElMessage.warning(message)
    } else {
      ElMessage.success(message)
    }

    return
  }

  ElMessage.error('复制失败，请手动选择文本复制')
}

async function copyWeeklyReport(value: Date | string | null = weeklyReportWeek.value) {
  const report = buildWeeklyReport(value ?? weeklyReportWeek.value)

  if (!report) {
    ElMessage.info('选中周内暂无制作记录')
    return
  }

  const copied = await copyText(report)

  if (copied) {
    ElMessage.success('已复制周报')
    return
  }

  ElMessage.error('复制失败，请手动选择文本复制')
}

async function copyShotDetail(shot: Shot) {
  const copied = await copyText(effectiveShotText(shot))

  if (copied) {
    ElMessage.success('已复制分镜详情')
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

onMounted(() => {
  window.addEventListener('keydown', handleShotCopyShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShotCopyShortcut)
})

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


async function exportAllEpisodes() {
  const filename = `${archiveFilename()}.json`

  try {
    await saveJson(filename, exportPayload())
  } catch {
    ElMessage.error('导出失败')
  }
}

function exportPayload(): ExportPayload {
  return {
    version: state.version,
    exportedAt: new Date().toISOString(),
    episodeGroups: state.episodeGroups.map((group) => ({
      ...JSON.parse(JSON.stringify(group)),
      starred: isGroupAutoStarred(group.id),
    })) as EpisodeGroup[],
    episodes: state.episodes.map((episode) => ({
      ...JSON.parse(JSON.stringify(episode)),
      starred: isEpisodeAutoStarred(episode),
    })) as Episode[],
    globalConfigSnapshot: JSON.parse(JSON.stringify(state.globalConfig)),
  }
}

function archiveFilename() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const year = pad(now.getFullYear() % 100)
  const month = pad(now.getMonth() + 1)
  const day = pad(now.getDate())
  const hour = pad(now.getHours())
  const minute = pad(now.getMinutes())

  return `S2P ${year}年${month}月${day}日 ${hour}时${minute}分`
}

async function saveJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const pickerWindow = window as SaveFilePickerWindow

  if (pickerWindow.showSaveFilePicker) {
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      throw error
    }
  }

  downloadJson(filename, blob)
}

function downloadJson(filename: string, blob: Blob) {
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

  const batches: Array<{ fileName: string; groups: unknown; episodes: Episode[] }> = []

  for (const file of files) {
    try {
      const payload = JSON.parse(await file.text()) as Partial<ExportPayload> & { episodes?: Episode[] }
      const episodes = Array.isArray(payload.episodes) ? payload.episodes : payload.episode ? [payload.episode] : []

      if (!episodes.length) {
        throw new Error('invalid episode')
      }

      batches.push({ fileName: file.name, groups: payload.episodeGroups, episodes })
    } catch {
      ElMessage.error(`导入失败：${file.name} 格式不正确或缺少单集数据`)
    }
  }

  if (!batches.length) {
    return
  }

  const importMode = await selectImportMode()

  if (!importMode) {
    return
  }

  if (importMode === 'replace') {
    state.episodeGroups = []
    state.episodes = []
    state.activeEpisodeId = ''
    selectedEpisodeGroupId.value = null
    expandedGroupIds.value = ['ungrouped']
  }

  let importedCount = 0
  const existingEpisodeSignatures = new Set(state.episodes.map((episode) => episodeComparableSignature(episode)))

  batches.forEach((batch) => {
    const importedGroups = normalizeImportedEpisodeGroups(batch.groups)
    const groupIdMap = new Map(importedGroups.map((group) => [group.sourceId, group.group.id]))
    const importedEpisodes = batch.episodes.map((episode) => normalizeImportedEpisode(episode, groupIdMap))
    const episodesToImport = importMode === 'replace'
      ? importedEpisodes
      : importedEpisodes.filter((episode) => {
        const signature = episodeComparableSignature(episode)

        if (existingEpisodeSignatures.has(signature)) {
          return false
        }

        existingEpisodeSignatures.add(signature)
        return true
      })
    const usedGroupIds = new Set(episodesToImport.map((episode) => episode.groupId).filter((id): id is string => Boolean(id)))

    importedGroups
      .filter(({ group }) => usedGroupIds.has(group.id))
      .forEach(({ group }) => {
        const sameTitleGroup = importMode === 'merge' ? state.episodeGroups.find((item) => item.title === group.title && item.archived === group.archived) : null

        if (sameTitleGroup) {
          episodesToImport.forEach((episode) => {
            if (episode.groupId === group.id) {
              episode.groupId = sameTitleGroup.id
            }
          })
          return
        }

        state.episodeGroups.push(group)
        expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, group.archived ? archivedTreeId : group.id]))
      })

    episodesToImport.forEach((episode) => {
      state.episodes.push(episode)
      selectEpisode(episode)
      importedCount += 1
    })
  })

  if (!state.episodes.length) {
    const episode = createEpisode(1)
    state.episodes = [episode]
    selectEpisode(episode)
  }

  if (importedCount) {
    ElMessage.success(`已导入 ${importedCount} 个剧本`)
  } else {
    ElMessage.info('没有可导入的新剧本')
  }
}

async function selectImportMode(): Promise<ImportMode | null> {
  try {
    await ElMessageBox.confirm('请选择导入方式。全部替换会删除当前所有旧数据；新旧合并会跳过完全相同的单集。', '导入数据', {
      type: 'warning',
      confirmButtonText: '全部替换',
      cancelButtonText: '新旧合并',
      distinguishCancelAndClose: true,
    })
    return 'replace'
  } catch (action) {
    return action === 'cancel' ? 'merge' : null
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

function episodeComparableSignature(episode: Episode) {
  return JSON.stringify({
    title: episode.title,
    characters: episode.characters,
    scenes: episode.scenes,
    props: episode.props,
    productionData: episode.productionData,
    scriptText: episode.scriptText,
    shots: episode.shots.map((shot) => ({
      text: shot.text,
      remark: shot.remark,
      connectPrevious: shot.connectPrevious,
      connectNext: shot.connectNext,
      scenes: shot.scenes.map((scene) => ({ name: scene.name, time: scene.time, space: scene.space })),
      usePositionReference: shot.usePositionReference,
      characters: shot.characters.map((character) => ({
        name: character.name,
        includeVoice: character.includeVoice,
        statusText: character.statusText ?? '',
      })),
      status: shot.status,
      review: normalizePromptReview(shot.review),
    })),
  })
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

function normalizeImportedShotScenes(scenes: unknown, assets: SceneAsset[]): SceneConfig[] {
  if (!Array.isArray(scenes)) {
    return [createSceneConfig()]
  }

  const normalized = scenes
    .map((scene) => normalizeImportedShotScene(scene, assets))
    .filter((scene): scene is SceneConfig => Boolean(scene))

  return normalized.length ? normalized : [createSceneConfig()]
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
          starred: Boolean(value.starred),
          archived: Boolean(value.archived),
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
    productionData: normalizeEpisodeProductionData(episode.productionData),
    scriptText: typeof episode.scriptText === 'string' ? episode.scriptText : '',
    shots: shots.map((shot) => ({
      ...createShot(),
      ...shot,
      id: createId('shot'),
      remark: typeof shot.remark === 'string' ? shot.remark : '',
      connectPrevious: Boolean(shot.connectPrevious),
      connectNext: Boolean(shot.connectNext),
      pendingDetection: null,
      autoSyncNotice: null,
      undoCharacters: null,
      review: normalizePromptReview(shot.review),
      scenes: normalizeImportedShotScenes(shot.scenes, scenes),
      characters: Array.isArray(shot.characters)
        ? shot.characters.map((character) => ({ ...character, id: createId('character') }))
        : [],
    })),
  }
}
</script>
