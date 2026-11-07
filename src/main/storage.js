/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo: Motor de Persistencia Atómica Local (Cero Servidor) en ./data/ y ./data/backups/
 */

const fs = require('fs');
const path = require('path');
const { crearEstadoSemillaSGH } = require('../domain/seed');
const { validarEstadoSGH } = require('../domain/schema');

class SGHStorage {
  /**
   * @param {string} [customBaseDir] Directorio raíz opcional (por defecto portable dir o cwd)
   */
  constructor(customBaseDir = null) {
    const baseDir =
      customBaseDir ||
      process.env.PORTABLE_EXECUTABLE_DIR ||
      process.cwd();

    this.dataDir = path.join(baseDir, 'data');
    this.backupsDir = path.join(this.dataDir, 'backups');
    this.simulacionesDir = path.join(this.dataDir, 'simulaciones');
    this.stateFilePath = path.join(this.dataDir, 'sgh_state.json');
    this.maxBackups = 25;

    this.asegurarDirectorios();
  }

  asegurarDirectorios() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
    if (!fs.existsSync(this.simulacionesDir)) {
      fs.mkdirSync(this.simulacionesDir, { recursive: true });
    }
  }

  /**
   * Carga el estado desde ./data/sgh_state.json o inicializa con Seed Data si no existe
   */
  cargarOInicializar() {
    this.asegurarDirectorios();

    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const validacion = validarEstadoSGH(parsed);
        if (validacion.valido) {
          if (!Array.isArray(parsed.almuerzos)) parsed.almuerzos = [];
          return parsed;
        }
        console.warn('Archivo de estado con advertencias de estructura, regenerando semilla:', validacion.errores);
      } catch (err) {
        console.error('Error leyendo sgh_state.json, inicializando desde semilla:', err);
      }
    }

    const estadoSemilla = crearEstadoSemillaSGH();
    this.guardarAtomico(estadoSemilla, 'Inicialización de Datos Semilla (Seed Data Fase 1)', true);
    return estadoSemilla;
  }

  /**
   * Guarda el estado de forma atómica (escribe en .tmp y renombra)
   */
  guardarAtomico(estado, motivo = 'Guardado automático', crearBackupSnapshot = false) {
    this.asegurarDirectorios();

    const payload = {
      ...estado,
      meta: {
        ...(estado.meta || {}),
        actualizadoEn: new Date().toISOString(),
        ultimoMotivoGuardado: motivo
      }
    };

    const tempPath = `${this.stateFilePath}.tmp`;
    const jsonString = JSON.stringify(payload, null, 2);

    fs.writeFileSync(tempPath, jsonString, 'utf-8');
    fs.renameSync(tempPath, this.stateFilePath);

    if (crearBackupSnapshot) {
      this.crearBackup(payload, motivo);
    }

    return {
      ok: true,
      ruta: this.stateFilePath,
      actualizadoEn: payload.meta.actualizadoEn
    };
  }

  /**
   * Crea un archivo de respaldo en ./data/backups/ y rota los más antiguos
   */
  crearBackup(estado, motivo = 'Respaldo manual') {
    this.asegurarDirectorios();

    const ahora = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const stamp = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}_${pad(ahora.getMilliseconds(), 3)}`;
    const fileName = `sgh_backup_${stamp}.json`;
    const filePath = path.join(this.backupsDir, fileName);

    const backupDoc = {
      backupMeta: {
        archivo: fileName,
        creadoEn: ahora.toISOString(),
        motivo,
        cursosCount: estado.cursos ? estado.cursos.length : 0,
        docentesCount: estado.docentes ? estado.docentes.length : 0,
        asignacionesCount: estado.asignaciones ? estado.asignaciones.length : 0
      },
      estado
    };

    fs.writeFileSync(filePath, JSON.stringify(backupDoc, null, 2), 'utf-8');
    this.rotarBackups();

    return {
      archivo: fileName,
      ruta: filePath,
      creadoEn: backupDoc.backupMeta.creadoEn,
      motivo
    };
  }

  rotarBackups() {
    try {
      const archivos = fs
        .readdirSync(this.backupsDir)
        .filter((f) => f.startsWith('sgh_backup_') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (archivos.length > this.maxBackups) {
        const excedentes = archivos.slice(this.maxBackups);
        for (const f of excedentes) {
          fs.unlinkSync(path.join(this.backupsDir, f));
        }
      }
    } catch (err) {
      console.error('Error al rotar backups:', err);
    }
  }

  /**
   * Lista todos los backups disponibles en ./data/backups/
   */
  listarBackups() {
    this.asegurarDirectorios();
    try {
      const archivos = fs
        .readdirSync(this.backupsDir)
        .filter((f) => f.startsWith('sgh_backup_') && f.endsWith('.json'))
        .sort()
        .reverse();

      return archivos.map((f) => {
        const fullPath = path.join(this.backupsDir, f);
        const stat = fs.statSync(fullPath);
        let meta = { archivo: f, creadoEn: stat.mtime.toISOString(), motivo: 'Backup automático' };
        try {
          const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          if (parsed.backupMeta) {
            meta = { ...meta, ...parsed.backupMeta };
          }
        } catch (_) {
          // Ignorar error de lectura individual
        }
        return {
          ...meta,
          tamanoBytes: stat.size
        };
      });
    } catch (err) {
      console.error('Error listando backups:', err);
      return [];
    }
  }

  /**
   * Restaura un archivo de backup específico desde ./data/backups/
   */
  restaurarBackup(nombreArchivo) {
    const safeName = path.basename(nombreArchivo);
    const fullPath = path.join(this.backupsDir, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`No existe el archivo de backup: ${safeName}`);
    }

    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const estadoRestaurado = parsed.estado || parsed;
    const validacion = validarEstadoSGH(estadoRestaurado);
    if (!validacion.valido) {
      throw new Error(`El backup seleccionado es inválido: ${validacion.errores.join(', ')}`);
    }

    this.guardarAtomico(estadoRestaurado, `Restaurado desde backup ${safeName}`, false);
    return estadoRestaurado;
  }

  /**
   * Elimina un archivo de backup individual de ./data/backups/
   */
  eliminarBackup(nombreArchivo) {
    this.asegurarDirectorios();
    const safeName = path.basename(String(nombreArchivo || ''));
    if (!safeName.startsWith('sgh_backup_') || !safeName.endsWith('.json')) {
      throw new Error(`Nombre de archivo de backup inválido: ${safeName}`);
    }
    const fullPath = path.join(this.backupsDir, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return {
      ok: true,
      eliminado: safeName,
      backups: this.listarBackups()
    };
  }

  /**
   * Elimina versiones antiguas de copias de seguridad conservando únicamente las N más recientes
   */
  limpiarBackupsAntiguos(conservarUltimos = 5) {
    this.asegurarDirectorios();
    const cantidadConservar = Math.max(0, parseInt(conservarUltimos, 10) || 0);
    const archivos = fs
      .readdirSync(this.backupsDir)
      .filter((f) => f.startsWith('sgh_backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    const eliminados = [];
    if (archivos.length > cantidadConservar) {
      const excedentes = archivos.slice(cantidadConservar);
      for (const f of excedentes) {
        const fullPath = path.join(this.backupsDir, f);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          eliminados.push(f);
        }
      }
    }

    return {
      ok: true,
      eliminadosCount: eliminados.length,
      eliminados,
      backups: this.listarBackups()
    };
  }

  /**
   * Regenera desde cero los Datos Semilla (haciendo primero un backup preventivo del estado previo)
   */
  regenerarDatosSemilla() {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const actual = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
        this.crearBackup(actual, 'Respaldo automático previo a regenerar Datos Semilla');
      } catch (_) {
        // continuar
      }
    }
    const nuevoSeed = crearEstadoSemillaSGH();
    this.guardarAtomico(nuevoSeed, 'Regeneración manual de Datos Semilla (85%)', true);
    return nuevoSeed;
  }

  /**
   * Guarda un escenario de simulación en ./data/simulaciones/ para poder retomarlo más adelante
   */
  guardarSimulacion({
    nombre,
    descripcion = '',
    estadoSimulado,
    simulacionDiff = {},
    archivoExistente = null
  }) {
    this.asegurarDirectorios();

    const ahora = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const stamp = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}_${pad(ahora.getMilliseconds(), 3)}`;
    const fileName = archivoExistente
      ? path.basename(archivoExistente)
      : `sgh_sim_${stamp}.json`;
    const filePath = path.join(this.simulacionesDir, fileName);

    const nombreLimpio = String(nombre || `Simulación ${ahora.toLocaleDateString('es-AR')}`).trim();

    const simDoc = {
      simulacionMeta: {
        archivo: fileName,
        nombre: nombreLimpio,
        descripcion: String(descripcion || '').trim(),
        guardadoEn: ahora.toISOString(),
        cantidadCambios: simulacionDiff.cantidadCeldasModificadas || 0,
        deltaHorasPuente: simulacionDiff.deltaHorasPuente || 0,
        asignacionesCount: estadoSimulado.asignaciones ? estadoSimulado.asignaciones.length : 0
      },
      estadoSimulado
    };

    fs.writeFileSync(filePath, JSON.stringify(simDoc, null, 2), 'utf-8');

    return simDoc.simulacionMeta;
  }

  /**
   * Lista todas las simulaciones guardadas en ./data/simulaciones/
   */
  listarSimulaciones() {
    this.asegurarDirectorios();
    try {
      const archivos = fs
        .readdirSync(this.simulacionesDir)
        .filter((f) => f.startsWith('sgh_sim_') && f.endsWith('.json'))
        .sort()
        .reverse();

      return archivos.map((f) => {
        const fullPath = path.join(this.simulacionesDir, f);
        const stat = fs.statSync(fullPath);
        let meta = {
          archivo: f,
          nombre: f,
          descripcion: '',
          guardadoEn: stat.mtime.toISOString(),
          cantidadCambios: 0
        };
        try {
          const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          if (parsed.simulacionMeta) {
            meta = { ...meta, ...parsed.simulacionMeta };
          }
        } catch (_) {
          // Ignorar error individual
        }
        return {
          ...meta,
          tamanoBytes: stat.size
        };
      });
    } catch (err) {
      console.error('Error listando simulaciones:', err);
      return [];
    }
  }

  /**
   * Carga una simulación guardada desde ./data/simulaciones/
   */
  cargarSimulacion(nombreArchivo) {
    const safeName = path.basename(nombreArchivo);
    const fullPath = path.join(this.simulacionesDir, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`No existe la simulación guardada: ${safeName}`);
    }

    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const estadoSimulado = parsed.estadoSimulado || parsed.estado || parsed;
    const validacion = validarEstadoSGH(estadoSimulado);
    if (!validacion.valido) {
      throw new Error(`La simulación seleccionada es inválida: ${validacion.errores.join(', ')}`);
    }

    return {
      simulacionMeta: parsed.simulacionMeta || { archivo: safeName, nombre: safeName },
      estadoSimulado
    };
  }

  /**
   * Elimina una simulación guardada de ./data/simulaciones/
   */
  eliminarSimulacion(nombreArchivo) {
    const safeName = path.basename(nombreArchivo);
    const fullPath = path.join(this.simulacionesDir, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return {
      ok: true,
      simulaciones: this.listarSimulaciones()
    };
  }

  obtenerInfoAlmacenamiento() {
    return {
      dataDir: this.dataDir,
      backupsDir: this.backupsDir,
      simulacionesDir: this.simulacionesDir,
      stateFilePath: this.stateFilePath,
      existeArchivoEstado: fs.existsSync(this.stateFilePath),
      backups: this.listarBackups(),
      simulaciones: this.listarSimulaciones()
    };
  }
}

module.exports = {
  SGHStorage
};
