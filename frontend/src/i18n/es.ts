import type { TranslationKey } from "./en";

const es: Record<TranslationKey, string> = {
  // App
  "app.title": "Visualizador de Oficina",
  "app.initializingSystems": "Inicializando sistemas...",

  // Header Controls
  "header.simulate": "SIMULAR",
  "header.reset": "REINICIAR",
  "header.clearDb": "LIMPIAR BD",
  "header.debugOn": "DEPURAR ON",
  "header.debugOff": "DEPURAR OFF",
  "header.settings": "AJUSTES",
  "header.help": "AYUDA",
  "header.status": "Estado",
  "header.connected": "CONECTADO",
  "header.disconnected": "DESCONECTADO",
  "header.aiOn": "ON",
  "header.aiOff": "OFF",
  "header.agents": "agentes",
  "header.cleanupAgents": "LIMPIAR AGENTES",
  "header.spawn": "SPAWN",
  "header.serverLabel": "SERVIDOR",
  "header.aiSummaryLabel": "RESUMEN IA",

  // Modals
  "modal.confirmDbWipe": "Confirmar borrado de base de datos",
  "modal.cancel": "Cancelar",
  "modal.wipeAllData": "Borrar todos los datos",
  "modal.wipeWarning":
    "¿Está seguro de que desea eliminar permanentemente todo el historial de sesiones y eventos? Esta acción no se puede deshacer y restablecerá el estado actual del visualizador.",
  "modal.keyboardShortcuts": "Atajos de teclado",
  "modal.close": "Cerrar",
  "modal.toggleDebug": "Alternar modo de depuración",
  "modal.showAgentPaths": "Mostrar rutas de agentes",
  "modal.showQueueSlots": "Mostrar espacios de cola",
  "modal.showPhaseLabels": "Mostrar etiquetas de fase",
  "modal.deleteSession": "Eliminar sesión",
  "modal.delete": "Eliminar",
  "modal.deleteSessionConfirm": "¿Está seguro de que desea eliminar la sesión",
  "modal.deleteSessionWarning": "Esto eliminará permanentemente",
  "modal.events": "eventos",
  "modal.cannotBeUndone": "Esta acción no se puede deshacer.",

  // Settings
  "settings.title": "Configuraciones",
  "settings.clockType": "Tipo de reloj",
  "settings.analog": "Analógico",
  "settings.digital": "Digital",
  "settings.timeFormat": "Formato de hora",
  "settings.12hour": "12 horas",
  "settings.24hour": "24 horas",
  "settings.sessionBehavior": "Comportamiento de sesiones",
  "settings.autoFollow": "Seguir nuevas sesiones automáticamente",
  "settings.autoFollowDesc":
    "Cambiar automáticamente a nuevas sesiones en el proyecto actual",
  "settings.clockTip":
    "Consejo: Haz clic en el reloj de la oficina para alternar rápidamente entre modos.",
  "settings.language": "Idioma",
  "settings.theme": "Tema",
  "settings.light": "Claro",
  "settings.dark": "Oscuro",
  "settings.system": "Sistema",

  // Sessions
  "sessions.title": "Sesiones",
  "sessions.loading": "Cargando sesiones...",
  "sessions.noSessions": "No se encontraron sesiones",
  "sessions.unknownProject": "Proyecto desconocido",
  "sessions.deleteSession": "Eliminar sesión",
  "sessions.activeSessions": "activas",
  "sessions.events": "eventos",
  "sessions.events_one": "{count} evento",
  "sessions.events_other": "{count} eventos",
  "sessions.expandSidebar": "Expandir barra lateral",
  "sessions.collapseSidebar": "Contraer barra lateral",
  "sessions.dragToResize": "Arrastrar para redimensionar",

  // Sidebar Navigation
  "sidebar.wholeOffice": "Toda la Oficina",
  "sidebar.allProjects": "Todos los Proyectos",
  "sidebar.allSessions": "Todas las Sesiones",
  "sidebar.projects": "Proyectos",

  // View Mode Tabs (mobile)
  "viewMode.office": "Oficina",
  "viewMode.projects": "Proyectos",
  "viewMode.sessions": "Sesiones",
  "viewMode.backToSessions": "\u2190 Sesiones",
  "viewMode.backToProjects": "\u2190 Proyectos",

  // Project Card
  "project.sessions": "sesiones",
  "project.sessions_one": "{count} sesión",
  "project.sessions_other": "{count} sesiones",
  "project.agents": "agentes",
  "project.agents_one": "{count} agente",
  "project.agents_other": "{count} agentes",

  // Right Sidebar
  "sidebar.events": "Eventos",
  "sidebar.conversation": "Conversación",

  // Event Log
  "eventLog.title": "Registro de Eventos",
  "eventLog.events": "eventos",
  "eventLog.events_one": "{count} evento",
  "eventLog.events_other": "{count} eventos",
  "eventLog.waiting": "Esperando eventos...",

  // Agent Status
  "agentStatus.title": "Estado del agente",
  "agentStatus.agents": "agentes",
  "agentStatus.agents_one": "agente",
  "agentStatus.agents_other": "agentes",
  "agentStatus.noAgents": "Sin agentes",
  "agentStatus.agent": "Agente",
  "agentStatus.desk": "Escritorio",
  "agentStatus.noTaskSummary": "Sin resumen de tarea",
  "agentStatus.noRecentToolCall": "Sin llamada de herramienta reciente",
  "agentStatus.inQueue": "En cola de {queueType} (posición {position})",

  // Git Status
  "git.title": "Estado de Git",
  "git.waitingForStatus": "Esperando el estado de git...",
  "git.noSession": "No hay sesión seleccionada",
  "git.noRepo": "No se detectó repositorio git",
  "git.changedFiles": "Archivos modificados",
  "git.staged": "preparado",
  "git.recentCommits": "Commits recientes",
  "git.noCommits": "No se encontraron commits",
  "git.modified": "modificado",
  "git.added": "agregado",
  "git.deleted": "eliminado",
  "git.renamed": "renombrado",
  "git.copied": "copiado",
  "git.untracked": "sin seguimiento",
  "git.ignored": "ignorado",

  // Conversation
  "conversation.title": "Conversación",
  "conversation.msgs": "msgs",
  "conversation.msgs_one": "{count} msg",
  "conversation.msgs_other": "{count} msgs",
  "conversation.thinking": "Pensando",
  "conversation.showMore": "Mostrar más",
  "conversation.collapse": "Contraer",
  "conversation.claude": "Claude",
  "conversation.showFullResponse": "Mostrar respuesta completa",
  "conversation.hideToolCalls": "Ocultar llamadas de herramientas",
  "conversation.showToolCalls": "Mostrar llamadas de herramientas",
  "conversation.expandConversation": "Expandir conversación",
  "conversation.close": "Cerrar",
  "conversation.noConversation":
    "Aún no hay conversaciones. Inicia una sesión de Claude Code.",

  // Event Detail Modal
  "eventDetail.summary": "Resumen",
  "eventDetail.tool": "Herramienta",
  "eventDetail.agentName": "Nombre del Agente",
  "eventDetail.taskDescription": "Descripción de la Tarea",
  "eventDetail.userPrompt": "Solicitud del Usuario",
  "eventDetail.thinking": "Pensamiento",
  "eventDetail.message": "Mensaje",
  "eventDetail.resultSummary": "Resumen del Resultado",
  "eventDetail.errorType": "Tipo de Error",
  "eventDetail.toolInput": "Entrada de Herramienta",
  "eventDetail.noDetail":
    "No hay detalles adicionales disponibles para este evento.",

  // Loading Screen
  "loading.office": "Cargando oficina...",

  // Zoom Controls
  "zoom.in": "Acercar",
  "zoom.out": "Alejar",
  "zoom.reset": "Restablecer zoom",

  // Mobile
  "mobile.menu": "Menú",
  "mobile.agentActivity": "Actividad de agentes",
  "mobile.boss": "JEFE",
  "mobile.noActiveAgents": "No hay agentes activos",

  // Status Messages
  "status.switchedToSession": "Cambió a sesión {sessionId}...",
  "status.deletingSession": "Eliminando sesión {sessionId}...",
  "status.sessionDeleted": "Sesión eliminada.",
  "status.failedDeleteSession": "Error al eliminar sesión.",
  "status.errorConnecting": "Error al conectar con el backend.",
  "status.clearingDatabase": "Limpiando base de datos...",
  "status.databaseCleared": "Base de datos limpia.",
  "status.failedClearDatabase": "Error al limpiar base de datos.",
  "status.triggeringSimulation": "Iniciando simulación...",
  "status.simulationStarted": "¡Simulación iniciada!",
  "status.failedSimulation": "Error al iniciar simulación.",
  "status.storeReset": "Estado reiniciado.",
  "status.sessionDeletedSwitched": "Sesión eliminada. Cambió a {sessionName}",
  "status.sessionDeletedNoOthers":
    "Sesión eliminada. No hay otras sesiones disponibles.",
  "status.connectedTo": "Conectado a {sessionName}",
  "status.autoFollowed": "Siguiendo nueva sesión: {sessionName}",

  // Tasks
  "tasks.title": "Tareas",
  "tasks.spawn": "Crear",
  "tasks.spawning": "Creando...",
  "tasks.spawnNewTask": "Crear Nueva Tarea",
  "tasks.notConnected": "No conectado",
  "tasks.connected": "Conectado",
  "tasks.noActiveTasks": "Sin tareas activas",
  "tasks.project": "Proyecto",
  "tasks.projectPlaceholder": "nombre-proyecto",
  "tasks.taskDescription": "Descripción de la Tarea",
  "tasks.taskPlaceholder": "Describe lo que el agente debe hacer...",

  // Task Status
  "taskStatus.spawning": "Creando",
  "taskStatus.working": "Trabajando",
  "taskStatus.prOpen": "PR Abierto",
  "taskStatus.ciFailed": "CI Fallido",
  "taskStatus.reviewPending": "Revisión Pendiente",
  "taskStatus.changesRequested": "Cambios Solicitados",
  "taskStatus.approved": "Aprobado",
  "taskStatus.merged": "Fusionado",
  "taskStatus.done": "Hecho",
  "taskStatus.error": "Error",
};

export default es;
