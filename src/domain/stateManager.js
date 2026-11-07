/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo: Gestor de Estado Centralizado con Pila Undo/Redo y Modo Borrador/Simulador (Sandbox)
 */

const { auditarEstadoHorario } = require('./metrics');

function clonarProfundo(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class SGHStateManager {
  /**
   * @param {object} estadoInicial Documento de estado SGH
   * @param {function} [onPersistCallback] Callback invocado cuando cambia el Horario Oficial
   */
  constructor(estadoInicial, onPersistCallback = null) {
    this.estadoActual = clonarProfundo(estadoInicial);
    this.estadoOficial = clonarProfundo(estadoInicial);
    this.modoSimulacion = false;
    this.nombreSimulacionActiva = null;
    this.archivoSimulacionActiva = null;

    this.undoStack = []; // Array de { id, descripcion, timestamp, enSimulacion, snapshotAnterior, metadata }
    this.redoStack = [];
    this.maxHistorial = 100;

    this.onPersistCallback = onPersistCallback;
    this.listeners = new Set();
  }

  /**
   * Suscribe un listener de UI para reaccionar a cualquier cambio de estado
   */
  suscribir(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notificar() {
    const resumen = this.obtenerResumenEstado();
    for (const fn of this.listeners) {
      try {
        fn(resumen);
      } catch (err) {
        console.error('Error en listener de SGHStateManager:', err);
      }
    }
  }

  obtenerEstado() {
    return this.estadoActual;
  }

  obtenerEstadoOficial() {
    return this.estadoOficial;
  }

  /**
   * Aplica una mutación transaccional registrando la operación en la pila Undo/Redo.
   * Si el Modo Simulación está inactivo, actualiza también el Horario Oficial y persiste en disco.
   */
  aplicarMutacion(descripcion, mutatorFn, metadata = {}) {
    const snapshotPrevio = clonarProfundo(this.estadoActual);
    const proximoEstado = clonarProfundo(this.estadoActual);

    mutatorFn(proximoEstado);
    proximoEstado.meta = proximoEstado.meta || {};
    proximoEstado.meta.actualizadoEn = new Date().toISOString();

    const registroHistorial = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      descripcion,
      timestamp: new Date().toISOString(),
      enSimulacion: this.modoSimulacion,
      snapshotAnterior: snapshotPrevio,
      metadata
    };

    this.undoStack.push(registroHistorial);
    if (this.undoStack.length > this.maxHistorial) {
      this.undoStack.shift();
    }
    this.redoStack = [];

    this.estadoActual = proximoEstado;

    if (!this.modoSimulacion) {
      this.estadoOficial = clonarProfundo(this.estadoActual);
      if (this.onPersistCallback) {
        this.onPersistCallback(this.estadoOficial, descripcion);
      }
    }

    this.notificar();
    return this.obtenerResumenEstado();
  }

  puedeDeshacer() {
    return this.undoStack.length > 0;
  }

  puedeRehacer() {
    return this.redoStack.length > 0;
  }

  /**
   * Deshace la última operación (Ctrl+Z)
   */
  deshacer() {
    if (!this.puedeDeshacer()) return null;

    const ultimoRegistro = this.undoStack.pop();
    const snapshotActual = clonarProfundo(this.estadoActual);

    this.redoStack.push({
      ...ultimoRegistro,
      snapshotPosterior: snapshotActual
    });

    this.estadoActual = clonarProfundo(ultimoRegistro.snapshotAnterior);

    if (!this.modoSimulacion) {
      this.estadoOficial = clonarProfundo(this.estadoActual);
      if (this.onPersistCallback) {
        this.onPersistCallback(this.estadoOficial, `Deshacer: ${ultimoRegistro.descripcion}`);
      }
    }

    this.notificar();
    return {
      operacionDeshecha: ultimoRegistro.descripcion,
      resumen: this.obtenerResumenEstado()
    };
  }

  /**
   * Rehace la última operación deshecha (Ctrl+Y)
   */
  rehacer() {
    if (!this.puedeRehacer()) return null;

    const registroRehacer = this.redoStack.pop();
    const snapshotActual = clonarProfundo(this.estadoActual);

    this.undoStack.push({
      id: registroRehacer.id,
      descripcion: registroRehacer.descripcion,
      timestamp: new Date().toISOString(),
      enSimulacion: this.modoSimulacion,
      snapshotAnterior: snapshotActual,
      metadata: registroRehacer.metadata
    });

    this.estadoActual = clonarProfundo(registroRehacer.snapshotPosterior);

    if (!this.modoSimulacion) {
      this.estadoOficial = clonarProfundo(this.estadoActual);
      if (this.onPersistCallback) {
        this.onPersistCallback(this.estadoOficial, `Rehacer: ${registroRehacer.descripcion}`);
      }
    }

    this.notificar();
    return {
      operacionRehecha: registroRehacer.descripcion,
      resumen: this.obtenerResumenEstado()
    };
  }

  /**
   * Activa el Modo Simulación / Borrador (Sandbox)
   */
  iniciarSimulacion() {
    if (this.modoSimulacion) return this.obtenerResumenEstado();
    this.estadoOficial = clonarProfundo(this.estadoActual);
    this.modoSimulacion = true;
    this.nombreSimulacionActiva = null;
    this.archivoSimulacionActiva = null;
    this.notificar();
    return this.obtenerResumenEstado();
  }

  /**
   * Carga un estado de simulación guardado en disco dentro del Modo Simulación sin alterar el Horario Oficial Vigente
   */
  cargarEstadoEnSimulacion(
    estadoSimulado,
    nombreSimulacion = 'Simulación guardada',
    archivoSimulacion = null
  ) {
    if (!this.modoSimulacion) {
      this.estadoOficial = clonarProfundo(this.estadoActual);
      this.modoSimulacion = true;
    }

    const snapshotPrevio = clonarProfundo(this.estadoActual);
    this.undoStack.push({
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      descripcion: `Cargar simulación: ${nombreSimulacion}`,
      timestamp: new Date().toISOString(),
      enSimulacion: true,
      snapshotAnterior: snapshotPrevio,
      metadata: { esCargaSimulacion: true }
    });
    this.redoStack = [];

    this.estadoActual = clonarProfundo(estadoSimulado);
    this.nombreSimulacionActiva = nombreSimulacion;
    this.archivoSimulacionActiva = archivoSimulacion;

    this.notificar();
    return this.obtenerResumenEstado();
  }

  /**
   * Confirma todos los cambios del Modo Simulación como el nuevo Horario Oficial Vigente
   */
  confirmarSimulacionComoOficial() {
    if (!this.modoSimulacion) return this.obtenerResumenEstado();

    const diff = this.calcularDiferenciasSimulacion();
    this.modoSimulacion = false;
    this.nombreSimulacionActiva = null;
    this.archivoSimulacionActiva = null;
    this.estadoOficial = clonarProfundo(this.estadoActual);

    // Marcar entradas del historial como confirmadas en oficial
    this.undoStack.forEach((item) => {
      item.enSimulacion = false;
    });

    if (this.onPersistCallback) {
      this.onPersistCallback(
        this.estadoOficial,
        `Confirmación de Simulación (${diff.cantidadCeldasModificadas} cambios de grilla aplicados)`
      );
    }

    this.notificar();
    return this.obtenerResumenEstado();
  }

  /**
   * Descarta el Modo Simulación y restaura intacto el Horario Oficial Vigente previo
   */
  descartarSimulacion() {
    if (!this.modoSimulacion) return this.obtenerResumenEstado();

    this.estadoActual = clonarProfundo(this.estadoOficial);
    this.modoSimulacion = false;
    this.nombreSimulacionActiva = null;
    this.archivoSimulacionActiva = null;

    // Limpiar de la pila Undo/Redo las operaciones que pertenecían solo al sandbox descartado
    this.undoStack = this.undoStack.filter((item) => !item.enSimulacion);
    this.redoStack = [];

    this.notificar();
    return this.obtenerResumenEstado();
  }

  /**
   * Reemplaza el estado completo (ej. al restaurar un backup o regenerar datos semilla)
   */
  reemplazarEstadoCompleto(nuevoEstado, motivo = 'Restauración de estado completo') {
    this.modoSimulacion = false;
    this.nombreSimulacionActiva = null;
    this.archivoSimulacionActiva = null;
    this.estadoActual = clonarProfundo(nuevoEstado);
    this.estadoOficial = clonarProfundo(nuevoEstado);
    this.undoStack = [];
    this.redoStack = [];

    if (this.onPersistCallback) {
      this.onPersistCallback(this.estadoOficial, motivo);
    }

    this.notificar();
    return this.obtenerResumenEstado();
  }

  /**
   * Calcula las diferencias exactas entre el Estado Actual (Borrador) y el Horario Oficial Vigente
   */
  calcularDiferenciasSimulacion() {
    if (!this.modoSimulacion) {
      return {
        activo: false,
        cantidadCeldasModificadas: 0,
        operacionesAcumuladas: 0,
        deltaHorasPuente: 0,
        horasPuenteOficial: 0,
        horasPuenteSimulacion: 0,
        cambiosDetallados: []
      };
    }

    const materiasMapActual = new Map(this.estadoActual.materias.map((m) => [m.id, m]));
    const materiasMapOficial = new Map(this.estadoOficial.materias.map((m) => [m.id, m]));
    const cursosMap = new Map(this.estadoActual.cursos.map((c) => [c.id, c]));
    const bloques = this.estadoActual.configuracion.bloquesHorarios;

    const mapaOficial = new Map();
    for (const a of this.estadoOficial.asignaciones) {
      mapaOficial.set(`${a.cursoId}|${a.dia}|${a.bloqueIndice}`, a.materiaId);
    }
    for (const alm of this.estadoOficial.almuerzos || []) {
      const k = `${alm.cursoId}|${alm.dia}|${alm.bloqueIndice}`;
      if (!mapaOficial.has(k)) mapaOficial.set(k, '__ALMUERZO__');
    }

    const mapaActual = new Map();
    for (const a of this.estadoActual.asignaciones) {
      mapaActual.set(`${a.cursoId}|${a.dia}|${a.bloqueIndice}`, a.materiaId);
    }
    for (const alm of this.estadoActual.almuerzos || []) {
      const k = `${alm.cursoId}|${alm.dia}|${alm.bloqueIndice}`;
      if (!mapaActual.has(k)) mapaActual.set(k, '__ALMUERZO__');
    }

    const todasLasClaves = new Set([...mapaOficial.keys(), ...mapaActual.keys()]);
    const cambiosDetallados = [];

    for (const clave of todasLasClaves) {
      const matOficialId = mapaOficial.get(clave) || null;
      const matActualId = mapaActual.get(clave) || null;

      if (matOficialId !== matActualId) {
        const [cursoId, dia, bloqueIdxStr] = clave.split('|');
        const bloqueIdx = parseInt(bloqueIdxStr, 10);
        const bloqueObj = bloques[bloqueIdx];
        const matAntes =
          matOficialId === '__ALMUERZO__'
            ? { nombre: '🍽️ Almuerzo' }
            : matOficialId
              ? materiasMapOficial.get(matOficialId)
              : null;
        const matDespues =
          matActualId === '__ALMUERZO__'
            ? { nombre: '🍽️ Almuerzo' }
            : matActualId
              ? materiasMapActual.get(matActualId)
              : null;

        cambiosDetallados.push({
          cursoId,
          cursoNombre: cursosMap.get(cursoId)?.nombre || cursoId,
          dia,
          bloqueIndice: bloqueIdx,
          bloqueNombre: bloqueObj ? bloqueObj.nombre : `Bloque ${bloqueIdx + 1}`,
          horario: bloqueObj ? `${bloqueObj.inicio} - ${bloqueObj.fin}` : '',
          materiaAntesId: matOficialId,
          materiaAntesNombre: matAntes ? matAntes.nombre : 'Libre (Vacío)',
          materiaDespuesId: matActualId,
          materiaDespuesNombre: matDespues ? matDespues.nombre : 'Libre (Vacío)'
        });
      }
    }

    const audOficial = auditarEstadoHorario(this.estadoOficial);
    const audActual = auditarEstadoHorario(this.estadoActual);
    const operacionesSim = this.undoStack.filter((u) => u.enSimulacion);

    return {
      activo: true,
      cantidadCeldasModificadas: cambiosDetallados.length,
      operacionesAcumuladas: operacionesSim.length,
      horasPuenteOficial: audOficial.totalHorasPuenteEscuela,
      horasPuenteSimulacion: audActual.totalHorasPuenteEscuela,
      deltaHorasPuente: audActual.totalHorasPuenteEscuela - audOficial.totalHorasPuenteEscuela,
      cambiosDetallados
    };
  }

  /**
   * Devuelve el paquete completo que necesita el Frontend para renderizar el estado, métricas, Undo/Redo y Simulación
   */
  obtenerResumenEstado() {
    const auditoria = auditarEstadoHorario(this.estadoActual);
    const simulacionDiff = this.calcularDiferenciasSimulacion();

    return {
      estado: this.estadoActual,
      modoSimulacion: this.modoSimulacion,
      nombreSimulacionActiva: this.nombreSimulacionActiva,
      archivoSimulacionActiva: this.archivoSimulacionActiva,
      simulacionDiff,
      auditoria,
      historial: {
        puedeDeshacer: this.puedeDeshacer(),
        puedeRehacer: this.puedeRehacer(),
        cantidadUndo: this.undoStack.length,
        cantidadRedo: this.redoStack.length,
        ultimaOperacion:
          this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].descripcion : null,
        proximaOperacionRedo:
          this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].descripcion : null,
        listaReciente: this.undoStack
          .slice(-15)
          .reverse()
          .map((u) => ({
            id: u.id,
            descripcion: u.descripcion,
            timestamp: u.timestamp,
            enSimulacion: u.enSimulacion
          }))
      }
    };
  }
}

module.exports = {
  SGHStateManager,
  clonarProfundo
};
