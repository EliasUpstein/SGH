/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo Fase 2: Gestión de Configuración Multi-Colegio, ABM de Cursos, Materias, Docentes
 * y Motor de Disponibilidad Docente por Lotes ("Pintar con el Mouse")
 */

const {
  BLOQUES_HORARIOS_DEFAULT,
  DIAS_HABILES_DEFAULT,
  MODOS_EXIGENCIA,
  PARAMETROS_SISTEMA_DEFAULT,
  obtenerParametrosSistema,
  recalcularSegmentos,
  normalizarDisponibilidadDocentes
} = require('./schema');

/**
 * 1. CONFIGURACIÓN ESCOLAR MULTI-COLEGIO (Días Hábiles, Datos de Institución, Logo/Siglas y Grilla de Bloques/Recreos)
 */
function actualizarConfiguracionInstitucion(
  manager,
  { nombreColegio, cicloLectivo, diasHabiles, siglasColegio, logoBase64 }
) {
  const diasLimpios =
    Array.isArray(diasHabiles) && diasHabiles.length > 0
      ? diasHabiles.map((d) => String(d).trim()).filter(Boolean)
      : [...DIAS_HABILES_DEFAULT];

  return manager.aplicarMutacion(
    `Actualizar datos del colegio (${nombreColegio} · ${diasLimpios.length} días hábiles)`,
    (draft) => {
      draft.configuracion.nombreColegio = String(nombreColegio || 'Escuela Secundaria').trim();
      draft.configuracion.cicloLectivo = String(cicloLectivo || '2026').trim();
      draft.configuracion.diasHabiles = diasLimpios;

      if (siglasColegio !== undefined) {
        const limpias = String(siglasColegio || 'SGH')
          .trim()
          .toUpperCase()
          .slice(0, 5);
        draft.configuracion.siglasColegio = limpias || 'SGH';
      }

      if (logoBase64 !== undefined) {
        draft.configuracion.logoBase64 = logoBase64 || null;
      }

      if (draft.meta) {
        draft.meta.nombreInstitucion = draft.configuracion.nombreColegio;
      }

      const cantBloques = draft.configuracion.bloquesHorarios.length;
      normalizarDisponibilidadDocentes(draft.docentes, diasLimpios, cantBloques);

      // Filtrar asignaciones de días que ya no sean hábiles
      const setDias = new Set(diasLimpios);
      draft.asignaciones = draft.asignaciones.filter((a) => setDias.has(a.dia));
    }
  );
}

/**
 * Actualiza los parámetros y alertas personalizables del sistema (flags de advertencia/error y tema claro/oscuro)
 */
function actualizarParametrosSistema(manager, nuevosParametros = {}) {
  return manager.aplicarMutacion('Actualizar parámetros del sistema', (draft) => {
    const actuales = obtenerParametrosSistema(draft);
    draft.configuracion.parametrosSistema = {
      ...PARAMETROS_SISTEMA_DEFAULT,
      ...actuales,
      ...nuevosParametros
    };
  });
}

function actualizarGrillaBloquesHorarios(manager, nuevosBloques) {
  if (!Array.isArray(nuevosBloques) || nuevosBloques.length === 0) {
    throw new Error('La grilla debe contener al menos 1 bloque horario.');
  }

  const bloquesNormalizados = nuevosBloques.map((b, idx) => ({
    id: b.id || `b${idx + 1}`,
    indice: idx,
    numero: idx + 1,
    nombre: (b.nombre || `Bloque ${idx + 1}`).trim(),
    inicio: b.inicio || '08:00',
    fin: b.fin || '08:40',
    duracionMin: parseInt(b.duracionMin, 10) || 40,
    recreoPosterior: b.recreoPosterior
      ? {
          duracionMin: parseInt(b.recreoPosterior.duracionMin, 10) || 10,
          inicio: b.recreoPosterior.inicio || b.fin || '',
          fin: b.recreoPosterior.fin || '',
          etiqueta:
            b.recreoPosterior.etiqueta ||
            `Recreo ${parseInt(b.recreoPosterior.duracionMin, 10) || 10} min (${b.recreoPosterior.inicio || b.fin} - ${b.recreoPosterior.fin || ''})`
        }
      : null
  }));

  const bloquesConSegmentos = recalcularSegmentos(bloquesNormalizados);

  return manager.aplicarMutacion(
    `Actualizar grilla horaria (${bloquesConSegmentos.length} bloques cátedra)`,
    (draft) => {
      draft.configuracion.bloquesHorarios = bloquesConSegmentos;
      normalizarDisponibilidadDocentes(
        draft.docentes,
        draft.configuracion.diasHabiles,
        bloquesConSegmentos.length
      );
      draft.asignaciones = draft.asignaciones.filter(
        (a) => a.bloqueIndice >= 0 && a.bloqueIndice < bloquesConSegmentos.length
      );
    }
  );
}

function restaurarPlantillaBloquesDefault(manager) {
  const copiaDefault = JSON.parse(JSON.stringify(BLOQUES_HORARIOS_DEFAULT));
  return actualizarGrillaBloquesHorarios(manager, copiaDefault);
}

/**
 * 2. ABM DE CURSOS / DIVISIONES
 */
function guardarCurso(manager, datosCurso) {
  const estado = manager.obtenerEstado();
  const esEdicion = Boolean(datosCurso.id && estado.cursos.some((c) => c.id === datosCurso.id));
  const idCurso = esEdicion ? datosCurso.id : `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const nombre = String(datosCurso.nombre || 'Nuevo Curso').trim();
  const division = String(datosCurso.division || 'A').trim();
  const nivel = parseInt(datosCurso.nivel, 10) || estado.cursos.length + 1;
  const aula = String(datosCurso.aula || `Aula ${100 + nivel}`).trim();

  const desc = esEdicion
    ? `Editar curso ${nombre} (${division})`
    : `Crear nuevo curso ${nombre} (${division})`;

  return manager.aplicarMutacion(desc, (draft) => {
    const payload = {
      id: idCurso,
      nombre,
      division,
      nivel,
      aula,
      activo: datosCurso.activo !== false
    };

    if (esEdicion) {
      const idx = draft.cursos.findIndex((c) => c.id === idCurso);
      if (idx !== -1) draft.cursos[idx] = payload;
    } else {
      draft.cursos.push(payload);
    }
  });
}

function eliminarCurso(manager, cursoId) {
  const estado = manager.obtenerEstado();
  const curso = estado.cursos.find((c) => c.id === cursoId);
  if (!curso) throw new Error('El curso indicado no existe.');
  if (estado.cursos.length <= 1) {
    throw new Error('No se puede eliminar el único curso activo de la institución.');
  }

  return manager.aplicarMutacion(`Eliminar curso ${curso.nombre} (${curso.division})`, (draft) => {
    draft.cursos = draft.cursos.filter((c) => c.id !== cursoId);
    draft.materias = draft.materias.filter((m) => m.cursoId !== cursoId);
    draft.asignaciones = draft.asignaciones.filter((a) => a.cursoId !== cursoId);
  });
}

/**
 * 3. ABM DE MATERIAS POR CURSO (Soporte Multi-Docente y Formato de Bloques)
 */
function guardarMateria(manager, datosMateria) {
  const estado = manager.obtenerEstado();
  const esEdicion = Boolean(
    datosMateria.id && estado.materias.some((m) => m.id === datosMateria.id)
  );
  const idMateria = esEdicion
    ? datosMateria.id
    : `m_${datosMateria.cursoId || 'c1'}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  const nombre = String(datosMateria.nombre || 'Nueva Materia').trim();
  const codigo = String(
    datosMateria.codigo || nombre.slice(0, 4).toUpperCase()
  ).trim();
  const cursoId = datosMateria.cursoId || estado.cursos[0]?.id;
  const horasSemanales = Math.max(1, parseInt(datosMateria.horasSemanales, 10) || 2);
  const formatoBloques = String(datosMateria.formatoBloques || String(horasSemanales)).trim();
  const modoExigencia =
    datosMateria.modoExigencia === MODOS_EXIGENCIA.IDEAL
      ? MODOS_EXIGENCIA.IDEAL
      : MODOS_EXIGENCIA.OBLIGATORIO;
  const docentesIds = Array.isArray(datosMateria.docentesIds)
    ? Array.from(new Set(datosMateria.docentesIds.filter(Boolean)))
    : [];
  const color = datosMateria.color || '#dbeafe';

  if (docentesIds.length === 0) {
    throw new Error('Debes asignar al menos 1 docente a la materia.');
  }

  const cursoObj = estado.cursos.find((c) => c.id === cursoId);
  const desc = esEdicion
    ? `Editar materia ${nombre} en ${cursoObj ? cursoObj.nombre : cursoId}`
    : `Crear materia ${nombre} (${horasSemanales} hs · ${formatoBloques}) en ${cursoObj ? cursoObj.nombre : cursoId}`;

  return manager.aplicarMutacion(desc, (draft) => {
    const payload = {
      id: idMateria,
      cursoId,
      codigo,
      nombre,
      horasSemanales,
      formatoBloques,
      modoExigencia,
      docentesIds,
      color
    };

    if (esEdicion) {
      const idx = draft.materias.findIndex((m) => m.id === idMateria);
      if (idx !== -1) draft.materias[idx] = payload;
    } else {
      draft.materias.push(payload);
    }
  });
}

function eliminarMateria(manager, materiaId) {
  const estado = manager.obtenerEstado();
  const mat = estado.materias.find((m) => m.id === materiaId);
  if (!mat) throw new Error('La materia indicada no existe.');
  const curso = estado.cursos.find((c) => c.id === mat.cursoId);

  return manager.aplicarMutacion(
    `Eliminar materia ${mat.nombre} de ${curso ? curso.nombre : mat.cursoId}`,
    (draft) => {
      draft.materias = draft.materias.filter((m) => m.id !== materiaId);
      draft.asignaciones = draft.asignaciones.filter((a) => a.materiaId !== materiaId);
    }
  );
}

/**
 * 4. ABM DE DOCENTES Y MOTOR DE DISPONIBILIDAD ("PINTAR CON EL MOUSE")
 */
function guardarDocente(manager, datosDocente) {
  const estado = manager.obtenerEstado();
  const esEdicion = Boolean(
    datosDocente.id && estado.docentes.some((d) => d.id === datosDocente.id)
  );
  const idDocente = esEdicion
    ? datosDocente.id
    : `d_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  const nombre = String(datosDocente.nombre || 'Nuevo Docente').trim();
  const especialidad = String(datosDocente.especialidad || 'General').trim();
  const legajo = String(
    datosDocente.legajo || `DOC-${1000 + estado.docentes.length + 1}`
  ).trim();
  const color = datosDocente.color || '#3b82f6';

  const desc = esEdicion ? `Editar docente ${nombre}` : `Registrar nuevo docente ${nombre}`;

  return manager.aplicarMutacion(desc, (draft) => {
    const cantBloques = draft.configuracion.bloquesHorarios.length;
    const dias = draft.configuracion.diasHabiles;

    if (esEdicion) {
      const idx = draft.docentes.findIndex((d) => d.id === idDocente);
      if (idx !== -1) {
        draft.docentes[idx] = {
          ...draft.docentes[idx],
          nombre,
          especialidad,
          legajo,
          color
        };
      }
    } else {
      const disponibilidadInicial = {};
      for (const dia of dias) {
        disponibilidadInicial[dia] = new Array(cantBloques).fill(true);
      }
      draft.docentes.push({
        id: idDocente,
        nombre,
        especialidad,
        legajo,
        color,
        disponibilidad: disponibilidadInicial
      });
    }
  });
}

function eliminarDocente(manager, docenteId) {
  const estado = manager.obtenerEstado();
  const doc = estado.docentes.find((d) => d.id === docenteId);
  if (!doc) throw new Error('El docente indicado no existe.');

  // Verificar si alguna materia quedaría con 0 docentes
  const materiasHuerfanas = estado.materias.filter(
    (m) => m.docentesIds.includes(docenteId) && m.docentesIds.length === 1
  );
  if (materiasHuerfanas.length > 0) {
    const nombres = materiasHuerfanas.map((m) => m.nombre).join(', ');
    throw new Error(
      `No se puede eliminar a ${doc.nombre} porque es el único docente asignado en: ${nombres}. Reasigna esas materias primero.`
    );
  }

  return manager.aplicarMutacion(`Eliminar docente ${doc.nombre}`, (draft) => {
    draft.docentes = draft.docentes.filter((d) => d.id !== docenteId);
    // Quitar de materias con pareja pedagógica
    draft.materias.forEach((m) => {
      m.docentesIds = m.docentesIds.filter((id) => id !== docenteId);
    });
  });
}

/**
 * Aplica un lote de cambios de disponibilidad ("trazo de pintura con el mouse") en una sola operación Undo/Redo
 * @param {SGHStateManager} manager
 * @param {{ docenteId: string, cambios: Array<{ dia: string, bloqueIndice: number, disponible: boolean }>, etiquetaAccion?: string }} payload
 */
function aplicarTrazoDisponibilidadDocente(manager, { docenteId, cambios, etiquetaAccion }) {
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return manager.obtenerResumenEstado();
  }

  const estado = manager.obtenerEstado();
  const doc = estado.docentes.find((d) => d.id === docenteId);
  if (!doc) throw new Error('Docente no encontrado.');

  // Filtrar solo los cambios que realmente modifican el valor actual
  const cambiosReales = cambios.filter((c) => {
    const actual = Boolean(doc.disponibilidad?.[c.dia]?.[c.bloqueIndice]);
    return actual !== Boolean(c.disponible);
  });

  if (cambiosReales.length === 0) {
    return manager.obtenerResumenEstado();
  }

  const desc =
    etiquetaAccion ||
    `Pintar disponibilidad de ${doc.nombre} (${cambiosReales.length} bloque${cambiosReales.length === 1 ? '' : 's'} actualizado${cambiosReales.length === 1 ? '' : 's'})`;

  return manager.aplicarMutacion(desc, (draft) => {
    const targetDoc = draft.docentes.find((d) => d.id === docenteId);
    if (!targetDoc) return;

    for (const c of cambiosReales) {
      if (!targetDoc.disponibilidad[c.dia]) {
        targetDoc.disponibilidad[c.dia] = new Array(
          draft.configuracion.bloquesHorarios.length
        ).fill(true);
      }
      targetDoc.disponibilidad[c.dia][c.bloqueIndice] = Boolean(c.disponible);
    }
  });
}

/**
 * Aplica un preset rápido de disponibilidad a un docente (Jornada Completa, Turno Mañana, Turno Tarde, Limpiar Todo)
 */
function aplicarPresetDisponibilidadDocente(manager, { docenteId, preset }) {
  const estado = manager.obtenerEstado();
  const doc = estado.docentes.find((d) => d.id === docenteId);
  if (!doc) throw new Error('Docente no encontrado.');

  const dias = estado.configuracion.diasHabiles;
  const bloques = estado.configuracion.bloquesHorarios;
  const cambios = [];

  let nombrePreset = preset;
  for (const dia of dias) {
    for (const b of bloques) {
      let valor = true;
      if (preset === 'JORNADA_COMPLETA') {
        valor = true;
        nombrePreset = 'Jornada Completa (100% Disponible)';
      } else if (preset === 'SOLO_MANANA') {
        valor = b.inicio < '13:00';
        nombrePreset = 'Solo Turno Mañana';
      } else if (preset === 'SOLO_TARDE') {
        valor = b.inicio >= '13:00';
        nombrePreset = 'Solo Turno Tarde';
      } else if (preset === 'LIMPIAR_TODO') {
        valor = false;
        nombrePreset = 'Sin Disponibilidad (0%)';
      }
      cambios.push({ dia, bloqueIndice: b.indice, disponible: valor });
    }
  }

  return aplicarTrazoDisponibilidadDocente(manager, {
    docenteId,
    cambios,
    etiquetaAccion: `Aplicar plantilla "${nombrePreset}" a ${doc.nombre}`
  });
}

module.exports = {
  actualizarConfiguracionInstitucion,
  actualizarParametrosSistema,
  actualizarGrillaBloquesHorarios,
  restaurarPlantillaBloquesDefault,
  guardarCurso,
  eliminarCurso,
  guardarMateria,
  eliminarMateria,
  guardarDocente,
  eliminarDocente,
  aplicarTrazoDisponibilidadDocente,
  aplicarPresetDisponibilidadDocente
};
