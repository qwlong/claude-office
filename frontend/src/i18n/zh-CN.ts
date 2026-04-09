import type { TranslationKey } from "./en";

const zhCN: Record<TranslationKey, string> = {
  // App
  "app.title": "办公室可视化",
  "app.initializingSystems": "系统初始化中...",

  // Header Controls
  "header.simulate": "模拟",
  "header.reset": "重置",
  "header.clearDb": "清空数据库",
  "header.debugOn": "调试开",
  "header.debugOff": "调试关",
  "header.settings": "设置",
  "header.help": "帮助",
  "header.status": "状态",
  "header.connected": "已连接",
  "header.disconnected": "未连接",
  "header.aiOn": "开",
  "header.aiOff": "关",
  "header.agents": "个智能体",
  "header.cleanupAgents": "清理智能体",
  "header.spawn": "派发",
  "header.serverLabel": "服务器",
  "header.aiSummaryLabel": "AI 摘要",

  // Modals
  "modal.confirmDbWipe": "确认清空数据库",
  "modal.cancel": "取消",
  "modal.wipeAllData": "清空所有数据",
  "modal.wipeWarning":
    "确定要永久删除所有会话历史和事件吗？此操作不可撤销，将重置当前可视化状态。",
  "modal.keyboardShortcuts": "键盘快捷键",
  "modal.close": "关闭",
  "modal.toggleDebug": "切换调试模式",
  "modal.showAgentPaths": "显示智能体路径",
  "modal.showQueueSlots": "显示队列槽位",
  "modal.showPhaseLabels": "显示阶段标签",
  "modal.deleteSession": "删除会话",
  "modal.delete": "删除",
  "modal.deleteSessionConfirm": "确定要删除会话",
  "modal.deleteSessionWarning": "这将永久删除",
  "modal.events": "个事件",
  "modal.cannotBeUndone": "此操作不可撤销。",

  // Settings
  "settings.title": "设置",
  "settings.clockType": "时钟类型",
  "settings.analog": "模拟时钟",
  "settings.digital": "数字时钟",
  "settings.timeFormat": "时间格式",
  "settings.12hour": "12 小时制",
  "settings.24hour": "24 小时制",
  "settings.sessionBehavior": "会话行为",
  "settings.autoFollow": "自动跟随新会话",
  "settings.autoFollowDesc": "自动切换到当前项目中的新会话",
  "settings.clockTip": "提示：点击办公室中的时钟可快速切换模式。",
  "settings.language": "语言",
  "settings.theme": "主题",
  "settings.light": "浅色",
  "settings.dark": "深色",
  "settings.system": "跟随系统",

  // Sessions
  "sessions.title": "会话",
  "sessions.loading": "加载会话中...",
  "sessions.noSessions": "未找到会话",
  "sessions.unknownProject": "未知项目",
  "sessions.deleteSession": "删除会话",
  "sessions.activeSessions": "个活跃",
  "sessions.events": "个事件",
  "sessions.events_one": "{count} 个事件",
  "sessions.events_other": "{count} 个事件",
  "sessions.expandSidebar": "展开侧边栏",
  "sessions.collapseSidebar": "收起侧边栏",
  "sessions.dragToResize": "拖拽调整大小",

  // Sidebar Navigation
  "sidebar.wholeOffice": "整个办公室",
  "sidebar.allProjects": "所有项目",
  "sidebar.allSessions": "所有会话",
  "sidebar.projects": "项目",

  // View Mode Tabs (mobile)
  "viewMode.office": "办公室",
  "viewMode.projects": "项目",
  "viewMode.sessions": "会话",
  "viewMode.backToSessions": "\u2190 会话",
  "viewMode.backToProjects": "\u2190 项目",

  // Project Card
  "project.sessions": "个会话",
  "project.sessions_one": "{count} 个会话",
  "project.sessions_other": "{count} 个会话",
  "project.agents": "个智能体",
  "project.agents_one": "{count} 个智能体",
  "project.agents_other": "{count} 个智能体",

  // Right Sidebar
  "sidebar.events": "事件",
  "sidebar.conversation": "对话",

  // Event Log
  "eventLog.title": "事件日志",
  "eventLog.events": "个事件",
  "eventLog.events_one": "{count} 个事件",
  "eventLog.events_other": "{count} 个事件",
  "eventLog.waiting": "等待事件中...",

  // Agent Status
  "agentStatus.title": "智能体状态",
  "agentStatus.agents": "个智能体",
  "agentStatus.agents_one": "个智能体",
  "agentStatus.agents_other": "个智能体",
  "agentStatus.noAgents": "暂无智能体",
  "agentStatus.agent": "智能体",
  "agentStatus.desk": "工位",
  "agentStatus.noTaskSummary": "暂无任务摘要",
  "agentStatus.noRecentToolCall": "暂无最近的工具调用",
  "agentStatus.inQueue": "在{queueType}队列中（第 {position} 位）",

  // Git Status
  "git.title": "Git 状态",
  "git.waitingForStatus": "等待 Git 状态...",
  "git.noSession": "未选择会话",
  "git.noRepo": "未检测到 Git 仓库",
  "git.changedFiles": "变更文件",
  "git.staged": "已暂存",
  "git.recentCommits": "最近提交",
  "git.noCommits": "未找到提交记录",
  "git.modified": "已修改",
  "git.added": "新增",
  "git.deleted": "已删除",
  "git.renamed": "已重命名",
  "git.copied": "已复制",
  "git.untracked": "未跟踪",
  "git.ignored": "已忽略",

  // Conversation
  "conversation.title": "对话",
  "conversation.msgs": "条消息",
  "conversation.msgs_one": "{count} 条消息",
  "conversation.msgs_other": "{count} 条消息",
  "conversation.thinking": "思考中",
  "conversation.showMore": "展开更多",
  "conversation.collapse": "收起",
  "conversation.claude": "Claude",
  "conversation.showFullResponse": "显示完整回复",
  "conversation.hideToolCalls": "隐藏工具调用",
  "conversation.showToolCalls": "显示工具调用",
  "conversation.expandConversation": "展开对话",
  "conversation.close": "关闭",
  "conversation.noConversation": "暂无对话。请启动一个 Claude Code 会话。",

  // Event Detail Modal
  "eventDetail.summary": "摘要",
  "eventDetail.tool": "工具",
  "eventDetail.agentName": "智能体名称",
  "eventDetail.taskDescription": "任务描述",
  "eventDetail.userPrompt": "用户提示",
  "eventDetail.thinking": "思考过程",
  "eventDetail.message": "消息",
  "eventDetail.resultSummary": "结果摘要",
  "eventDetail.errorType": "错误类型",
  "eventDetail.toolInput": "工具输入",
  "eventDetail.noDetail": "此事件暂无更多详情。",

  // Loading Screen
  "loading.office": "加载办公室中...",

  // Zoom Controls
  "zoom.in": "放大",
  "zoom.out": "缩小",
  "zoom.reset": "重置缩放",

  // Mobile
  "mobile.menu": "菜单",
  "mobile.agentActivity": "智能体活动",
  "mobile.boss": "BOSS",
  "mobile.noActiveAgents": "暂无活跃智能体",

  // Status Messages
  "status.switchedToSession": "已切换到会话 {sessionId}...",
  "status.deletingSession": "正在删除会话 {sessionId}...",
  "status.sessionDeleted": "会话已删除。",
  "status.failedDeleteSession": "删除会话失败。",
  "status.errorConnecting": "连接后端服务出错。",
  "status.clearingDatabase": "正在清空数据库...",
  "status.databaseCleared": "数据库已清空。",
  "status.failedClearDatabase": "清空数据库失败。",
  "status.triggeringSimulation": "正在启动模拟...",
  "status.simulationStarted": "模拟已启动！",
  "status.failedSimulation": "启动模拟失败。",
  "status.storeReset": "状态已重置。",
  "status.sessionDeletedSwitched": "会话已删除。已切换到 {sessionName}",
  "status.sessionDeletedNoOthers": "会话已删除。没有其他可用会话。",
  "status.connectedTo": "已连接到 {sessionName}",
  "status.autoFollowed": "已自动跟随新会话：{sessionName}",

  // Tasks
  "tasks.title": "任务",
  "tasks.spawn": "派发",
  "tasks.spawning": "派发中...",
  "tasks.spawnNewTask": "派发新任务",
  "tasks.notConnected": "未连接",
  "tasks.connected": "已连接",
  "tasks.noActiveTasks": "暂无活跃任务",
  "tasks.project": "项目",
  "tasks.projectPlaceholder": "项目名称",
  "tasks.taskDescription": "任务描述",
  "tasks.taskPlaceholder": "描述智能体需要完成的工作...",

  // Task Status
  "taskStatus.spawning": "派发中",
  "taskStatus.working": "工作中",
  "taskStatus.prOpen": "PR 已开",
  "taskStatus.ciFailed": "CI 失败",
  "taskStatus.reviewPending": "等待审查",
  "taskStatus.changesRequested": "需要修改",
  "taskStatus.approved": "已通过",
  "taskStatus.merged": "已合并",
  "taskStatus.done": "已完成",
  "taskStatus.error": "错误",
};

export default zhCN;
