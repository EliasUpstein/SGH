/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Preload Script (ContextBridge entre Electron Main y Renderer UI)
 */

const { contextBridge, ipcRenderer } = require('electron');
const schema = require('../domain/schema');
const metrics = require('../domain/metrics');
const seed = require('../domain/seed');
const abm = require('../domain/abm');
const proposals = require('../domain/proposals');
const { SGHStateManager } = require('../domain/stateManager');

// Instancia de gestor de estado en el contexto del preload para permitir mutaciones ricas desde la UI
let stateManagerInstance = null;

contextBridge.exposeInMainWorld('sghAPI', {
  // Inicialización del motor de estado conectado a la persistencia atómica
  async inicializarSistema() {
    const { estado, infoStorage } = await ipcRenderer.invoke('sgh:cargarEstadoInicial');

    stateManagerInstance = new SGHStateManager(estado, (estadoOficial, motivo) => {
      const esConfirmacionSimulacion = motivo && motivo.startsWith('Confirmación de Simulación');
      ipcRenderer.invoke('sgh:guardarEstado', {
        estado: estadoOficial,
        motivo,
        crearBackup: esConfirmacionSimulacion
      });
    });

    return {
      resumen: stateManagerInstance.obtenerResumenEstado(),
      infoStorage
    };
  },

  obtenerResumenActual() {
    if (!stateManagerInstance) return null;
    return stateManagerInstance.obtenerResumenEstado();
  },

  calcularMetricasDocente(docenteId) {
    if (!stateManagerInstance) return null;
    return metrics.calcularMetricasDocente(stateManagerInstance.obtenerEstado(), docenteId);
  },

  validarAsignacionDesdeVistaDocente(payload) {
    if (!stateManagerInstance) return null;
    return metrics.validarAsignacionDesdeVistaDocente(
      stateManagerInstance.obtenerEstado(),
      payload
    );
  },

  evaluarSlotEnVistaCurso(payload) {
    if (!stateManagerInstance) return null;
    return metrics.evaluarSlotEnVistaCurso(
      stateManagerInstance.obtenerEstado(),
      payload
    );
  },

  // Operaciones Fase 4: Motor Inteligente de Propuestas de Movimiento, Enroques y Pre-Confirmación
  generarPropuestasMovimiento(payload) {
    if (!stateManagerInstance) return null;
    return proposals.generarPropuestasMovimiento(
      stateManagerInstance.obtenerEstado(),
      payload
    );
  },

  evaluarImpactoOperacionHorario(operacion) {
    if (!stateManagerInstance) return null;
    return proposals.evaluarImpactoOperacionHorario(
      stateManagerInstance.obtenerEstado(),
      operacion
    );
  },

  previsualizarInteraccionMovimiento(payload) {
    if (!stateManagerInstance) return null;
    return proposals.previsualizarInteraccionMovimiento(
      stateManagerInstance.obtenerEstado(),
      payload
    );
  },

  diagnosticarMovimientoDeseado(payload) {
    if (!stateManagerInstance) return null;
    return proposals.diagnosticarMovimientoDeseado(
      stateManagerInstance.obtenerEstado(),
      payload
    );
  },

  aplicarOperacionHorarioConfirmada(operacion) {
    if (!stateManagerInstance) return null;
    return proposals.aplicarOperacionHorarioConfirmada(stateManagerInstance, operacion);
  },

  obtenerResumenSegmentos() {
    if (!stateManagerInstance) {
      return schema.obtenerResumenSegmentos(schema.BLOQUES_HORARIOS_DEFAULT);
    }
    return schema.obtenerResumenSegmentos(
      stateManagerInstance.obtenerEstado().configuracion.bloquesHorarios
    );
  },

  // Operaciones de Estado, Undo/Redo y Modo Borrador/Simulación
  deshacer() {
    if (!stateManagerInstance) return null;
    return stateManagerInstance.deshacer();
  },

  rehacer() {
    if (!stateManagerInstance) return null;
    return stateManagerInstance.rehacer();
  },

  iniciarSimulacion() {
    if (!stateManagerInstance) return null;
    return stateManagerInstance.iniciarSimulacion();
  },

  confirmarSimulacionComoOficial() {
    if (!stateManagerInstance) return null;
    return stateManagerInstance.confirmarSimulacionComoOficial();
  },

  descartarSimulacion() {
    if (!stateManagerInstance) return null;
    return stateManagerInstance.descartarSimulacion();
  },

  // Acciones de dominio sobre la grilla para probar Undo/Redo y Modo Simulador desde Fase 1
  asignarMateriaEnBloque({ cursoId, dia, bloqueIndice, materiaId }) {
    if (!stateManagerInstance) return null;
    const estado = stateManagerInstance.obtenerEstado();
    const curso = estado.cursos.find((c) => c.id === cursoId);
    const materia = estado.materias.find((m) => m.id === materiaId);
    const bloque = estado.configuracion.bloquesHorarios[bloqueIndice];

    const desc = `Asignar ${materia ? materia.nombre : materiaId} en ${curso ? curso.nombre : cursoId} (${dia} - ${bloque ? bloque.nombre : bloqueIndice})`;

    return stateManagerInstance.aplicarMutacion(desc, (draft) => {
      draft.asignaciones = draft.asignaciones.filter(
        (a) => !(a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice)
      );
      draft.asignaciones.push({
        id: `asig_${cursoId}_${dia}_b${bloqueIndice}_${Date.now()}`,
        cursoId,
        dia,
        bloqueIndice,
        materiaId
      });
    });
  },

  asignarPaqueteMateriaEnBloques({ cursoId, dia, bloquesIndices, materiaId }) {
    if (!stateManagerInstance) return null;
    const indices = Array.isArray(bloquesIndices) ? bloquesIndices : [];
    if (indices.length === 0) return stateManagerInstance.obtenerResumenEstado();

    const estado = stateManagerInstance.obtenerEstado();
    const curso = estado.cursos.find((c) => c.id === cursoId);
    const materia = estado.materias.find((m) => m.id === materiaId);
    const bloques = estado.configuracion.bloquesHorarios || [];
    const nombresBloques = indices.map((i) => bloques[i]?.nombre || `B${i + 1}`).join(', ');

    const desc = `Asignar bloque (${indices.length} hs) de ${materia ? materia.nombre : materiaId} en ${curso ? curso.nombre : cursoId} (${dia}: ${nombresBloques})`;

    return stateManagerInstance.aplicarMutacion(desc, (draft) => {
      const setIndices = new Set(indices);
      draft.asignaciones = draft.asignaciones.filter(
        (a) => !(a.cursoId === cursoId && a.dia === dia && setIndices.has(a.bloqueIndice))
      );
      for (const bIdx of indices) {
        draft.asignaciones.push({
          id: `asig_${cursoId}_${dia}_b${bIdx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          cursoId,
          dia,
          bloqueIndice: bIdx,
          materiaId
        });
      }
    });
  },

  alternarAlmuerzoEnBloque({ cursoId, dia, bloqueIndice }) {
    if (!stateManagerInstance) return null;
    const estado = stateManagerInstance.obtenerEstado();
    const curso = estado.cursos.find((c) => c.id === cursoId);
    const bloque = estado.configuracion.bloquesHorarios[bloqueIndice];
    const almuerzosActuales = Array.isArray(estado.almuerzos) ? estado.almuerzos : [];
    const yaEsAlmuerzo = almuerzosActuales.some(
      (a) => a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice
    );

    const asigMateria = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice
    );
    if (!yaEsAlmuerzo && asigMateria) {
      return {
        error: 'Este bloque ya tiene una materia asignada. Libérala primero (✕) para marcarlo como Almuerzo.'
      };
    }

    const desc = yaEsAlmuerzo
      ? `Quitar bloque de Almuerzo en ${curso ? curso.nombre : cursoId} (${dia} - ${bloque ? bloque.nombre : bloqueIndice + 1})`
      : `Asignar bloque de Almuerzo en ${curso ? curso.nombre : cursoId} (${dia} - ${bloque ? bloque.nombre : bloqueIndice + 1})`;

    const resumen = stateManagerInstance.aplicarMutacion(desc, (draft) => {
      if (!Array.isArray(draft.almuerzos)) draft.almuerzos = [];
      draft.almuerzos = draft.almuerzos.filter(
        (a) => !(a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice)
      );
      if (!yaEsAlmuerzo) {
        draft.almuerzos.push({
          id: `alm_${cursoId}_${dia}_b${bloqueIndice}_${Date.now()}`,
          cursoId,
          dia,
          bloqueIndice
        });
      }
    });

    return {
      resumen,
      accion: yaEsAlmuerzo ? 'QUITADO' : 'ASIGNADO'
    };
  },

  liberarBloqueCurso({ cursoId, dia, bloqueIndice }) {
    if (!stateManagerInstance) return null;
    const estado = stateManagerInstance.obtenerEstado();
    const curso = estado.cursos.find((c) => c.id === cursoId);
    const actual = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice
    );
    if (!actual) return stateManagerInstance.obtenerResumenEstado();

    const materia = estado.materias.find((m) => m.id === actual.materiaId);
    const bloque = estado.configuracion.bloquesHorarios[bloqueIndice];
    const desc = `Liberar ${materia ? materia.nombre : 'bloque'} de ${curso ? curso.nombre : cursoId} (${dia} - ${bloque ? bloque.nombre : bloqueIndice})`;

    return stateManagerInstance.aplicarMutacion(desc, (draft) => {
      draft.asignaciones = draft.asignaciones.filter(
        (a) => !(a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice)
      );
    });
  },

  intercambiarBloquesCurso({ cursoId, origenDia, origenBloque, destinoDia, destinoBloque }) {
    if (!stateManagerInstance) return null;
    const estado = stateManagerInstance.obtenerEstado();
    const curso = estado.cursos.find((c) => c.id === cursoId);
    const asigOrigen = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === origenDia && a.bloqueIndice === origenBloque
    );
    const asigDestino = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === destinoDia && a.bloqueIndice === destinoBloque
    );

    const matOrigen = asigOrigen
      ? estado.materias.find((m) => m.id === asigOrigen.materiaId)?.nombre || 'Materia A'
      : 'Libre';
    const matDestino = asigDestino
      ? estado.materias.find((m) => m.id === asigDestino.materiaId)?.nombre || 'Materia B'
      : 'Libre';

    const desc = `Movimiento en ${curso ? curso.nombre : cursoId}: ${matOrigen} (${origenDia} B${origenBloque + 1}) ↔ ${matDestino} (${destinoDia} B${destinoBloque + 1})`;

    return stateManagerInstance.aplicarMutacion(desc, (draft) => {
      draft.asignaciones = draft.asignaciones.filter(
        (a) =>
          !(
            a.cursoId === cursoId &&
            ((a.dia === origenDia && a.bloqueIndice === origenBloque) ||
              (a.dia === destinoDia && a.bloqueIndice === destinoBloque))
          )
      );
      if (asigOrigen) {
        draft.asignaciones.push({
          id: `asig_${cursoId}_${destinoDia}_b${destinoBloque}`,
          cursoId,
          dia: destinoDia,
          bloqueIndice: destinoBloque,
          materiaId: asigOrigen.materiaId
        });
      }
      if (asigDestino) {
        draft.asignaciones.push({
          id: `asig_${cursoId}_${origenDia}_b${origenBloque}`,
          cursoId,
          dia: origenDia,
          bloqueIndice: origenBloque,
          materiaId: asigDestino.materiaId
        });
      }
    });
  },

  alternarDisponibilidadDocente({ docenteId, dia, bloqueIndice }) {
    if (!stateManagerInstance) return null;
    const estado = stateManagerInstance.obtenerEstado();
    const doc = estado.docentes.find((d) => d.id === docenteId);
    if (!doc) return null;

    const valorActual = Boolean(doc.disponibilidad?.[dia]?.[bloqueIndice]);
    const nuevoValor = !valorActual;
    const desc = `${nuevoValor ? 'Habilitar' : 'Deshabilitar'} disponibilidad de ${doc.nombre} (${dia} Bloque ${bloqueIndice + 1})`;

    return stateManagerInstance.aplicarMutacion(desc, (draft) => {
      const targetDoc = draft.docentes.find((d) => d.id === docenteId);
      if (targetDoc && targetDoc.disponibilidad && targetDoc.disponibilidad[dia]) {
        targetDoc.disponibilidad[dia][bloqueIndice] = nuevoValor;
      }
    });
  },

  // Operaciones Fase 2: Configuración Multi-Colegio, Parámetros del Sistema, ABM Cursos, Materias, Docentes y Pintar Disponibilidad
  actualizarConfiguracionInstitucion(payload) {
    if (!stateManagerInstance) return null;
    return abm.actualizarConfiguracionInstitucion(stateManagerInstance, payload);
  },

  actualizarParametrosSistema(nuevosParametros) {
    if (!stateManagerInstance) return null;
    return abm.actualizarParametrosSistema(stateManagerInstance, nuevosParametros);
  },

  actualizarGrillaBloquesHorarios(nuevosBloques) {
    if (!stateManagerInstance) return null;
    return abm.actualizarGrillaBloquesHorarios(stateManagerInstance, nuevosBloques);
  },

  restaurarPlantillaBloquesDefault() {
    if (!stateManagerInstance) return null;
    return abm.restaurarPlantillaBloquesDefault(stateManagerInstance);
  },

  guardarCurso(datosCurso) {
    if (!stateManagerInstance) return null;
    return abm.guardarCurso(stateManagerInstance, datosCurso);
  },

  eliminarCurso(cursoId) {
    if (!stateManagerInstance) return null;
    return abm.eliminarCurso(stateManagerInstance, cursoId);
  },

  guardarMateria(datosMateria) {
    if (!stateManagerInstance) return null;
    return abm.guardarMateria(stateManagerInstance, datosMateria);
  },

  eliminarMateria(materiaId) {
    if (!stateManagerInstance) return null;
    return abm.eliminarMateria(stateManagerInstance, materiaId);
  },

  guardarDocente(datosDocente) {
    if (!stateManagerInstance) return null;
    return abm.guardarDocente(stateManagerInstance, datosDocente);
  },

  eliminarDocente(docenteId) {
    if (!stateManagerInstance) return null;
    return abm.eliminarDocente(stateManagerInstance, docenteId);
  },

  aplicarTrazoDisponibilidadDocente(payload) {
    if (!stateManagerInstance) return null;
    return abm.aplicarTrazoDisponibilidadDocente(stateManagerInstance, payload);
  },

  aplicarPresetDisponibilidadDocente(payload) {
    if (!stateManagerInstance) return null;
    return abm.aplicarPresetDisponibilidadDocente(stateManagerInstance, payload);
  },

  // Operaciones de Persistencia y Backups
  async crearBackupManual(motivo) {
    if (!stateManagerInstance) return null;
    return ipcRenderer.invoke('sgh:crearBackupManual', {
      estado: stateManagerInstance.obtenerEstadoOficial(),
      motivo: motivo || 'Backup manual desde interfaz SGH'
    });
  },

  async restaurarBackup(archivo) {
    const { estado, infoStorage } = await ipcRenderer.invoke('sgh:restaurarBackup', { archivo });
    if (stateManagerInstance) {
      stateManagerInstance.reemplazarEstadoCompleto(estado, `Restaurado backup ${archivo}`);
    }
    return {
      resumen: stateManagerInstance ? stateManagerInstance.obtenerResumenEstado() : null,
      infoStorage
    };
  },

  async eliminarBackup(archivo) {
    return ipcRenderer.invoke('sgh:eliminarBackup', { archivo });
  },

  async limpiarBackupsAntiguos(conservarUltimos = 5) {
    return ipcRenderer.invoke('sgh:limpiarBackupsAntiguos', { conservarUltimos });
  },

  async regenerarDatosSemilla() {
    const { estado, infoStorage } = await ipcRenderer.invoke('sgh:regenerarSemilla');
    if (stateManagerInstance) {
      stateManagerInstance.reemplazarEstadoCompleto(estado, 'Regeneración de Datos Semilla (85%)');
    }
    return {
      resumen: stateManagerInstance ? stateManagerInstance.obtenerResumenEstado() : null,
      infoStorage
    };
  },

  async obtenerInfoStorage() {
    return ipcRenderer.invoke('sgh:obtenerInfoStorage');
  },

  // Operaciones para Guardar, Cargar y Eliminar Simulaciones en Disco
  async guardarSimulacionActual({ nombre, descripcion, sobrescribirActiva }) {
    if (!stateManagerInstance) return null;
    const resumen = stateManagerInstance.obtenerResumenEstado();
    const archivoExistente =
      sobrescribirActiva && resumen.archivoSimulacionActiva ? resumen.archivoSimulacionActiva : null;

    const { simulacionMeta, infoStorage } = await ipcRenderer.invoke('sgh:guardarSimulacion', {
      nombre,
      descripcion,
      estadoSimulado: stateManagerInstance.obtenerEstado(),
      simulacionDiff: resumen.simulacionDiff,
      archivoExistente
    });

    stateManagerInstance.nombreSimulacionActiva = simulacionMeta.nombre;
    stateManagerInstance.archivoSimulacionActiva = simulacionMeta.archivo;

    return {
      ok: true,
      simulacion: simulacionMeta,
      simulacionMeta,
      resumen: stateManagerInstance.obtenerResumenEstado(),
      infoStorage
    };
  },

  async cargarSimulacionGuardada(archivo) {
    const { simulacionMeta, estadoSimulado, infoStorage } = await ipcRenderer.invoke(
      'sgh:cargarSimulacion',
      { archivo }
    );
    if (stateManagerInstance) {
      stateManagerInstance.cargarEstadoEnSimulacion(
        estadoSimulado,
        simulacionMeta.nombre || archivo,
        simulacionMeta.archivo || archivo
      );
    }
    return {
      ok: true,
      simulacion: simulacionMeta,
      simulacionMeta,
      resumen: stateManagerInstance ? stateManagerInstance.obtenerResumenEstado() : null,
      infoStorage
    };
  },

  async eliminarSimulacionGuardada(archivo) {
    const res = await ipcRenderer.invoke('sgh:eliminarSimulacion', { archivo });
    return {
      ok: true,
      ...res
    };
  },

  // Operaciones Fase 5: Exportación a Excel (.xlsx) y PDF (.pdf)
  async exportarExcel(opciones = {}) {
    if (!stateManagerInstance) return null;
    return ipcRenderer.invoke('sgh:exportarExcel', {
      estado: stateManagerInstance.obtenerEstado(),
      opciones
    });
  },

  async exportarPDF(opciones = {}) {
    if (!stateManagerInstance) return null;
    return ipcRenderer.invoke('sgh:exportarPDF', {
      estado: stateManagerInstance.obtenerEstado(),
      opciones
    });
  },

  async mostrarArchivoEnCarpeta(rutaArchivo) {
    return ipcRenderer.invoke('sgh:mostrarArchivoEnCarpeta', { rutaArchivo });
  }
});
