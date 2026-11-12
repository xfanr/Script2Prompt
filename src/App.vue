<template>
  <el-config-provider>
    <div class="app-shell" :inert="isReplacing">
      <el-alert v-if="saveError" class="storage-save-error" type="error" :closable="false" show-icon title="更改尚未保存">
        <div>{{ saveError }}</div>
        <el-button size="small" @click="saveNow">重试保存</el-button>
        <el-button size="small" @click="exportAllEpisodes">导出备份</el-button>
      </el-alert>
      <input ref="fileInputRef" class="file-input" type="file" accept="application/json,.json" multiple @change="importEpisode" />

      <div class="workspace">
        <header class="workspace-header" :class="{ 'is-library': workspaceView === 'library' }">
          <div class="workspace-header-left">
            <section class="sidebar-brand">
              <div class="brand-mark"><img :src="brandIconUrl" alt="Script2Prompt" /></div>
              <div class="brand-text">
                <strong>短剧工作台</strong>
                <el-tooltip v-if="pendingResults.total > 0" placement="bottom">
                  <template #content>
                    <div v-for="description in pendingResults.descriptions" :key="description">{{ description }}</div>
                  </template>
                  <span class="brand-pending-results">{{ pendingResults.total }}</span>
                </el-tooltip>
                <span v-else>Script2Prompt</span>
              </div>
            </section>
            <nav v-if="workspaceView === 'editor' && activeEpisode" class="stage-page-title" aria-label="剧集导航">
              <el-button :icon="HomeBackIcon" text aria-label="返回主页" title="返回主页" @click="returnToLibrary" />
              <el-dropdown class="stage-group-switch" trigger="click" popper-class="stage-title-switch-dropdown" @command="switchActiveEpisodeGroup">
                <button class="stage-title-switch-trigger" type="button" title="切换剧本" aria-label="切换剧本">
                  <span>《{{ getEpisodeGroupTitle(activeEpisode.groupId) }}》</span>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="group in sortedEpisodeGroups"
                      :key="group.id"
                      :command="group.id"
                      :disabled="group.id === activeEpisode.groupId || !hasEpisodesInGroup(group.id)"
                    >
                      <span class="stage-title-switch-option">《{{ group.title }}》<small v-if="!hasEpisodesInGroup(group.id)">无单集</small></span>
                      <el-icon v-if="group.id === activeEpisode.groupId" class="stage-title-switch-check"><Check /></el-icon>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <button class="stage-title-switch-trigger stage-episode-nav" type="button" title="上一集" aria-label="上一集" :disabled="activeGroupEpisodeIndex <= 0" @click="switchRelativeEpisode(-1)"><el-icon><GoStart /></el-icon></button>
              <el-dropdown ref="episodeSwitchDropdownRef" trigger="click" :hide-on-click="false" popper-class="episode-switch-dropdown" @command="switchActiveEpisode" @visible-change="handleEpisodeSwitchVisibleChange">
                <button class="stage-title-switch-trigger" type="button" title="切换集数" aria-label="切换集数"><span>{{ activeEpisode.title }}</span></button>
                <template #dropdown>
                  <div class="episode-switch-panel">
                    <form v-if="!isArchivedEpisodeGroupId(activeEpisode.groupId)" class="episode-switch-add" @submit.prevent="addEpisodesFromMenu(1)" @keydown.stop>
                      <el-input ref="episodeStartInputRef" v-model="episodeStartNumber" inputmode="numeric" placeholder="输入起始集号" aria-label="起始集号" :formatter="filterEpisodeNumberInput" :parser="filterEpisodeNumberInput" @keydown.esc.stop="episodeSwitchDropdownRef?.handleClose()" />
                      <div class="episode-add-actions">
                        <el-button v-for="count in [5, 4, 3, 2, 1]" :key="count" type="primary" plain size="small" :disabled="!episodeStartNumber" @click="addEpisodesFromMenu(count)">+{{ count }}</el-button>
                      </div>
                    </form>
                    <div class="episode-manager-list">
                      <el-dropdown-menu>
                        <el-dropdown-item v-for="episode in activeGroupEpisodes" :key="episode.id" :command="episode.id" class="episode-manager-row" :class="{ active: episode.id === activeEpisode.id }">
                          <div v-if="editingEpisodeId === episode.id" class="rename-inline" data-rename-kind="episode" :data-rename-id="episode.id" @click.stop @keydown.stop>
                            <el-input v-model="editingEpisodeNumber" inputmode="numeric" aria-label="集号" :formatter="filterEpisodeNumberInput" :parser="filterEpisodeNumberInput" @keyup.enter="finishEpisodeRename(episode)" />
                            <el-button :icon="Check" type="success" aria-label="确认命名" @click="finishEpisodeRename(episode)" />
                            <el-button :icon="Close" type="danger" aria-label="取消命名" @click="cancelEpisodeRename(episode)" />
                          </div>
                          <template v-else>
                            <span class="stage-title-switch-option">{{ episode.title }}{{ isEpisodeAutoStarred(episode) ? ' ⭐️' : '' }}</span>
                            <el-icon v-if="episode.id === activeEpisode.id" class="stage-title-switch-check"><Check /></el-icon>
                            <el-dropdown trigger="click" popper-class="episode-switch-actions" @command="handleEpisodeCommand($event, episode)" @click.stop>
                              <el-button class="sidebar-row-action-button" :icon="MoreFilled" text aria-label="更多单集操作" @click.stop />
                              <template #dropdown><el-dropdown-menu>
                                <el-dropdown-item command="summary" :icon="DataAnalysis">数据</el-dropdown-item>
                                <el-dropdown-item command="edit" :icon="EditPen">命名</el-dropdown-item>
                                <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                              </el-dropdown-menu></template>
                            </el-dropdown>
                          </template>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </div>
                  </div>
                </template>
              </el-dropdown>
              <button class="stage-title-switch-trigger stage-episode-nav" type="button" title="下一集" aria-label="下一集" :disabled="activeGroupEpisodeIndex < 0 || activeGroupEpisodeIndex >= activeGroupEpisodes.length - 1" @click="switchRelativeEpisode(1)"><el-icon><GoEnd /></el-icon></button>
            </nav>
          </div>
          <nav v-if="workspaceView === 'library'" class="project-section-menu" aria-label="项目分类">
            <el-button v-for="section in projectSections" :key="section.id" text :icon="projectSection === section.id ? section.filledIcon : section.icon" :aria-pressed="projectSection === section.id" @click="selectProjectSection(section.id)">{{ section.title }}</el-button>
          </nav>
          <nav v-else-if="activeEpisode" class="stage-header" aria-label="工作区菜单">
                <el-button-group class="stage-title-data-actions">
                  <el-button :icon="Notebook" text @click="openGroupSummary(activeEpisode.groupId ?? 'ungrouped')">全剧</el-button>
                  <el-button :icon="Document" text @click="openReviewSummary(activeEpisode)">分集</el-button>
                </el-button-group>
              <el-divider direction="vertical" />
              <div class="stage-page-actions">
                <el-button-group class="stage-action-group">
                  <el-button :icon="MaterialTabIcon" text @click="openEpisodeScriptDialog('materials')">素材</el-button>
                  <el-button :icon="ShotTabIcon" text @click="openEpisodeScriptDialog('shots')">分镜</el-button>
                  <el-dropdown class="dialogue-episode-dropdown" split-button trigger="hover" :button-props="{ text: true }" @click="openDialogueDialog(activeEpisode)" @command="openDialogueDialog">
                    <el-icon><DialogueTabIcon /></el-icon><span>台词</span>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-for="episode in activeGroupEpisodes" :key="episode.id" :command="episode">{{ episode.title }}</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </el-button-group>
              </div>
          </nav>
          <div class="brand-tools" role="group" aria-label="积分与设置">
            <el-tooltip :content="String(remainingPoints)" placement="bottom">
              <el-button class="header-points-button" :icon="PointBalanceIcon" text aria-label="积分记录" @click="openPointLedger">{{ remainingPointsLabel }}</el-button>
            </el-tooltip>
            <el-divider direction="vertical" />
            <el-button class="theme-switch" :icon="isDarkMode ? Moon : Sunny" text circle :title="isDarkMode ? '切换浅色模式' : '切换深色模式'" :aria-label="isDarkMode ? '切换浅色模式' : '切换深色模式'" @click="setDarkMode(!isDarkMode)" />
            <el-button
              class="global-config-icon"
              :icon="Setting"
              circle
              title="全局配置"
              aria-label="全局配置"
              @click="openGlobalDialog"
            />
          </div>
        </header>

        <main v-if="workspaceView === 'library'" ref="projectLibraryRef" class="project-library" aria-label="剧本管理" @scroll="rememberProjectScroll">
          <div class="project-library-content">
            <div class="project-library-toolbar">
              <h2>{{ projectSearchKeyword ? '搜索结果' : projectSections.find(section => section.id === projectSection)?.title }}</h2>
              <div class="project-library-tools">
                <el-tooltip content="从云端下载" placement="bottom"><el-button :icon="Download" text circle aria-label="从云端下载" :loading="webDavAction === 'download'" :disabled="Boolean(webDavAction)" @click="requestWebDavTransfer('download')" /></el-tooltip>
                <el-tooltip content="上传到云端" placement="bottom"><el-button :icon="Upload" text circle aria-label="上传到云端" :loading="webDavAction === 'upload'" :disabled="Boolean(webDavAction)" @click="requestWebDavTransfer('upload')" /></el-tooltip>
                <el-input v-model="projectSearch" class="project-search-input" :prefix-icon="Search" clearable placeholder="搜索项目" aria-label="搜索项目" />
              </div>
            </div>
            <div class="project-grid">
              <button v-if="projectSection === 'projects' && !projectSearchKeyword" class="project-card project-create-card" type="button" @click="addEpisodeGroup">
                <el-icon><AddIcon /></el-icon><span>新建剧集</span>
              </button>
              <template v-for="(card, index) in projectCards" :key="card.id">
                <h2 v-if="projectSection === 'projects' && card.group?.archived && !projectCards[index - 1]?.group?.archived" class="project-grid-section-title">归档</h2>
              <article class="project-card" :data-project-id="card.id" role="button" tabindex="0" :aria-label="`进入${card.title}`" @click="openProjectCard(card, $event)" @keydown.enter.self="openProjectCard(card, $event)" @keydown.space.self.prevent="openProjectCard(card, $event)">
                <span v-if="card.group && card.group.results.playCount >= 2000" class="project-card-medal" :class="{ 'is-warning': card.group.results.playCount < 20000 }">
                  <GroupPlayMedal class="episode-star" :play-count="card.group.results.playCount" />
                </span>
                <header class="project-card-header">
                  <div class="project-card-date">{{ card.dateRange }}</div>
                  <div class="project-card-title" :class="{ 'has-full-name': card.fullName }" :title="[card.title, card.fullName].filter(Boolean).join(' · ')">
                    <h3>{{ card.title }}</h3>
                    <template v-if="card.fullName">
                      <el-button class="project-full-name-copy" :icon="CopyDocument" text size="small" title="复制全称" aria-label="复制全称" @click.stop="copyProjectFullName(card.fullName)" />
                      <div class="project-card-full-name">{{ card.fullName }}</div>
                    </template>
                  </div>
                </header>
                <div class="project-card-body">
                  <p class="project-original-summary"><el-tooltip :disabled="!card.contacts.length" placement="left">
                    <template #content><div v-for="contact in card.contacts" :key="contact">{{ contact }}</div></template>
                    <span class="project-summary-label">{{ card.episodes.length ? `原始 ${card.episodes.length}集：` : '原始：' }}</span>
                  </el-tooltip>{{ card.originalNumbers || '无' }}</p>
                  <p class="project-split-summary"><span class="project-summary-label">{{ card.splitCount ? `拆分 ${card.splitCount}集：` : '拆分：' }}</span>{{ card.splitNumbers || '无' }}</p>
                </div>
                <footer class="project-card-footer" @click.stop>
                  <div><span>整剧成本</span><strong>{{ card.totalCost }}</strong></div>
                  <div><span>平均单集</span><strong>{{ card.averageEpisodeCost }}</strong></div>
                  <el-dropdown trigger="click" popper-class="project-card-dropdown" @command="card.group ? handleGroupCommand($event, card.group.id) : handleEpisodeCommand($event, card.episodes[0])">
                    <el-button class="project-card-more sidebar-row-action-button" :icon="MoreOneIcon" text aria-label="更多操作" @click.stop />
                    <template #dropdown>
                      <el-dropdown-menu v-if="card.group">
                        <el-dropdown-item command="summary" :icon="DataLine">数据</el-dropdown-item>
                        <el-dropdown-item command="archive" :icon="ArchiveFolder">{{ card.group.archived ? '取消归档' : '归档' }}</el-dropdown-item>
                        <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                      </el-dropdown-menu>
                      <el-dropdown-menu v-else>
                        <el-dropdown-item command="summary" :icon="DataAnalysis">数据</el-dropdown-item>
                        <el-dropdown-item command="delete" :icon="Delete">删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </footer>
              </article>
              </template>
            </div>
            <el-empty v-if="!projectCards.length && (projectSearchKeyword || projectSection !== 'projects')" :description="projectSearchKeyword ? '未找到匹配的剧集' : '暂无历史项目'" />
          </div>
        </main>

        <div v-else class="workspace-body">
        <aside class="sidebar">
            <section class="panel episode-panel material-library-panel" aria-label="素材库">
              <div class="material-library-header">
                <h2 class="material-sidebar-title">素材库</h2>
                <el-button :icon="FolderConversion" text>管理</el-button>
              </div>
              <div class="material-library-search-row">
                <el-input v-model="materialLibrarySearch" :prefix-icon="Search" clearable :placeholder="materialLibraryEpisode ? '在文件夹中搜索' : '搜索素材'" aria-label="搜索素材库" />
                <span ref="materialLibraryAddAnchorRef">
                  <el-dropdown trigger="click" :disabled="!materialLibraryEpisode" @command="openMaterialAddDialog($event, undefined, materialLibraryEpisode)">
                    <el-button :icon="AddIcon" text :disabled="!materialLibraryEpisode" aria-label="新增素材" />
                    <template #dropdown><el-dropdown-menu @click.stop>
                      <el-dropdown-item command="scenes">添加场景</el-dropdown-item>
                      <el-dropdown-item command="characters">添加角色</el-dropdown-item>
                    </el-dropdown-menu></template>
                  </el-dropdown>
                </span>
              </div>
              <el-breadcrumb class="material-library-breadcrumb" separator="/">
                <el-breadcrumb-item><button type="button" :disabled="!materialLibraryEpisode && !materialLibrarySearch.trim()" @click="openMaterialLibraryFolder(null)">全部</button></el-breadcrumb-item>
                <el-breadcrumb-item v-if="materialLibraryEpisode">{{ materialLibraryEpisode.title }}</el-breadcrumb-item>
              </el-breadcrumb>
                  <el-scrollbar :key="materialLibraryEpisodeId ?? 'all'" class="material-management-scrollbar">
                    <div v-if="!materialLibraryEpisode && !materialLibrarySearch.trim()" class="material-library-folders">
                      <button v-for="episode in activeGroupEpisodes" :key="episode.id" class="material-library-folder" type="button" @click="openMaterialLibraryFolder(episode.id)">
                        <span class="material-folder-icon" aria-hidden="true"><img :src="materialFolderIconUrl" alt="" draggable="false" /></span>
                        <span>{{ episode.title }}</span>
                      </button>
                      <div v-if="!activeGroupEpisodes.length" class="material-management-empty">暂无分集</div>
                    </div>
                    <div v-else>
                      <section v-for="section in materialLibrarySections" :key="section.episode.id" class="material-library-search-section" :aria-label="`${section.episode.title}素材`">
                        <button v-if="!materialLibraryEpisode" class="material-library-search-heading" type="button" @click="openMaterialLibraryFolder(section.episode.id)">{{ section.episode.title }}</button>
                        <div class="material-management">
                          <section v-if="section.scenes.length || (materialLibraryEpisode && materialLibrarySearch.trim())" class="material-management-section">
                            <div class="material-scene-cards">
                              <MaterialCard v-for="item in section.scenes" :key="sceneAssetKey(item)" class="material-scene-card"
                                :name="item.name" :label="`${sceneAssetLabel(item)}场景素材`" kind="scene"
                                :description="[item.time, item.space === '无' ? '' : item.space].filter(Boolean).join('·')"
                                :used="item.used" :references="item.referenceBlocks" :confirmed="section.confirmed" :reference-title="name => materialReferenceTitle(name, section.episode)"
                                @toggle="toggleMaterialConfirmation($event, section.episode)" @copy="copyMaterialReferenceName">
                                <template #actions>
                                  <el-button class="sidebar-row-action-button" :icon="EditPen" text size="small" aria-label="修改场景素材" @click="openMaterialEditDialog('scenes', sceneAssetKey(item), $event, section.episode)" />
                                  <el-popconfirm title="确认删除这条场景素材？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeMaterial('scenes', sceneAssetKey(item), section.episode)">
                                    <template #reference><el-button class="sidebar-row-action-button" :icon="Delete" text size="small" aria-label="删除场景素材" /></template>
                                  </el-popconfirm>
                                </template>
                              </MaterialCard>
                              <div v-if="materialLibraryEpisode && !section.scenes.length" class="material-management-empty">未找到场景素材</div>
                            </div>
                          </section>
                          <section v-if="section.characters.length || (materialLibraryEpisode && materialLibrarySearch.trim())" class="material-management-section">
                            <div class="material-character-cards">
                              <MaterialCard v-for="item in section.characters" :key="item.id" class="material-character-card"
                                :name="item.name" :label="`${item.name}角色素材`" kind="character" :description="item.isMain ? '主角' : item.isEnsemble ? '群像' : '配角'"
                                :used="item.used" :references="item.referenceBlocks" :confirmed="section.confirmed" :reference-title="name => materialReferenceTitle(name, section.episode)"
                                @toggle="toggleMaterialConfirmation($event, section.episode)" @copy="copyMaterialReferenceName">
                                <template #actions>
                                  <el-button class="sidebar-row-action-button" :icon="EditPen" text size="small" :aria-label="`修改角色${item.name}`" @click="openMaterialEditDialog('characters', item.name, undefined, section.episode)" />
                                  <el-popconfirm :title="section.episode.groupId ? '确认删除此角色及本剧分镜中的角色配置？' : '确认删除此角色？'" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeMaterial('characters', item.name, section.episode)">
                                    <template #reference><el-button class="sidebar-row-action-button" :icon="Delete" text size="small" :aria-label="`删除角色${item.name}`" /></template>
                                  </el-popconfirm>
                                </template>
                              </MaterialCard>
                              <div v-if="materialLibraryEpisode && !section.characters.length" class="material-management-empty">未找到角色</div>
                            </div>
                          </section>
                          <section v-if="section.custom.length" class="material-management-section" aria-label="自定义配置">
                            <div class="material-custom-cards">
                              <MaterialCard v-for="item in section.custom" :key="item.referenceBlocks[0].name" class="material-custom-card"
                                :name="item.name" :label="`${item.name}自定义素材`" kind="custom" description="引用"
                                :used="item.used" :references="item.referenceBlocks" :confirmed="section.confirmed" :reference-title="name => materialReferenceTitle(name, section.episode)"
                                @toggle="toggleMaterialConfirmation($event, section.episode)" @copy="copyMaterialReferenceName" />
                            </div>
                          </section>
                        </div>
                      </section>
                      <div v-if="!materialLibrarySections.length" class="material-management-empty">未找到素材</div>
                    </div>
                  </el-scrollbar>
            </section>
        </aside>

        <main v-if="activeEpisode" class="main-stage">
          <section ref="shotListRef" class="shot-list">
            <article
              v-for="{ shot, episode, index, order } in displayedShotCards"
              :key="shot.id"
              :id="shotRowElementId(shot.id)"
              class="shot-row"
              :class="{
                'is-complete': shot.status === 'complete',
                'is-collapsed': isShotCollapsed(shot),
                'is-even-unit': normalizeShotUnitNumber(shot.unitNumber) % 2 === 0,
                'is-same-unit-as-previous':
                  index > 0 &&
                  normalizeShotUnitNumber(episode.shots[index - 1].unitNumber) ===
                    normalizeShotUnitNumber(shot.unitNumber),
              }"
              @dblclick="copyPromptFromShotBlank($event, shot)"
            >

              <div class="shot-meta">
                <div class="shot-index-area">
                  <span
                    class="shot-index"
                    @dblclick.stop.prevent="copyShotNumber(shot)"
                  >
                    <span class="shot-order">{{ order }}</span>
                    <span class="shot-number">{{ formatShotNumber(episode, index) }}{{ linkedCurrentShotIds.has(shot.id) ? '（衔接中）' : '' }}</span>
                  </span>
                </div>
                <div class="shot-tools">
                  <el-button
                    class="shot-review-button"
                    :icon="isShotReviewed(shot) ? StarFilled : Star"
                    circle
                    type="warning"
                    :plain="!isShotReviewed(shot)"
                    size="small"
                    :title="isShotReviewed(shot) ? '编辑评分' : '填写评分'"
                    :aria-label="isShotReviewed(shot) ? '编辑评分' : '填写评分'"
                    @click="openReviewDialog(shot)"
                  />
                  <el-popconfirm title="确认删除这条分镜？" @confirm="deleteShot(shot.id)">
                    <template #actions="{ confirm }">
                      <el-button size="small" type="danger" @click="confirm($event)">删除</el-button>
                    </template>
                    <template #reference>
                      <el-button :icon="Delete" circle type="danger" size="small" title="删除分镜" aria-label="删除分镜" />
                    </template>
                  </el-popconfirm>
                </div>
              </div>

              <div v-if="!isShotCollapsed(shot)" class="shot-grid">
                <section class="shot-cell script-cell">
                  <div class="cell-title script-title">
                    <div class="script-title-main">
                      <span class="script-title-label">分镜详情</span>
                      <el-button
                        class="title-copy-button"
                        :icon="CopyDocument"
                        text
                        type="primary"
                        title="复制分镜详情"
                        aria-label="复制分镜详情"
                        @click="copyShotDetail(shot)"
                      />
                      <div class="script-title-actions">
                        <el-button class="title-copy-button" :icon="Search" text type="primary" title="识别角色" aria-label="识别角色" @click="detectShotCharacters(shot)" />
                        <el-button
                          type="primary"
                          text
                          :bg="shot.firstFrameMode"
                          :title="`${shot.firstFrameMode ? '关闭首帧' : '开启首帧'}；右键应用到本集全部分镜`"
                          :aria-label="shot.firstFrameMode ? '关闭首帧' : '开启首帧'"
                          @click="shot.firstFrameMode = !shot.firstFrameMode"
                          @contextmenu.prevent.stop="toggleEpisodeFirstFrameModeFromShot(shot)"
                        >首帧</el-button>
                      </div>
                    </div>
                    <div class="script-title-stats">
                      <el-tooltip placement="top" popper-class="timing-summary-tooltip">
                        <template #content>
                          <div class="timing-summary-lines">
                            <span>台词发音 {{ formatTimingShare(shotTimingAnalysis(shot).dialogueArticulationSeconds, shotTimingAnalysis(shot).totalSeconds) }}</span>
                            <span>标点停顿 {{ formatTimingShare(shotTimingAnalysis(shot).punctuationSeconds, shotTimingAnalysis(shot).totalSeconds) }}</span>
                            <span>异步动作 {{ formatTimingShare(shotTimingAnalysis(shot).asyncActionSeconds, shotTimingAnalysis(shot).totalSeconds) }}</span>
                            <span>同步动作 {{ shotTimingAnalysis(shot).synchronousActionCount }} 段 · 0 秒</span>
                          </div>
                        </template>
                        <el-dropdown trigger="click" @command="shot.thirtySecondMode = $event === 'SD2.5'" @dblclick.stop>
                          <el-tag
                            class="shot-mode-trigger"
                            :type="shotDurationState(shot).warn ? 'danger' : 'info'"
                            effect="light"
                            round
                            role="button"
                            tabindex="0"
                            :aria-label="`切换分镜模式，当前 ${shot.thirtySecondMode ? 'SD2.5' : 'SD2.0'}`"
                            title="点击切换模式；右键应用到本集全部分镜"
                            @contextmenu.prevent.stop="toggleEpisodeThirtySecondModeFromShot(shot)"
                          >
                            {{ shotTimingTitleStats(shot) }}
                          </el-tag>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="SD2.0" :disabled="!shot.thirtySecondMode">SD2.0</el-dropdown-item>
                              <el-dropdown-item command="SD2.5" :disabled="shot.thirtySecondMode">SD2.5</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </el-tooltip>
                    </div>
                  </div>
                  <div class="script-editor-layout">
                    <div class="script-input-wrap">
                      <div v-if="connectedPreviousText(shot, index)" class="script-context-line is-previous" aria-readonly="true">
                        <span class="script-context-text">{{ connectedPreviousText(shot, index) }}</span>
                      </div>
                      <div
                        class="script-textarea-stack"
                        @mousemove="handleTimingHighlightPointerMove($event, shot)"
                        @mouseleave="clearHoveredTimingHighlight"
                        @contextmenu="openTimingPopoverFromContextMenu($event, shot)"
                      >
                        <div :ref="(element) => setScriptHighlightRef(shot.id, element)" class="script-highlight-layer" v-html="highlightedShotText(shot)"></div>
                        <el-input
                          :ref="(input) => setScriptInputRef(shot.id, input)"
                          v-model="shot.text"
                          type="textarea"
                          :rows="9"
                          resize="vertical"
                          placeholder="输入或粘贴分镜正文，建议控制在 40～120 字。点击“识别”可匹配本集角色。"
                          @input="syncShotTimingSegments(shot)"
                        />
                      </div>
                      <div v-if="connectedNextText(shot, index)" class="script-context-line is-next" aria-readonly="true">
                        <span class="script-context-text">{{ connectedNextText(shot, index) }}</span>
                      </div>
                    </div>
                    <el-slider
                      class="shot-connection-slider"
                      :model-value="shotConnectionValue(shot, index)"
                      :min="-12"
                      :max="12"
                      :step="1"
                      range
                      vertical
                      height="100%"
                      :show-stops="false"
                      :marks="shotConnectionMarks"
                      size="small"
                      :disabled="episode.shots.length === 1"
                      :format-tooltip="formatShotConnectionTooltip"
                      aria-label="承上启下截取标点数，上滑块承上，下滑块启下"
                      @update:model-value="updateShotConnectionValue(shot, index, $event)"
                    />
                  </div>
                </section>

                <section class="shot-cell config-cell">
                  <div class="config-group character-config-group">
                    <div class="config-heading character-heading">
                      <div class="character-heading-title">
                        <span>场景与角色</span>
                        <el-button
                          class="title-copy-button"
                          :icon="CopyDocument"
                          text
                          type="primary"
                          title="复制角色配置"
                          aria-label="复制角色配置"
                          :disabled="!composeCharacterSettings(shot, assetsFor(state, episode))"
                          @click="copyCharacterSettings(shot)"
                        />
                        <el-dropdown trigger="click" @command="cloneShotCharacters(shot, $event)">
                          <el-button class="title-copy-button" :icon="CloneCharacters" text type="primary" title="克隆角色配置" aria-label="克隆角色配置" />
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item v-for="item in characterCloneSources(shot)" :key="item.shot.id" class="character-clone-source" :command="item.shot.id" :divided="item.divided" :disabled="item.shot.id === shot.id || !item.shot.characters.length">
                                {{ formatShotNumber(item.episode, item.index) }} · {{ item.shot.characters.length }} 人{{ item.adjacentLabel ? ` · ${item.adjacentLabel}` : '' }}
                              </el-dropdown-item>
                              <el-dropdown-item v-if="!characterCloneSources(shot).some((item) => item.shot.id !== shot.id && item.shot.characters.length)" disabled>暂无可克隆的角色配置</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                      <div class="character-heading-actions">
                        <el-dropdown trigger="click" popper-class="character-add-dropdown" max-height="min(320px, calc(100vh - 32px))" @command="addCharacterToShot(shot, $event)">
                          <el-button class="title-copy-button" :icon="AddIcon" text type="primary" title="添加角色" aria-label="添加角色" />
                          <template #dropdown>
                            <el-dropdown-menu class="character-add-menu" :class="{ 'has-three-columns': availableCharacterAssets(shot).length > 8 }">
                              <template v-for="group in groupCharactersByType(availableCharacterAssets(shot))" :key="group.value">
                                <li class="character-add-group-heading el-select-group__title" role="presentation"><el-icon aria-hidden="true"><component :is="group.icon" /></el-icon><span>{{ group.label }}</span></li>
                                <el-dropdown-item v-for="item in group.items" :key="item.name" :command="item.name">
                                  <span class="character-add-name" :title="item.name">{{ item.name }}</span>
                                </el-dropdown-item>
                              </template>
                              <el-dropdown-item v-if="!availableCharacterAssets(shot).length" class="character-add-empty" disabled>暂无可添加的角色</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                        <el-dropdown trigger="click" @command="removeCharacterFromShot(shot, $event)">
                          <el-button class="title-copy-button" :icon="Delete" text type="primary" title="删除角色" aria-label="删除角色" :disabled="!shot.characters.length" />
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item v-for="character in shot.characters" :key="character.id" :command="character.id">{{ character.name }}</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                    </div>
                    <div v-for="scene in shot.scenes" :key="scene.id" class="config-line scene-line">
                      <div class="scene-selection-controls scene-reference-controls">
                        <el-select v-if="shot.usePositionReference" popper-class="shot-reference-dropdown" :model-value="referenceSelectionId(episode, index)" :aria-label="`分镜${index + 1}引用序号`" @update:model-value="selectShotReference(shot, $event)">
                          <template #prefix>
                            <button class="scene-reference-copy" type="button" title="复制引用序号" aria-label="复制引用序号" @click.stop="copySceneReference(shot, scene)"><el-icon><CopyDocument /></el-icon></button>
                          </template>
                          <el-option-group v-for="source in continuousEpisodes(state.episodes, episode)" :key="source.id" label="">
                            <el-option v-for="(sourceShot, sourceIndex) in source.shots" :key="sourceShot.id" :label="formatShotNumber(source, sourceIndex)" :value="sourceShot.id" />
                          </el-option-group>
                        </el-select>
                        <el-input v-else :model-value="scene.name ? sceneReferenceName(scene) : ''" readonly aria-label="场景引用名称" :title="scene.name ? sceneReferenceName(scene) : ''">
                          <template #prefix>
                            <button class="scene-reference-copy" type="button" title="复制场景引用" aria-label="复制场景引用" :disabled="!scene.name" @click.stop="copySceneReference(shot, scene)"><el-icon><CopyDocument /></el-icon></button>
                          </template>
                        </el-input>
                        <el-button :icon="PositionReference" :type="shot.usePositionReference ? 'primary' : undefined" :aria-pressed="shot.usePositionReference" aria-label="多角色位置参考" :title="shot.usePositionReference ? '关闭多角色位置参考' : '开启多角色位置参考'" @click="shot.usePositionReference = !shot.usePositionReference" />
                      </div>
                      <div class="scene-detail-controls">
                        <el-select :model-value="scene.name ? sceneAssetKey(scene) : ''" placeholder="选择场景" aria-label="选择场景" @change="syncSceneFromAsset(scene, $event, episode)">
                          <template #label="{ label }">{{ scene.name ? sceneAssetLabel(scene) : label }}</template>
                          <el-option v-for="item in episode.scenes" :key="sceneAssetKey(item)" :label="sceneAssetLabel(item)" :value="sceneAssetKey(item)" />
                        </el-select>
                        <el-popover trigger="click" placement="bottom-end" :width="280" popper-class="scene-status-popover">
                          <template #reference>
                            <el-button class="scene-status-button" :icon="SceneStatus" :type="scene.statusText?.trim() ? 'primary' : undefined" plain :title="scene.statusText?.trim() || '场景状态'" aria-label="场景状态" />
                          </template>
                          <el-input v-model="scene.statusText" class="scene-status-input" type="textarea" :rows="3" resize="vertical" placeholder="场景状态" aria-label="场景状态" />
                        </el-popover>
                      </div>
                      <el-button
                        class="config-edit-button"
                        :icon="EditPen"
                        type="primary"
                        text
                        size="small"
                        title="修改场景素材"
                        aria-label="修改场景素材"
                        :disabled="!episode.scenes.some((item) => sceneAssetKey(item) === sceneAssetKey(scene))"
                        @click="openMaterialEditDialog('scenes', sceneAssetKey(scene), $event, episode)"
                      />
                    </div>
                    <VueDraggable
                      v-model="shot.characters"
                      class="character-config-list"
                      :animation="150"
                      :bubble-scroll="false"
                      handle=".character-drag-handle"
                      ghost-class="character-drag-ghost"
                    >
                      <div v-if="!shot.characters.length" class="empty-note">暂无角色配置</div>
                      <div v-for="character in shot.characters" :key="character.id" class="config-line character-line">
                      <el-button
                        class="character-drag-handle"
                        :icon="Sort"
                        text
                        type="primary"
                        title="拖拽排序"
                        aria-label="拖拽排序"
                      />
                      <div class="character-identity-controls">
                        <el-input :model-value="character.name" class="character-name-input" readonly aria-label="角色名称">
                          <template #prefix>
                            <el-tooltip
                              :content="characterAppearanceInfo(character.name, shot).description"
                              :disabled="!characterAppearanceInfo(character.name, shot).description"
                              placement="top"
                              popper-class="character-appearance-tooltip"
                            >
                              <el-icon
                                class="character-appearance-icon"
                                :class="{ 'has-description': Boolean(characterAppearanceInfo(character.name, shot).description) }"
                                :aria-label="characterAppearanceInfo(character.name, shot).description ? '查看形象描述' : '暂无形象描述'"
                              >
                                <component :is="characterAppearanceInfo(character.name, shot).icon" />
                              </el-icon>
                            </el-tooltip>
                          </template>
                          <template #append>
                            <el-button
                              :disabled="isEnsembleCharacter(character.name, episode)"
                              :type="isEnsembleCharacter(character.name, episode) ? undefined : !shot.thirtySecondMode && isVoiceOverflow(shot) && character.includeVoice ? 'danger' : character.includeVoice ? 'primary' : undefined"
                              :icon="!isEnsembleCharacter(character.name, episode) && character.includeVoice ? Microphone : Mute"
                              :title="isEnsembleCharacter(character.name, episode) ? '角色群像不使用音色' : characterVoiceDescription(character.name, episode) || (character.includeVoice ? '关闭音色' : '开启音色')"
                              :aria-label="isEnsembleCharacter(character.name, episode) ? '角色群像不使用音色' : character.includeVoice ? '关闭音色' : '开启音色'"
                              @click="character.includeVoice = !character.includeVoice"
                            />
                          </template>
                        </el-input>
                      </div>
                      <el-input
                        v-model="character.statusText"
                        class="character-status-input"
                        placeholder="输入角色状态"
                      >
                        <template #suffix>
                          <el-icon v-if="!character.name.trim()" class="status-sync-suffix-icon is-disabled" title="请先选择角色" aria-label="请先选择角色"><Refresh /></el-icon>
                          <el-popconfirm v-else title="请选择同名角色状态的同步范围">
                            <template #actions="{ confirm }">
                              <el-button size="small" @click="syncCharacterStatus(shot, character, 'unit'); confirm($event)">本单元</el-button>
                              <el-button size="small" type="primary" @click="syncCharacterStatus(shot, character, 'all'); confirm($event)">全部</el-button>
                            </template>
                            <template #reference>
                              <el-icon class="status-sync-suffix-icon" title="同步同名角色状态" aria-label="同步同名角色状态"><Refresh /></el-icon>
                            </template>
                          </el-popconfirm>
                        </template>
                      </el-input>
                      <el-button
                        class="config-edit-button"
                        :icon="EditPen"
                        type="primary"
                        text
                        size="small"
                        title="修改角色"
                        aria-label="修改角色"
                        :disabled="!assetsFor(state, episode).some((item) => item.name === character.name)"
                        @click="openMaterialEditDialog('characters', character.name, undefined, episode)"
                      />
                      </div>
                    </VueDraggable>
                  </div>
                </section>

                <section class="shot-cell preview-cell">
                  <div class="cell-title preview-title">
                    <span class="preview-title-label">
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
                      完整提示词
                      <el-button
                        class="title-copy-button"
                        :icon="CopyDocument"
                        text
                        type="primary"
                        title="复制完整提示词"
                        aria-label="复制完整提示词"
                        @click="copyPrompt(shot)"
                      />
                    </span>
                  </div>
                  <pre>{{ promptFor(shot) }}</pre>
                </section>
              </div>
            </article>
            <div ref="neighborScrollSpacerRef" class="neighbor-scroll-spacer" style="flex: 0 0 0px" aria-hidden="true"></div>
          </section>
          <nav class="shot-navigation-bar" aria-label="分镜导航">
            <div class="shot-view-controls">
              <div class="shot-navigation-leading">
                <el-button text circle :icon="Expand" :bg="state.shotViewMode === 'single-expanded'" title="手风琴模式" aria-label="手风琴模式" :aria-pressed="state.shotViewMode === 'single-expanded'" @click="toggleShotAccordion" />
                <el-button text circle :icon="PreviousEpisodeUnit" :bg="activeEpisode.showPreviousEpisodeUnit" :disabled="Boolean(previousEpisodeUnit.reason)" :title="previousEpisodeUnit.reason || '衔接上集单元'" aria-label="衔接上集单元" :aria-pressed="activeEpisode.showPreviousEpisodeUnit" @click="toggleNeighborUnit(-1)" />
              </div>
              <ShotViewSelector
                :state="state"
                :options="shotViewModeOptions"
                @change="handleShotViewModeChange"
              />
              <el-button text circle :icon="NextEpisodeUnit" :bg="activeEpisode.showNextEpisodeUnit" :disabled="Boolean(nextEpisodeUnit.reason)" :title="nextEpisodeUnit.reason || '衔接下集单元'" aria-label="衔接下集单元" :aria-pressed="activeEpisode.showNextEpisodeUnit" @click="toggleNeighborUnit(1)" />
            </div>
          </nav>
          <span ref="timingPopoverAnchorRef" class="timing-popover-anchor" :style="timingPopoverAnchorStyle" aria-hidden="true"></span>
          <el-popover
            :visible="timingPopoverVisible"
            :virtual-ref="timingPopoverAnchorRef"
            virtual-triggering
            placement="bottom-start"
            :width="activeTimingSegment?.kind === 'action' ? 322 : 286"
            popper-class="timing-config-popover"
          >
            <div
              v-if="activeTimingSegment"
              class="timing-config-panel"
            >
              <template v-if="activeTimingSegment.kind === 'dialogue'">
                <div class="timing-config-heading">
                  <span>台词语速</span>
                  <em>{{ activeTimingSegment.sourceText }}</em>
                </div>
                <el-segmented
                  :model-value="activeTimingSegment.speechRate"
                  :options="speechRateOptions"
                  block
                  @change="updateActiveSpeechRate"
                />
                <div v-if="activeDialogueTiming" class="timing-config-result">
                  发音 {{ activeDialogueTiming.articulationSeconds.toFixed(1) }} 秒 + 停顿 {{ activeDialogueTiming.pauseSeconds.toFixed(1) }} 秒 = {{ activeDialogueTiming.totalSeconds.toFixed(1) }} 秒
                </div>
              </template>
              <template v-else>
                <div class="timing-config-heading">
                  <span>动作计时</span>
                  <em>{{ activeTimingSegment.sourceText }}</em>
                </div>
                  <div class="timing-config-row">
                    <span>镜头数</span>
                    <el-segmented
                      :model-value="activeTimingSegment.shotCount"
                      :options="actionShotCountOptions"
                      @change="updateActiveShotCount"
                    />
                  </div>
                  <div class="timing-config-row">
                    <span>单镜时长</span>
                    <el-segmented
                      :model-value="activeTimingSegment.secondsPerShot"
                      :options="actionSecondsPerShotOptions"
                      @change="updateActiveSecondsPerShot"
                    />
                  </div>
                  <div class="timing-config-result">
                    {{ activeTimingSegment.shotCount }} 镜 × {{ activeTimingSegment.secondsPerShot }} 秒 = {{ activeTimingSegment.shotCount * activeTimingSegment.secondsPerShot }} 秒
                  </div>
              </template>
            </div>
          </el-popover>
        </main>
        </div>
      </div>
    </div>

      <GlobalConfigDialog
        v-model="globalDialogVisible"
        :config="state.globalConfig"
        :web-dav-settings="webDavSettings"
        :web-dav-action="webDavAction"
        @save="saveGlobalConfig"
        @webdav-save="saveWebDavConnection"
        @webdav-test="testWebDav"
        @webdav-migrate="migrateWebDav"
      />
      <el-dialog v-model="webDavAuthVisible" title="WebDAV 验证" width="400px" :before-close="closeWebDavAuth" @opened="webDavAuthPasswordRef?.focus()">
        <el-form id="webdav-auth-form" name="webdav-auth" method="post" autocomplete="on" label-position="top" :disabled="webDavAuthSubmitting" @submit.prevent="continueWebDavTransfer">
          <el-form-item label="用户名" for="webdav-auth-username">
            <el-input id="webdav-auth-username" v-model="webDavAuthUsername" name="username" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码" for="webdav-auth-password">
            <el-input id="webdav-auth-password" ref="webDavAuthPasswordRef" v-model="webDavAuthPassword" name="password" type="password" autocomplete="current-password" show-password />
          </el-form-item>
          <el-alert v-if="webDavAuthError" :title="webDavAuthError" type="error" :closable="false" show-icon />
        </el-form>
        <template #footer>
          <el-button :disabled="webDavAuthSubmitting" @click="closeWebDavAuth">取消</el-button>
          <el-button type="primary" native-type="submit" form="webdav-auth-form" :loading="webDavAuthSubmitting">{{ pendingWebDavTransfer === 'download' ? '继续下载' : '继续上传' }}</el-button>
        </template>
      </el-dialog>
      <PointLedgerDialog v-model="pointLedgerVisible" :invoices="state.pointInvoices" :episodes="state.episodes" :episode-groups="state.episodeGroups" @save="savePointInvoices" />
      <el-drawer v-model="detectionDialogVisible" title="角色识别冲突" size="380px" direction="ltr" :modal="false" :show-close="false" modal-class="dismissible-drawer-overlay" append-to-body class="app-drawer detection-dialog" @closed="cancelActiveDetection">
        <div v-if="detectionConflict" class="detection-compare">
          <div class="detection-compare-row">
            <span>当前配置</span>
            <div>
              <el-tag v-for="name in detectionConflict.currentNames" :key="`current-${name}`" effect="plain" type="info">{{ name }}</el-tag>
              <span v-if="!detectionConflict.currentNames.length" class="empty-note">无</span>
            </div>
          </div>
          <div class="detection-compare-row">
            <span>识别结果</span>
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
          <el-button :disabled="!detectionMergeChanged()" @click="mergeActiveDetection">合并角色</el-button>
          <el-button type="primary" :disabled="!detectionReplaceChanged()" @click="replaceActiveDetection">替换角色</el-button>
        </template>
      </el-drawer>
      <component
        :is="dataDialogView === 'shot' ? ElDrawer : ElDialog"
        v-model="dataDialogVisible"
        :title="dataDialogTitle"
        v-bind="dataDialogView === 'shot' ? { size: '380px', direction: 'ltr', modal: false, modalClass: 'dismissible-drawer-overlay', appendToBody: true } : { width: '820px' }"
        :show-close="false"
        class="data-dialog"
        :class="{ 'app-drawer review-dialog': dataDialogView === 'shot', 'review-summary-dialog': dataDialogView === 'episode', 'group-summary-dialog': dataDialogView === 'group' }"
        @closed="clearDataDialogContext"
      >
        <template #header="{ titleId, titleClass }">
          <span :id="titleId" :class="titleClass" role="heading" aria-level="2">{{ dataDialogTitle }}</span>
          <el-breadcrumb separator="/" class="data-dialog-breadcrumb">
            <el-breadcrumb-item>
              <el-button v-if="dataDialogView !== 'group'" link @click="openGroupSummary(dataDialogGroupId)">《{{ dataDialogGroupTitle }}》</el-button>
              <span v-else class="data-dialog-breadcrumb-current">《{{ dataDialogGroupTitle }}》</span>
            </el-breadcrumb-item>
            <el-breadcrumb-item v-if="dataDialogEpisode">
              <el-button v-if="dataDialogView === 'shot'" link @click="openReviewSummary(dataDialogEpisode)">{{ dataDialogEpisode.title }}</el-button>
              <span v-else class="data-dialog-breadcrumb-current">{{ dataDialogEpisode.title }}</span>
            </el-breadcrumb-item>
            <el-breadcrumb-item v-if="dataDialogView === 'shot'"><span class="data-dialog-breadcrumb-current">分镜 {{ reviewShotNumber }}</span></el-breadcrumb-item>
          </el-breadcrumb>
        </template>
        <template v-if="dataDialogView === 'shot'">
          <el-form class="dialog-form-width-limit review-form" label-position="top">
          <el-form-item label="自动评分">
            <el-rate
              :model-value="reviewDraft.rating"
              disabled
              show-text
              :texts="reviewRateTexts"
              :low-threshold="2"
            />
          </el-form-item>
          <el-form-item label="抽卡次数">
              <el-radio-group v-model="reviewDrawCountMode" class="review-choice-field" @change="selectReviewDrawCountMode">
                <el-radio-button v-for="count in reviewDrawCountOptions" :key="count" :value="count">{{ count }}</el-radio-button>
              <el-input-number
                v-model="reviewCustomDrawCount"
                :min="1"
                :max="8"
                :step="0.5"
                step-strictly
                :controls="false"
                placeholder="输入"
                aria-label="自定义抽卡次数"
                @focus="reviewDrawCountMode = ''"
                @input="updateReviewCustomDrawCount"
                @blur="finalizeReviewDrawCountInput"
              />
              </el-radio-group>
          </el-form-item>
          <el-form-item label="备注">
            <div class="review-note-field">
                <el-cascader
                  v-model="reviewNotePrefixPath"
                  :options="reviewNoteCascaderOptions"
                  :props="reviewNoteCascaderProps"
                  separator=" → "
                  placeholder="选择备注前缀"
                  clearable
                  @change="updateReviewNotePrefix"
                />
              <el-input v-model="reviewDraft.note" placeholder="输入评分备注" clearable />
            </div>
          </el-form-item>
          </el-form>
        </template>
        <template v-else-if="dataDialogView === 'episode'">
        <div v-if="reviewSummaryEpisode" class="episode-summary-cards">
          <section class="episode-summary-card episode-date-card">
            <el-statistic title="制作日期" :value="0" :formatter="formatEpisodeProductionDate" />
          </section>
          <section class="episode-summary-card episode-cost-card">
            <el-statistic title="本集成本" :value="Number(episodeTotalCost.toFixed(1))" :precision="1" />
            <div class="episode-statistic-detail">
              <span>平均分镜成本 {{ (reviewSummary.total ? episodeTotalCost / reviewSummary.total : 0).toFixed(1) }}</span>
            </div>
          </section>
          <section class="episode-summary-card">
            <el-statistic title="平均分" :value="reviewSummary.averageValue" :precision="1" />
            <el-rate
              class="episode-average-rate"
              :class="{ muted: reviewSummary.averageValue <= 2 }"
              :model-value="reviewSummary.averageValue"
              size="small"
              disabled
              allow-half
              :max="5"
            />
          </section>
          <section class="episode-summary-card draw-success-card">
            <el-statistic title="抽卡成功率" :value="reviewSummary.drawSuccessRateValue">
              <template #suffix>%</template>
            </el-statistic>
            <div class="episode-statistic-detail">
              <span>总分镜数 {{ reviewSummary.total }}</span>
              <span>总抽卡数 {{ reviewSummary.drawTotal }}</span>
            </div>
          </section>
        </div>
        <el-table :data="reviewSummaryRows" max-height="430" empty-text="暂无分镜">
          <el-table-column prop="index" label="分镜编号" width="112" />
          <el-table-column label="评分" width="110">
            <template #default="{ row }">{{ row.ratingText }}</template>
          </el-table-column>
          <el-table-column label="抽卡次数" width="86">
            <template #default="{ row }">{{ row.drawCount }} 次</template>
          </el-table-column>
          <el-table-column prop="noteText" label="备注" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="84" fixed="right" align="center" header-align="center">
            <template #default="{ row }">
              <el-link type="primary" href="#" @click.prevent="openReviewDialog(row.shot, true)">编辑</el-link>
            </template>
          </el-table-column>
        </el-table>
        </template>
        <template v-else>
        <div class="group-summary-heading">
          <p class="group-summary-subtitle"><GroupPlayMedal :play-count="activeGroupSummary?.results.playCount" />{{ groupSummarySubtitle }}</p>
          <div class="group-summary-flags">
            <el-checkbox v-model="groupProductionOptions.colorGrading" size="small">调色</el-checkbox>
            <el-checkbox v-model="groupProductionOptions.filter" size="small">滤镜</el-checkbox>
            <el-dropdown trigger="click" @command="groupPromptProfileId = $event">
              <el-link class="group-summary-profile" underline="never" aria-label="提示词方案">{{ promptProfileOptions.find(profile => profile.value === groupPromptProfileId)?.label }}</el-link>
              <template #dropdown><el-dropdown-menu>
                <el-dropdown-item v-for="profile in promptProfileOptions" :key="profile.value" :command="profile.value" :disabled="profile.value === groupPromptProfileId">{{ profile.label }}</el-dropdown-item>
              </el-dropdown-menu></template>
            </el-dropdown>
            <el-segmented
              v-model="groupProductionOptions.referenceMode"
              :options="referenceModeOptions"
              class="reference-mode-segmented"
              size="small"
              aria-label="引用模式"
            />
          </div>
        </div>
        <div v-if="activeGroupSummary" class="group-summary-inputs">
          <div class="group-summary-options">
            <div v-if="activeGroupSummary" class="group-summary-reward">
              <el-select :model-value="groupResultTier?.playCount" :placeholder="groupResultPlaceholder" size="default" clearable aria-label="播放与提成档位" @change="updateGroupResultTier">
                <template #prefix><span class="group-summary-select-prefix">绩效</span></template>
                <el-option v-for="tier in groupResultTiers" :key="tier.playCount" :label="tier.label" :value="tier.playCount" />
              </el-select>
              <el-button :type="activeGroupSummary.results.received ? 'primary' : 'default'" :icon="Coin" aria-label="到账" :title="activeGroupSummary.results.received ? '取消到账' : '到账'" :aria-pressed="activeGroupSummary.results.received" @click="activeGroupSummary.results.received = !activeGroupSummary.results.received" />
            </div>
            <el-input v-model="activeGroupSummary.title" class="group-short-name" size="default" aria-label="简称">
              <template #prepend>简称</template>
            </el-input>
            <el-input v-if="activeGroupSummary" v-model="activeGroupSummary.fullName" class="group-full-name" size="default" aria-label="全称">
              <template #prepend>全称</template>
            </el-input>
          </div>
        </div>
        <div class="episode-summary-cards group-statistic-cards">
          <section class="episode-summary-card">
            <el-statistic title="制作周期" :value="0" :formatter="formatGroupProductionDateRange" />
            <div class="episode-statistic-detail">
              <span>总制作天数 {{ groupProductionSummary.productionDays }}</span>
            </div>
          </section>
          <section class="episode-summary-card">
            <el-statistic title="整剧成本" :value="Number(groupProductionSummary.totalCostValue.toFixed(1))" :precision="1" />
            <div class="episode-statistic-detail">
              <span>平均单集 {{ groupProductionSummary.averageEpisodeCost }}</span>
              <span>总集数 {{ groupProductionSummary.episodeCount }}</span>
            </div>
          </section>
          <section class="episode-summary-card">
            <el-statistic title="平均分" :value="groupSummaryStats.averageValue" :precision="1" />
            <el-rate
              class="episode-average-rate"
              :class="{ muted: groupSummaryStats.averageValue <= 2 }"
              :model-value="groupSummaryStats.averageValue"
              size="small"
              disabled
              allow-half
              :max="5"
            />
          </section>
          <section class="episode-summary-card">
            <el-statistic title="抽卡成功率" :value="groupSummaryStats.drawSuccessRateValue">
              <template #suffix>%</template>
            </el-statistic>
            <div class="episode-statistic-detail">
              <span>总分镜数 {{ groupSummaryStats.total }}</span>
              <span>总抽卡数 {{ groupSummaryStats.drawTotal }}</span>
            </div>
          </section>
        </div>
        <el-table :ref="setGroupSummaryTableRef" class="group-summary-table" :data="groupSummaryTableRows" max-height="430" empty-text="暂无单集" :row-class-name="groupSummaryRowClass">
          <el-table-column prop="title" label="单集" :min-width="1" show-overflow-tooltip />
          <el-table-column label="对接人" :min-width="1">
            <template #default="{ row }">
              <el-dropdown
                v-if="!row.isSummary && contactEditableIds.has(row.episode.id)"
                :ref="(dropdown) => setContactPersonDropdownRef(row.episode.id, dropdown)"
                class="episode-contact-dropdown"
                trigger="click"
                popper-class="contact-person-dropdown"
                @command="selectEpisodeContactPerson(row.episode, $event)"
                @visible-change="handleContactDropdownVisibleChange(row.episode.id, $event)"
              >
                <el-link class="episode-contact-link" type="primary" underline="never" :title="row.episode.contactPerson || '未选择'" :aria-label="`${row.title}对接人`">
                  <span class="point-episode-selection">{{ row.episode.contactPerson || '未选择' }}</span>
                </el-link>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="isHistoricalContactPerson(row.episode)" disabled>{{ row.episode.contactPerson }}</el-dropdown-item>
                    <el-dropdown-item v-for="option in state.globalConfig.dataCollection.contactPersonOptions" :key="option.id" :command="option.label">{{ option.label }}</el-dropdown-item>
                    <el-dropdown-item v-if="!state.globalConfig.dataCollection.contactPersonOptions.length" class="contact-person-empty" disabled>请先在全局设置中添加数据</el-dropdown-item>
                    <el-dropdown-item v-if="row.episode.contactPerson" command="" divided>清空</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="拆分集号" :min-width="1">
            <template #default="{ row }">
              <EpisodeSplitNumberCell v-if="!row.isSummary && contactEditableIds.has(row.episode.id)" v-model="row.episode.splitEpisodeNumber" :label="`${row.title}拆分集号`" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="totalCost" label="总成本" :min-width="1" />
          <el-table-column v-if="showGroupSummaryAverage" prop="averageText" label="平均分" :min-width="1" />
          <el-table-column label="分镜/抽卡" :min-width="1">
            <template #default="{ row }">{{ row.total }}/{{ row.drawTotal }}</template>
          </el-table-column>
          <el-table-column prop="averageDrawRate" label="抽卡成功率" :min-width="1" />
          <el-table-column label="操作" :min-width="1" align="center" header-align="center">
            <template #default="{ row }">
              <el-link v-if="!row.isSummary" type="primary" href="#" @click.prevent="openReviewSummary(row.episode)">查看</el-link>
            </template>
          </el-table-column>
        </el-table>
        </template>
        <template v-if="dataDialogView === 'shot'" #footer>
          <el-button @click="clearReviewDialog">清空</el-button>
          <el-button type="primary" @click="saveReviewDialog">保存</el-button>
        </template>
      </component>
      <el-dialog v-model="episodeScriptDialogVisible" width="820px" class="episode-script-dialog" :show-close="false" :close-on-click-modal="!episodeScriptSaving" :close-on-press-escape="!episodeScriptSaving" @closed="resetEpisodeScriptDialog">
        <el-tabs v-model="episodeScriptActiveTab" class="episode-script-tabs" :before-leave="() => !episodeScriptSaving">
          <el-tab-pane label="素材" name="materials">
            <div class="episode-script-columns">
              <div class="episode-script-source-panel">
                <div class="episode-script-panel-title has-inline-action">
                  <span>原始剧本</span>
                  <el-link type="primary" underline="never" href="#" :disabled="episodeScriptSaving" @click.prevent="organizeEpisodeScriptDraft">整理</el-link>
                </div>
                <el-input
                  v-model="episodeScriptDraft"
                  :disabled="episodeScriptSaving"
                  class="episode-script-source-input"
                  type="textarea"
                  :rows="16"
                  resize="none"
                  placeholder="粘贴或输入本集完整剧本；使用“===”划分单元，“---”划分分镜（默认为 SD2.5）"
                  @input="syncMaterialSceneDraftCount"
                />
              </div>
              <div class="episode-script-material-panel">
                <div class="episode-script-panel-title has-inline-action">
                  <span>素材配置</span>
                  <el-dropdown trigger="click" @command="cloneEpisodeMaterials">
                    <el-link type="primary" underline="never" :disabled="episodeScriptSaving">克隆</el-link>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-for="episode in materialCloneSourceEpisodes" :key="episode.id" :command="episode.id">
                          克隆 {{ episode.title }}
                        </el-dropdown-item>
                        <el-dropdown-item v-if="!materialCloneSourceEpisodes.length" disabled>暂无可克隆的单集</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
                <el-form class="episode-script-material-form" label-position="top" :disabled="episodeScriptSaving">
                  <el-form-item label="角色">
                    <el-input
                      v-model="materialCharacterDraft"
                      type="textarea"
                      :rows="3"
                      resize="none"
                      placeholder="输入单个或多个角色名称"
                    />
                  </el-form-item>
                  <el-form-item label="场景">
                    <div class="material-scene-list">
                      <div v-for="(scene, index) in materialSceneDrafts" :key="index" class="episode-script-material-scene-entry">
                        <div class="episode-script-material-scene-controls">
                          <el-segmented
                            v-model="scene.time"
                            :options="materialSceneTimeOptions"
                            block
                            size="small"
                            aria-label="场景时间"
                            class="material-scene-segmented"
                            :class="{ 'is-transition-ready': materialSceneTransitionsReady }"
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
                            size="small"
                            aria-label="场景空间"
                            class="material-scene-segmented"
                            :class="{ 'is-transition-ready': materialSceneTransitionsReady }"
                          >
                            <template #default="{ item }">
                              <el-icon class="material-segment-icon" :aria-label="segmentedOptionLabel(item)">
                                <component :is="segmentedOptionIcon(item)" />
                              </el-icon>
                            </template>
                          </el-segmented>
                        </div>
                        <el-input
                          v-model="scene.name"
                          clearable
                          :placeholder="batchShotUnitCount() ? `${formatUnitLabel(index + 1)}场景` : '场景名称'"
                          @keyup.enter="continueFromEpisodeScriptMaterials"
                        />
                      </div>
                    </div>
                  </el-form-item>
                </el-form>
                <section class="episode-script-current-materials">
                  <div class="episode-script-current-materials-title">当前素材</div>
                  <div class="episode-script-current-materials-scroll">
                    <template v-if="activeEpisode">
                      <div v-if="activeCharacterAssets.length" class="episode-script-current-material-row">
                        <div class="episode-script-current-material-tags">
                          <el-tag v-for="character in activeCharacterAssets" :key="character.name" size="small" effect="plain">
                            <span class="episode-script-current-material-tag-text">{{ character.name }}</span>
                          </el-tag>
                        </div>
                      </div>
                      <div v-if="activeEpisode.scenes.length" class="episode-script-current-material-row">
                        <div class="episode-script-current-material-tags">
                          <el-tag v-for="scene in activeEpisode.scenes" :key="sceneAssetKey(scene)" size="small" type="info" effect="plain">
                            <span class="episode-script-current-material-tag-text">{{ sceneAssetLabel(scene) }}</span>
                          </el-tag>
                        </div>
                      </div>
                      <div v-if="!activeCharacterAssets.length && !activeEpisode.scenes.length" class="episode-script-current-material-empty">
                        暂无素材
                      </div>
                    </template>
                  </div>
                </section>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="分镜" name="shots">
            <div class="episode-script-columns">
              <div class="episode-script-source-panel">
                <div class="episode-script-panel-title has-inline-action">
                  <span>拆分剧本</span>
                  <el-link type="primary" underline="never" href="#" :disabled="episodeScriptSaving" @click.prevent="organizeEpisodeScriptDraft">整理</el-link>
                </div>
                <el-input
                  v-model="splitScriptDraft"
                  :disabled="episodeScriptSaving"
                  class="episode-script-source-input"
                  type="textarea"
                  :rows="16"
                  resize="none"
                  placeholder="粘贴或输入本集完整剧本；使用“===”划分单元，“---”划分分镜（默认为 SD2.5）"
                  @input="syncSplitScriptDraft"
                />
              </div>
              <div class="episode-script-preview-panel">
                <div class="episode-script-panel-title has-inline-action">
                  <span>分镜列表</span>
                  <el-popconfirm title="将使用已保存的原始剧本重置拆分剧本。确认重置？" @confirm="resetSplitScript">
                    <template #reference>
                      <el-link type="primary" underline="never" :disabled="episodeScriptSaving">重置</el-link>
                    </template>
                  </el-popconfirm>
                </div>
                <div class="batch-shot-preview">
                  <div
                    v-for="(segment, index) in batchShotSegments"
                    :key="`${segment.unitNumber}-${index}-${segment.text.length}-${segment.remark}`"
                    class="batch-shot-preview-item"
                    :class="{
                      warn: batchDurationState(segment.text, true).warn,
                      'is-even-unit': normalizeShotUnitNumber(segment.unitNumber) % 2 === 0,
                    }"
                  >
                    <div class="batch-shot-preview-head">
                      <div class="batch-shot-heading">
                        <span class="batch-shot-index">{{ batchShotNumber(segment, index) }}</span>
                        <span class="batch-shot-remark">SD2.5</span>
                        <span v-if="segment.remark" class="batch-shot-remark" :title="segment.remark">{{ segment.remark }}</span>
                      </div>
                      <span class="batch-shot-stat">{{ batchShotMatchedCharacterCount(segment.text) }} 人 · {{ batchTimingAnalysis(segment.text).dialogueCharacters }} / {{ batchTimingAnalysis(segment.text).totalCharacters }} 字 · {{ formatTimingSeconds(batchTimingAnalysis(segment.text).totalSeconds) }}</span>
                    </div>
                    <p>{{ segment.text }}</p>
                  </div>
                  <div v-if="!batchShotSegments.length" class="episode-script-empty empty-note">使用“===”划分单元、“---”划分分镜（默认为 SD2.5）后，将在此显示识别结果。</div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
        <template #footer>
          <template v-if="episodeScriptActiveTab === 'materials'">
            <el-button :disabled="episodeScriptSaving" @click="saveEpisodeScriptMaterials">保存</el-button>
            <el-button type="primary" :disabled="episodeScriptSaving" @click="continueFromEpisodeScriptMaterials">下一步</el-button>
          </template>
          <template v-else>
            <el-popconfirm
              v-if="isEpisodeShotUpdateMode"
              title="将按识别结果更新分镜列表，并按顺序保留对应配置。确认继续？"
              @confirm="applyEpisodeScriptShots"
            >
              <template #actions="{ confirm }">
                <el-button size="small" type="primary" @click="confirm($event)">更新</el-button>
              </template>
              <template #reference>
                <el-button type="primary" :loading="episodeScriptSaving">更新</el-button>
              </template>
            </el-popconfirm>
            <el-button v-else type="primary" :loading="episodeScriptSaving" @click="applyEpisodeScriptShots">确认添加</el-button>
          </template>
        </template>
      </el-dialog>
      <el-dialog v-model="dialogueDialogVisible" title="台词" width="820px" class="episode-script-dialog dialogue-dialog" :close-on-click-modal="!dialogueSaving" :close-on-press-escape="!dialogueSaving" :show-close="!dialogueSaving" @closed="resetDialogueDialog">
        <div class="episode-script-columns">
          <div class="episode-script-source-panel">
            <div class="episode-script-panel-title">
              <span>原始剧本</span>
            </div>
            <el-input
              :model-value="dialogueEpisode?.scriptText ?? ''"
              class="episode-script-source-input"
              type="textarea"
              :rows="16"
              resize="none"
              placeholder="粘贴或输入包含角色名称及冒号的剧本文字"
              readonly
            />
          </div>
          <div class="dialogue-result-panel">
            <div class="episode-script-panel-title has-inline-action">
              <span>提取结果</span>
              <el-link type="primary" underline="never" :disabled="dialogueSaving" @click="resetDialogueExtraction">重置</el-link>
            </div>
            <div class="dialogue-result-stack" :class="{ 'is-readonly': dialogueView === 'replaced' }">
              <div :ref="setDialogueHighlightRef" class="dialogue-line-highlight-layer" aria-hidden="true" v-html="highlightedDialogueText"></div>
              <el-input
                :ref="setDialogueInputRef"
                v-model="dialogueOutputDraft"
                :disabled="dialogueSaving"
                class="dialogue-result-input"
                type="textarea"
                :rows="16"
                resize="none"
                :readonly="dialogueView === 'replaced'"
                placeholder="暂无提取结果"
              />
            </div>
          </div>
        </div>
        <template #footer>
          <el-button
            :disabled="dialogueSaving || (dialogueView === 'original' && !state.globalConfig.dialogueExtraction.replacementRules.length)"
            @click="toggleDialogueReplacement"
          >
            {{ dialogueView === 'replaced' ? '原文' : '替换' }}
          </el-button>
          <el-button type="primary" :disabled="!dialogueOutputDraft.trim()" :loading="dialogueSaving" @click="copyExtractedDialogue">复制</el-button>
        </template>
      </el-dialog>
      <component :is="shouldShowMaterialScenes ? ElPopover : ElDrawer" v-bind="materialDialogProps" :title="materialDialogTitle" :class="shouldShowMaterialScenes ? undefined : 'app-drawer material-dialog'" @update:model-value="materialDialogVisible = $event" @closed="handleMaterialDialogClosed" @after-leave="handleMaterialDialogClosed">
        <el-form class="material-form" :class="{ 'material-form-inline': isCharacterMaterialEdit }" :label-position="isCharacterMaterialEdit ? 'left' : 'top'" :label-width="isCharacterMaterialEdit ? '4em' : undefined" @submit.prevent @keydown.esc.stop="materialDialogVisible = false">
          <el-form-item v-if="shouldShowMaterialCharacters" label="角色">
            <div class="material-character-name-row">
              <el-input
                v-model="materialCharacterDraft"
                class="material-character-input"
                clearable
                placeholder="请输入角色名称"
                @input="materialDialogMode === 'add' && !materialCharacterTypeManuallySelected && (materialCharacterTypeDraft = /(?:们|群像|若干)$/.test($event.trim()) ? 'ensemble' : 'ordinary')"
                @keyup.enter="confirmMaterialDialog"
              />
              <el-radio-group v-model="materialCharacterTypeDraft" class="material-character-type" aria-label="角色类型" @change="() => {
                materialCharacterTypeManuallySelected = true
                if (materialCharacterTypeDraft === 'ensemble') {
                  materialCharacterAppearanceEnabledDraft = true
                  materialCharacterOutfitsDraft.forEach(outfit => outfit.appearanceDescriptionEnabled = true)
                }
              }">
                <el-radio-button value="main" aria-label="主角" title="主角"><el-icon><MainCharacter /></el-icon></el-radio-button>
                <el-radio-button value="ordinary" aria-label="配角" title="配角"><el-icon><User /></el-icon></el-radio-button>
                <el-radio-button value="ensemble" aria-label="群像" title="群像"><el-icon><Grape /></el-icon></el-radio-button>
              </el-radio-group>
            </div>
          </el-form-item>
          <el-form-item v-if="shouldShowMaterialCharacters && materialCharacterOutfitsDraft.length < 2" label="备注">
            <el-input v-model="materialCharacterNoteDraft" />
          </el-form-item>
          <el-form-item v-if="shouldShowMaterialCharacters" label="可选范围">
            <el-select v-model="materialCharacterScopeSelection" class="material-character-scope" value-key="key" multiple collapse-tags collapse-tags-tooltip clearable :disabled="materialCharacterTypeDraft === 'main'" :placeholder="materialCharacterTypeDraft === 'main' ? '全剧所有单元' : '选择单元'" aria-label="角色可选范围">
              <el-option-group v-for="group in materialCharacterScopeOptions" :key="group.value" :label="group.label">
                <el-option v-for="unit in group.children" :key="unit.value.key" :label="unit.label" :value="unit.value" />
              </el-option-group>
            </el-select>
          </el-form-item>
          <CharacterOutfitEditor v-if="shouldShowMaterialCharacters && materialDialogVisible" ref="materialOutfitEditorRef" v-model:outfits="materialCharacterOutfitsDraft" v-model:description="materialCharacterAppearanceDraft" v-model:description-enabled="materialCharacterAppearanceEnabledDraft" v-model:note="materialCharacterNoteDraft" :units="materialCharacterUnits" :allow-add="materialCharacterUnits.length > 1">
            <el-form-item v-if="shouldShowMaterialCharacters" label="音色描述">
              <div class="appearance-description-control">
                <el-switch v-model="materialCharacterVoiceEnabledDraft" :disabled="materialCharacterIsEnsembleDraft" aria-label="启用音色描述" />
                <el-input
                  v-if="materialCharacterVoiceEnabledDraft"
                  v-model="materialCharacterVoiceDraft"
                  :disabled="materialCharacterIsEnsembleDraft"
                  aria-label="音色描述"
                  type="textarea"
                  :rows="2"
                  resize="vertical"
                  placeholder="输入角色的音色描述（选填）"
                />
              </div>
            </el-form-item>
            <el-form-item v-if="shouldShowMaterialCharacters && materialCharacterOutfitsDraft.length < 2" class="material-appearance-field" label="形象描述">
              <template #label>
                <span>形象描述</span>
                <el-dropdown v-if="materialCharacterIsEnsembleDraft && materialCharacterAppearanceEnabledDraft" trigger="click" @command="(content) => materialCharacterAppearanceDraft = content">
                  <el-link type="primary" underline="never">模板</el-link>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-for="template in state.globalConfig.prompt.ensembleAppearanceTemplates" :key="template.id" :command="template.content">{{ template.name }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
              <div class="appearance-description-control">
                <el-switch v-model="materialCharacterAppearanceEnabledDraft" aria-label="启用形象描述" />
                <el-input
                  v-if="materialCharacterAppearanceEnabledDraft"
                  v-model="materialCharacterAppearanceDraft"
                  aria-label="形象描述"
                  type="textarea"
                  :rows="4"
                  resize="vertical"
                  placeholder="输入角色的外貌、服装或造型描述（选填）"
                />
              </div>
            </el-form-item>
          </CharacterOutfitEditor>
          <el-form-item v-if="shouldShowMaterialScenes">
            <div class="material-scene-list">
              <div v-for="(scene, index) in materialSceneDrafts" :key="index" class="material-scene-row">
                <el-segmented
                  v-model="scene.time"
                  :options="materialSceneTimeOptions"
                  block
                  size="small"
                  aria-label="场景时间"
                  class="material-scene-segmented"
                  :class="{ 'is-transition-ready': materialSceneTransitionsReady }"
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
                  size="small"
                  aria-label="场景空间"
                  class="material-scene-segmented"
                  :class="{ 'is-transition-ready': materialSceneTransitionsReady }"
                >
                  <template #default="{ item }">
                    <el-icon class="material-segment-icon" :aria-label="segmentedOptionLabel(item)">
                      <component :is="segmentedOptionIcon(item)" />
                    </el-icon>
                  </template>
                </el-segmented>
                <el-input
                  v-model="scene.name"
                  clearable
                  :placeholder="`场景 ${index + 1}`"
                  @keyup.enter="confirmMaterialDialog"
                />
              </div>
            </div>
          </el-form-item>
          <div v-if="shouldShowMaterialScenes" class="scene-material-footer">
            <el-button type="primary" @click="confirmMaterialDialog">{{ materialDialogConfirmText }}</el-button>
          </div>
        </el-form>
        <template v-if="shouldShowMaterialCharacters" #footer>
          <el-button type="primary" @click="confirmMaterialDialog">{{ materialDialogConfirmText }}</el-button>
        </template>
      </component>
      <el-drawer v-model="outfitAssignmentVisible" title="分配角色服装" direction="ltr" size="380px" :modal="false" :show-close="false" modal-class="dismissible-drawer-overlay" append-to-body class="app-drawer outfit-assignment-drawer" @closed="cancelOutfitAssignment">
        <p class="empty-note">新增使用单元需要分配服装，保存后应用本次操作。</p>
        <el-form label-position="top">
          <section v-for="item in outfitAssignmentDrafts" :key="item.asset.id">
            <h4>{{ item.asset.name }}</h4>
            <el-form-item v-if="item.asset.outfits.length < 2" label="形象描述">
              <div class="appearance-description-control">
                <el-switch v-model="item.asset.appearanceDescriptionEnabled" aria-label="启用形象描述" />
                <el-input v-if="item.asset.appearanceDescriptionEnabled" v-model="item.asset.appearanceDescription" aria-label="形象描述" type="textarea" :rows="3" />
              </div>
            </el-form-item>
            <CharacterOutfitEditor ref="assignmentOutfitEditorRefs" v-model:outfits="item.asset.outfits" v-model:description="item.asset.appearanceDescription" v-model:description-enabled="item.asset.appearanceDescriptionEnabled" v-model:note="item.asset.note" :units="item.units" :allow-add="false" />
          </section>
        </el-form>
        <template #footer><el-button type="primary" @click="saveOutfitAssignment">保存</el-button></template>
      </el-drawer>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import brandIconUrl from './assets/angry-cat-brand.jpg'
import materialFolderIconUrl from '../folder.png'
import GlobalConfigDialog from './components/GlobalConfigDialog.vue'
import PointLedgerDialog from './components/PointLedgerDialog.vue'
import ShotViewSelector from './components/ShotViewSelector.vue'
import GroupPlayMedal from './components/GroupPlayMedal.vue'
import { linkedSourceShotIds, neighboringEpisode, visibleShotCards } from './neighborUnits'
import EpisodeSplitNumberCell from './components/EpisodeSplitNumberCell.vue'
import { activePromptProfile, cloneGlobalConfig, mergeGlobalConfigs, normalizeGlobalConfigSnapshot, normalizeReferenceMode } from './config'
import { ElDialog, ElDrawer, ElPopover, ElMessageBox, type DropdownInstance } from 'element-plus'
import { AddIcon, ArrowDown, Check, CircleCheckFilled, Close, CloseBold, Coin, CloneCharacters, CopyDocument, DataAnalysis, DataLine, Delete, DialogueTabIcon, Document, Download, EditPen, Expand, Grape, Location, MainCharacter, MaterialTabIcon, Microphone, Moon, MoreFilled, Mute, Notebook, NextEpisodeUnit, Position, PositionReference, PreviousEpisodeUnit, Refresh, Search, Setting, ShotTabIcon, Sort, Star, StarFilled, Sunny, Upload, User, UserFilled, WarningFilled } from './icons'
import { extractDialogueText, replaceDialogueText } from './dialogue'
import { normalizeSplitScriptText } from './episodeScript'
import { clearInteriorEpisodeContacts, contactEditableEpisodeIds, renameEpisodeContacts } from './episodeContacts'
import { clearInteriorSplitEpisodeNumbers, episodePreviewRanges, normalizeSplitEpisodeNumber } from './episodeSplits'
import { effectiveProductionData, invoiceUsedPoints, mergePointInvoices, normalizePointInvoices, remapPointInvoices } from './pointLedger'
import { normalizeGroupResults, pendingGroupResults } from './groupResults'
import { isHistoricalEpisodeGroup, latestGroupProductionDate as groupProductionDate } from './groupHistory'
import type { PointInvoice } from './types'
import {
  createCharacterConfig,
  createCharacterAsset,
  createEpisode,
  createEpisodeGroup,
  createEpisodeProductionData,
  formatEpisodeTitle,
  createId,
  createPromptReview,
  createSceneAsset,
  createSceneConfig,
  createShot,
  normalizeCharacterAssets,
  normalizeShotSceneSelection,
  sceneAssetKey,
} from './defaults'
import {
  buildDetectedCharacters,
  composeCharacterSettings,
  composePrompt,
  composeShotDetail,
  countNonPunctuationCharacters,
  detectCharacters,
  findPhoneVoiceMatches,
  formatPromptReferenceName,
  mergeDetectedCharacters,
  normalizeCharacterNameForMatch,
  prepareManualReferenceName,
  sceneReferenceName,
} from './prompt'
import { normalizeConnectionPunctuationCount, normalizeStoredShotConnection, takeLeadingPunctuationSegments, takeTrailingPunctuationSegments } from './shotContext'
import { compactShotUnitNumbers, continuousEpisodes, formatShotNumber, formatShotReference, reconcileShotReferences, normalizeShotUnitNumber } from './shotNumber'
import {
  analyzeDialogueTiming,
  analyzeTimingRange,
  reconcileTimingSegments,
  resolveTimingSegments,
  sumTimingAnalyses,
  type TimingAnalysis,
} from './timing'
import type { AppState, CharacterConfig, DialogueSpeechRate, Episode, EpisodeGroup, EpisodeProductionData, ExportPayload, GlobalConfig, PendingDetection, PromptReview, SceneAsset, SceneConfig, SceneSpace, SceneTime, Shot, ShotTimingSegment } from './types'
import { characterAssetsFor as assetsFor, initializeSharedCharacters, characterAppearance, characterUnits, validateCharacterOutfits } from './sharedCharacters'
import { characterAvailableInUnit, compareCharacterAssets, episodeCharacterUnits, extendCharacterScopes, initializeCharacterScopes, mapCharacterUnitReferences, pruneCharacterScopes, referencedCharacterNames } from './characterScopes'
import { formatPromptReferences } from './prompt'
import { parseFirstFrameText } from './firstFrame'
import { GrapeFilled, MainCharacterFilled } from './icons'
import { HomeBackIcon, GoStart, GoEnd, PointBalanceIcon, SceneStatus } from './icons'
import { ProjectFolder, ProjectFolderFilled, ArchiveFolder, HistoryFolder, HistoryFolderFilled, MoreOneIcon, FolderConversion } from './icons'
import MaterialCard from './components/MaterialCard.vue'
import { normalizeMaterialConfirmations } from './defaults'
import CharacterOutfitEditor from './components/CharacterOutfitEditor.vue'
import type { CharacterOutfit, CharacterAsset } from './types'
import { useAppState } from './useAppState'
import { LocalRepository, readSyncTarget } from './storage'
import { buildDataFiles, canonicalJson, groupFilePath, mergeDownloadedFiles } from './dataFiles'
import { acceptDownloadedFiles, downloadDataFiles, legacySnapshotFiles, migrateLegacyFiles, uploadDataFiles, type TransferItem, type TransferResult } from './webdavSync'
import { notify } from './notification'
import { copyText } from './clipboard'
import {
  loadWebDavSettings,
  saveWebDavSettings,
  normalizeWebDavSettings,
  WebDavClient,
  webDavTargetIdentity,
  type WebDavAction,
  type WebDavSettings,
} from './webdav'

type MaterialKind = 'characters' | 'scenes'
type StatusSyncScope = 'unit' | 'all'
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
type MaterialDialogMode = 'add' | 'edit'
type ProjectSection = 'projects' | 'history'
type EpisodeScriptTab = 'materials' | 'shots'
type DialogueView = 'original' | 'replaced'
type BatchShotSegment = {
  text: string
  remark: string
  unitNumber: number
}
type EditingMaterial = {
  kind: MaterialKind
  value: string
}
type ImportMode = 'replace' | 'merge'
type ImportBatch = {
  groups: unknown
  episodes: Episode[]
  globalConfig: GlobalConfig | null
  pointInvoices: PointInvoice[]
}
const reviewDrawCountOptions = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const
type ReviewDrawCountMode = '' | typeof reviewDrawCountOptions[number]

const props = defineProps<{
  initialGlobalConfig: GlobalConfig
  initialState: AppState
  repository: LocalRepository
}>()

const { state, activeEpisode, saveError, saveNow, replaceState, isReplacing } = useAppState(props.initialState, props.repository)
const activeCharacterAssets = computed(() => activeEpisode.value ? assetsFor(state, activeEpisode.value) : [])
const materialLibraryEpisodeId = ref<string | null>(activeEpisode.value?.id ?? null)
const materialLibraryEpisode = computed(() => state.episodes.find(episode => episode.id === materialLibraryEpisodeId.value))
const materialLibrarySearch = ref('')
const materialLibraryAddAnchorRef = ref<HTMLElement | null>(null)
const shotOwners = computed(() => new Map(state.episodes.flatMap(episode => episode.shots.map(shot => [shot.id, episode] as const))))
function episodeForShot(shot: Shot) { return shotOwners.value.get(shot.id)! }
const displayedShotCards = computed(() => activeEpisode.value ? visibleShotCards(state, activeEpisode.value) : [])
const referencedCharactersByEpisode = computed(() => new Map([...new Set(displayedShotCards.value.map(card => card.episode))]
  .map(episode => [episode.id, referencedCharacterNames(episode)])))
const linkedCurrentShotIds = computed(() => {
  const linked = linkedSourceShotIds(state)
  return new Set(displayedShotCards.value.filter(card => card.region === 'current' && linked.has(card.shot.id)).map(card => card.shot.id))
})
const selectableShotCards = computed(() => displayedShotCards.value.filter(card => !linkedCurrentShotIds.value.has(card.shot.id)))
const neighborScrollSpacerRef = ref<HTMLElement | null>(null)
let neighborScrollPadding = 0
let shotScrollAnimation = 0
const previousEpisodeUnit = computed(() => activeEpisode.value ? neighboringEpisode(state, activeEpisode.value, -1) : { episode: null, reason: '' })
const nextEpisodeUnit = computed(() => activeEpisode.value ? neighboringEpisode(state, activeEpisode.value, 1) : { episode: null, reason: '' })
const materialDialogVisible = ref(false)
const outfitAssignmentVisible = ref(false)
const assignmentOutfitEditorRefs = ref<InstanceType<typeof CharacterOutfitEditor>[]>([])
const outfitAssignmentDrafts = ref<{ asset: CharacterAsset; units: ReturnType<typeof characterUnits> }[]>([])
let finishOutfitAssignment: ((accepted: boolean) => void) | null = null

async function approveEpisodeCharacters(candidate: Episode, candidateAssets?: CharacterAsset[]): Promise<boolean> {
  const assets = candidateAssets ?? assetsFor(state, candidate)
  candidate.shots.forEach(shot => shot.characters.forEach(character => {
    character.characterId = assets.find(asset => asset.name === character.name)?.id ?? null
  }))
  const proposed = { ...state, episodeGroups: state.episodeGroups.map(group => group.id === candidate.groupId ? { ...group, characters: assets } : group), episodes: state.episodes.map(episode => episode.id === candidate.id ? candidate : episode) }
  if (!await approveCharacterOutfits(proposed, candidate, assets)) return false
  extendCharacterScopes(assets, candidate, state.episodes.find(episode => episode.id === candidate.id))
  return true
}

async function approveCharacterOutfits(proposed: AppState, candidate: Episode, assets: CharacterAsset[]) {
  const missing = assets.filter(asset => validateCharacterOutfits(proposed, candidate, asset))
  if (!missing.length) return true
  outfitAssignmentDrafts.value = missing.map(asset => ({ asset: JSON.parse(JSON.stringify(asset)), units: characterUnits(proposed, candidate, asset) }))
  outfitAssignmentVisible.value = true
  const accepted = await new Promise<boolean>(resolve => { finishOutfitAssignment = resolve })
  if (accepted) outfitAssignmentDrafts.value.forEach(item => {
    const asset = assets.find(asset => asset.id === item.asset.id)!
    Object.assign(asset, item.asset)
  })
  return accepted
}

function cancelOutfitAssignment() {
  finishOutfitAssignment?.(false)
  finishOutfitAssignment = null
}

function saveOutfitAssignment() {
  if (assignmentOutfitEditorRefs.value.some(editor => editor.hasIncompleteSingle)) {
    outfitAssignmentVisible.value = false
    return
  }
  for (const { asset, units } of outfitAssignmentDrafts.value) {
    if (asset.outfits.length < 2) continue
    const notes = asset.outfits.map(outfit => outfit.note.trim())
    if (notes.some(note => !note) || new Set(notes).size !== notes.length) { notify.warning('请填写不重复的服装备注'); return }
    if (units.some(unit => asset.outfits.filter(outfit => outfit.units.some(item => item.episodeId === unit.episodeId && item.unitNumber === unit.unitNumber)).length !== 1)) {
      notify.warning('请为每个单元分配服装'); return
    }
    asset.outfits.forEach(outfit => { outfit.note = outfit.note.trim() })
  }
  finishOutfitAssignment?.(true)
  finishOutfitAssignment = null
  outfitAssignmentVisible.value = false
}

async function applyShotCharacters(shot: Shot, characters: CharacterConfig[]) {
  const episode = episodeForShot(shot)
  const candidate = { ...episode, shots: episode.shots.map(item => item.id === shot.id ? { ...item, characters } : item) }
  if (!await approveEpisodeCharacters(candidate)) return false
  shot.characters = characters
  return true
}
const globalDialogVisible = ref(false)
const pointLedgerVisible = ref(false)
const webDavSettings = ref<WebDavSettings>(loadWebDavSettings())
const webDavAction = ref<WebDavAction | null>(null)
const webDavAuthVisible = ref(false)
const pendingWebDavTransfer = ref<'upload' | 'download' | null>(null)
const webDavAuthUsername = ref('')
const webDavAuthPassword = ref('')
const webDavAuthPasswordRef = ref<{ focus: () => void } | null>(null)
const webDavAuthSubmitting = ref(false)
const webDavAuthError = ref('')
const detectionDialogVisible = ref(false)
const detectionConflictShotId = ref<string | null>(null)
const workspaceView = ref<'library' | 'editor'>('library')
const projectSections: { id: ProjectSection; title: string; icon: Component; filledIcon: Component }[] = [
  { id: 'projects', title: '项目', icon: ProjectFolder, filledIcon: ProjectFolderFilled },
  { id: 'history', title: '历史', icon: HistoryFolder, filledIcon: HistoryFolderFilled },
]
const projectSection = ref<ProjectSection>('projects')
const projectSearch = ref('')
const projectSearchKeyword = computed(() => projectSearch.value.trim().toLocaleLowerCase())
const projectLibraryRef = ref<HTMLElement | null>(null)
const projectScrollPositions: Record<ProjectSection, number> = { projects: 0, history: 0 }
const lastGroupEpisodes = new Map<string, string>()
const episodeSwitchDropdownRef = ref<DropdownInstance | null>(null)
const episodeSwitchVisible = ref(false)
const episodeStartNumber = ref('')
const episodeStartInputRef = ref<{ focus: () => void } | null>(null)
const isDarkMode = ref(document.documentElement.classList.contains('dark'))
const materialDialogMode = ref<MaterialDialogMode>('add')
const materialDialogKind = ref<MaterialKind>('characters')
const scenePopoverReference = ref<HTMLElement | null>(null)
const materialDialogProps = computed(() => materialDialogKind.value === 'scenes'
  ? { visible: materialDialogVisible.value, virtualRef: scenePopoverReference.value, virtualTriggering: true, width: 300, placement: 'right-start' as const, popperClass: 'scene-material-popover' }
  : { modelValue: materialDialogVisible.value, size: '380px', direction: 'ltr' as const, modal: false, showClose: false, modalClass: 'dismissible-drawer-overlay', appendToBody: true })
const isCharacterMaterialEdit = computed(() => materialDialogMode.value === 'edit' && materialDialogKind.value === 'characters')
const editingMaterial = ref<EditingMaterial | null>(null)
const materialCharacterDraft = ref('')
const materialCharacterNoteDraft = ref('')
const materialCharacterAppearanceDraft = ref('')
const materialCharacterAppearanceEnabledDraft = ref(false)
const materialCharacterVoiceDraft = ref('')
const materialCharacterVoiceEnabledDraft = ref(false)
const materialCharacterTypeDraft = ref<'ordinary' | 'main' | 'ensemble'>('ordinary')
const materialCharacterTypeManuallySelected = ref(false)
const materialCharacterIsEnsembleDraft = computed(() => materialCharacterTypeDraft.value === 'ensemble')
const materialCharacterAvailableUnitsDraft = ref<NonNullable<CharacterAsset['availableUnits']>>([])
const materialCharacterOutfitsDraft = ref<CharacterOutfit[]>([])
watch([materialCharacterTypeDraft, () => materialCharacterOutfitsDraft.value.length], ([type, count]) => {
  if (type === 'main' && count < 2 && !materialCharacterNoteDraft.value.trim()) materialCharacterNoteDraft.value = '原皮'
})
const materialEditingEpisodeId = ref<string | null>(null)
const materialEditingEpisode = computed(() => state.episodes.find(episode => episode.id === materialEditingEpisodeId.value) ?? activeEpisode.value)
const materialCharacterScopeSelection = computed({
  get: () => materialCharacterTypeDraft.value === 'main' ? [] : materialCharacterAvailableUnitsDraft.value.map(unit => ({ ...unit, key: JSON.stringify([unit.episodeId, unit.unitNumber]) })),
  set: (units: NonNullable<CharacterAsset['availableUnits']>) => { materialCharacterAvailableUnitsDraft.value = units.map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber })) },
})
const materialCharacterScopeOptions = computed(() => {
  const owner = materialEditingEpisode.value
  if (!owner) return []
  return state.episodes.filter(episode => owner.groupId ? episode.groupId === owner.groupId : episode.id === owner.id)
    .sort((a, b) => parseEpisodeNumber(a.title) - parseEpisodeNumber(b.title))
    .map(episode => ({ value: episode.id, label: episode.title, children: episodeCharacterUnits(episode).map(unit => ({ value: { ...unit, key: JSON.stringify([unit.episodeId, unit.unitNumber]) }, label: `${parseEpisodeNumber(episode.title)}-${unit.unitNumber}` })) }))
})
const materialOutfitEditorRef = ref<InstanceType<typeof CharacterOutfitEditor> | null>(null)
const materialCharacterUnits = computed(() => {
  const episode = materialEditingEpisode.value
  const asset = (episode ? assetsFor(state, episode) : []).find(item => item.name === editingMaterial.value?.value)
  return episode && asset ? characterUnits(state, episode, asset) : []
})
const materialSceneDrafts = ref<MaterialSceneDraft[]>(createMaterialSceneDrafts())
const materialSceneTransitionsReady = ref(false)
const batchShotSegments = ref<BatchShotSegment[]>([])
const episodeScriptActiveTab = ref<EpisodeScriptTab>('shots')
const dialogueView = ref<DialogueView>('original')
const dialogueOriginalDraft = ref('')
const dialogueReplacedDraft = ref('')
const editingEpisodeId = ref<string | null>(null)
const editingEpisodeOriginalTitle = ref('')
const editingEpisodeNumber = ref('')
const materialSceneTimeOptions: MaterialSegmentedOption<SceneTime>[] = [
  { label: '白天', value: '白天', icon: Sunny },
  { label: '深夜', value: '深夜', icon: Moon },
]
const materialSceneSpaceOptions: MaterialSegmentedOption<SceneSpace>[] = [
  { label: '室内', value: '室内', icon: Location },
  { label: '室外', value: '室外', icon: Position },
  { label: '无', value: '无', icon: CloseBold },
]
const characterTypeGroups = [
  { value: 'main', label: '主角', icon: MainCharacter },
  { value: 'ordinary', label: '配角', icon: User },
  { value: 'ensemble', label: '群像', icon: Grape },
]
const shotViewModeOptions = computed(() => displayedShotCards.value.map(({ shot, order }) => ({
  label: `第 ${order} 条分镜${linkedCurrentShotIds.value.has(shot.id) ? '（衔接中）' : ''}`,
  value: shot.id,
  number: order,
  disabled: linkedCurrentShotIds.value.has(shot.id),
})))
const speechRateOptions = [
  { label: '慢 · 5', value: 'slow' },
  { label: '中 · 6', value: 'medium' },
  { label: '快 · 7', value: 'fast' },
]
const actionShotCountOptions = [1, 2, 3, 4, 5].map((value) => ({ label: String(value), value }))
const actionSecondsPerShotOptions = [0, 2, 3, 4, 5].map((value) => ({ label: String(value), value }))
type HighlightInputBinding = {
  textarea: HTMLTextAreaElement
  handler: () => void
  observer: ResizeObserver | null
}

const scriptInputRefs = new Map<string, HighlightInputBinding>()
const scriptHighlightRefs = new Map<string, HTMLElement>()
const timingPopoverAnchorRef = ref<HTMLElement | null>(null)
const timingPopoverPosition = ref({ left: 0, top: 0 })
const activeTimingTarget = ref<{ shotId: string; segmentId: string } | null>(null)
const hoveredTimingTarget = ref<{ shotId: string; segmentId: string } | null>(null)
let dialogueInputRef: HighlightInputBinding | null = null
let dialogueHighlightRef: HTMLElement | null = null
let materialSceneTransitionFrame: number | null = null
const fileInputRef = ref<HTMLInputElement | null>(null)
const shotListRef = ref<HTMLElement | null>(null)
const dataDialogVisible = ref(false)
const dataDialogView = ref<'group' | 'episode' | 'shot'>('group')
const episodeScriptDialogVisible = ref(false)
const dialogueDialogVisible = ref(false)
const dialogueEpisodeId = ref<string | null>(null)
const dialogueEpisode = computed(() => state.episodes.find(episode => episode.id === dialogueEpisodeId.value))
const activeReviewShot = ref<Shot | null>(null)
const activeReviewEpisodeId = ref<string | null>(null)
const reviewOpenedFromSummary = ref(false)
const reviewSummaryEpisodeId = ref<string | null>(null)
const activeGroupSummaryId = ref<string | null>(null)
const activeContactEpisodeId = ref<string | null>(null)
const contactPersonDropdowns = new Map<string, DropdownInstance>()
const showGroupSummaryAverage = ref(false)
let groupSummaryTableElement: HTMLElement | null = null
let groupSummaryTableObserver: ResizeObserver | null = null
const reviewDraft = ref<PromptReview>(createPromptReview())
const reviewDrawCountMode = ref<ReviewDrawCountMode>('')
const reviewCustomDrawCount = ref<number | undefined>()
const timingPopoverAnchorStyle = computed(() => ({
  left: `${timingPopoverPosition.value.left}px`,
  top: `${timingPopoverPosition.value.top}px`,
}))
const activeTimingSegment = computed<ShotTimingSegment | null>(() => {
  const target = activeTimingTarget.value
  if (!target) return null
  const shot = shotOwners.value.get(target.shotId)?.shots.find((item) => item.id === target.shotId)
  return shot?.timingSegments.find((segment) => segment.id === target.segmentId) ?? null
})
const activeDialogueTiming = computed(() => {
  const segment = activeTimingSegment.value
  return segment?.kind === 'dialogue'
    ? analyzeDialogueTiming(segment.sourceText, segment.speechRate)
    : null
})
const timingPopoverVisible = computed(() => Boolean(activeTimingSegment.value))
const reviewNotePrefixPath = ref<string[]>([])
const episodeScriptDraft = ref('')
const splitScriptDraft = ref('')
const episodeScriptSaving = ref(false)
const dialogueSaving = ref(false)
const remainingPoints = computed(() => state.pointInvoices.reduce((total, invoice) => total + invoice.initialPoints + invoice.receivedPoints - invoiceUsedPoints(invoice), 0))
const remainingPointsLabel = computed(() => remainingPoints.value >= 1000 ? `${(remainingPoints.value / 1000).toFixed(1)}k` : String(remainingPoints.value))
const historyToday = ref(new Date())
let historyDateTimer: number | undefined
const reviewRateTexts = ['拉完了', 'NPC', '人上人', '顶级', '夯']
const reviewNoteCascaderProps = { expandTrigger: 'hover' as const }
const shotConnectionMarks = {
  [-8]: '',
  [-4]: '',
  0: '',
  4: '',
  8: '',
}

const materialReferenceUnits = computed(() => {
  const scopes = materialLibraryEpisode.value ? [materialLibraryEpisode.value] : activeGroupEpisodes.value
  const result = new Map<string, Map<string, Set<string>>>()
  for (const current of scopes) {
    const key = current.groupId ?? current.id
    if (result.has(key)) continue
    const references = new Map<string, Set<string>>()
    const group = state.episodeGroups.find(group => group.id === current.groupId)
    const mode = group?.referenceMode ?? state.globalConfig.prompt.referenceMode
    const episodes = state.episodes.filter(episode => current.groupId ? episode.groupId === current.groupId : episode.id === current.id)
      .sort((a, b) => parseEpisodeNumber(a.title) - parseEpisodeNumber(b.title))
    for (const episode of episodes) {
      const assets = assetsFor(state, episode)
      const add = (name: string, unitNumber: number) => {
        if (/\.mp3$/i.test(name)) return
        const units = references.get(name) ?? new Set<string>()
        units.add(`${parseEpisodeNumber(episode.title)}-${unitNumber}`)
        references.set(name, units)
      }
      const collectManual = (text: string, unitNumber: number) => {
        for (const match of text.matchAll(/\[([^\[\]\r\n]+)\]/g)) {
          const name = match[1].trim()
          if (name) {
            add(formatPromptReferenceName(prepareManualReferenceName(name, text.slice(0, match.index))), unitNumber)
            const characterName = name.replace(/\.[a-z\d]+$/i, '').replace(/\.+$/u, '').trim()
            if (assets.some(asset => asset.name === characterName)) add(characterName, unitNumber)
          }
        }
      }
      episode.shots.map((shot, index) => ({ shot, index })).sort((a, b) => a.shot.unitNumber - b.shot.unitNumber).forEach(({ shot, index }) => {
        shot.scenes.filter(scene => scene.name.trim()).forEach(scene => {
          add(shot.usePositionReference ? mode === 'basic' ? '@' : formatPromptReferenceName(formatShotReference(episode, index, state.episodes))
            : mode === 'basic' ? `${sceneReferenceName(scene)}@` : formatPromptReferenceName(sceneReferenceName(scene)), shot.unitNumber)
        })
        shot.characters.forEach(character => {
          add(character.name, shot.unitNumber)
          const asset = assets.find(asset => asset.name === character.name)
          const appearance = asset ? characterAppearance(asset, episode.id, shot) : null
          if (!asset?.isEnsemble) add(mode === 'basic' ? `${character.name}@` : formatPromptReferenceName(appearance?.referenceName ?? character.name), shot.unitNumber)
          if (appearance) collectManual(appearance.description, shot.unitNumber)
        })
        collectManual(shot.text, shot.unitNumber)
      })
    }
    result.set(key, references)
  }
  return result
})
function materialReferenceTitle(name: string, episode: Episode) {
  const units = !/\.mp3$/i.test(name) ? materialReferenceUnits.value.get(episode.groupId ?? episode.id)!.get(name) : undefined
  return units?.size ? `${name}\n${[...units].join('丨')}` : name
}
async function copyMaterialReferenceName(name: string) {
  const materialName = name.replace(/\.[a-z\d]+$/i, '').replace(/[@.]$/u, '').trim()
  if (await copyText(materialName)) notify.success('已复制素材名')
  else notify.error('复制失败')
}
function toggleMaterialConfirmation(name: string, episode: Episode) {
  const owner = state.episodeGroups.find(group => group.id === episode.groupId) ?? episode
  const index = owner.confirmedMaterialReferences.indexOf(name)
  if (index < 0) owner.confirmedMaterialReferences.push(name)
  else owner.confirmedMaterialReferences.splice(index, 1)
}
function collectEpisodeMaterials(episode: Episode) {
  type Usage = { used: boolean; references: Map<number, Set<string>> }
  const scenes = new Map<string, Usage>(episode.scenes.map((asset) => [sceneAssetKey(asset), { used: false, references: new Map() }]))
  const characters = new Map<string, Usage>(assetsFor(state, episode).map((asset) => [asset.name.trim(), { used: false, references: new Map() }]))
  const custom = new Map<string, Usage>()
  const voicedCharacters = new Set<string>()
  const group = state.episodeGroups.find((group) => group.id === episode.groupId)
  const mode = group?.referenceMode ?? state.globalConfig.prompt.referenceMode
  const addReference = (usage: Usage, unit: number, reference?: string) => {
    usage.used = true
    if (reference === undefined) return
    const names = usage.references.get(unit) ?? new Set<string>()
    names.add(reference)
    usage.references.set(unit, names)
  }
  const collectBracketReferences = (text: string, unit?: number) => {
    for (const match of text.matchAll(/\[([^\[\]\r\n]+)\]/g)) {
      const rawName = match[1].trim()
      const name = rawName.replace(/\.[a-z\d]+$/i, '').replace(/\.+$/u, '').trim()
      if (!name) continue
      const reference = formatPromptReferenceName(prepareManualReferenceName(rawName, text.slice(0, match.index)))
      const matchedScenes = episode.scenes.filter(asset => asset.name.trim() === name || sceneReferenceName(asset) === name)
      const characterUsage = characters.get(name)
      if (unit !== undefined) {
        for (const scene of matchedScenes) addReference(scenes.get(sceneAssetKey(scene))!, unit, reference)
        if (characterUsage) addReference(characterUsage, unit, reference)
      }
      if (!matchedScenes.length && !characterUsage) {
        const usage = custom.get(name) ?? { used: false, references: new Map<number, Set<string>>() }
        addReference(usage, unit ?? 0, reference)
        custom.set(name, usage)
      }
    }
  }
  episode.shots.forEach((shot, index) => {
    const unit = shot.unitNumber
    shot.scenes.forEach((scene) => {
      const usage = scenes.get(sceneAssetKey(scene))
      if (!usage) return
      const reference = shot.usePositionReference
        ? mode === 'basic' ? '@' : formatPromptReferenceName(formatShotReference(episode, index, state.episodes))
        : mode === 'basic' ? `${sceneReferenceName(scene)}@` : formatPromptReferenceName(sceneReferenceName(scene))
      addReference(usage, unit, reference)
    })
    shot.characters.forEach((character) => {
      const name = character.name.trim()
      const usage = characters.get(name)
      if (!usage) return
      const asset = assetsFor(state, episode).find((asset) => asset.name === name)
      if (asset?.isEnsemble) {
        addReference(usage, unit)
        return
      }
      const appearance = asset ? characterAppearance(asset, episode.id, shot).referenceName ?? name : name
      addReference(usage, unit, mode === 'basic' ? `${name}@` : formatPromptReferenceName(appearance))
      if (character.includeVoice) {
        voicedCharacters.add(name)
        addReference(usage, unit, mode === 'basic' ? `${name}@` : formatPromptReferenceName(`${name}.`))
      }
    })
    collectBracketReferences(shot.text, unit)
  })
  assetsFor(state, episode).forEach((character) => {
    if (character.appearanceDescriptionEnabled) collectBracketReferences(character.appearanceDescription)
    character.outfits.filter(outfit => outfit.appearanceDescriptionEnabled).forEach(outfit => collectBracketReferences(outfit.appearanceDescription))
  })
  const referenceNames = (usage: Usage) => ({
    used: usage.used,
    references: [...new Set([...usage.references].sort(([a], [b]) => a - b).flatMap(([, names]) => [...names]))]
      .sort((a, b) => Number(/\.mp3$/i.test(b)) - Number(/\.mp3$/i.test(a)))
      .map(name => ({ name })),
  })
  const referenced = referencedCharacterNames(episode)
  return {
    scenes: episode.scenes.map((asset) => ({ ...asset, ...referenceNames(scenes.get(sceneAssetKey(asset))!) })),
    characters: assetsFor(state, episode).map((asset) => {
      const usage = characters.get(asset.name.trim())!
      const item = { ...asset, ...referenceNames(usage) }
      if (!item.references.length) item.references.push({ name: asset.name })
      return { ...item, voiceReference: asset.isEnsemble ? null : item.references.find(reference => /\.mp3$/i.test(reference.name)) ?? (voicedCharacters.has(asset.name) ? { name: `${asset.name}@` } : null) }
    }).filter(asset => asset.isMain || !asset.availableUnits?.length || asset.availableUnits.some(unit => unit.episodeId === episode.id))
      .sort((a, b) => compareCharacterAssets(a, b, referenced)),
    custom: [...custom].map(([name, usage]) => ({ name, ...referenceNames(usage) })),
  }
}
const completedCount = computed(() => activeEpisode.value?.shots.filter((shot) => shot.status === 'complete').length ?? 0)
const isEpisodeShotUpdateMode = computed(() => Boolean(activeEpisode.value && hasExistingShotConfiguration(activeEpisode.value)))
const sortedEpisodeGroups = computed(() => state.episodeGroups.filter((group) => !group.archived).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN', { numeric: true })))
const sortedArchivedEpisodeGroups = computed(() => state.episodeGroups
  .filter((group) => group.archived)
  .sort((a, b) => {
    const dateDiff = latestGroupProductionDate(b.id).localeCompare(latestGroupProductionDate(a.id))
    return dateDiff || state.episodeGroups.indexOf(a) - state.episodeGroups.indexOf(b)
  }))
const historicalGroupIds = computed(() => new Set(sortedArchivedEpisodeGroups.value
  .filter((group) => isHistoricalEpisodeGroup(group, latestGroupProductionDate(group.id), historyToday.value))
  .map((group) => group.id)))
const sortedUngroupedEpisodes = computed(() => sortEpisodesForDisplay(state.episodes.filter((episode) => !episode.groupId)))
const activeGroupEpisodes = computed(() => activeEpisode.value
  ? sortEpisodesForDisplay(state.episodes.filter((episode) => episode.groupId === activeEpisode.value?.groupId))
  : [])
const activeGroupEpisodeIndex = computed(() => activeGroupEpisodes.value.findIndex(episode => episode.id === activeEpisode.value?.id))
const materialLibrarySections = computed(() => {
  const query = materialLibrarySearch.value.trim().toLocaleLowerCase()
  const matches = (item: { name: string; references: { name: string }[] }) => !query || [item.name, ...item.references.map(reference => reference.name)].some(name => name.toLocaleLowerCase().includes(query))
  const episodes = materialLibraryEpisode.value ? [materialLibraryEpisode.value] : query ? activeGroupEpisodes.value : []
  return episodes.map(episode => {
    const materials = collectEpisodeMaterials(episode)
    const scenes = materials.scenes.filter(item => matches(item) || sceneAssetLabel(item).toLocaleLowerCase().includes(query)).map(scene => ({
      ...scene,
      referenceBlocks: scene.references.map(reference => {
        const label = reference.name.replace(/\.[a-z\d]+$/i, '')
        const isNumber = /^\d+(?:-\d+)+$/.test(label)
        return { ...reference, label: /\.mp3$/i.test(reference.name) ? '音色' : isNumber || label === '@' ? label : '原场景', isNumber, kind: /\.mp3$/i.test(reference.name) ? 'audio' as const : 'image' as const, confirmable: scene.used }
      }).sort((a, b) => Number(a.isNumber) - Number(b.isNumber)),
    }))
    const characters = materials.characters.filter(matches).map(asset => ({
      ...asset,
      referenceBlocks: [
        ...(asset.voiceReference ? [{ ...asset.voiceReference, label: '音色', kind: 'audio' as const, confirmable: asset.used }] : []),
        ...asset.references.filter(reference => !/\.mp3$/i.test(reference.name))
          .filter(reference => reference.name !== asset.name || asset.used && !asset.isEnsemble)
          .map(reference => {
            const name = reference.name.replace(/\.[a-z\d]+$/i, '')
            const label = name.startsWith(`${asset.name}（`) && name.endsWith('）') ? name.slice(asset.name.length + 1, -1) : name
            return { ...reference, label, kind: 'image' as const, confirmable: asset.used && !asset.isEnsemble }
          }),
      ],
    }))
    const custom = materials.custom.filter(matches).flatMap(item => item.references.map(reference => ({
      ...item,
      referenceBlocks: [{ ...reference, label: /\.mp3$/i.test(reference.name) ? '音色' : reference.name.replace(/\.[a-z\d]+$/i, ''), kind: /\.mp3$/i.test(reference.name) ? 'audio' as const : 'image' as const, confirmable: item.used }],
    })))
    const owner = state.episodeGroups.find(group => group.id === episode.groupId) ?? episode
    return { episode, scenes, characters, custom, confirmed: owner.confirmedMaterialReferences }
  }).filter(section => materialLibraryEpisode.value || section.scenes.length || section.characters.length || section.custom.length)
})
const projectCards = computed(() => {
  const groups = projectSection.value === 'projects'
    ? sortedEpisodeGroups.value
    : sortedArchivedEpisodeGroups.value.filter(group => historicalGroupIds.value.has(group.id))
  const entries: { id: string; group: EpisodeGroup | null; episodes: Episode[] }[] = [
    ...groups.map(group => ({ id: group.id, group, episodes: episodesForGroup(group.id) })),
    ...(projectSection.value === 'projects' ? sortedUngroupedEpisodes.value.map(episode => ({ id: episode.id, group: null, episodes: [episode] })) : []),
    ...(projectSection.value === 'projects' ? sortedArchivedEpisodeGroups.value.filter(group => !historicalGroupIds.value.has(group.id))
      .map(group => ({ id: group.id, group, episodes: episodesForGroup(group.id) })) : []),
  ]
  return entries.map(entry => {
    const production = summarizeProductionData(entry.episodes)
    const splits = [...new Set(episodePreviewRanges(entry.episodes).flatMap(range => range.splitNumbers))].sort((a, b) => a - b)
    return {
      ...entry,
      title: entry.group?.title ?? entry.episodes[0].title,
      fullName: entry.group ? entry.group.fullName.trim() : '未分组',
      dateRange: production.dates.length ? `${production.dates[0].slice(2)} ~ ${production.dates[production.dates.length - 1].slice(2)}` : '未设置制作日期',
      originalNumbers: entry.episodes.map(formatEpisodeSummaryNumber).join(', '),
      contacts: entry.episodes.filter(episode => episode.contactPerson).map(episode => `${formatEpisodeSummaryNumber(episode)} · ${episode.contactPerson}`),
      splitNumbers: splits.map(number => String(number).padStart(2, '0')).join(', '),
      splitCount: splits.length,
      totalCost: production.totalCost,
      averageEpisodeCost: production.averageEpisodeCost,
    }
  }).filter(card => projectSearchKeyword.value === '绩效'
    ? Boolean(card.group && (card.group.results.playCount > 0 || card.group.results.commission > 0))
    : !projectSearchKeyword.value || [card.title, card.fullName, card.originalNumbers, card.splitNumbers]
      .some(value => value.toLocaleLowerCase().includes(projectSearchKeyword.value)))
})
const materialCloneSourceEpisodes = computed(() => {
  const targetEpisode = activeEpisode.value

  if (!targetEpisode) {
    return []
  }

  return sortEpisodesForDisplay(state.episodes.filter((episode) => (
    episode.id !== targetEpisode.id
    && (episode.groupId ?? null) === (targetEpisode.groupId ?? null)
  )))
})
const detectionConflictShot = computed(() => state.episodes.flatMap(episode => episode.shots).find(shot => shot.id === detectionConflictShotId.value) ?? null)
const dialogueOutputDraft = computed({
  get: () => dialogueView.value === 'replaced' ? dialogueReplacedDraft.value : dialogueOriginalDraft.value,
  set: (value: string) => {
    if (dialogueView.value === 'original') {
      dialogueOriginalDraft.value = value
    }
  },
})
const highlightedDialogueText = computed(() => {
  const text = dialogueOutputDraft.value || ' '
  const replacementTerms = dialogueView.value === 'original'
    ? Array.from(new Set(state.globalConfig.dialogueExtraction.replacementRules
      .map((rule) => rule.forbidden)
      .map((term) => term.trim())
      .filter(Boolean)))
      .sort((a, b) => b.length - a.length)
    : []

  return text
    .split('\n')
    .map((line) => {
      const highlightedLine = highlightDialogueReplacements(line, replacementTerms)
      return countNonPunctuationCharacters(line) > 9
        ? `<mark class="dialogue-length-warning">${highlightedLine}</mark>`
        : highlightedLine
    })
    .join('\n')
})
const detectionConflict = computed(() => detectionConflictShot.value?.pendingDetection ?? null)
const reviewNoteCascaderOptions = computed(() => {
  const categories = new Map<string, Array<{ value: string; label: string }>>()

  state.globalConfig.dataCollection.reviewNotePrefixOptions.forEach((option) => {
    const children = categories.get(option.category) ?? []
    children.push({ value: option.label, label: option.label })
    categories.set(option.category, children)
  })

  return Array.from(categories, ([category, children]) => ({
    value: category,
    label: category,
    children,
  }))
})
const reviewSummaryEpisode = computed(() => state.episodes.find((episode) => episode.id === reviewSummaryEpisodeId.value) ?? null)
const activeReviewEpisode = computed(() => state.episodes.find((episode) => episode.id === activeReviewEpisodeId.value) ?? null)
const dataDialogEpisode = computed(() => dataDialogView.value === 'group' ? null : dataDialogView.value === 'shot' ? activeReviewEpisode.value : reviewSummaryEpisode.value)
const dataDialogGroupId = computed(() => dataDialogView.value === 'group' ? activeGroupSummaryId.value ?? 'ungrouped' : dataDialogEpisode.value?.groupId ?? 'ungrouped')
const dataDialogGroupTitle = computed(() => getEpisodeGroupTitle(dataDialogGroupId.value === 'ungrouped' ? null : dataDialogGroupId.value))
const dataDialogTitle = computed(() => ({ group: '全剧数据', episode: '分集数据', shot: '分镜数据' })[dataDialogView.value])
const activeGroupSummary = computed(() => state.episodeGroups.find((group) => group.id === activeGroupSummaryId.value) ?? null)
const groupProductionOptions = computed(() => activeGroupSummary.value ?? state.globalConfig.prompt)
const referenceModeOptions = [
  { label: '基础', value: 'basic' },
  { label: '详细', value: 'detailed' },
]
const groupResultTiers = [
  { playCount: 2000, commission: 500, label: '500元丨2千万' },
  { playCount: 5000, commission: 1000, label: '1000元丨5千万' },
  { playCount: 10000, commission: 2000, label: '2000元丨1亿' },
  { playCount: 20000, commission: 3000, label: '3000元丨2亿' },
  { playCount: 50000, commission: 4000, label: '4000元丨5亿' },
]
const groupResultTier = computed(() => groupResultTiers.find((tier) => tier.playCount === activeGroupSummary.value?.results.playCount && tier.commission === activeGroupSummary.value?.results.commission))
const groupResultPlaceholder = computed(() => {
  const results = activeGroupSummary.value?.results
  return results && (results.playCount || results.commission)
    ? `${results.commission}元丨${results.playCount >= 10000 ? `${results.playCount / 10000}亿` : `${results.playCount}万`}（原数据）`
    : '选择档位'
})
const pendingResults = computed(() => pendingGroupResults(state.episodeGroups))
const groupSummaryEpisodes = computed(() => activeGroupSummaryId.value === 'ungrouped'
  ? sortedUngroupedEpisodes.value
  : activeGroupSummaryId.value ? episodesForGroup(activeGroupSummaryId.value) : [])
const contactEditableIds = computed(() => contactEditableEpisodeIds(state.episodes))
const promptProfileOptions = computed(() => state.globalConfig.prompt.profiles.map((profile) => ({
  label: profile.name,
  value: profile.id,
})))
const groupPromptProfileId = computed<string>({
  get: () => activePromptProfile(state.globalConfig, activeGroupSummary.value?.promptProfileId).id,
  set: (profileId) => {
    const normalizedProfileId = activePromptProfile(state.globalConfig, profileId).id

    if (activeGroupSummary.value) {
      activeGroupSummary.value.promptProfileId = normalizedProfileId
    } else if (activeGroupSummaryId.value === 'ungrouped') {
      state.globalConfig.prompt.activeProfileId = normalizedProfileId
    }
  },
})
const reviewShotNumber = computed(() => {
  const shot = activeReviewShot.value
  const episode = activeReviewEpisode.value
  const index = shot ? episode?.shots.findIndex((item) => item.id === shot.id) ?? -1 : -1

  if (!shot || !episode || index < 0) {
    return ''
  }

  return formatShotNumber(episode, index)
})
const reviewSummaryRows = computed(() => {
  const episode = reviewSummaryEpisode.value

  return episode?.shots.map((shot, index) => ({
    shot,
    index: formatShotNumber(episode, index),
    rating: shot.review.rating,
    ratingText: shot.review.rating ? `${shot.review.rating} 星` : '未评分',
    drawCount: shot.review.drawCount,
    noteText: formatReviewNote(shot.review),
  })) ?? []
})
const reviewSummary = computed(() => summarizeShots(reviewSummaryEpisode.value?.shots ?? []))
const reviewProductionData = computed(() => reviewSummaryEpisode.value ? productionDataFor(reviewSummaryEpisode.value) : null)
const episodeTotalCost = computed(() => reviewProductionData.value?.totalCost ?? 0)
const materialDialogTitle = computed(() => {
  const action = materialDialogMode.value === 'add' ? '添加' : '修改'
  return `${action}${materialDialogKind.value === 'characters' ? '角色' : '场景素材'}`
})
const materialDialogConfirmText = computed(() => materialDialogMode.value === 'add' ? '添加' : '保存')
const shouldShowMaterialCharacters = computed(() => materialDialogKind.value === 'characters')
const shouldShowMaterialScenes = computed(() => materialDialogKind.value === 'scenes')
const groupSummarySubtitle = computed(() => {
  const episodeNumbers = groupSummaryEpisodes.value.map(formatEpisodeSummaryNumber).join('/')
  return `${episodeNumbers || '无'}，共${groupSummaryEpisodes.value.length}集`
})
const groupSummaryStats = computed(() => summarizeEpisodeGroup(groupSummaryEpisodes.value))
const groupProductionSummary = computed(() => summarizeProductionData(groupSummaryEpisodes.value))
const groupSummaryRows = computed(() => groupSummaryEpisodes.value.map((episode) => {
  const summary = summarizeShots(episode.shots)
  const data = productionDataFor(episode)

  return {
    isSummary: false,
    episode,
    episodeNumber: formatEpisodeSummaryNumber(episode),
    title: episode.title,
    total: summary.total,
    drawTotal: summary.drawTotal,
    averageText: summary.averageValue ? `${summary.averageValue} 星` : '未评分',
    averageDrawRate: summary.averageDrawRate,
    totalCost: formatPointCost(data.totalCost),
  }
}))
const groupSummaryTableRows = computed(() => [
  ...groupSummaryRows.value,
  {
    isSummary: true,
    episode: null,
    episodeNumber: '汇总',
    title: `共 ${groupSummaryEpisodes.value.length} 集`,
    total: groupSummaryStats.value.total,
    drawTotal: groupSummaryStats.value.drawTotal,
    averageText: groupSummaryStats.value.averageValue ? `${groupSummaryStats.value.averageValue} 星` : '未评分',
    averageDrawRate: groupSummaryStats.value.averageDrawRate,
    totalCost: groupProductionSummary.value.totalCost,
  },
])

function groupSummaryRowClass({ row }: { row: { isSummary?: boolean } }) {
  return row.isSummary ? 'group-summary-total-row' : ''
}

function setGroupSummaryTableRef(table: unknown) {
  const element = (table as { $el?: HTMLElement } | null)?.$el ?? null
  if (element === groupSummaryTableElement) return
  groupSummaryTableObserver?.disconnect()
  groupSummaryTableElement = element
  if (!element) return
  const update = () => { showGroupSummaryAverage.value = element.clientWidth >= 800 }
  update()
  groupSummaryTableObserver = new ResizeObserver(update)
  groupSummaryTableObserver.observe(element)
}

function summarizeShots(shots: Shot[]) {
  const ratedShots = shots.filter((shot) => shot.review.rating > 0)
  const ratingTotal = ratedShots.reduce((total, shot) => total + shot.review.rating, 0)
  const drawTotal = shots.reduce((total, shot) => total + shot.review.drawCount, 0)
  const drawSuccessRateValue = drawTotal ? Math.round((shots.length / drawTotal) * 100) : 0

  return {
    total: shots.length,
    averageValue: ratedShots.length ? Number((ratingTotal / ratedShots.length).toFixed(1)) : 0,
    drawTotal,
    drawSuccessRateValue,
    averageDrawRate: `${drawSuccessRateValue}%`,
  }
}

function summarizeEpisodeGroup(episodes: Episode[]) {
  const summary = summarizeShots(episodes.flatMap((episode) => episode.shots))
  const episodeAverages = episodes
    .map((episode) => summarizeShots(episode.shots).averageValue)
    .filter((average) => average > 0)

  return {
    ...summary,
    averageValue: episodeAverages.length
      ? Number((episodeAverages.reduce((total, average) => total + average, 0) / episodeAverages.length).toFixed(1))
      : 0,
  }
}

function summarizeProductionData(episodes: Episode[]) {
  const totalCost = episodes.reduce((total, episode) => total + productionDataFor(episode).totalCost, 0)
  const dates = Array.from(new Set(episodes
    .map((episode) => normalizeDateString(productionDataFor(episode).productionDate))
    .filter((date): date is string => Boolean(date))))
    .sort()

  return {
    dates,
    episodeCount: episodes.length,
    averageEpisodeCost: formatPointCost(episodes.length ? totalCost / episodes.length : 0),
    totalCostValue: totalCost,
    totalCost: formatPointCost(totalCost),
    dateRange: dates.length ? `${formatMonthDayWithSeparator(dates[0])} 至 ${formatMonthDayWithSeparator(dates[dates.length - 1])}` : '未设置',
    productionDays: `${dates.length} 天`,
  }
}

function formatPointCost(value: number) {
  return Math.max(0, value).toFixed(1)
}

function productionDataFor(episode: Episode) {
  return effectiveProductionData(episode, state.pointInvoices)
}

function formatEpisodeProductionDate() {
  const date = normalizeDateString(reviewProductionData.value?.productionDate ?? '')
  return date ? `${date.slice(5, 7)}月${date.slice(8, 10)}日` : '未设置'
}

function formatGroupProductionDateRange() {
  return groupProductionSummary.value.dateRange
}

function formatMonthDayWithSeparator(value: string) {
  const [, month, day] = value.split('-')
  return `${month}-${day}`
}

function formatEpisodeSummaryNumber(episode: Episode) {
  const number = parseEpisodeNumber(episode.title)
  return number ? pad2(number) : episode.title
}

function openGlobalDialog() {
  globalDialogVisible.value = true
}

function mapPromptProfileId(
  profileId: unknown,
  sourceConfig: GlobalConfig,
  targetConfig: GlobalConfig,
) {
  const sourceProfile = activePromptProfile(sourceConfig, typeof profileId === 'string' ? profileId : undefined)
  const sourceIndex = sourceConfig.prompt.profiles.findIndex((profile) => profile.id === sourceProfile.id)
  return targetConfig.prompt.profiles.find((profile) => profile.id === sourceProfile.id)?.id
    ?? targetConfig.prompt.profiles.find((profile) => profile.name === sourceProfile.name)?.id
    ?? targetConfig.prompt.profiles[sourceIndex]?.id
    ?? activePromptProfile(targetConfig).id
}

function saveGlobalConfig(config: GlobalConfig) {
  const previousConfig = state.globalConfig
  const nextConfig = cloneGlobalConfig(config)
  renameEpisodeContacts(state.episodes, previousConfig.dataCollection.contactPersonOptions, nextConfig.dataCollection.contactPersonOptions)
  state.episodeGroups.forEach((group) => {
    group.promptProfileId = activePromptProfile(nextConfig, group.promptProfileId).id
  })
  state.globalConfig = nextConfig
}

function setContactPersonDropdownRef(id: string, dropdown: unknown) {
  if (dropdown) contactPersonDropdowns.set(id, dropdown as DropdownInstance)
  else contactPersonDropdowns.delete(id)
}

function selectEpisodeContactPerson(episode: Episode, value: unknown) {
  if (!contactEditableIds.value.has(episode.id) || typeof value !== 'string') return
  if (value && !state.globalConfig.dataCollection.contactPersonOptions.some((option) => option.label === value)) return
  episode.contactPerson = value
  activeContactEpisodeId.value = null
}

function isHistoricalContactPerson(episode: Episode) {
  return episode.contactPerson && !state.globalConfig.dataCollection.contactPersonOptions.some((option) => option.label === episode.contactPerson)
}

function handleContactDropdownVisibleChange(id: string, visible: boolean) {
  if (visible) activeContactEpisodeId.value = id
  else if (activeContactEpisodeId.value === id) activeContactEpisodeId.value = null
}

function closeContactPersonDropdown() {
  if (activeContactEpisodeId.value) contactPersonDropdowns.get(activeContactEpisodeId.value)?.handleClose()
  activeContactEpisodeId.value = null
}

function handleContactDropdownEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !activeContactEpisodeId.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  closeContactPersonDropdown()
}

function openPointLedger() {
  pointLedgerVisible.value = true
}

function savePointInvoices(invoices: PointInvoice[]) {
  state.pointInvoices = invoices
}

async function persistWebDavSettings(settings: WebDavSettings) {
  const identity = webDavTargetIdentity(settings)
  const normalized = saveWebDavSettings({
    ...settings,
    lastSyncedAt: (await readSyncTarget(props.repository, identity)).lastCompleteAt,
  })
  webDavSettings.value = normalized
  return normalized
}

async function saveWebDavConnection(settings: WebDavSettings) {
  try {
    await persistWebDavSettings(settings)
    notify.success('WebDAV 连接设置已保存')
    globalDialogVisible.value = false
  } catch (error) { notifyWebDavError(error) }
}

function requestWebDavTransfer(action: 'upload' | 'download') {
  if (webDavAction.value || webDavAuthVisible.value || webDavAuthSubmitting.value) return
  const settings = webDavSettings.value
  if (!settings.baseUrl.trim() || !settings.username.trim()) {
    openGlobalDialog()
    notify.info('请先配置 WebDAV 地址和用户名')
    return
  }
  if (settings.password) {
    void (action === 'upload' ? uploadToWebDav(settings) : downloadFromWebDav(settings))
    return
  }
  webDavAuthUsername.value = settings.username
  pendingWebDavTransfer.value = action
  webDavAuthVisible.value = true
}

function closeWebDavAuth() {
  if (webDavAuthSubmitting.value) return
  webDavAuthVisible.value = false
  pendingWebDavTransfer.value = null
  webDavAuthPassword.value = ''
  webDavAuthError.value = ''
}

async function continueWebDavTransfer(event: SubmitEvent) {
  if (webDavAuthSubmitting.value || !pendingWebDavTransfer.value) return
  webDavAuthError.value = ''
  const form = new FormData(event.target as HTMLFormElement)
  webDavAuthSubmitting.value = true
  try {
    const settings = normalizeWebDavSettings({
      ...webDavSettings.value,
      username: String(form.get('username') ?? ''),
      password: String(form.get('password') ?? ''),
    })
    await new WebDavClient(settings).test()
    const action = pendingWebDavTransfer.value
    webDavAuthSubmitting.value = false
    closeWebDavAuth()
    await (action === 'upload' ? uploadToWebDav(settings) : downloadFromWebDav(settings))
  } catch (error) {
    webDavAuthError.value = error instanceof Error ? error.message : 'WebDAV 验证失败'
  } finally {
    webDavAuthSubmitting.value = false
  }
}

async function confirmWebDavItems(items: TransferItem[], deleting = false) {
  try {
    await ElMessageBox.confirm(
      items.map((item) => `${item.title}（${item.path}）：${item.reason}`).join('\n'),
      deleting ? '确认删除云端分组' : '确认覆盖云端文件',
      { type: 'warning', confirmButtonText: deleting ? '删除云端文件' : '覆盖列出的文件', cancelButtonText: '保留云端文件', customClass: 'webdav-confirm-dialog' },
    )
    return true
  } catch { return false }
}

async function testWebDav(settings: WebDavSettings) {
  if (webDavAction.value) return
  webDavAction.value = 'test'
  try {
    await new WebDavClient(await persistWebDavSettings(settings)).test()
    notify.success('WebDAV 连接成功')
  } catch (error) { notifyWebDavError(error) }
  finally { webDavAction.value = null }
}

async function uploadToWebDav(settings: WebDavSettings) {
  if (webDavAction.value) return
  webDavAction.value = 'upload'
  try {
    if (!await saveNow()) return
    const normalized = await persistWebDavSettings(settings)
    // Snapshot the whole operation, so edits during network requests are left for the next upload.
    const snapshot = JSON.parse(JSON.stringify(state)) as AppState
    const result = await uploadDataFiles(new WebDavClient(normalized), buildDataFiles(snapshot), {
      repository: props.repository,
      identity: webDavTargetIdentity(normalized),
      confirmOverwrite: (items) => confirmWebDavItems(items),
      confirmDelete: (items) => confirmWebDavItems(items, true),
      isGroupPresent: (path) => state.episodeGroups.some((group) => groupFilePath(group.id) === path),
    })
    await persistWebDavSettings(normalized)
    notifyWebDavTransferResults('WebDAV 上传', result.results, result.complete)
  } catch (error) { notifyWebDavError(error) }
  finally { webDavAction.value = null }
}

async function downloadFromWebDav(settings: WebDavSettings) {
  if (webDavAction.value) return
  webDavAction.value = 'download'
  try {
    if (!await saveNow()) return
    const normalized = await persistWebDavSettings(settings)
    const before = canonicalJson({ groups: state.episodeGroups, episodes: state.episodes, config: state.globalConfig, pointInvoices: state.pointInvoices })
    const downloaded = await downloadDataFiles(new WebDavClient(normalized))
    const next = mergeDownloadedFiles(state, downloaded.files)
    try {
      await ElMessageBox.confirm(
        `将下载 ${downloaded.files.size - 2} 个分组及未分组内容，替换本地同 ID 分组、全局设置（提示词、数据收集、台词规则）和积分记录。本地独有分组保留。是否继续？`,
        '从 WebDAV 下载',
        { type: 'warning', confirmButtonText: '下载并替换', cancelButtonText: '取消' },
      )
    } catch { return }
    if (before !== canonicalJson({ groups: state.episodeGroups, episodes: state.episodes, config: state.globalConfig, pointInvoices: state.pointInvoices })) {
      throw new Error('下载期间本地数据已变化，请重新下载后确认')
    }
    await replaceState(next, {
      identity: webDavTargetIdentity(normalized),
      update: (target) => acceptDownloadedFiles(target, downloaded.files, downloaded.remote),
    })
    await persistWebDavSettings(normalized)
    notify.success(`WebDAV 下载完成：已保存 ${downloaded.files.size} 个文件，分组及单集 ID 已保留`)
  } catch (error) { notifyWebDavError(error) }
  finally { webDavAction.value = null }
}

async function migrateWebDav(settings: WebDavSettings) {
  if (webDavAction.value) return
  webDavAction.value = 'migrate'
  try {
    const client = new WebDavClient(await persistWebDavSettings(settings))
    const legacy = await client.readLegacy()
    const files = legacySnapshotFiles(legacy.text, state.globalConfig)
    try {
      await ElMessageBox.confirm(
        `将旧文件“${settings.legacyFilename}”拆分为 ${files.size} 个文件，直接保存在当前同步目录：${client.settings.baseUrl}。旧文件与本地数据保留；目录中已有不同的新格式数据时停止迁移。是否继续？`,
        '迁移旧版 WebDAV 文件',
        { type: 'warning', confirmButtonText: '迁移为多文件', cancelButtonText: '取消' },
      )
    } catch { return }
    const results = await migrateLegacyFiles(client, files, () => {})
    notifyWebDavTransferResults('WebDAV 迁移', results, results.every((item) => item.status !== 'failed'))
  } catch (error) { notifyWebDavError(error) }
  finally { webDavAction.value = null }
}

function notifyWebDavError(error: unknown) {
  const message = error instanceof Error ? error.message : 'WebDAV 操作失败'
  notify.error(message)
}

function notifyWebDavTransferResults(operation: string, results: TransferResult[], complete: boolean) {
  const changed = results.filter((item) => item.status === 'uploaded' || item.status === 'downloaded' || item.status === 'deleted').length
  const unchanged = results.filter((item) => item.status === 'unchanged').length
  const unfinished = results.filter((item) => item.status === 'failed' || item.status === 'skipped')
  const summary = `${operation}${complete ? '完成' : '未全部完成'}：已处理 ${changed}，未变化 ${unchanged}`
  if (complete) {
    notify.success(summary)
    return
  }
  const details = unfinished.map((item) => `${item.title}：${item.message}`).join('；')
  notify.warning(`${summary}；${details || '请重试'}`)
}

function setDarkMode(value: boolean) {
  isDarkMode.value = value
  document.documentElement.classList.toggle('dark', value)
}

function isArchivedEpisodeGroupId(id: string | null) {
  return Boolean(id && state.episodeGroups.some((group) => group.id === id && group.archived))
}

function rememberProjectScroll() {
  projectScrollPositions[projectSection.value] = projectLibraryRef.value?.scrollTop ?? 0
}

function openMaterialLibraryFolder(episodeId: string | null) {
  materialLibraryEpisodeId.value = episodeId
  materialLibrarySearch.value = ''
}

function selectProjectSection(section: ProjectSection) {
  projectSection.value = section
  void nextTick(() => { if (projectLibraryRef.value) projectLibraryRef.value.scrollTop = projectScrollPositions[section] })
}

function returnToLibrary() {
  handleEpisodeSwitchVisibleChange(false)
  cancelAnimationFrame(shotScrollAnimation)
  workspaceView.value = 'library'
  closeTimingPopover()
  void nextTick(() => { if (projectLibraryRef.value) projectLibraryRef.value.scrollTop = projectScrollPositions[projectSection.value] })
}

function enterEpisodeWorkspace(episode: Episode) {
  selectEpisode(episode)
  workspaceView.value = 'editor'
  void nextTick(scrollToCurrentEpisodeStart)
}

async function copyProjectFullName(name: string) {
  if (await copyText(name)) notify.success('已复制全称')
  else notify.error('复制失败')
}

function openProjectCard(card: { group: EpisodeGroup | null; episodes: Episode[] }, event?: Event) {
  if (event?.target instanceof Element) {
    if (event.target.closest('button, .el-dropdown, .rename-inline')) return
  }
  if (!card.episodes.length && card.group) {
    const episode = createEpisode(1)
    episode.groupId = card.group.id
    state.episodes.push(episode)
    enterEpisodeWorkspace(episode)
    return
  }
  const episode = card.episodes.find(episode => episode.id === lastGroupEpisodes.get(card.group?.id ?? '')) ?? card.episodes[0]
  if (episode) enterEpisodeWorkspace(episode)
}

function selectEpisode(episode: Episode) {
  state.activeEpisodeId = episode.id
}

function switchActiveEpisode(episodeId: string) {
  const episode = activeGroupEpisodes.value.find((item) => item.id === episodeId)
  if (episode) selectEpisode(episode)
  episodeSwitchDropdownRef.value?.handleClose()
}
function switchRelativeEpisode(offset: -1 | 1) {
  const episode = activeGroupEpisodes.value[activeGroupEpisodeIndex.value + offset]
  if (episode) selectEpisode(episode)
}

function hasEpisodesInGroup(groupId: string) {
  return state.episodes.some((episode) => episode.groupId === groupId)
}

function switchActiveEpisodeGroup(groupId: string) {
  const episode = episodesForGroup(groupId)[0]
  if (episode) selectEpisode(episode)
}

function latestGroupProductionDate(groupId: string) {
  return groupProductionDate(groupId, state.episodes, state.pointInvoices)
}

function refreshHistoryDate() {
  const now = new Date()
  historyToday.value = now
  window.clearTimeout(historyDateTimer)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  historyDateTimer = window.setTimeout(refreshHistoryDate, midnight.getTime() - now.getTime())
}

function handleHistoryVisibilityChange() {
  if (document.visibilityState === 'visible') refreshHistoryDate()
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

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function parseEpisodeNumber(title: string) {
  const match = title.match(/\d+/)
  const value = match ? Number(match[0]) : 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

function getEpisodeGroupTitle(groupId: string | null) {
  if (!groupId) {
    return '未分组'
  }

  return state.episodeGroups.find((group) => group.id === groupId)?.title ?? '未分组'
}

function sceneAssetLabel(scene: SceneAsset) {
  return [scene.time, scene.space === '无' ? '' : scene.space, scene.name].filter(Boolean).join(' · ')
}

function formatUnitLabel(unitNumber: number) {
  return `单元${unitNumber}`
}

function filterEpisodeNumberInput(value: string) {
  return value.replace(/\D/g, '')
}

function getEpisodeNumberDraft(title: string) {
  return title.match(/\d+/)?.[0] ?? ''
}

function isEpisodeNumberUsed(groupId: string | null, episodeNumber: number, excludedEpisodeId?: string) {
  return state.episodes.some((item) => (
    item.id !== excludedEpisodeId
    && item.groupId === groupId
    && parseEpisodeNumber(item.title) === episodeNumber
  ))
}

function finishEpisodeRename(episode: Episode) {
  const episodeNumber = Number(editingEpisodeNumber.value)

  if (!editingEpisodeNumber.value || !Number.isSafeInteger(episodeNumber) || episodeNumber <= 0) {
    notify.warning('请输入正整数集号')
    return
  }

  if (isEpisodeNumberUsed(episode.groupId, episodeNumber, episode.id)) {
    notify.warning(`当前分组已存在${formatEpisodeTitle(episodeNumber)}`)
    return
  }

  episode.title = formatEpisodeTitle(episodeNumber)

  editingEpisodeId.value = null
  editingEpisodeOriginalTitle.value = ''
  editingEpisodeNumber.value = ''
}

function cancelEpisodeRename(episode: Episode) {
  episode.title = editingEpisodeOriginalTitle.value || episode.title

  editingEpisodeId.value = null
  editingEpisodeOriginalTitle.value = ''
  editingEpisodeNumber.value = ''
}

function addEpisodeGroup() {
  const group = createEpisodeGroup(state.globalConfig.prompt.activeProfileId)
  group.title = '未命名项目'
  const episode = createEpisode(1)
  episode.groupId = group.id
  state.episodeGroups.push(group)
  state.episodes.push(episode)
  enterEpisodeWorkspace(episode)
}

function handleEpisodeSwitchVisibleChange(visible: boolean) {
  episodeSwitchVisible.value = visible
  if (visible) {
    void nextTick(() => episodeStartInputRef.value?.focus())
    return
  }
  episodeStartNumber.value = ''
  const editing = activeGroupEpisodes.value.find(episode => episode.id === editingEpisodeId.value)
  if (editing) cancelEpisodeRename(editing)
}

function setScriptHighlightRef(id: string, element: unknown) {
  if (element instanceof HTMLElement) {
    scriptHighlightRefs.set(id, element)
    syncScriptHighlightScroll(id)
    syncTimingHighlight(id, element)
    return
  }

  scriptHighlightRefs.delete(id)
}

function setScriptInputRef(id: string, input: unknown) {
  const existing = scriptInputRefs.get(id)

  if (!input || typeof input !== 'object') {
    existing?.textarea.removeEventListener('scroll', existing.handler)
    existing?.observer?.disconnect()
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
  existing?.observer?.disconnect()
  const handler = () => syncScriptHighlightScroll(id)
  const observer = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => syncScriptHighlightScroll(id))
  textarea.addEventListener('scroll', handler, { passive: true })
  observer?.observe(textarea)
  scriptInputRefs.set(id, { textarea, handler, observer })
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

function syncTimingHighlight(shotId: string, element: HTMLElement) {
  const target = activeTimingTarget.value ?? hoveredTimingTarget.value
  element.querySelectorAll<HTMLElement>('.timing-segment').forEach((mark) => {
    mark.classList.toggle('is-highlighted', target?.shotId === shotId && target.segmentId === mark.dataset.timingId)
  })
}

watch([activeTimingTarget, hoveredTimingTarget], () => {
  scriptHighlightRefs.forEach((element, shotId) => syncTimingHighlight(shotId, element))
}, { flush: 'post' })

function timingSegmentAtPoint(shot: Shot, clientX: number, clientY: number) {
  const highlight = scriptHighlightRefs.get(shot.id)
  if (!highlight) return null

  const timingMarks = Array.from(highlight.querySelectorAll<HTMLElement>('.timing-segment[data-timing-id]'))
  return timingMarks.flatMap((mark) => (
    Array.from(mark.getClientRects()).map((rect) => ({ mark, rect }))
  )).find(({ rect }) => (
    clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom
  )) ?? null
}

function handleTimingHighlightPointerMove(event: MouseEvent, shot: Shot) {
  if (activeTimingTarget.value) return
  const hit = timingSegmentAtPoint(shot, event.clientX, event.clientY)
  const segmentId = hit?.mark.dataset.timingId
  const nextTarget = segmentId ? { shotId: shot.id, segmentId } : null
  if (
    hoveredTimingTarget.value?.shotId === nextTarget?.shotId
    && hoveredTimingTarget.value?.segmentId === nextTarget?.segmentId
  ) return
  hoveredTimingTarget.value = nextTarget
}

function clearHoveredTimingHighlight() {
  if (!activeTimingTarget.value) {
    hoveredTimingTarget.value = null
  }
}

function openTimingPopoverFromContextMenu(event: MouseEvent, shot: Shot) {
  event.preventDefault()
  const hit = timingSegmentAtPoint(shot, event.clientX, event.clientY)
  if (!hit) {
    closeTimingPopover()
    return
  }

  const segmentId = hit.mark.dataset.timingId
  if (!segmentId) return
  event.stopPropagation()
  hoveredTimingTarget.value = null
  activeTimingTarget.value = { shotId: shot.id, segmentId }
  timingPopoverPosition.value = {
    left: hit.rect.left + Math.min(24, hit.rect.width / 2),
    top: hit.rect.bottom,
  }
}

function closeTimingPopover() {
  activeTimingTarget.value = null
  hoveredTimingTarget.value = null
}

function handleTimingPopoverPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('.timing-config-popover')) return
  closeTimingPopover()
}

function handleTimingPopoverKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeTimingTarget.value) {
    closeTimingPopover()
  }
}

function updateActiveSpeechRate(value: unknown) {
  const segment = activeTimingSegment.value
  if (segment?.kind === 'dialogue' && (value === 'slow' || value === 'medium' || value === 'fast')) {
    segment.speechRate = value as DialogueSpeechRate
  }
}

function updateActiveShotCount(value: unknown) {
  const segment = activeTimingSegment.value
  const shotCount = Number(value)
  if (segment?.kind === 'action' && Number.isInteger(shotCount) && shotCount >= 1 && shotCount <= 5) {
    segment.shotCount = shotCount
  }
}

function updateActiveSecondsPerShot(value: unknown) {
  const segment = activeTimingSegment.value
  const seconds = Number(value)
  if (segment?.kind === 'action' && actionSecondsPerShotOptions.some((option) => option.value === seconds)) {
    segment.secondsPerShot = seconds
    segment.mode = seconds === 0 ? 'sync' : 'async'
  }
}

function setDialogueHighlightRef(element: unknown) {
  dialogueHighlightRef = element instanceof HTMLElement ? element : null
  syncDialogueHighlightScroll()
}

function setDialogueInputRef(input: unknown) {
  const current = dialogueInputRef

  if (!input || typeof input !== 'object') {
    current?.textarea.removeEventListener('scroll', current.handler)
    current?.observer?.disconnect()
    dialogueInputRef = null
    return
  }

  const candidate = input as { textarea?: HTMLTextAreaElement; $el?: HTMLElement }
  const textarea = candidate.textarea ?? candidate.$el?.querySelector('textarea') ?? null

  if (!textarea || current?.textarea === textarea) {
    syncDialogueHighlightScroll()
    return
  }

  current?.textarea.removeEventListener('scroll', current.handler)
  current?.observer?.disconnect()
  const handler = () => syncDialogueHighlightScroll()
  const observer = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(syncDialogueHighlightScroll)
  textarea.addEventListener('scroll', handler, { passive: true })
  observer?.observe(textarea)
  dialogueInputRef = { textarea, handler, observer }
  syncDialogueHighlightScroll()
}

function syncDialogueHighlightScroll() {
  if (!dialogueInputRef || !dialogueHighlightRef) {
    return
  }

  dialogueHighlightRef.scrollTop = dialogueInputRef.textarea.scrollTop
  dialogueHighlightRef.scrollLeft = dialogueInputRef.textarea.scrollLeft
}

function syncAllScriptHighlights() {
  scriptInputRefs.forEach((_, id) => syncScriptHighlightScroll(id))
}

watch(
  () => displayedShotCards.value.map(({ shot }) => `${shot.id}\u0001${shot.text}`).join('\u0000'),
  () => void nextTick(syncAllScriptHighlights),
  { flush: 'post' },
)

watch(
  () => JSON.stringify({
    episodeId: activeEpisode.value?.id,
    episodeCharacters: activeCharacterAssets.value,
    shots: displayedShotCards.value.map(({ shot }) => ({
      id: shot.id,
      text: shot.text,
      characterNames: shot.characters.map((character) => character.name),
      firstFrameMode: shot.firstFrameMode,
    })),
  }),
  () => displayedShotCards.value.forEach(({ shot }) => syncShotTimingSegments(shot)),
  { flush: 'sync' },
)

watch(
  () => activeEpisode.value,
  (episode) => {
    if (!episode) return
    initializeSharedCharacters(state, episode)
    if (episode.groupId) lastGroupEpisodes.set(episode.groupId, episode.id)
  },
  { immediate: true },
)

watch(
  () => state.activeEpisodeId,
  (episodeId, previousEpisodeId) => {
    if (episodeId !== previousEpisodeId) {
      openMaterialLibraryFolder(episodeId || null)
      cancelAnimationFrame(shotScrollAnimation)
      setNeighborScrollPadding(0)
      resetSingleExpandedView()
      void nextTick(() => {
        if (shotListRef.value) {
          scrollToCurrentEpisodeStart()
        }
      })
    }
  },
)

watch(
  () => JSON.stringify(state.episodes.map(({ id, groupId, title }) => ({ id, groupId, title }))),
  () => {
    clearInteriorEpisodeContacts(state.episodes)
    clearInteriorSplitEpisodeNumbers(state.episodes)
    pruneCharacterScopes(state)
  },
)

watch(
  () => JSON.stringify(state.episodes.map(({ id, groupId, title, shots }) => [id, groupId, title, shots.length])),
  () => reconcileShotReferences(state.episodes),
)

watch([dataDialogVisible, dataDialogView, activeGroupSummaryId, contactEditableIds], ([visible, view, groupId], [, , previousGroupId]) => {
  if (!visible || view !== 'group' || groupId !== previousGroupId || (activeContactEpisodeId.value && !contactEditableIds.value.has(activeContactEpisodeId.value))) {
    closeContactPersonDropdown()
  }
})

watch(
  () => selectableShotCards.value.map(({ shot }) => shot.id).join('\u0000'),
  () => {
    if (!isSelectableShot(state.singleExpandedShotId)) {
      state.singleExpandedShotId = selectableShotCards.value.find(card => card.region === 'current')?.shot.id ?? null
    }
  },
  { immediate: true },
)

watch(
  [dialogueOutputDraft, dialogueView],
  () => void nextTick(syncDialogueHighlightScroll),
  { flush: 'post' },
)

watch([episodeScriptDialogVisible, episodeScriptActiveTab], ([visible, tab]) => {
  const episode = activeEpisode.value
  if (!visible || tab !== 'shots' || !episode) return
  if (episode.splitScriptText === null) {
    episode.splitScriptText = normalizeSplitScriptText(null, episode.shots) ?? normalizeSplitScriptText(episode.scriptText, []) ?? ''
  }
  splitScriptDraft.value = episode.splitScriptText
  batchShotSegments.value = splitBatchShotText(splitScriptDraft.value)
})

watch(
  [episodeScriptDialogVisible, materialDialogVisible, episodeScriptActiveTab, () => materialSceneDrafts.value.length],
  resetMaterialSceneTransition,
  { flush: 'sync' },
)

function resetMaterialSceneTransition() {
  materialSceneTransitionsReady.value = false

  if (materialSceneTransitionFrame !== null) {
    cancelAnimationFrame(materialSceneTransitionFrame)
  }

  void nextTick(() => {
    materialSceneTransitionFrame = requestAnimationFrame(() => {
      materialSceneTransitionFrame = requestAnimationFrame(() => {
        materialSceneTransitionFrame = null
        materialSceneTransitionsReady.value = true
      })
    })
  })
}

function handleEpisodeCommand(command: string, episode: Episode) {
  if (workspaceView.value === 'editor' && command !== 'edit') episodeSwitchDropdownRef.value?.handleClose()

  if (command === 'edit') {
    editingEpisodeOriginalTitle.value = episode.title
    editingEpisodeNumber.value = getEpisodeNumberDraft(episode.title)
    editingEpisodeId.value = episode.id
    if (workspaceView.value === 'editor') episodeSwitchDropdownRef.value?.handleOpen()
    void nextTick(() => {
      requestAnimationFrame(() => {
        const container = Array.from(document.querySelectorAll<HTMLElement>('.rename-inline')).find(element => element.dataset.renameId === episode.id)
        const input = container?.querySelector<HTMLInputElement>('.el-input__inner')
        input?.focus()
        input?.select()
      })
    })
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
  if (command === 'summary') {
    openGroupSummary(groupId)
    return
  }

  if (command === 'archive') {
    const group = state.episodeGroups.find((item) => item.id === groupId)

    if (!group) {
      return
    }

    group.archived = !group.archived

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
    await ElMessageBox.confirm('删除剧集后，组内单集将移至“我的剧集”。', '删除剧集', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  state.episodes.forEach((episode) => {
    if (episode.groupId === groupId) {
      episode.characters = JSON.parse(JSON.stringify(assetsFor(state, episode)))
      episode.groupId = null
    }
  })
  state.episodeGroups = state.episodeGroups.filter((item) => item.id !== groupId)
}

function cloneEpisodeMaterials(sourceEpisodeId: string) {
  const targetEpisode = activeEpisode.value
  const sourceEpisode = state.episodes.find((episode) => episode.id === sourceEpisodeId)

  if (
    !targetEpisode
    || !sourceEpisode
    || sourceEpisode.id === targetEpisode.id
    || (sourceEpisode.groupId ?? null) !== (targetEpisode.groupId ?? null)
  ) {
    return
  }

  const existingCharacterNames = new Set(assetsFor(state, targetEpisode).map((character) => character.name))
  const characters = assetsFor(state, sourceEpisode)
    .filter((character) => !existingCharacterNames.has(character.name))
    .map((character) => ({ ...JSON.parse(JSON.stringify(character)), id: createId('asset'), availableUnits: episodeCharacterUnits(targetEpisode) } as CharacterAsset))
  const existingSceneNames = new Set(targetEpisode.scenes.map(sceneAssetKey))
  const scenes = sourceEpisode.scenes
    .filter((scene) => !existingSceneNames.has(sceneAssetKey(scene)))
    .map((scene) => createSceneAsset(scene.name, scene.time, scene.space))
  const added = characters.length + scenes.length
  const skipped = assetsFor(state, sourceEpisode).length + sourceEpisode.scenes.length - added

  assetsFor(state, targetEpisode).push(...characters)
  targetEpisode.scenes.push(...scenes)

  if (added && skipped) {
    notify.success(`已克隆 ${added} 项素材，跳过 ${skipped} 个重复项`)
  } else if (added) {
    notify.success(`已克隆 ${added} 项素材`)
  } else {
    notify.info('本集素材均已存在')
  }
}

function confirmMaterialDialog() {
  if (materialDialogKind.value === 'characters' && materialOutfitEditorRef.value?.hasIncompleteSingle) {
    materialDialogVisible.value = false
    return
  }
  if (commitMaterialDialog()) {
    materialDialogVisible.value = false
  }
}

async function commitEpisodeScriptMaterials() {
  const episode = activeEpisode.value
  if (!episode || episodeScriptSaving.value) return false
  episodeScriptSaving.value = true
  try {
    episode.scriptText = episodeScriptDraft.value
    addMaterialDrafts(false)
    if (!await saveNow()) return false
    refreshEpisodeScriptDerivedDrafts()
    notify.success('已保存原始剧本和素材')
    return true
  } finally {
    episodeScriptSaving.value = false
  }
}

async function continueFromEpisodeScriptMaterials() {
  if (await commitEpisodeScriptMaterials()) episodeScriptActiveTab.value = 'shots'
}

async function saveEpisodeScriptMaterials() {
  if (await commitEpisodeScriptMaterials()) episodeScriptDialogVisible.value = false
}

function handleMaterialDialogClosed() {
  if (materialDialogVisible.value) return
  materialEditingEpisodeId.value = null
  materialDialogMode.value = 'add'
  editingMaterial.value = null
  resetMaterialDrafts()
}

function createMaterialSceneDraft(): MaterialSceneDraft {
  return {
    name: '',
    time: '白天',
    space: '室内',
  }
}

function createMaterialSceneDrafts(count = 1) {
  return Array.from({ length: Math.max(1, count) }, () => createMaterialSceneDraft())
}

function resetMaterialDrafts(sceneCount = 1) {
  materialCharacterDraft.value = ''
  materialCharacterNoteDraft.value = ''
  materialCharacterAppearanceDraft.value = ''
  materialCharacterAppearanceEnabledDraft.value = false
  materialCharacterVoiceDraft.value = ''
  materialCharacterVoiceEnabledDraft.value = false
  materialCharacterTypeDraft.value = 'ordinary'
  materialCharacterTypeManuallySelected.value = false
  materialCharacterAvailableUnitsDraft.value = materialEditingEpisode.value ? episodeCharacterUnits(materialEditingEpisode.value) : []
  materialCharacterOutfitsDraft.value = []
  materialSceneDrafts.value = createMaterialSceneDrafts(sceneCount)
}

function batchShotUnitCount() {
  return splitBatchShotText(episodeScriptDraft.value).reduce((maximum, segment) => Math.max(maximum, segment.unitNumber), 0)
}

function requiredMaterialSceneDraftCount() {
  return Math.max(1, batchShotUnitCount())
}

function syncMaterialSceneDraftCount() {
  const requiredUnitCount = requiredMaterialSceneDraftCount()
  const currentUnitCount = materialSceneDrafts.value.length

  if (currentUnitCount < requiredUnitCount) {
    materialSceneDrafts.value.push(...createMaterialSceneDrafts(requiredUnitCount - currentUnitCount))
    return
  }

  if (currentUnitCount > requiredUnitCount) {
    materialSceneDrafts.value.splice(requiredUnitCount, currentUnitCount - requiredUnitCount)
  }
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

function openMaterialAddDialog(kind: MaterialKind, event?: MouseEvent, episode = activeEpisode.value) {
  if (!episode) return
  if (kind === 'scenes') scenePopoverReference.value = event ? event.currentTarget as HTMLElement : materialLibraryAddAnchorRef.value
  materialEditingEpisodeId.value = episode.id
  materialDialogMode.value = 'add'
  materialDialogKind.value = kind
  editingMaterial.value = null
  resetMaterialDrafts()
  materialDialogVisible.value = true
}

function openMaterialEditDialog(kind: MaterialKind, value: string, event?: MouseEvent, owner = activeEpisode.value) {
  const episode = owner

  if (!episode) {
    return
  }

  materialEditingEpisodeId.value = episode.id
  if (kind === 'characters') {
    const character = assetsFor(state, episode).find((item) => item.name === value)

    if (!character) {
      return
    }

    materialDialogMode.value = 'edit'
    editingMaterial.value = { kind, value }
    resetMaterialDrafts()
    materialCharacterDraft.value = character.name
    materialCharacterNoteDraft.value = character.note
    materialCharacterAppearanceDraft.value = character.appearanceDescription
    materialCharacterAppearanceEnabledDraft.value = character.appearanceDescriptionEnabled
    materialCharacterVoiceDraft.value = character.voiceDescription
    materialCharacterVoiceEnabledDraft.value = character.voiceDescriptionEnabled
    materialCharacterTypeDraft.value = character.isMain ? 'main' : character.isEnsemble ? 'ensemble' : 'ordinary'
    materialCharacterAvailableUnitsDraft.value = JSON.parse(JSON.stringify(character.availableUnits ?? []))
    materialCharacterOutfitsDraft.value = JSON.parse(JSON.stringify(character.outfits))
  } else {
    const scene = episode.scenes.find((item) => sceneAssetKey(item) === value)

    if (!scene) {
      return
    }

    materialDialogMode.value = 'edit'
    editingMaterial.value = { kind, value }
    resetMaterialDrafts()
    materialSceneDrafts.value = [{ name: scene.name, time: scene.time, space: scene.space }]
  }

  materialDialogKind.value = kind
  if (kind === 'scenes') scenePopoverReference.value = event!.currentTarget as HTMLElement
  materialDialogVisible.value = true
}

function commitMaterialDialog() {
  const editing = editingMaterial.value
  const episode = materialEditingEpisode.value
  const adding = materialDialogMode.value === 'add'

  if (!episode || (!adding && !editing)) {
    return false
  }

  if (materialDialogKind.value === 'characters') {
    const nextName = materialCharacterDraft.value.trim()

    if (!nextName) {
      notify.warning('请输入角色名称')
      return false
    }

    if ((adding || nextName !== editing?.value) && assetsFor(state, episode).some((character) => character.name === nextName)) {
      notify.warning('本集已存在同名角色')
      return false
    }

    materialCharacterNoteDraft.value = materialCharacterNoteDraft.value.trim() || (materialCharacterTypeDraft.value === 'main' && materialCharacterOutfitsDraft.value.length < 2 ? '原皮' : '')
    const draftAsset = { ...(assetsFor(state, episode).find(item => item.name === editing?.value) ?? createCharacterAsset(nextName)), outfits: materialCharacterOutfitsDraft.value }
    const outfitError = validateCharacterOutfits(state, episode, draftAsset)
    if (outfitError) { notify.warning(outfitError); return false }
    if (adding) {
      assetsFor(state, episode).push({ ...createCharacterAsset(nextName, materialCharacterAppearanceDraft.value.trim(), materialCharacterVoiceDraft.value.trim(), materialCharacterIsEnsembleDraft.value), isMain: materialCharacterTypeDraft.value === 'main', availableUnits: materialCharacterAvailableUnitsDraft.value.map(unit => ({ ...unit })), note: materialCharacterNoteDraft.value.trim(), appearanceDescriptionEnabled: materialCharacterAppearanceEnabledDraft.value, voiceDescriptionEnabled: materialCharacterVoiceEnabledDraft.value })
      notify.success('已添加角色')
    } else {
      updateCharacterMaterial(editing!.value, nextName, materialCharacterAppearanceDraft.value, materialCharacterVoiceDraft.value, materialCharacterIsEnsembleDraft.value)
    }
    return true
  }

  const draft = materialSceneDrafts.value[0]
  const nextName = draft?.name.trim() ?? ''

  if (!draft || !nextName) {
    notify.warning('请输入场景名称')
    return false
  }

  const nextKey = sceneAssetKey({ name: nextName, time: draft.time })
  if ((adding || nextKey !== editing?.value) && episode.scenes.some((scene) => sceneAssetKey(scene) === nextKey)) {
    notify.warning('本集已存在同名、同时段的场景素材')
    return false
  }

  if (adding) {
    episode.scenes.push(createSceneAsset(nextName, draft.time, draft.space))
    notify.success('已添加场景素材')
  } else {
    renameSceneMaterial(editing!.value, {
      name: nextName,
      time: draft.time,
      space: draft.space,
    })
  }
  return true
}

function updateCharacterMaterial(oldName: string, nextName: string, appearanceDescription: string, voiceDescription: string, isEnsemble: boolean) {
  const episode = materialEditingEpisode.value

  if (!episode) {
    return
  }

  const characterAsset = assetsFor(state, episode).find((character) => character.name === oldName)

  if (!characterAsset) {
    return
  }

  characterAsset.name = nextName
  characterAsset.note = materialCharacterNoteDraft.value.trim()
  characterAsset.appearanceDescription = appearanceDescription.trim()
  characterAsset.appearanceDescriptionEnabled = materialCharacterAppearanceEnabledDraft.value
  characterAsset.voiceDescription = voiceDescription.trim()
  characterAsset.voiceDescriptionEnabled = materialCharacterVoiceEnabledDraft.value
  characterAsset.isEnsemble = isEnsemble
  characterAsset.isMain = materialCharacterTypeDraft.value === 'main'
  characterAsset.availableUnits = materialCharacterAvailableUnitsDraft.value.map(unit => ({ ...unit }))
  characterAsset.outfits = JSON.parse(JSON.stringify(materialCharacterOutfitsDraft.value))
  characterAsset.outfits.forEach(outfit => { outfit.note = outfit.note.trim() })
  const scope = state.episodes.filter(item => episode.groupId ? item.groupId === episode.groupId : item.id === episode.id)
  scope.flatMap(item => item.shots).forEach((shot) => {
    shot.characters.forEach((character) => {
      if (character.characterId === characterAsset.id || character.name === oldName) {
        character.characterId = characterAsset.id
        character.name = nextName
      }
    })
  })
}

function renameSceneMaterial(oldKey: string, nextScene: MaterialSceneDraft) {
  const episode = materialEditingEpisode.value
  const sceneAsset = episode?.scenes.find((scene) => sceneAssetKey(scene) === oldKey)

  if (!episode || !sceneAsset) {
    return
  }

  sceneAsset.name = nextScene.name
  sceneAsset.time = nextScene.time
  sceneAsset.space = nextScene.space
  episode.shots.forEach((shot) => {
    shot.scenes.forEach((scene) => {
      if (sceneAssetKey(scene) === oldKey) {
        scene.name = nextScene.name
        scene.time = nextScene.time
        scene.space = nextScene.space
      }
    })
  })
}

function syncCharacterStatus(sourceShot: Shot, source: CharacterConfig, scope: StatusSyncScope) {
  const episode = episodeForShot(sourceShot)
  const name = source.name.trim()

  if (!episode || !name) {
    return
  }

  const sourceUnitNumber = normalizeShotUnitNumber(sourceShot.unitNumber)
  let count = 0
  const targetShots = scope === 'unit'
    ? episode.shots.filter((shot) => normalizeShotUnitNumber(shot.unitNumber) === sourceUnitNumber)
    : episode.shots
  targetShots.forEach((shot) => {
    shot.characters.forEach((character) => {
      if (character.name === name) {
        character.statusText = source.statusText ?? ''
        count += 1
      }
    })
  })
  notify.success(scope === 'unit' ? `已同步本单元角色状态，共 ${count} 项` : `已同步全篇角色状态，共 ${count} 项`)
}

function addEpisodesFromMenu(count: number) {
  const groupId = activeEpisode.value!.groupId
  const start = Number(episodeStartNumber.value)
  if (!Number.isSafeInteger(start) || start <= 0 || !Number.isSafeInteger(start + count - 1)) {
    notify.warning('请输入有效的正整数集号')
    return
  }
  for (let offset = 0; offset < count; offset += 1) {
    if (isEpisodeNumberUsed(groupId, start + offset)) {
      notify.warning(`当前分组已存在${formatEpisodeTitle(start + offset)}`)
      return
    }
  }
  const episodes = Array.from({ length: count }, (_, index) => ({ ...createEpisode(start + index), groupId }))
  state.episodes.push(...episodes)
  selectEpisode(episodes[0])
  episodeSwitchDropdownRef.value?.handleClose()
  notify.success(`已添加 ${count} 集`)
}

async function deleteEpisodeById(id: string) {
  if (state.episodes.length === 1) {
    notify.warning('至少保留一个单集')
    return
  }

  const episode = state.episodes.find((item) => item.id === id)

  if (!episode) {
    return
  }

  try {
    await ElMessageBox.confirm(`确认删除“${episode.title}”？`, '删除单集', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const index = state.episodes.findIndex((item) => item.id === id)
  state.pointInvoices.forEach((invoice) => invoice.usages.forEach((usage) => usage.episodes.forEach((reference) => {
    if (reference.episodeId !== id) return
    reference.episodeTitle = episode.title
    reference.groupTitle = getEpisodeGroupTitle(episode.groupId)
  })))
  state.episodes.splice(index, 1)

  if (state.activeEpisodeId === id) {
    selectEpisode(state.episodes[Math.max(index - 1, 0)])
  }
}

function splitBatchShotText(value: string): BatchShotSegment[] {
  const segments: BatchShotSegment[] = []
  let unitNumber = 1

  value
    .replace(/\r\n/g, '\n')
    .split(/===/g)
    .forEach((unitText) => {
      const unitSegments: Omit<BatchShotSegment, 'unitNumber'>[] = []
      unitText.split(/---/g).forEach((item, index) => {
        let text = item
        let remark = ''

        if (index > 0) {
          const remarkMatch = text.match(/^[ \t　]*#([^#\r\n]*)#/)

          if (remarkMatch) {
            remark = remarkMatch[1].trim() ? remarkMatch[1] : ''
            text = text.slice(remarkMatch[0].length)
          }
        }

        text = text.trim()

        if (text) {
          unitSegments.push({
            text,
            remark,
          })
        }
      })

      if (!unitSegments.length) {
        return
      }

      segments.push(...unitSegments.map((segment) => ({ ...segment, unitNumber })))
      unitNumber += 1
    })

  return segments
}

function batchShotNumber(segment: BatchShotSegment, index: number) {
  const episode = activeEpisode.value

  if (!episode) {
    return ''
  }

  const shotNumber = batchShotSegments.value
    .slice(0, index + 1)
    .filter((item) => item.unitNumber === segment.unitNumber)
    .length

  return `${parseEpisodeNumber(episode.title)}-${segment.unitNumber}-${shotNumber}`
}

function batchShotMatchedCharacterCount(text: string) {
  return detectCharacters(text, activeCharacterAssets.value.map((character) => character.name) ?? []).length
}

function applyUnitSceneToEmptyShot(episode: Episode, shot: Shot, unitNumber: number, sceneDrafts: MaterialSceneDraft[]) {
  if (hasConfiguredScenes(shot)) {
    return
  }

  const draft = sceneDrafts[unitNumber - 1]
  const sceneAsset = draft?.name.trim() ? episode.scenes.find((scene) => sceneAssetKey(scene) === sceneAssetKey(draft)) : null

  if (!sceneAsset) {
    return
  }

  const preservedStatus = shot.scenes.find((scene) => scene.statusText?.trim())?.statusText ?? shot.scenes[0]?.statusText ?? ''
  shot.scenes = [createSceneConfig(sceneAsset.name, sceneAsset.time, sceneAsset.space, preservedStatus)]
}

async function syncEpisodeShots(episode: Episode, segments: BatchShotSegment[], sceneDrafts: MaterialSceneDraft[], assets: CharacterAsset[]) {
  if (!segments.length) {
    return 0
  }

  const nextShots = segments.map((segment, index) => {
    const shot = episode.shots[index] ? JSON.parse(JSON.stringify(episode.shots[index])) as Shot : createShot(segment.unitNumber)
    shot.text = segment.text
    shot.remark = segment.remark
    shot.thirtySecondMode = true
    shot.unitNumber = segment.unitNumber
    applyUnitSceneToEmptyShot(episode, shot, segment.unitNumber, sceneDrafts)
    return shot
  })
  nextShots.forEach((shot, index) => {
    const contextText = [takeTrailingPunctuationSegments(nextShots[index - 1]?.text ?? '', shot.connectPreviousCount), shot.text, takeLeadingPunctuationSegments(nextShots[index + 1]?.text ?? '', shot.connectNextCount)].filter(Boolean).join('\n')
    const detected = detectCharacters(contextText, assets.map(asset => asset.name)).map(character => ({ ...character, includeVoice: character.includeVoice && !assets.find(asset => asset.name === character.name)?.isEnsemble }))
    shot.characters = mergeDetectedCharacters(shot.characters, detected, true)
  })
  const unitMap = compactShotUnitNumbers(nextShots)
  for (const asset of assets) mapCharacterUnitReferences(asset, units => units.filter(unit => unit.episodeId !== episode.id || unitMap.has(unit.unitNumber))
    .map(unit => unit.episodeId === episode.id ? { ...unit, unitNumber: unitMap.get(unit.unitNumber)! } : unit))
  if (!await approveEpisodeCharacters({ ...episode, shots: nextShots }, assets)) return 0
  episode.shots = nextShots
  episode.shots.forEach(syncShotTimingSegments)
  normalizeEpisodeShotConnections(episode)
  return segments.length
}

function isSelectableShot(id: string | null) {
  return Boolean(id && selectableShotCards.value.some(card => card.shot.id === id))
}

function resetSingleExpandedView() {
  state.singleExpandedShotId = selectableShotCards.value.find(card => card.region === 'current')?.shot.id ?? null
  state.shotViewMode = 'expanded'
}
function shotScrollContainer() {
  const list = shotListRef.value!
  return getComputedStyle(list).overflowY === 'visible' ? document.scrollingElement as HTMLElement : list
}
function setNeighborScrollPadding(value: number) {
  neighborScrollPadding = value
  // Animation-only space must not trigger a render of every shot card.
  if (neighborScrollSpacerRef.value) neighborScrollSpacerRef.value.style.flexBasis = `${value}px`
}
async function scrollShotListTo(shotId: string, mode: 'smooth' | 'instant' | 'preserve' = 'smooth', offset = 0) {
  cancelAnimationFrame(shotScrollAnimation)
  await nextTick()
  if (workspaceView.value !== 'editor') return
  const list = shotScrollContainer()
  const row = document.getElementById(shotRowElementId(shotId))!
  const lastRow = shotListRef.value!.querySelector<HTMLElement>('.shot-row:last-of-type')
  const start = list.scrollTop
  const started = performance.now()
  const frame = (now: number) => {
    if (!row.isConnected) return
    const progress = mode === 'instant' ? 1 : Math.min(1, (now - started) / 550)
    const top = list === document.scrollingElement ? 0 : list.getBoundingClientRect().top
    const naturalEnd = lastRow ? list.scrollTop + lastRow.getBoundingClientRect().bottom - top - list.clientHeight : 0
    const destination = Math.max(0, list.scrollTop + row.getBoundingClientRect().top - top - offset)
    const nextTop = mode === 'smooth' ? start + (destination - start) * (1 - (1 - progress) ** 3) : destination
    // Shrink the spacer with the scroll, so removing it cannot abruptly clamp the current position.
    setNeighborScrollPadding(Math.max(destination - naturalEnd, nextTop > 0 ? nextTop - naturalEnd : 0, 0))
    list.scrollTop = nextTop
    if (progress < 1) shotScrollAnimation = requestAnimationFrame(frame)
  }
  shotScrollAnimation = requestAnimationFrame(frame)
}
function scrollToCurrentEpisodeStart() {
  const first = activeEpisode.value?.shots[0]
  if (first) void scrollShotListTo(first.id, 'instant')
}
async function toggleNeighborUnit(direction: -1 | 1) {
  const episode = activeEpisode.value!
  const removing = direction < 0 ? episode.showPreviousEpisodeUnit : episode.showNextEpisodeUnit
  let retainedPosition: { shotId: string; offset: number } | undefined
  if (removing) {
    cancelAnimationFrame(shotScrollAnimation)
    const list = shotScrollContainer()
    const top = list === document.scrollingElement ? 0 : list.getBoundingClientRect().top
    const remaining = displayedShotCards.value.filter(card => card.region !== (direction < 0 ? 'previous' : 'next'))
      .map(card => ({ shotId: card.shot.id, row: document.getElementById(shotRowElementId(card.shot.id))! }))
    const anchor = remaining.find(item => item.row.getBoundingClientRect().bottom > top) ?? remaining.at(-1)
    if (anchor) retainedPosition = { shotId: anchor.shotId, offset: anchor.row.getBoundingClientRect().bottom > top ? anchor.row.getBoundingClientRect().top - top : 0 }
    setNeighborScrollPadding(neighborScrollPadding + displayedShotCards.value
      .filter(card => card.region === (direction < 0 ? 'previous' : 'next'))
      .reduce((height, card) => height + document.getElementById(shotRowElementId(card.shot.id))!.getBoundingClientRect().height, 0))
  }
  if (direction < 0) episode.showPreviousEpisodeUnit = !episode.showPreviousEpisodeUnit
  else episode.showNextEpisodeUnit = !episode.showNextEpisodeUnit
  await nextTick()
  if (removing) {
    if (retainedPosition) void scrollShotListTo(retainedPosition.shotId, 'preserve', retainedPosition.offset)
    else setNeighborScrollPadding(0)
    return
  }
  const enabled = direction < 0 ? episode.showPreviousEpisodeUnit : episode.showNextEpisodeUnit
  const region = enabled && direction < 0 ? 'previous' : 'current'
  const candidates = selectableShotCards.value.filter(card => card.region === region)
  const useLast = direction > 0 || enabled
  const target = useLast ? candidates.at(-1) : candidates[0]
  state.singleExpandedShotId = target?.shot.id ?? selectableShotCards.value.find(card => card.region === 'current')?.shot.id ?? null
  if (state.singleExpandedShotId) void scrollShotListTo(state.singleExpandedShotId)
  else setNeighborScrollPadding(0)
}
function toggleShotAccordion() {
  state.shotViewMode = state.shotViewMode === 'single-expanded' ? 'expanded' : 'single-expanded'
  if (state.singleExpandedShotId) void scrollShotListTo(state.singleExpandedShotId)
}
function handleShotViewModeChange(value: string | number | boolean | undefined) {
  const shot = typeof value === 'string'
    ? displayedShotCards.value.find(card => card.shot.id === value)?.shot
    : null
  if (shot) selectShotView(shot)
}

function shotRowElementId(id: string) {
  return `shot-row-${id}`
}

function selectShotView(shot: Shot) {
  if (!isSelectableShot(shot.id)) {
    return
  }

  state.singleExpandedShotId = shot.id
  void scrollShotListTo(shot.id)
}

function isShotCollapsed(shot: Shot) {
  return linkedCurrentShotIds.value.has(shot.id) || state.shotViewMode === 'single-expanded' && shot.id !== state.singleExpandedShotId
}

function hasModifiedShots(episode: Episode) {
  return episode.shots.some((shot) => (
    Boolean(shot.text.trim())
    || Boolean(shot.remark.trim())
    || !shot.thirtySecondMode
    || shot.connectPreviousCount > 0
    || shot.connectNextCount > 0
    || hasConfiguredScenes(shot)
    || shot.characters.length > 0
    || shot.timingSegments.some((segment) => (
      segment.kind === 'dialogue'
        ? segment.speechRate !== 'medium'
        : segment.mode !== 'async' || segment.shotCount !== 1 || segment.secondsPerShot !== 2
    ))
    || shot.firstFrameMode
    || shot.referenceShotNumber !== null
    || shot.referenceEpisodeId !== null
    || shot.status !== 'incomplete'
    || !isReviewDefault(shot.review)
  ))
}

function hasExistingShotConfiguration(episode: Episode) {
  return episode.shots.length > 1 || hasModifiedShots(episode)
}

function deleteShot(id: string) {
  const episode = shotOwners.value.get(id)
  if (!episode) {
    return
  }

  if (episode.shots.length === 1) {
    notify.warning('至少保留一条分镜')
    return
  }

  episode.shots = episode.shots.filter((shot) => shot.id !== id)
  const unitMap = compactShotUnitNumbers(episode.shots)
  for (const asset of assetsFor(state, episode)) mapCharacterUnitReferences(asset, units => units.filter(unit => unit.episodeId !== episode.id || unitMap.has(unit.unitNumber))
    .map(unit => unit.episodeId === episode.id ? { ...unit, unitNumber: unitMap.get(unit.unitNumber)! } : unit))
  normalizeEpisodeShotConnections(episode)
}

function addMaterialDrafts(showNotification = true): MaterialAddResult {
  const episode = activeEpisode.value

  if (!episode) {
    return { added: 0, skipped: 0 }
  }

  const characterResult = addCharacterMaterials(episode, materialCharacterDraft.value)
  const sceneResult = addSceneMaterials(episode, materialSceneDrafts.value)
  const added = characterResult.added + sceneResult.added
  const skipped = characterResult.skipped + sceneResult.skipped

  if (showNotification) {
    if (added && skipped) {
      notify.success(`已添加 ${added} 项素材，跳过 ${skipped} 个重复项`)
    } else if (added) {
      notify.success(`已添加 ${added} 项素材`)
    } else if (skipped) {
      notify.info('输入的素材均已存在')
    }
  }

  return { added, skipped }
}

function addCharacterMaterials(episode: Episode, value: string): MaterialAddResult {
  const items = splitMaterialInput(value)

  if (!items.length) {
    return { added: 0, skipped: 0 }
  }

  const existingNames = new Set(assetsFor(state, episode).map((character) => character.name))
  const added = items.filter((item) => !existingNames.has(item))

  assetsFor(state, episode).push(...added.map((name) => ({ ...createCharacterAsset(name), availableUnits: episodeCharacterUnits(episode) })))

  return {
    added: added.length,
    skipped: items.length - added.length,
  }
}

function addSceneMaterials(episode: Episode, drafts: MaterialSceneDraft[]): MaterialAddResult {
  const existingNames = new Set(episode.scenes.map(sceneAssetKey))
  const draftNames = new Set<string>()
  let skipped = 0

  const added = drafts
    .map((draft) => ({ ...draft, name: draft.name.trim() }))
    .filter((draft) => {
      if (!draft.name) {
        return false
      }

      const key = sceneAssetKey(draft)
      if (existingNames.has(key) || draftNames.has(key)) {
        skipped += 1
        return false
      }

      draftNames.add(key)
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
        .split(/[、；，;,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function removeMaterial(kind: MaterialKind, value: string, episode = activeEpisode.value) {
  if (!episode) {
    return
  }

  if (kind === 'characters') {
    assetsFor(state, episode).splice(0, assetsFor(state, episode).length, ...assetsFor(state, episode).filter((item) => item.name !== value))
    state.episodes.filter(item => episode.groupId ? item.groupId === episode.groupId : item.id === episode.id).forEach(item => item.shots.forEach(shot => { shot.characters = shot.characters.filter(character => character.name !== value) }))
    return
  }

  episode.scenes = episode.scenes.filter((item) => sceneAssetKey(item) !== value)
}

function syncSceneFromAsset(scene: SceneConfig, key: string, episode = activeEpisode.value) {
  const selected = episode?.scenes.find((item) => sceneAssetKey(item) === key)

  if (!selected) {
    return
  }

  scene.name = selected.name
  scene.time = selected.time
  scene.space = selected.space
}

function groupCharactersByType<T extends CharacterAsset>(assets: T[]) {
  return characterTypeGroups.map(group => ({ ...group, items: assets.filter(asset => (asset.isMain ? 'main' : asset.isEnsemble ? 'ensemble' : 'ordinary') === group.value) }))
    .filter(group => group.items.length)
}

function availableCharacterAssets(shot: Shot) {
  const episode = episodeForShot(shot)
  return assetsFor(state, episode).filter(asset => characterAvailableInUnit(asset, episode.id, shot.unitNumber)
    && !shot.characters.some(character => character.name === asset.name))
    .sort((a, b) => compareCharacterAssets(a, b, referencedCharactersByEpisode.value.get(episode.id)))
}

async function addCharacterToShot(shot: Shot, name: string) {
  const asset = availableCharacterAssets(shot).find((character) => character.name === name)

  if (!asset) {
    notify.info('暂无可添加的角色')
    return
  }

  await applyShotCharacters(shot, [...shot.characters, createCharacterConfig(asset.name)])
}

function removeCharacterFromShot(shot: Shot, id: string) {
  shot.characters = shot.characters.filter((character) => character.id !== id)
}

function characterCloneSources(target: Shot) {
  const currentEpisode = episodeForShot(target)
  if (!currentEpisode) return []
  const targetIndex = shotIndex(target)
  return continuousEpisodes(state.episodes, currentEpisode).filter(episode => episode.shots.length)
    .flatMap((episode, episodeIndex) => episode.shots.map((shot, index) => ({
      episode, shot, index, divided: episodeIndex > 0 && index === 0,
      adjacentLabel: episode.id === currentEpisode.id
        ? index === targetIndex - 1 ? '前' : index === targetIndex + 1 ? '后' : ''
        : '',
    })))
}

function referenceSelectionId(episode: Episode, index: number) {
  const shot = episode.shots[index]
  const source = shot.referenceEpisodeId ? state.episodes.find(item => item.id === shot.referenceEpisodeId)! : episode
  return source.shots[(shot.referenceShotNumber ?? index + 1) - 1]?.id
}

function selectShotReference(shot: Shot, sourceShotId: string) {
  const episode = episodeForShot(shot)
  const source = continuousEpisodes(state.episodes, episode).find(item => item.shots.some(shot => shot.id === sourceShotId))!
  shot.referenceEpisodeId = source.id === episode.id ? null : source.id
  shot.referenceShotNumber = source.shots.findIndex(shot => shot.id === sourceShotId) + 1
}

async function cloneShotCharacters(target: Shot, sourceId: string) {
  const selected = characterCloneSources(target).find((item) => item.shot.id === sourceId)
  if (sourceId === target.id || !selected?.shot.characters.length) return
  const source = selected.shot
  const episode = episodeForShot(target)
  const assets: CharacterAsset[] = JSON.parse(JSON.stringify(assetsFor(state, episode)))
  if (selected.episode.id !== episode.id) {
    source.characters.forEach((character) => {
      const asset = assetsFor(state, selected.episode).find((asset) => asset.name === character.name)
      if (asset && !assets.some((item) => item.name === asset.name)) {
        assets.push({ ...JSON.parse(JSON.stringify(asset)), id: createId('asset'), availableUnits: [] })
      }
    })
  }

  const voices = new Set(detectCharacters(effectiveShotText(target), source.characters.map((character) => character.name))
    .filter((character) => character.includeVoice && !assets.find(asset => asset.name === character.name)?.isEnsemble)
    .map((character) => character.name))
  const cloned = source.characters.map((character) => ({
    ...character,
    id: createId('character'),
    includeVoice: voices.has(character.name),
  }))
  const candidate = { ...episode, characters: episode.groupId ? [] : assets, shots: episode.shots.map(shot => shot.id === target.id ? { ...shot, characters: cloned } : shot) }
  if (!await approveEpisodeCharacters(candidate, assets)) return
  const group = state.episodeGroups.find(group => group.id === episode.groupId)
  if (group) group.characters = assets
  else episode.characters = assets
  target.characters = cloned
  target.pendingDetection = null
  target.autoSyncNotice = null
  target.undoCharacters = null
  notify.success('已克隆角色配置')
}

function characterAppearanceInfo(name: string, shot: Shot) {
  const episode = episodeForShot(shot)
  const asset = assetsFor(state, episode).find(character => character.name === name)
  const description = asset ? characterAppearance(asset, episode.id, shot).description : ''
  const icon = asset?.isMain ? description ? MainCharacterFilled : MainCharacter
    : asset?.isEnsemble ? description ? GrapeFilled : Grape
    : description ? UserFilled : User
  return { description, icon }
}

function characterVoiceDescription(name: string, episode = activeEpisode.value!) {
  const asset = assetsFor(state, episode).find(character => character.name === name)
  return asset?.voiceDescriptionEnabled ? asset.voiceDescription.trim() : ''
}

function isEnsembleCharacter(name: string, episode = activeEpisode.value!) {
  return assetsFor(state, episode).find((character) => character.name === name)?.isEnsemble ?? false
}

function isVoiceOverflow(shot: Shot) {
  return shot.characters.filter((character) => character.includeVoice && !isEnsembleCharacter(character.name, episodeForShot(shot))).length > 3
}

function hasConfiguredScenes(shot: Shot) {
  return shot.scenes.some((scene) => scene.name.trim() || scene.statusText?.trim())
}

function timingCharacterNames(shot: Shot) {
  return Array.from(new Set([
    ...(assetsFor(state, shotOwners.value.get(shot.id) ?? activeEpisode.value!).map((character) => character.name) ?? []),
    ...shot.characters.map((character) => character.name),
  ].map((name) => name.trim()).filter(Boolean)))
}

function syncShotTimingSegments(shot: Shot) {
  const reconciled = reconcileTimingSegments(shot.text, timingCharacterNames(shot), shot.timingSegments, shot.firstFrameMode)
  if (JSON.stringify(reconciled) !== JSON.stringify(shot.timingSegments)) {
    shot.timingSegments = reconciled
  }
}

function sourceShotTimingAnalysis(shot: Shot, start = 0, end = shot.text.length) {
  return analyzeTimingRange(shot.text, timingCharacterNames(shot), shot.timingSegments, start, end, shot.firstFrameMode)
}

function shotTimingAnalysis(shot: Shot): TimingAnalysis {
  const episode = episodeForShot(shot)
  const index = shotIndex(shot)
  const analyses = [sourceShotTimingAnalysis(shot)]

  if (episode && index > 0 && shot.connectPreviousCount > 0) {
    const previous = episode.shots[index - 1]
    const fragment = previousShotTail(index, shot.connectPreviousCount, episode)
    const start = previous.text.lastIndexOf(fragment)
    if (fragment && start >= 0) {
      analyses.unshift(sourceShotTimingAnalysis(previous, start, start + fragment.length))
    }
  }

  if (episode && index >= 0 && index < episode.shots.length - 1 && shot.connectNextCount > 0) {
    const next = episode.shots[index + 1]
    const fragment = nextShotHead(index, shot.connectNextCount, episode)
    const start = next.text.indexOf(fragment)
    if (fragment && start >= 0) {
      analyses.push(sourceShotTimingAnalysis(next, start, start + fragment.length))
    }
  }

  return sumTimingAnalyses(analyses)
}

function batchTimingAnalysis(text: string) {
  return analyzeTimingRange(text, activeCharacterAssets.value.map((character) => character.name) ?? [], [])
}

function formatTimingSeconds(seconds: number) {
  return `${seconds.toFixed(1)} 秒`
}

function formatTimingShare(seconds: number, totalSeconds: number) {
  const percent = totalSeconds > 0 ? Math.round(seconds / totalSeconds * 100) : 0
  return `${formatTimingSeconds(seconds)} · 占比 ${percent}%`
}

function shotTimingTitleStats(shot: Shot) {
  const analysis = shotTimingAnalysis(shot)
  return `${analysis.totalSeconds.toFixed(1)}秒`
}

function isDurationOutsideRange(seconds: number, hasText: boolean, thirtySecondMode = false) {
  const min = 4
  const max = 15 * (thirtySecondMode ? 2 : 1)
  return { warn: hasText && (seconds < min || seconds > max) }
}

function shotDurationState(shot: Shot) {
  return isDurationOutsideRange(shotTimingAnalysis(shot).totalSeconds, Boolean(effectiveShotText(shot)), shot.thirtySecondMode)
}

function batchDurationState(text: string, thirtySecondMode = false) {
  return isDurationOutsideRange(batchTimingAnalysis(text).totalSeconds, Boolean(text.trim()), thirtySecondMode)
}

function promptPreviewWarnings(shot: Shot) {
  const warnings: string[] = []
  const configuredCharacters = shot.characters.filter((character) => character.name.trim())
  const text = effectiveShotText(shot)

  if (!configuredCharacters.length) {
    warnings.push('未配置角色')
  }

  if (!hasConfiguredScenes(shot)) {
    warnings.push('未配置场景')
  }

  if (!shot.thirtySecondMode && isVoiceOverflow(shot)) {
    warnings.push('发生角色超过 3 个')
  }

  const seconds = shotTimingAnalysis(shot).totalSeconds
  const min = 4
  const max = 15 * (shot.thirtySecondMode ? 2 : 1)

  if (text && (seconds < min || seconds > max)) {
    warnings.push(`推荐时长 ${formatTimingSeconds(seconds)}，超出推荐范围 ${formatTimingSeconds(min)}～${formatTimingSeconds(max)}`)
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
  const highlightedRanges = [
    ...parseFirstFrameText(text).ranges.flatMap(({ start, end }) => [
      { start, end: start + 2, className: 'script-note-bracket' },
      { start: start + 2, end: end - 2, className: 'script-note' },
      { start: end - 2, end, className: 'script-note-bracket' },
    ]),
    ...Array.from(text.matchAll(/\[([^\[\]\r\n]+)\]/g))
      .filter((match) => match[1].trim())
      .map((match) => ({ start: match.index, end: match.index + match[0].length, className: 'manual-reference' })),
    ...findPhoneVoiceMatches(text)
      .map((match) => ({ start: match.index, end: match.index + match[0].length, className: 'phone-voice-marker' })),
  ].sort((a, b) => a.start - b.start)
  const characters = shot.characters
    .map((character) => {
      const name = character.name.trim()
      return {
        name,
        matchName: normalizeCharacterNameForMatch(name),
        includeVoice: character.includeVoice && !isEnsembleCharacter(character.name, episodeForShot(shot)),
      }
    })
    .filter((character, index, list) => character.name && character.matchName && list.findIndex((item) => item.matchName === character.matchName) === index)
    .sort((a, b) => b.matchName.length - a.matchName.length)

  const highlightCharacters = (value: string) => {
    if (!characters.length) return escapeHtml(value)
    const pattern = new RegExp(characters.map((character) => escapeRegExp(character.matchName)).join('|'), 'g')
    const parts: string[] = []
    let cursor = 0
    value.replace(pattern, (match, offset: number) => {
      parts.push(escapeHtml(value.slice(cursor, offset)))
      const character = characters.find((item) => item.matchName === match)
      const className = character?.includeVoice ? 'matched-character with-voice' : 'matched-character without-voice'
      parts.push('<mark class="' + className + '">' + escapeHtml(match) + '</mark>')
      cursor = offset + match.length
      return match
    })
    parts.push(escapeHtml(value.slice(cursor)))
    return parts.join('')
  }

  const highlightRange = (start: number, end: number, render: (value: string) => string) => {
    const parts: string[] = []
    let cursor = start
    highlightedRanges.forEach((match) => {
      const matchStart = Math.max(start, match.start, cursor)
      const matchEnd = Math.min(end, match.end)
      if (matchStart >= matchEnd) return
      parts.push(render(text.slice(cursor, matchStart)))
      parts.push(`<mark class="${match.className}">${escapeHtml(text.slice(matchStart, matchEnd))}</mark>`)
      cursor = matchEnd
    })
    parts.push(render(text.slice(cursor, end)))
    return parts.join('')
  }

  const resolved = resolveTimingSegments(shot.text, timingCharacterNames(shot), shot.timingSegments, shot.firstFrameMode)
  const highlightPrefix = (value: string) => value.split(/((?:os|vo)(?=\s*(?:（[^）\r\n]*）|\([^\)\r\n]*\))?\s*[：:]))/gi)
    .map((part, index) => index % 2
      ? `<span class="voice-marker">${escapeHtml(part)}</span>`
      : highlightCharacters(part))
    .join('')
  const parts: string[] = []
  let cursor = 0
  resolved.forEach((segment) => {
    parts.push(highlightRange(cursor, segment.start, highlightPrefix))
    const modeClass = segment.config.kind === 'action' ? ` is-${segment.config.mode}` : ''
    const highlightedContent = highlightRange(segment.start, segment.end,
      segment.kind === 'dialogue' ? escapeHtml : highlightCharacters)
    parts.push(
      `<mark class="timing-segment is-${segment.kind}${modeClass}" data-timing-id="${segment.id}">`
      + highlightedContent
      + '</mark>',
    )
    cursor = segment.end
  })
  parts.push(highlightRange(cursor, text.length, highlightCharacters))
  return parts.join('')
}

function highlightDialogueReplacements(line: string, replacementTerms: string[]) {
  if (!replacementTerms.length) {
    return escapeHtml(line)
  }

  const pattern = new RegExp(replacementTerms.map(escapeRegExp).join('|'), 'g')
  const highlightedParts: string[] = []
  let cursor = 0

  line.replace(pattern, (match, offset: number) => {
    highlightedParts.push(escapeHtml(line.slice(cursor, offset)))
    highlightedParts.push(`<mark class="dialogue-replacement-highlight">${escapeHtml(match)}</mark>`)
    cursor = offset + match.length
    return match
  })

  highlightedParts.push(escapeHtml(line.slice(cursor)))
  return highlightedParts.join('')
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
function toggleEpisodeFirstFrameModeFromShot(shot: Shot) {
  const enabled = !shot.firstFrameMode
  episodeForShot(shot).shots.forEach((item) => {
    item.firstFrameMode = enabled
  })
  notify.success(`已${enabled ? '开启' : '关闭'}本集全部首帧`)
}

function toggleEpisodeThirtySecondModeFromShot(shot: Shot) {
  const enabled = !shot.thirtySecondMode
  episodeForShot(shot).shots.forEach((item) => {
    item.thirtySecondMode = enabled
  })
  notify.success(`已将本集全部分镜切换为 ${enabled ? 'SD2.5' : 'SD2.0'}`)
}

function shotIndex(shot: Shot) {
  return episodeForShot(shot).shots.findIndex((item) => item.id === shot.id) ?? -1
}

function previousShotTail(index: number, count = 1, episode = activeEpisode.value!) {
  const previous = episode.shots[index - 1]
  return takeTrailingPunctuationSegments(previous?.text ?? '', count)
}

function nextShotHead(index: number, count = 1, episode = activeEpisode.value!) {
  const next = episode.shots[index + 1]
  return takeLeadingPunctuationSegments(next?.text ?? '', count)
}

function connectedPreviousText(shot: Shot, index: number) {
  return previousShotTail(index, shot.connectPreviousCount, episodeForShot(shot))
}

function connectedNextText(shot: Shot, index: number) {
  return nextShotHead(index, shot.connectNextCount, episodeForShot(shot))
}

function shotConnectionValue(shot: Shot, index: number) {
  const connection = normalizeStoredShotConnection(
    shot.connectPreviousCount,
    shot.connectPrevious,
    shot.connectNextCount,
    shot.connectNext,
    index > 0,
    index < episodeForShot(shot).shots.length - 1,
  )

  return [
    connection.connectNext ? -connection.connectNextCount : 0,
    connection.connectPrevious ? connection.connectPreviousCount : 0,
  ]
}

function updateShotConnectionValue(shot: Shot, index: number, value: unknown) {
  if (!Array.isArray(value) || value.length < 2) {
    return
  }

  const nextValue = Number(value[0])
  const previousValue = Number(value[1])
  const lastIndex = episodeForShot(shot).shots.length - 1
  const connectPreviousCount = index > 0 && Number.isFinite(previousValue) && previousValue > 0
    ? normalizeConnectionPunctuationCount(previousValue)
    : 0
  const connectNextCount = index < lastIndex && Number.isFinite(nextValue) && nextValue < 0
    ? normalizeConnectionPunctuationCount(Math.abs(nextValue))
    : 0
  Object.assign(shot, {
    connectPrevious: connectPreviousCount > 0,
    connectPreviousCount,
    connectNext: connectNextCount > 0,
    connectNextCount,
  })
}

function formatShotConnectionTooltip(value: number) {
  if (value < 0) {
    return `启下 ${Math.abs(value)}`
  }

  if (value > 0) {
    return `承上 ${value}`
  }

  return '不衔接'
}

function normalizeEpisodeShotConnections(episode: Episode) {
  const lastIndex = episode.shots.length - 1
  episode.shots.forEach((shot, index) => {
    Object.assign(shot, normalizeStoredShotConnection(
      shot.connectPreviousCount,
      shot.connectPrevious,
      shot.connectNextCount,
      shot.connectNext,
      index > 0,
      index < lastIndex,
    ))
  })
}

function effectiveShotText(shot: Shot) {
  const index = shotIndex(shot)
  const lines = [
    index > -1 ? previousShotTail(index, shot.connectPreviousCount, episodeForShot(shot)) : '',
    shot.text.trim(),
    index > -1 ? nextShotHead(index, shot.connectNextCount, episodeForShot(shot)) : '',
  ].filter(Boolean)

  return lines.join('\n').trim()
}

async function detectShotCharacters(shot: Shot, options: { silent?: boolean; showConflict?: boolean } = {}) {
  const episode = episodeForShot(shot)
  const showConflict = options.showConflict ?? true

  if (!episode) {
    return false
  }

  const detected = detectCharacters(effectiveShotText(shot), assetsFor(state, episode).map((character) => character.name))
    .map((character) => ({ ...character, includeVoice: character.includeVoice && !isEnsembleCharacter(character.name, episode) }))
  shot.autoSyncNotice = null

  if (!detected.length) {
    shot.pendingDetection = null
    if (!options.silent) {
      notify.info('未识别到本集角色')
    }
    return false
  }

  const currentNames = shot.characters.map((character) => character.name).filter(Boolean)
  const voiceSuggestions = detected
    .filter((character) => character.includeVoice)
    .filter((character) => shot.characters.some((item) => item.name === character.name && !item.includeVoice))
    .map((character) => character.name)

  if (!currentNames.length) {
    if (!await applyShotCharacters(shot, buildDetectedCharacters(detected))) return false
    shot.pendingDetection = null
    if (!options.silent) {
      notify.success('已识别并添加角色配置')
    }
    return true
  }

  const mergeNames = Array.from(new Set([...currentNames, ...detected.map((character) => character.name)]))
  const replaceNames = detected.map((character) => character.name)

  if (sameNames(currentNames, replaceNames) && !voiceSuggestions.length) {
    if (!options.silent) {
      notify.success('角色配置与识别结果一致')
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
    if (!await applyShotCharacters(shot, mergeDetectedCharacters(shot.characters, detected, true))) return false
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

async function mergeActiveDetection() {
  const shot = detectionConflictShot.value

  if (!shot?.pendingDetection) {
    detectionDialogVisible.value = false
    return
  }

  if (!detectionMergeChanged()) {
    return
  }

  if (!await applyShotCharacters(shot, mergeDetectedCharacters(shot.characters, shot.pendingDetection.detected, true))) return
  notify.success('已合并角色配置')
  shot.pendingDetection = null
  detectionConflictShotId.value = null
  detectionDialogVisible.value = false
}

async function replaceActiveDetection() {
  const shot = detectionConflictShot.value

  if (!shot?.pendingDetection) {
    detectionDialogVisible.value = false
    return
  }

  if (!detectionReplaceChanged()) {
    return
  }

  if (!await applyShotCharacters(shot, buildDetectedCharacters(shot.pendingDetection.detected))) return
  notify.success('已替换角色配置')
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
    ? Math.max(1, Math.min(8, Math.round(value.drawCount * 2) / 2))
    : 1

  return {
    rating,
    drawCount,
    notePrefix: typeof value.notePrefix === 'string' ? value.notePrefix : '',
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
  return shot.review.rating > 0
    || shot.review.drawCount !== 1
    || Boolean(shot.review.notePrefix.trim())
    || Boolean(shot.review.note.trim())
}

function isEpisodeAutoStarred(episode: Episode) {
  return episode.shots.length > 0 && episode.shots.every(isShotReviewed)
}

function isGroupAutoStarred(groupId: string) {
  const episodes = episodesForGroup(groupId)
  return episodes.length > 0 && episodes.every(isEpisodeAutoStarred)
}

function isReviewDefault(review: PromptReview) {
  return review.rating === 0
    && review.drawCount === 1
    && !review.notePrefix.trim()
    && !review.note.trim()
}

function calculateAutomaticReviewRating(drawCount: number, notePrefix: string) {
  const normalizedDrawCount = Math.max(1, Math.min(8, drawCount))
  const drawCountPenalty = normalizedDrawCount > 6 ? 3 : normalizedDrawCount > 4 ? 2 : normalizedDrawCount > 2 ? 1 : 0
  const notePrefixCategory = notePrefix.split('→')[0]?.trim() ?? ''
  const notePrefixPenalty = notePrefixCategory === '抽卡失误' ? 1 : 0

  return Math.max(1, Math.min(5, 5 - drawCountPenalty - notePrefixPenalty))
}

function updateAutomaticReviewRating() {
  const drawCount = currentReviewDrawCount()

  if (!drawCount) {
    reviewDraft.value.rating = 0
    return
  }

  reviewDraft.value.drawCount = drawCount
  reviewDraft.value.rating = calculateAutomaticReviewRating(drawCount, reviewDraft.value.notePrefix)
}

function currentReviewDrawCount() {
  return reviewDrawCountMode.value || (isValidReviewDrawCount(reviewCustomDrawCount.value) ? reviewCustomDrawCount.value : null)
}

function isValidReviewDrawCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value * 2) && value >= 1 && value <= 8
}

function selectReviewDrawCountMode(value: string | number | boolean | undefined) {
  reviewDrawCountMode.value = value as ReviewDrawCountMode
  reviewCustomDrawCount.value = undefined
  updateAutomaticReviewRating()
}

function updateReviewCustomDrawCount(value: number | null | undefined) {
  if (!isValidReviewDrawCount(value)) {
    return
  }

  reviewDrawCountMode.value = ''
  reviewDraft.value.drawCount = value
}

function finalizeReviewDrawCountInput() {
  updateAutomaticReviewRating()
}

function updateReviewNotePrefix(value: unknown) {
  const path = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  reviewNotePrefixPath.value = path
  reviewDraft.value.notePrefix = path.length === 2 ? path.join('→') : ''
  updateAutomaticReviewRating()
}

function formatReviewNote(review: PromptReview) {
  const prefix = review.notePrefix.trim()
  const note = review.note.trim()

  if (prefix && note) {
    return `${prefix}：${note}`
  }

  return prefix || note || '无'
}

function resetReviewDraft() {
  reviewDraft.value = createPromptReview()
  reviewDrawCountMode.value = ''
  reviewCustomDrawCount.value = undefined
  reviewNotePrefixPath.value = []
}

function clearReviewDialog() {
  resetReviewDraft()

  const shot = activeReviewShot.value

  if (!shot) {
    return
  }

  shot.review = normalizePromptReview(reviewDraft.value)
  notify.success('已清空评分')
}

function openReviewDialog(shot: Shot, fromSummary = false) {
  const episode = state.episodes.find((episode) => episode.shots.some((item) => item.id === shot.id))
  if (!episode) return
  reviewOpenedFromSummary.value = fromSummary
  activeReviewEpisodeId.value = episode.id
  activeReviewShot.value = shot
  reviewDraft.value = { ...normalizePromptReview(shot.review) }
  const isDefaultReview = isReviewDefault(reviewDraft.value)
  reviewDrawCountMode.value = isDefaultReview
    ? ''
    : reviewDrawCountOptions.find((count) => count === reviewDraft.value.drawCount) ?? ''
  reviewCustomDrawCount.value = reviewDrawCountMode.value || isDefaultReview ? undefined : reviewDraft.value.drawCount
  reviewNotePrefixPath.value = reviewDraft.value.notePrefix.split('→').filter(Boolean)
  dataDialogView.value = 'shot'
  dataDialogVisible.value = true
}

function saveReviewDialog() {
  const shot = activeReviewShot.value

  if (!shot) {
    dataDialogVisible.value = false
    return
  }

  const drawCount = currentReviewDrawCount()

  if (!drawCount) {
    notify.warning('请输入抽卡次数')
    return
  }

  reviewDraft.value.drawCount = drawCount
  updateAutomaticReviewRating()
  const normalizedReview = normalizePromptReview(reviewDraft.value)

  if (isReviewDefault(normalizedReview)) {
    notify.warning('请至少填写一项评分内容')
    return
  }

  shot.review = normalizedReview
  if (reviewOpenedFromSummary.value && activeReviewEpisode.value) {
    openReviewSummary(activeReviewEpisode.value)
  } else {
    dataDialogVisible.value = false
  }
  notify.success('已保存评分')
}

function openReviewSummary(episode = activeEpisode.value) {
  if (!episode) return
  reviewOpenedFromSummary.value = false
  resetReviewDraft()
  activeReviewShot.value = null
  activeReviewEpisodeId.value = null
  reviewSummaryEpisodeId.value = episode.id
  dataDialogView.value = 'episode'
  dataDialogVisible.value = true
}

function openGroupSummary(groupId: string) {
  if (groupId !== 'ungrouped' && !state.episodeGroups.some((group) => group.id === groupId)) {
    return
  }

  activeGroupSummaryId.value = groupId
  reviewOpenedFromSummary.value = false
  resetReviewDraft()
  activeReviewShot.value = null
  activeReviewEpisodeId.value = null
  reviewSummaryEpisodeId.value = null
  dataDialogView.value = 'group'
  dataDialogVisible.value = true
}

function clearDataDialogContext() {
  if (dataDialogVisible.value) return
  reviewOpenedFromSummary.value = false
  activeReviewShot.value = null
  activeReviewEpisodeId.value = null
  reviewSummaryEpisodeId.value = null
  activeGroupSummaryId.value = null
  resetReviewDraft()
}

function updateGroupResultTier(value: number | undefined | '') {
  const group = activeGroupSummary.value
  if (!group) return
  const tier = groupResultTiers.find((tier) => tier.playCount === value)
  group.results.playCount = tier?.playCount ?? 0
  group.results.commission = tier?.commission ?? 0
}

function openEpisodeScriptDialog(tab: EpisodeScriptTab) {
  episodeScriptActiveTab.value = tab
  episodeScriptDraft.value = activeEpisode.value?.scriptText ?? ''
  splitScriptDraft.value = activeEpisode.value?.splitScriptText ?? ''
  refreshEpisodeScriptDerivedDrafts()
  resetMaterialDrafts(requiredMaterialSceneDraftCount())
  episodeScriptDialogVisible.value = true
}

function openDialogueDialog(episode: Episode) {
  dialogueEpisodeId.value = episode.id
  const savedDialogue = episode.extractedDialogueText
  dialogueView.value = 'original'
  dialogueOriginalDraft.value = savedDialogue ?? extractDialogueText(episode.scriptText)
  dialogueReplacedDraft.value = savedDialogue == null
    ? extractDialogueText(episode.scriptText, state.globalConfig.dialogueExtraction.replacementRules)
    : replaceDialogueText(savedDialogue, state.globalConfig.dialogueExtraction.replacementRules)
  dialogueDialogVisible.value = true
}

function organizeEpisodeScriptDraft() {
  const isSplitScript = episodeScriptActiveTab.value === 'shots'
  const draft = isSplitScript ? splitScriptDraft.value : episodeScriptDraft.value
  const protectedRemarks: string[] = []
  const protectedDraft = draft
    .replace(/\r\n/g, '\n')
    .replace(/:/g, '：')
    .replace(/[ \t　]*---[ \t　]*#([^#\r\n]*)#[ \t　]*/g, (_match, remark: string) => {
      const placeholder = `\n__SHOT_REMARK_${protectedRemarks.length}__\n`
      protectedRemarks.push(remark)
      return placeholder
    })

  const organizedDraft = protectedDraft
    .replace(/[ \t　]*===[ \t　]*/g, '\n===\n')
    .replace(/[ \t　]*---[ \t　]*/g, '\n---\n')
    .replace(/[△▲][ \t　]*/g, '')
    .replace(/[\t　]+/g, '')
    .replace(/\.{3,}/g, '…')
    .replace(/[ \t　]+\n/g, '\n')
    .replace(/\n[ \t　]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .replace(/__SHOT_REMARK_(\d+)__/g, (_match, index: string) => {
      return `--- #${protectedRemarks[Number(index)]}#`
    })
  if (isSplitScript) {
    splitScriptDraft.value = organizedDraft
    syncSplitScriptDraft()
  } else {
    episodeScriptDraft.value = organizedDraft
    syncMaterialSceneDraftCount()
  }
  notify.success('已整理剧本文字')
}

function refreshEpisodeScriptDerivedDrafts() {
  batchShotSegments.value = splitBatchShotText(splitScriptDraft.value)
  syncMaterialSceneDraftCount()
}

function syncSplitScriptDraft() {
  const episode = activeEpisode.value

  if (episode) {
    episode.splitScriptText = splitScriptDraft.value
  }

  batchShotSegments.value = splitBatchShotText(splitScriptDraft.value)
}

function resetSplitScript() {
  splitScriptDraft.value = normalizeSplitScriptText(activeEpisode.value?.scriptText ?? '', []) ?? ''
  syncSplitScriptDraft()
}

function resetDialogueExtraction() {
  const original = dialogueEpisode.value?.scriptText ?? ''
  dialogueOriginalDraft.value = extractDialogueText(original)
  dialogueReplacedDraft.value = extractDialogueText(original, state.globalConfig.dialogueExtraction.replacementRules)
}

function refreshBatchShotSegments() {
  batchShotSegments.value = splitBatchShotText(splitScriptDraft.value)

  if (!batchShotSegments.value.length) {
    notify.warning('未识别到可用分镜')
    return false
  }

  return true
}

function resetEpisodeScriptDialog() {
  episodeScriptDraft.value = ''
  splitScriptDraft.value = ''
  batchShotSegments.value = []
  resetMaterialDrafts()
  episodeScriptActiveTab.value = 'materials'
}

function resetDialogueDialog() {
  dialogueEpisodeId.value = null
  dialogueOriginalDraft.value = ''
  dialogueReplacedDraft.value = ''
  dialogueView.value = 'original'
}

function toggleDialogueReplacement() {
  if (dialogueView.value === 'replaced') {
    dialogueView.value = 'original'
    return
  }

  dialogueReplacedDraft.value = replaceDialogueText(dialogueOriginalDraft.value, state.globalConfig.dialogueExtraction.replacementRules)
  dialogueView.value = 'replaced'
}

async function copyExtractedDialogue() {
  const episode = dialogueEpisode.value
  if (!episode || dialogueSaving.value) return

  if (!dialogueOutputDraft.value.trim()) {
    notify.warning('暂无可复制的台词')
    return
  }

  dialogueSaving.value = true
  try {
    const copied = await copyText(dialogueOutputDraft.value)
    if (!copied) {
      notify.error('复制失败，请手动选择文本复制')
      return
    }
    episode.extractedDialogueText = dialogueOutputDraft.value
    if (!await saveNow()) return
    notify.success('已复制并保存台词')
    dialogueDialogVisible.value = false
  } finally {
    dialogueSaving.value = false
  }
}

async function applyEpisodeScriptShots() {
  const episode = activeEpisode.value

  if (!episode || episodeScriptSaving.value || !refreshBatchShotSegments()) {
    return
  }

  episodeScriptSaving.value = true
  try {
    const isUpdate = hasExistingShotConfiguration(episode)
    const sceneDrafts = materialSceneDrafts.value.map((scene) => ({ ...scene }))
    const candidate: Episode = JSON.parse(JSON.stringify(episode))
    const assets: CharacterAsset[] = JSON.parse(JSON.stringify(assetsFor(state, episode)))
    candidate.splitScriptText = splitScriptDraft.value
    for (const name of splitMaterialInput(materialCharacterDraft.value)) {
      if (!assets.some(asset => asset.name === name)) assets.push({ ...createCharacterAsset(name), availableUnits: episodeCharacterUnits(episode) })
    }
    addSceneMaterials(candidate, sceneDrafts)
    if (!candidate.groupId) candidate.characters = assets
    const syncedCount = await syncEpisodeShots(candidate, batchShotSegments.value, sceneDrafts, assets)
    if (!syncedCount) return
    const group = state.episodeGroups.find(group => group.id === episode.groupId)
    if (group) group.characters = assets
    Object.assign(episode, candidate)
    if (!await saveNow()) return
    episodeScriptDialogVisible.value = false
    batchShotSegments.value = []
    notify.success(isUpdate ? `已更新为 ${syncedCount} 条分镜` : `已添加 ${syncedCount} 条分镜`)
  } finally {
    episodeScriptSaving.value = false
  }
}

function promptFor(shot: Shot, detailOnly = false) {
  const group = state.episodeGroups.find((item) => item.id === episodeForShot(shot).groupId)
  const profileId = group?.promptProfileId ?? state.globalConfig.prompt.activeProfileId
  const args = [
    state.globalConfig,
    { ...shot, text: effectiveShotText(shot) },
    profileId,
    shotTimingAnalysis(shot).totalSeconds,
  ] as const
  const characters = assetsFor(state, episodeForShot(shot))
  const referenceName = formatShotReference(episodeForShot(shot), shotIndex(shot), state.episodes)
  const referenceMode = group?.referenceMode ?? state.globalConfig.prompt.referenceMode
  const appearanceReferencePrefix = `${parseEpisodeNumber(episodeForShot(shot).title)}-${normalizeShotUnitNumber(shot.unitNumber)}`
  return detailOnly
    ? composeShotDetail(...args, characters, referenceName, referenceMode)
    : composePrompt(...args, characters, referenceName, referenceMode, appearanceReferencePrefix, episodeForShot(shot).id)
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return (tagName === 'input' && (target as HTMLInputElement).type !== 'radio') || tagName === 'textarea' || tagName === 'select'
}

function isShortcutBlocked() {
  return workspaceView.value === 'library' || episodeSwitchVisible.value || outfitAssignmentVisible.value || materialDialogVisible.value
    || globalDialogVisible.value
    || webDavAuthVisible.value
    || pointLedgerVisible.value
    || detectionDialogVisible.value
    || dataDialogVisible.value
    || episodeScriptDialogVisible.value
    || dialogueDialogVisible.value
}

function handleShotNumberShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) {
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

  if (event.altKey) {
    void copyPrompt(shot)
    return
  }

  selectShotView(shot)
}

function shotCopyLabel(shot: Shot) {
  const episode = episodeForShot(shot)
  const index = episode?.shots.findIndex((item) => item.id === shot.id) ?? -1
  return episode && index >= 0 ? formatShotNumber(episode, index) : '当前'
}

async function copyShotNumber(shot: Shot) {
  const label = shotCopyLabel(shot)
  const copied = await copyText(label)

  if (copied) {
    notify.success(`已复制分镜编号 ${label}`)
    return
  }

  notify.error('复制失败，请手动选择文本复制')
}

async function copySceneReference(shot: Shot, scene: SceneConfig) {
  const label = shot.usePositionReference ? formatShotReference(episodeForShot(shot), shotIndex(shot), state.episodes) : sceneReferenceName(scene)
  if (await copyText(label)) notify.success(`已复制${shot.usePositionReference ? '引用序号' : '场景引用'} ${label}`)
  else notify.error('复制失败，请手动选择文本复制')
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
    const message = `已复制 ${shotCopyLabel(shot)}`

    if (status.type === 'warning') {
      notify.warning(`${message}\n${status.message}`)
    } else {
      notify.success(message)
    }

    return
  }

  notify.error('复制失败，请手动选择文本复制')
}

async function copyShotDetail(shot: Shot) {
  const copied = await copyText(promptFor(shot, true))

  if (copied) {
    notify.success('已复制分镜详情')
    return
  }

  notify.error('复制失败，请手动选择文本复制')
}

async function copyCharacterSettings(shot: Shot) {
  const episode = episodeForShot(shot)
  const group = state.episodeGroups.find(group => group.id === episode.groupId)
  const detailed = (group?.referenceMode ?? state.globalConfig.prompt.referenceMode) === 'detailed'
  const copied = await copyText(formatPromptReferences(composeCharacterSettings(shot, assetsFor(state, episode), detailed, `${parseEpisodeNumber(episode.title)}-${shot.unitNumber}`, episode.id)))

  if (copied) {
    notify.success('已复制角色配置')
    return
  }

  notify.error('复制失败，请手动选择文本复制')
}

function preventBrowserContextMenu(event: MouseEvent) {
  event.preventDefault()
}

function handleDrawerOutsideClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (materialDialogVisible.value && materialDialogKind.value === 'scenes' && !target.closest('.scene-material-popover') && !scenePopoverReference.value?.contains(target)) materialDialogVisible.value = false
  if (!target.classList.contains('dismissible-drawer-overlay')) return
  if (target.querySelector('.material-dialog')) materialDialogVisible.value = false
  if (target.querySelector('.detection-dialog')) detectionDialogVisible.value = false
  if (target.querySelector('.review-dialog')) dataDialogVisible.value = false
  if (target.querySelector('.outfit-assignment-drawer')) outfitAssignmentVisible.value = false
}

onMounted(() => {
  refreshHistoryDate()
  window.addEventListener('focus', refreshHistoryDate)
  document.addEventListener('visibilitychange', handleHistoryVisibilityChange)
  window.addEventListener('keydown', handleContactDropdownEscape, true)
  window.addEventListener('keydown', handleShotNumberShortcut)
  document.addEventListener('contextmenu', preventBrowserContextMenu)
  document.addEventListener('click', handleDrawerOutsideClick)
  document.addEventListener('pointerdown', handleTimingPopoverPointerDown)
  window.addEventListener('keydown', handleTimingPopoverKeydown)
  window.addEventListener('blur', closeTimingPopover)
})

onUnmounted(() => {
  cancelAnimationFrame(shotScrollAnimation)
  groupSummaryTableObserver?.disconnect()
  window.clearTimeout(historyDateTimer)
  window.removeEventListener('focus', refreshHistoryDate)
  document.removeEventListener('visibilitychange', handleHistoryVisibilityChange)
  window.removeEventListener('keydown', handleContactDropdownEscape, true)
  window.removeEventListener('keydown', handleShotNumberShortcut)
  document.removeEventListener('contextmenu', preventBrowserContextMenu)
  document.removeEventListener('click', handleDrawerOutsideClick)
  document.removeEventListener('pointerdown', handleTimingPopoverPointerDown)
  window.removeEventListener('keydown', handleTimingPopoverKeydown)
  window.removeEventListener('blur', closeTimingPopover)
  if (materialSceneTransitionFrame !== null) {
    cancelAnimationFrame(materialSceneTransitionFrame)
  }
  scriptInputRefs.forEach((binding) => {
    binding.textarea.removeEventListener('scroll', binding.handler)
    binding.observer?.disconnect()
  })
  scriptInputRefs.clear()
  dialogueInputRef?.textarea.removeEventListener('scroll', dialogueInputRef.handler)
  dialogueInputRef?.observer?.disconnect()
})

function namesText(names: string[]) {
  return names.length ? names.join('、') : '无'
}

function sameNames(left: string[], right: string[]) {
  return left.length === right.length && left.every((name) => right.includes(name))
}

async function exportAllEpisodes() {
  const filename = `${archiveFilename()}.json`

  try {
    const result = await saveJson(filename, exportPayload())

    if (result === 'saved') {
      notify.success('已保存备份')
    } else if (result === 'downloaded') {
      notify.warning('无法选择保存位置，已改为默认下载')
    }
  } catch {
    notify.error('备份导出失败')
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
      characters: JSON.parse(JSON.stringify(assetsFor(state, episode))),
      confirmedMaterialReferences: [...(state.episodeGroups.find(group => group.id === episode.groupId)?.confirmedMaterialReferences ?? episode.confirmedMaterialReferences)],
    })) as Episode[],
    globalConfigSnapshot: JSON.parse(JSON.stringify(state.globalConfig)),
    pointInvoices: JSON.parse(JSON.stringify(state.pointInvoices)),
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

async function saveJson(filename: string, payload: unknown): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const pickerWindow = window as SaveFilePickerWindow

  if (window.isSecureContext && pickerWindow.showSaveFilePicker) {
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
      return 'saved'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }

  downloadJson(filename, blob)
  return 'downloaded'
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

  const batches: ImportBatch[] = []

  for (const file of files) {
    try {
      batches.push(parseImportPayload(JSON.parse(await file.text())))
    } catch {
      notify.error(`导入失败：文件“${file.name}”格式错误或缺少单集数据`)
    }
  }

  if (!batches.length) {
    return
  }

  const importMode = await selectImportMode()

  if (!importMode) {
    return
  }

  const previousInvoices = JSON.stringify(state.pointInvoices)
  const candidate: AppState = JSON.parse(JSON.stringify(state))
  const importedCount = applyImportBatches(batches, importMode, candidate)
  const scopes = new Set<string>()
  for (const episode of candidate.episodes) {
    const scope = episode.groupId ?? episode.id
    if (scopes.has(scope)) continue
    scopes.add(scope)
    initializeSharedCharacters(candidate, episode)
    if (!await approveCharacterOutfits(candidate, episode, assetsFor(candidate, episode))) return
  }
  Object.assign(state, candidate)

  if (importedCount) {
    notify.success(`已导入 ${importedCount} 个单集`)
  } else if (JSON.stringify(state.pointInvoices) !== previousInvoices) {
    notify.success('已导入积分记录')
  } else {
    notify.info('暂无可导入的新单集')
  }
}

function parseImportPayload(value: unknown): ImportBatch {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid payload')
  }

  const payload = value as Partial<ExportPayload> & { episodes?: Episode[] }
  const episodes = Array.isArray(payload.episodes) ? payload.episodes : payload.episode ? [payload.episode] : []
  const storedVersion = typeof payload.version === 'number' && Number.isInteger(payload.version) ? payload.version : 1
  const globalConfig = normalizeGlobalConfigSnapshot(payload.globalConfigSnapshot, storedVersion, state.globalConfig)

  if (!episodes.length) {
    throw new Error('invalid episode')
  }

  return {
    groups: payload.episodeGroups,
    episodes,
    globalConfig,
    pointInvoices: normalizePointInvoices(payload.pointInvoices),
  }
}

function applyImportBatches(batches: ImportBatch[], importMode: ImportMode, state: AppState) {
  applyImportedGlobalConfigs(batches, importMode, state)

  if (importMode === 'replace') {
    state.episodeGroups = []
    state.episodes = []
    state.pointInvoices = []
    state.activeEpisodeId = ''
  }

  const preparedBatches = batches.map((batch) => {
    const importedGroups = normalizeImportedEpisodeGroups(
      batch.groups,
      batch.globalConfig ?? state.globalConfig,
      state.globalConfig,
    )
    const groupIdMap = new Map(importedGroups.map((group) => [group.sourceId, group.group.id]))
    const importedEpisodes = batch.episodes.map((episode) => normalizeImportedEpisode(episode, groupIdMap))
    const episodeIds = new Map(batch.episodes.map((episode, index) => [episode.id, importedEpisodes[index].id]))
    for (const episode of importedEpisodes) for (const shot of episode.shots) {
      if (shot.referenceEpisodeId) {
        shot.referenceEpisodeId = episodeIds.get(shot.referenceEpisodeId) ?? null
        if (!shot.referenceEpisodeId) shot.referenceShotNumber = null
      }
    }
    reconcileShotReferences(importedEpisodes)
    const unitMaps = new Map(batch.episodes.map((episode, index) => [episode.id, new Map(episode.shots.map((shot, shotIndex) => [normalizeShotUnitNumber(shot.unitNumber), importedEpisodes[index].shots[shotIndex].unitNumber]))]))
    for (const asset of [...importedGroups.flatMap(item => item.group.characters ?? []), ...importedEpisodes.flatMap(item => item.characters)]) {
      mapCharacterUnitReferences(asset, units => units.filter(unit => unitMaps.get(unit.episodeId)?.has(unit.unitNumber)).map(unit => ({ episodeId: episodeIds.get(unit.episodeId)!, unitNumber: unitMaps.get(unit.episodeId)!.get(unit.unitNumber)! })))
    }
    const importedState = { ...state, episodeGroups: importedGroups.map(item => item.group), episodes: importedEpisodes }
    for (const episode of importedEpisodes) initializeCharacterScopes(importedState, episode, assetsFor(importedState, episode), false)
    return { batch, importedGroups, importedEpisodes }
  })
  // Compare contacts using the final group membership, before any imported value is cleared.
  const mergedGroupIds = new Map<string, string>()
  state.episodeGroups.forEach((group) => {
    const key = JSON.stringify([group.title, group.archived])
    if (!mergedGroupIds.has(key)) mergedGroupIds.set(key, group.id)
  })
  const contactEpisodes = state.episodes.map(({ id, groupId, title }) => ({ id, groupId, title }))
  preparedBatches.forEach(({ importedGroups, importedEpisodes }) => {
    const groupIdMap = new Map(importedGroups.map(({ group }) => {
      const key = JSON.stringify([group.title, group.archived])
      const targetId = importMode === 'merge' ? mergedGroupIds.get(key) ?? group.id : group.id
      mergedGroupIds.set(key, targetId)
      return [group.id, targetId]
    }))
    contactEpisodes.push(...importedEpisodes.map(({ id, groupId, title }) => ({
      id, title, groupId: groupId ? groupIdMap.get(groupId) ?? groupId : null,
    })))
  })
  const editableContactIds = contactEditableEpisodeIds(contactEpisodes)
  let importedCount = 0
  const existingEpisodeSignatures = new Map(state.episodes.map((episode) => [episodeImportSignature(episode, state.episodeGroups, editableContactIds, state.episodes), episode.id]))

  preparedBatches.forEach(({ batch, importedGroups, importedEpisodes }) => {
    const episodeIdMap = new Map<string, string>()
    const episodesToImport = importedEpisodes.filter((episode, index) => {
      const signature = episodeImportSignature(episode, importedGroups.map((item) => item.group), editableContactIds, importedEpisodes)
      const existingId = importMode === 'merge' ? existingEpisodeSignatures.get(signature) : undefined
      episodeIdMap.set(batch.episodes[index].id, existingId ?? episode.id)
      if (existingId) {
        const existing = state.episodes.find(item => item.id === existingId)
        if (existing) existing.confirmedMaterialReferences = [...new Set([...existing.confirmedMaterialReferences, ...episode.confirmedMaterialReferences])]
        return false
      }
      existingEpisodeSignatures.set(signature, episode.id)
      return true
    })
    const resolvedIds = new Map(importedEpisodes.map((episode, index) => [episode.id, episodeIdMap.get(batch.episodes[index].id)!]))
    for (const episode of episodesToImport) for (const shot of episode.shots) {
      if (shot.referenceEpisodeId) shot.referenceEpisodeId = resolvedIds.get(shot.referenceEpisodeId)!
    }
    for (const asset of [...importedGroups.flatMap(item => item.group.characters ?? []), ...importedEpisodes.flatMap(item => item.characters)]) {
      mapCharacterUnitReferences(asset, units => units.map(unit => ({ ...unit, episodeId: resolvedIds.get(unit.episodeId)! })))
    }
    const usedGroupIds = new Set(episodesToImport.map((episode) => episode.groupId).filter((id): id is string => Boolean(id)))

    importedGroups
      .filter(({ group }) => usedGroupIds.has(group.id) || (importMode === 'merge' && state.episodeGroups.some(item => item.title === group.title && item.archived === group.archived)))
      .forEach(({ group }) => {
        const sameTitleGroup = importMode === 'merge' ? state.episodeGroups.find((item) => item.title === group.title && item.archived === group.archived) : null

        if (sameTitleGroup) {
          sameTitleGroup.confirmedMaterialReferences = [...new Set([...sameTitleGroup.confirmedMaterialReferences, ...group.confirmedMaterialReferences])]
          if (sameTitleGroup.characters !== null) {
            for (const asset of group.characters ?? []) {
              const existing = sameTitleGroup.characters.find(item => item.name === asset.name)
              if (!existing) sameTitleGroup.characters.push(asset)
              else {
                if (asset.availableUnits !== null) {
                  const units = existing.availableUnits ?? []
                  existing.availableUnits = [...units, ...asset.availableUnits.filter(unit => !units.some(item => item.episodeId === unit.episodeId && item.unitNumber === unit.unitNumber))]
                }
                if (existing.outfits.length > 1 && asset.outfits.length > 1) asset.outfits.forEach(outfit => {
                  const match = existing.outfits.find(item => item.note === outfit.note)
                  if (match) match.units.push(...outfit.units.filter(unit => !match.units.some(item => item.episodeId === unit.episodeId && item.unitNumber === unit.unitNumber)))
                  else existing.outfits.push(outfit)
                })
              }
            }
          }
          episodesToImport.forEach((episode) => {
            if (episode.groupId === group.id) {
              episode.groupId = sameTitleGroup.id
            }
          })
          return
        }

        state.episodeGroups.push(group)
      })

    episodesToImport.forEach((episode) => {
      state.episodes.push(episode)
      state.activeEpisodeId = episode.id
      importedCount += 1
    })
    state.pointInvoices = mergePointInvoices(state.pointInvoices, remapPointInvoices(batch.pointInvoices, episodeIdMap), new Set(state.episodes.map((episode) => episode.id)))
  })

  if (!state.episodes.length) {
    const episode = createEpisode(1)
    state.episodes = [episode]
    state.activeEpisodeId = episode.id
  }

  for (const episode of state.episodes) initializeCharacterScopes(state, episode, assetsFor(state, episode), false)
  reconcileShotReferences(state.episodes)
  pruneCharacterScopes(state)
  clearInteriorEpisodeContacts(state.episodes)
  clearInteriorSplitEpisodeNumbers(state.episodes)
  return importedCount
}

function applyImportedGlobalConfigs(
  batches: Array<{ globalConfig: GlobalConfig | null }>,
  importMode: ImportMode,
  state: AppState,
) {
  const importedConfigs = batches.map((batch) => batch.globalConfig).filter((config): config is GlobalConfig => Boolean(config))

  if (!importedConfigs.length) {
    return
  }

  if (importMode === 'replace') {
    state.globalConfig = cloneGlobalConfig(importedConfigs[importedConfigs.length - 1])
    return
  }

  state.globalConfig = importedConfigs.reduce(
    (current, imported) => mergeGlobalConfigs(current, imported),
    cloneGlobalConfig(state.globalConfig),
  )
}

async function selectImportMode(): Promise<ImportMode | null> {
  try {
    await ElMessageBox.confirm('“全部替换”会清除现有分组和单集；“新旧合并”会跳过内容完全相同的单集。', '选择导入方式', {
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
    value.space === '无' ? '无' : value.space === '室外' ? '室外' : '室内',
  )
}

function normalizeSceneAssets(scenes: unknown): SceneAsset[] {
  if (!Array.isArray(scenes)) {
    return []
  }

  const normalized = scenes.map(normalizeSceneAsset).filter((scene): scene is SceneAsset => Boolean(scene))
  return normalized.filter((scene, index, list) => list.findIndex((item) => sceneAssetKey(item) === sceneAssetKey(scene)) === index)
}

function episodeComparableSignature(episode: Episode, contactPerson: string, splitEpisodeNumber: number | null, assets: CharacterAsset[], episodes: Episode[]) {
  return JSON.stringify({
    title: episode.title,
    showPreviousEpisodeUnit: episode.showPreviousEpisodeUnit,
    showNextEpisodeUnit: episode.showNextEpisodeUnit,
    characters: assets.map(({ name, note, appearanceDescription, appearanceDescriptionEnabled, voiceDescription, voiceDescriptionEnabled, isEnsemble, isMain, availableUnits, outfits }) => ({
      name, note, appearanceDescription, appearanceDescriptionEnabled, voiceDescription, voiceDescriptionEnabled, isEnsemble, isMain,
      availableUnits: availableUnits?.filter(unit => unit.episodeId === episode.id).map(unit => unit.unitNumber).sort((a, b) => a - b) ?? null,
      outfits: outfits.map(outfit => ({ note: outfit.note, appearanceDescription: outfit.appearanceDescription, appearanceDescriptionEnabled: outfit.appearanceDescriptionEnabled, units: outfit.units.filter(unit => unit.episodeId === episode.id).map(unit => unit.unitNumber).sort((a, b) => a - b) })),
    })),
    contactPerson,
    splitEpisodeNumber,
    scenes: episode.scenes,
    props: episode.props,
    productionData: episode.productionData,
    scriptText: episode.scriptText,
    splitScriptText: episode.splitScriptText,
    extractedDialogueText: episode.extractedDialogueText,
    shots: episode.shots.map((shot) => ({
      text: shot.text,
      remark: shot.remark,
      thirtySecondMode: shot.thirtySecondMode,
      unitNumber: normalizeShotUnitNumber(shot.unitNumber),
      referenceShotNumber: shot.referenceShotNumber,
      referenceEpisodeNumber: shot.referenceEpisodeId ? parseEpisodeNumber(episodes.find(item => item.id === shot.referenceEpisodeId)!.title) : null,
      connectPrevious: shot.connectPrevious,
      connectPreviousCount: shot.connectPreviousCount,
      connectNext: shot.connectNext,
      connectNextCount: shot.connectNextCount,
      scenes: shot.scenes.map((scene) => ({
        name: scene.name,
        time: scene.time,
        space: scene.space,
        statusText: scene.statusText ?? '',
      })),
      usePositionReference: shot.usePositionReference,
      useReverseAngle: shot.useReverseAngle,
      firstFrameMode: shot.firstFrameMode,
      characters: shot.characters.map((character) => ({
        name: character.name,
        includeVoice: character.includeVoice,
        statusText: character.statusText ?? '',
      })),
      timingSegments: shot.timingSegments.map((segment) => segment.kind === 'dialogue'
        ? {
            kind: segment.kind,
            sourceText: segment.sourceText,
            speechRate: segment.speechRate,
          }
        : {
            kind: segment.kind,
            sourceText: segment.sourceText,
            mode: segment.mode,
            shotCount: segment.shotCount,
            secondsPerShot: segment.secondsPerShot,
          }),
      status: shot.status,
      review: normalizePromptReview(shot.review),
    })),
  })
}

function episodeImportSignature(episode: Episode, groups: EpisodeGroup[], editableContactIds: Set<string>, episodes: Episode[]) {
  const group = groups.find((item) => item.id === episode.groupId)
  const contactPerson = editableContactIds.has(episode.id) ? episode.contactPerson : ''
  const splitEpisodeNumber = editableContactIds.has(episode.id) ? episode.splitEpisodeNumber : null
  return JSON.stringify([group?.title ?? null, group?.archived ?? false, episodeComparableSignature(episode, contactPerson, splitEpisodeNumber, group?.characters ?? episode.characters, episodes)])
}

function normalizeImportedShotScene(scene: unknown, assets: SceneAsset[]): SceneConfig | null {
  if (!scene || typeof scene !== 'object') {
    return null
  }

  const value = scene as Partial<SceneConfig>
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const statusText = typeof value.statusText === 'string' ? value.statusText : ''

  if (!name) {
    return null
  }

  const asset = assets.find((item) => item.name === name && (value.time == null || item.time === value.time))

  return createSceneConfig(
    name,
    value.time ?? asset?.time ?? '白天',
    value.space === '无' || value.space === '室外' || value.space === '室内'
      ? value.space
      : asset?.space ?? '室内',
    statusText,
  )
}

function normalizeImportedShotScenes(scenes: unknown, assets: SceneAsset[]): SceneConfig[] {
  if (!Array.isArray(scenes)) {
    return [createSceneConfig()]
  }

  const normalized = scenes
    .map((scene) => normalizeImportedShotScene(scene, assets))
    .filter((scene): scene is SceneConfig => Boolean(scene))

  return normalizeShotSceneSelection(normalized)
}

function normalizeImportedEpisodeGroups(
  groups: unknown,
  sourceConfig: GlobalConfig,
  targetConfig: GlobalConfig,
): Array<{ sourceId: string; group: EpisodeGroup }> {
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
          characters: value.characters === null || value.characters === undefined ? null : normalizeCharacterAssets(value.characters),
          confirmedMaterialReferences: normalizeMaterialConfirmations(value.confirmedMaterialReferences),
          title,
          starred: Boolean(value.starred),
          fullName: typeof value.fullName === 'string' ? value.fullName : '',
          archived: Boolean(value.archived),
          results: normalizeGroupResults(value.results),
          colorGrading: value.colorGrading === true,
          filter: value.filter === true,
          referenceMode: normalizeReferenceMode(value.referenceMode),
          promptProfileId: mapPromptProfileId(value.promptProfileId, sourceConfig, targetConfig),
        },
      }
    })
    .filter((group): group is { sourceId: string; group: EpisodeGroup } => Boolean(group))
}

function normalizeImportedEpisode(episode: Episode, groupIdMap = new Map<string, string>()): Episode {
  const scenes = normalizeSceneAssets(episode.scenes)
  const shots = Array.isArray(episode.shots) ? episode.shots : []
  const groupId = typeof episode.groupId === 'string' ? groupIdMap.get(episode.groupId) ?? null : null
  const normalizedShots = shots.map((shot, index) => {
    const connection = normalizeStoredShotConnection(
      shot.connectPreviousCount,
      shot.connectPrevious,
      shot.connectNextCount,
      shot.connectNext,
      index > 0,
      index < shots.length - 1,
    )

    const text = typeof shot.text === 'string' ? shot.text : ''
    const characters = Array.isArray(shot.characters)
      ? shot.characters.map((character) => ({ ...character, id: createId('character') }))
      : []
    const timingSegments = reconcileTimingSegments(
      text,
      [...normalizeCharacterAssets(episode.characters).map((character) => character.name), ...characters.map((character) => character.name)],
      shot.timingSegments,
      Boolean(shot.firstFrameMode),
    )

    return {
      ...createShot(),
      ...shot,
      ...connection,
      id: createId('shot'),
      text,
      remark: typeof shot.remark === 'string' ? shot.remark : '',
      thirtySecondMode: typeof shot.thirtySecondMode === 'boolean' ? shot.thirtySecondMode : true,
      unitNumber: normalizeShotUnitNumber(shot.unitNumber),
      referenceShotNumber: shot.referenceShotNumber ?? null,
      referenceEpisodeId: typeof shot.referenceEpisodeId === 'string' ? shot.referenceEpisodeId : null,
      usePositionReference: shot.usePositionReference !== false,
      useReverseAngle: false,
      firstFrameMode: Boolean(shot.firstFrameMode),
      pendingDetection: null,
      autoSyncNotice: null,
      undoCharacters: null,
      review: normalizePromptReview(shot.review),
      scenes: normalizeImportedShotScenes(shot.scenes, scenes),
      characters,
      timingSegments,
    }
  })
  compactShotUnitNumbers(normalizedShots)

  return {
    ...episode,
    id: createId('episode'),
    title: episode.title || '导入单集',
    showPreviousEpisodeUnit: episode.showPreviousEpisodeUnit === true,
    showNextEpisodeUnit: episode.showNextEpisodeUnit === true,
    groupId,
    starred: Boolean(episode.starred),
    characters: normalizeCharacterAssets(episode.characters),
    confirmedMaterialReferences: normalizeMaterialConfirmations(episode.confirmedMaterialReferences),
    contactPerson: typeof episode.contactPerson === 'string' ? episode.contactPerson.trim() : '',
    splitEpisodeNumber: normalizeSplitEpisodeNumber(episode.splitEpisodeNumber),
    scenes,
    props: [],
    productionData: normalizeEpisodeProductionData(episode.productionData),
    scriptText: typeof episode.scriptText === 'string' ? episode.scriptText : '',
    splitScriptText: normalizeSplitScriptText(episode.splitScriptText, normalizedShots),
    extractedDialogueText: typeof episode.extractedDialogueText === 'string' ? episode.extractedDialogueText : null,
    shots: normalizedShots,
  }
}
</script>
