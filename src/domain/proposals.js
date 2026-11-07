/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo Fase 4: Motor Inteligente de Propuestas de Movimiento (Horarios Libres, Enroques 1 a 1
 * y Enroques Triangulares A → B → C → A) y Evaluador de Impacto para Pre-Confirmación
 */

const { obtenerParametrosSistema, esBloqueAlmuerzo } = require('./schema');
const {
  agruparEnCorridasContiguas,
  calcularHorasPuenteDia,
  evaluarContinuidadRecreos,
  auditarEstadoHorario
} = require('./metrics');

/**
 * Formatea un conjunto de índices de bloques de un día en texto legible (ej. "Bloque 1 y Bloque 2 (07:50 - 09:10)")
 */
function formatearRangoBloques(bloquesHorarios, indices = []) {
  const ordenados = Array.from(new Set(indices)).sort((a, b) => a - b);
  if (ordenados.length === 0) return 'Sin bloque';
  const primero = bloquesHorarios[ordenados[0]];
  const ultimo = bloquesHorarios[ordenados[ordenados.length - 1]];

  if (ordenados.length === 1) {
    return primero
      ? `${primero.nombre} (${primero.inicio} - ${primero.fin})`
      : `Bloque ${ordenados[0] + 1}`;
  }

  const nombres = ordenados.map((i) => bloquesHorarios[i]?.nombre || `Bloque ${i + 1}`);
  const horarioTexto =
    primero && ultimo ? ` (${primero.inicio} - ${ultimo.fin})` : '';
  return `${nombres.join(' + ')}${horarioTexto}`;
}

/**
 * Clona livianamente el estado reemplazando únicamente la colección de asignaciones
 * y ejecutando la operación indicada para simular su impacto exacto.
 */
function simularEstadoConOperacion(estado, operacion) {
  if (!estado || !operacion) return estado;

  const { tipo, cursoId } = operacion;
  let nuevasAsignaciones = estado.asignaciones.map((a) => ({ ...a }));
  const stamp = Date.now();

  if (tipo === 'ASIGNAR_LIBRE' || tipo === 'MOVER_A_LIBRE') {
    const origenIndices = Array.isArray(operacion.origenBloquesIndices)
      ? operacion.origenBloquesIndices
      : Number.isInteger(operacion.origenBloqueIndice)
        ? [operacion.origenBloqueIndice]
        : [];
    const destinoIndices = Array.isArray(operacion.destinoBloquesIndices)
      ? operacion.destinoBloquesIndices
      : Number.isInteger(operacion.destinoBloqueIndice)
        ? [operacion.destinoBloqueIndice]
        : [];

    if (operacion.origenDia && origenIndices.length > 0) {
      const setOrig = new Set(origenIndices);
      nuevasAsignaciones = nuevasAsignaciones.filter(
        (a) => !(a.cursoId === cursoId && a.dia === operacion.origenDia && setOrig.has(a.bloqueIndice))
      );
    }

    if (operacion.destinoDia && destinoIndices.length > 0) {
      const setDest = new Set(destinoIndices);
      nuevasAsignaciones = nuevasAsignaciones.filter(
        (a) => !(a.cursoId === cursoId && a.dia === operacion.destinoDia && setDest.has(a.bloqueIndice))
      );

      for (const bIdx of destinoIndices) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${operacion.destinoDia}_b${bIdx}_${stamp}`,
          cursoId,
          dia: operacion.destinoDia,
          bloqueIndice: bIdx,
          materiaId: operacion.materiaId
        });
      }
    }
  } else if (tipo === 'ENROQUE_1_A_1') {
    const origenIndices = Array.isArray(operacion.origenBloquesIndices)
      ? operacion.origenBloquesIndices
      : [operacion.origenBloqueIndice];
    const destinoIndices = Array.isArray(operacion.destinoBloquesIndices)
      ? operacion.destinoBloquesIndices
      : [operacion.destinoBloqueIndice];

    const setOrig = new Set(origenIndices);
    const setDest = new Set(destinoIndices);

    nuevasAsignaciones = nuevasAsignaciones.filter(
      (a) =>
        !(
          a.cursoId === cursoId &&
          ((a.dia === operacion.origenDia && setOrig.has(a.bloqueIndice)) ||
            (a.dia === operacion.destinoDia && setDest.has(a.bloqueIndice)))
        )
    );

    if (operacion.materiaAId) {
      for (const bIdx of destinoIndices) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${operacion.destinoDia}_b${bIdx}_${stamp}_A`,
          cursoId,
          dia: operacion.destinoDia,
          bloqueIndice: bIdx,
          materiaId: operacion.materiaAId
        });
      }
    }

    if (operacion.materiaBId) {
      for (const bIdx of origenIndices) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${operacion.origenDia}_b${bIdx}_${stamp}_B`,
          cursoId,
          dia: operacion.origenDia,
          bloqueIndice: bIdx,
          materiaId: operacion.materiaBId
        });
      }
    }
  } else if (tipo === 'ENROQUE_TRIANGULAR') {
    const {
      diaA,
      bloquesA = [],
      materiaAId,
      diaB,
      bloquesB = [],
      materiaBId,
      diaC,
      bloquesC = [],
      materiaCId
    } = operacion;

    const setA = new Set(bloquesA);
    const setB = new Set(bloquesB);
    const setC = new Set(bloquesC);

    nuevasAsignaciones = nuevasAsignaciones.filter(
      (a) =>
        !(
          a.cursoId === cursoId &&
          ((a.dia === diaA && setA.has(a.bloqueIndice)) ||
            (a.dia === diaB && setB.has(a.bloqueIndice)) ||
            (a.dia === diaC && setC.has(a.bloqueIndice)))
        )
    );

    // A -> B
    if (materiaAId) {
      for (const bIdx of bloquesB) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaB}_b${bIdx}_${stamp}_TA`,
          cursoId,
          dia: diaB,
          bloqueIndice: bIdx,
          materiaId: materiaAId
        });
      }
    }
    // B -> C
    if (materiaBId) {
      for (const bIdx of bloquesC) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaC}_b${bIdx}_${stamp}_TB`,
          cursoId,
          dia: diaC,
          bloqueIndice: bIdx,
          materiaId: materiaBId
        });
      }
    }
    // C -> A
    if (materiaCId) {
      for (const bIdx of bloquesA) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaA}_b${bIdx}_${stamp}_TC`,
          cursoId,
          dia: diaA,
          bloqueIndice: bIdx,
          materiaId: materiaCId
        });
      }
    }
  } else if (tipo === 'DESPLAZAMIENTO_BANDEJA_1_A_1') {
    // A (desde Bandeja) ingresa en B (diaB, bloquesB); B se desplaza al casillero libre C (diaC, bloquesC)
    const {
      materiaAId,
      diaB,
      bloquesB = [],
      materiaBId,
      diaC,
      bloquesC = []
    } = operacion;
    const setB = new Set(bloquesB);
    const setC = new Set(bloquesC);

    nuevasAsignaciones = nuevasAsignaciones.filter(
      (a) =>
        !(
          a.cursoId === cursoId &&
          ((a.dia === diaB && setB.has(a.bloqueIndice)) ||
            (a.dia === diaC && setC.has(a.bloqueIndice)))
        )
    );

    if (materiaAId) {
      for (const bIdx of bloquesB) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaB}_b${bIdx}_${stamp}_DBA`,
          cursoId,
          dia: diaB,
          bloqueIndice: bIdx,
          materiaId: materiaAId
        });
      }
    }
    if (materiaBId) {
      for (const bIdx of bloquesC) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaC}_b${bIdx}_${stamp}_DBB`,
          cursoId,
          dia: diaC,
          bloqueIndice: bIdx,
          materiaId: materiaBId
        });
      }
    }
  } else if (tipo === 'DESPLAZAMIENTO_BANDEJA_TRIANGULAR') {
    // A (desde Bandeja) -> B; B -> C; C -> Libre D
    const {
      materiaAId,
      diaB,
      bloquesB = [],
      materiaBId,
      diaC,
      bloquesC = [],
      materiaCId,
      diaD,
      bloquesD = []
    } = operacion;
    const setB = new Set(bloquesB);
    const setC = new Set(bloquesC);
    const setD = new Set(bloquesD);

    nuevasAsignaciones = nuevasAsignaciones.filter(
      (a) =>
        !(
          a.cursoId === cursoId &&
          ((a.dia === diaB && setB.has(a.bloqueIndice)) ||
            (a.dia === diaC && setC.has(a.bloqueIndice)) ||
            (a.dia === diaD && setD.has(a.bloqueIndice)))
        )
    );

    if (materiaAId) {
      for (const bIdx of bloquesB) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaB}_b${bIdx}_${stamp}_DTA`,
          cursoId,
          dia: diaB,
          bloqueIndice: bIdx,
          materiaId: materiaAId
        });
      }
    }
    if (materiaBId) {
      for (const bIdx of bloquesC) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaC}_b${bIdx}_${stamp}_DTB`,
          cursoId,
          dia: diaC,
          bloqueIndice: bIdx,
          materiaId: materiaBId
        });
      }
    }
    if (materiaCId) {
      for (const bIdx of bloquesD) {
        nuevasAsignaciones.push({
          id: `asig_${cursoId}_${diaD}_b${bIdx}_${stamp}_DTC`,
          cursoId,
          dia: diaD,
          bloqueIndice: bIdx,
          materiaId: materiaCId
        });
      }
    }
  } else if (tipo === 'OPERACION_COMPUESTA') {
    let estadoIntermedio = {
      ...estado,
      asignaciones: nuevasAsignaciones
    };

    if (Array.isArray(operacion.cambiosDisponibilidad) && operacion.cambiosDisponibilidad.length > 0) {
      const nuevosDocentes = estado.docentes.map((d) => {
        const cambiosDoc = operacion.cambiosDisponibilidad.filter((c) => c.docenteId === d.id);
        if (cambiosDoc.length === 0) return d;
        const nuevaDisp = {};
        for (const [kDia, arr] of Object.entries(d.disponibilidad || {})) {
          nuevaDisp[kDia] = [...arr];
        }
        for (const c of cambiosDoc) {
          if (!nuevaDisp[c.dia]) nuevaDisp[c.dia] = [];
          nuevaDisp[c.dia][c.bloqueIndice] = Boolean(c.disponible);
        }
        return {
          ...d,
          disponibilidad: nuevaDisp
        };
      });
      estadoIntermedio.docentes = nuevosDocentes;
    }

    for (const subOp of operacion.operaciones || []) {
      estadoIntermedio = simularEstadoConOperacion(estadoIntermedio, subOp);
    }
    return estadoIntermedio;
  }

  return {
    ...estado,
    asignaciones: nuevasAsignaciones
  };
}

/**
 * Calcula las horas libres por día y totales para un docente dado un conjunto de asignaciones
 */
function calcularMapaHorasPuenteDocente(estado, asignaciones, docenteId, materiasMap) {
  const dias = estado.configuracion.diasHabiles || [];
  const porDia = {};
  let totalSemana = 0;

  for (const dia of dias) {
    const indicesDia = asignaciones
      .filter((a) => {
        if (a.dia !== dia) return false;
        const m = materiasMap.get(a.materiaId);
        return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(docenteId);
      })
      .map((a) => a.bloqueIndice);

    const info = calcularHorasPuenteDia(indicesDia);
    porDia[dia] = info.cantidadHorasPuente;
    totalSemana += info.cantidadHorasPuente;
  }

  return {
    porDia,
    totalSemana
  };
}

/**
 * Evalúa el impacto completo de una operación antes de ejecutarla, generando toda la información
 * requerida por el Modal Obligatorio de Pre-Confirmación ("Detalle de Impacto del Movimiento" - Sección 5.2).
 */
function evaluarImpactoOperacionHorario(estado, operacion) {
  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));
  const bloques = estado.configuracion.bloquesHorarios || [];
  const params = obtenerParametrosSistema(estado);

  const curso = cursosMap.get(operacion.cursoId);
  const cursoNombre = curso ? curso.nombre : operacion.cursoId;

  const estadoSimulado = simularEstadoConOperacion(estado, operacion);

  // Construir pasos del movimiento y recolectar materias y días involucrados
  const pasosMovimiento = [];
  const materiasInvolucradasIds = new Set();
  const diasInvolucradosSet = new Set();

  const formatearDocentes = (mat) => {
    if (!mat || !Array.isArray(mat.docentesIds)) return 'Sin docente';
    return mat.docentesIds.map((id) => docentesMap.get(id)?.nombre || id).join(' + ');
  };

  let categoria = 'LIBRE';
  let identificadorColor = 'VERDE';
  let tituloOperacion = 'Movimiento a Horario Libre';
  let descripcionHistorial = '';

  if (operacion.tipo === 'ASIGNAR_LIBRE') {
    categoria = 'LIBRE';
    identificadorColor = 'VERDE';
    tituloOperacion = 'Asignación a Curso con Horario Libre';
    const mat = materiasMap.get(operacion.materiaId);
    const destIndices = operacion.destinoBloquesIndices || [operacion.destinoBloqueIndice];
    materiasInvolucradasIds.add(operacion.materiaId);
    diasInvolucradosSet.add(operacion.destinoDia);

    // Si en el destino había otra materia (reemplazo directo desde bandeja), registrarla también
    const reemplazadas = new Map();
    for (const bIdx of destIndices) {
      const asigPrev = estado.asignaciones.find(
        (a) => a.cursoId === operacion.cursoId && a.dia === operacion.destinoDia && a.bloqueIndice === bIdx
      );
      if (asigPrev && asigPrev.materiaId !== operacion.materiaId) {
        materiasInvolucradasIds.add(asigPrev.materiaId);
        if (!reemplazadas.has(asigPrev.materiaId)) reemplazadas.set(asigPrev.materiaId, []);
        reemplazadas.get(asigPrev.materiaId).push(bIdx);
      }
    }

    const rangoDestino = formatearRangoBloques(bloques, destIndices);

    if (reemplazadas.size > 0) {
      identificadorColor = 'AZUL';
      tituloOperacion = 'Asignación reemplazando una clase existente';
      let orden = 2;
      for (const [matPrevId, idxs] of reemplazadas.entries()) {
        const matPrev = materiasMap.get(matPrevId);
        pasosMovimiento.push({
          orden: orden++,
          cursoId: operacion.cursoId,
          cursoNombre,
          materiaId: matPrevId,
          materiaNombre: matPrev ? matPrev.nombre : matPrevId,
          materiaColor: matPrev ? matPrev.color : '#64748b',
          docentesNombres: formatearDocentes(matPrev),
          cantidadHoras: idxs.length,
          origenDia: operacion.destinoDia,
          origenTexto: `${operacion.destinoDia} · ${formatearRangoBloques(bloques, idxs)}`,
          destinoDia: null,
          destinoTexto: 'Vuelve a la Bandeja (queda como hora pendiente)'
        });
      }
    }
    pasosMovimiento.unshift({
      orden: 1,
      cursoId: operacion.cursoId,
      cursoNombre,
      materiaId: operacion.materiaId,
      materiaNombre: mat ? mat.nombre : operacion.materiaId,
      materiaColor: mat ? mat.color : '#3b82f6',
      docentesNombres: formatearDocentes(mat),
      cantidadHoras: destIndices.length,
      origenDia: null,
      origenTexto: 'Bandeja de Materias (Horas por ubicar)',
      destinoDia: operacion.destinoDia,
      destinoTexto: `${operacion.destinoDia} · ${rangoDestino}`
    });

    descripcionHistorial = `Asignar ${mat ? mat.nombre : operacion.materiaId} (${destIndices.length}h) en ${cursoNombre} (${operacion.destinoDia} · ${rangoDestino})`;
  } else if (operacion.tipo === 'MOVER_A_LIBRE') {
    categoria = 'LIBRE';
    identificadorColor = 'VERDE';
    tituloOperacion = 'Movimiento a Curso con Horario Libre';
    const mat = materiasMap.get(operacion.materiaId);
    const origIndices = operacion.origenBloquesIndices || [operacion.origenBloqueIndice];
    const destIndices = operacion.destinoBloquesIndices || [operacion.destinoBloqueIndice];
    materiasInvolucradasIds.add(operacion.materiaId);
    diasInvolucradosSet.add(operacion.origenDia);
    diasInvolucradosSet.add(operacion.destinoDia);

    const rangoOrigen = formatearRangoBloques(bloques, origIndices);
    const rangoDestino = formatearRangoBloques(bloques, destIndices);

    pasosMovimiento.push({
      orden: 1,
      cursoId: operacion.cursoId,
      cursoNombre,
      materiaId: operacion.materiaId,
      materiaNombre: mat ? mat.nombre : operacion.materiaId,
      materiaColor: mat ? mat.color : '#10b981',
      docentesNombres: formatearDocentes(mat),
      cantidadHoras: destIndices.length,
      origenDia: operacion.origenDia,
      origenTexto: `${operacion.origenDia} · ${rangoOrigen}`,
      destinoDia: operacion.destinoDia,
      destinoTexto: `${operacion.destinoDia} · ${rangoDestino}`
    });

    descripcionHistorial = `Mover ${mat ? mat.nombre : 'materia'} en ${cursoNombre}: de ${operacion.origenDia} (${rangoOrigen}) a Horario Libre en ${operacion.destinoDia} (${rangoDestino})`;
  } else if (operacion.tipo === 'ENROQUE_1_A_1') {
    categoria = 'ENROQUE_1_A_1';
    identificadorColor = 'AZUL';
    tituloOperacion = 'Enroque Directo entre Materias / Docentes (1 a 1)';

    const matA = materiasMap.get(operacion.materiaAId);
    const matB = materiasMap.get(operacion.materiaBId);
    const origIndices = operacion.origenBloquesIndices || [operacion.origenBloqueIndice];
    const destIndices = operacion.destinoBloquesIndices || [operacion.destinoBloqueIndice];

    if (operacion.materiaAId) materiasInvolucradasIds.add(operacion.materiaAId);
    if (operacion.materiaBId) materiasInvolucradasIds.add(operacion.materiaBId);
    diasInvolucradosSet.add(operacion.origenDia);
    diasInvolucradosSet.add(operacion.destinoDia);

    const rangoA = formatearRangoBloques(bloques, origIndices);
    const rangoB = formatearRangoBloques(bloques, destIndices);

    if (matA) {
      pasosMovimiento.push({
        orden: 1,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matA.id,
        materiaNombre: matA.nombre,
        materiaColor: matA.color || '#3b82f6',
        docentesNombres: formatearDocentes(matA),
        cantidadHoras: destIndices.length,
        origenDia: operacion.origenDia,
        origenTexto: `${operacion.origenDia} · ${rangoA}`,
        destinoDia: operacion.destinoDia,
        destinoTexto: `${operacion.destinoDia} · ${rangoB}`
      });
    }
    if (matB) {
      pasosMovimiento.push({
        orden: 2,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matB.id,
        materiaNombre: matB.nombre,
        materiaColor: matB.color || '#6366f1',
        docentesNombres: formatearDocentes(matB),
        cantidadHoras: origIndices.length,
        origenDia: operacion.destinoDia,
        origenTexto: `${operacion.destinoDia} · ${rangoB}`,
        destinoDia: operacion.origenDia,
        destinoTexto: `${operacion.origenDia} · ${rangoA}`
      });
    }

    descripcionHistorial = `Enroque 1 a 1 en ${cursoNombre}: ${matA ? matA.nombre : 'Libre'} (${operacion.origenDia} B${origIndices[0] + 1}) ↔ ${matB ? matB.nombre : 'Libre'} (${operacion.destinoDia} B${destIndices[0] + 1})`;
  } else if (operacion.tipo === 'ENROQUE_TRIANGULAR') {
    categoria = 'ENROQUE_TRIANGULAR';
    identificadorColor = 'VIOLETA';
    tituloOperacion = 'Enroque en Cadena Triangular (A → B → C → A)';

    const matA = materiasMap.get(operacion.materiaAId);
    const matB = materiasMap.get(operacion.materiaBId);
    const matC = materiasMap.get(operacion.materiaCId);

    if (operacion.materiaAId) materiasInvolucradasIds.add(operacion.materiaAId);
    if (operacion.materiaBId) materiasInvolucradasIds.add(operacion.materiaBId);
    if (operacion.materiaCId) materiasInvolucradasIds.add(operacion.materiaCId);
    diasInvolucradosSet.add(operacion.diaA);
    diasInvolucradosSet.add(operacion.diaB);
    diasInvolucradosSet.add(operacion.diaC);

    const rangoA = formatearRangoBloques(bloques, operacion.bloquesA);
    const rangoB = formatearRangoBloques(bloques, operacion.bloquesB);
    const rangoC = formatearRangoBloques(bloques, operacion.bloquesC);

    if (matA) {
      pasosMovimiento.push({
        orden: 1,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matA.id,
        materiaNombre: matA.nombre,
        materiaColor: matA.color || '#8b5cf6',
        docentesNombres: formatearDocentes(matA),
        cantidadHoras: (operacion.bloquesB || []).length,
        origenDia: operacion.diaA,
        origenTexto: `${operacion.diaA} · ${rangoA}`,
        destinoDia: operacion.diaB,
        destinoTexto: `${operacion.diaB} · ${rangoB}`
      });
    }
    if (matB) {
      pasosMovimiento.push({
        orden: 2,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matB.id,
        materiaNombre: matB.nombre,
        materiaColor: matB.color || '#3b82f6',
        docentesNombres: formatearDocentes(matB),
        cantidadHoras: (operacion.bloquesC || []).length,
        origenDia: operacion.diaB,
        origenTexto: `${operacion.diaB} · ${rangoB}`,
        destinoDia: operacion.diaC,
        destinoTexto: `${operacion.diaC} · ${rangoC}`
      });
    }
    if (matC) {
      pasosMovimiento.push({
        orden: 3,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matC.id,
        materiaNombre: matC.nombre,
        materiaColor: matC.color || '#10b981',
        docentesNombres: formatearDocentes(matC),
        cantidadHoras: (operacion.bloquesA || []).length,
        origenDia: operacion.diaC,
        origenTexto: `${operacion.diaC} · ${rangoC}`,
        destinoDia: operacion.diaA,
        destinoTexto: `${operacion.diaA} · ${rangoA}`
      });
    }

    descripcionHistorial = `Enroque Triangular en ${cursoNombre}: ${matA ? matA.nombre : 'A'} → ${matB ? matB.nombre : 'B'} → ${matC ? matC.nombre : 'C'} → ${matA ? matA.nombre : 'A'}`;
  } else if (operacion.tipo === 'DESPLAZAMIENTO_BANDEJA_1_A_1') {
    categoria = 'ENROQUE_1_A_1';
    identificadorColor = 'AZUL';
    tituloOperacion = 'Enroque / Desplazamiento 1 a 1 (Bandeja → Curso)';

    const matA = materiasMap.get(operacion.materiaAId);
    const matB = materiasMap.get(operacion.materiaBId);
    if (operacion.materiaAId) materiasInvolucradasIds.add(operacion.materiaAId);
    if (operacion.materiaBId) materiasInvolucradasIds.add(operacion.materiaBId);
    diasInvolucradosSet.add(operacion.diaB);
    diasInvolucradosSet.add(operacion.diaC);

    const rangoB = formatearRangoBloques(bloques, operacion.bloquesB);
    const rangoC = formatearRangoBloques(bloques, operacion.bloquesC);

    if (matA) {
      pasosMovimiento.push({
        orden: 1,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matA.id,
        materiaNombre: matA.nombre,
        materiaColor: matA.color || '#3b82f6',
        docentesNombres: formatearDocentes(matA),
        cantidadHoras: (operacion.bloquesB || []).length,
        origenDia: null,
        origenTexto: 'Bandeja de Materias (Horas pendientes)',
        destinoDia: operacion.diaB,
        destinoTexto: `${operacion.diaB} · ${rangoB}`
      });
    }
    if (matB) {
      pasosMovimiento.push({
        orden: 2,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matB.id,
        materiaNombre: matB.nombre,
        materiaColor: matB.color || '#6366f1',
        docentesNombres: formatearDocentes(matB),
        cantidadHoras: (operacion.bloquesC || []).length,
        origenDia: operacion.diaB,
        origenTexto: `${operacion.diaB} · ${rangoB}`,
        destinoDia: operacion.diaC,
        destinoTexto: `${operacion.diaC} · ${rangoC} (Horario Libre)`
      });
    }

    descripcionHistorial = `Enroque / Desplazamiento 1 a 1 en ${cursoNombre}: ${matA ? matA.nombre : 'A'} ingresa en ${operacion.diaB} B${(operacion.bloquesB?.[0] || 0) + 1} y ${matB ? matB.nombre : 'B'} pasa a ${operacion.diaC} B${(operacion.bloquesC?.[0] || 0) + 1}`;
  } else if (operacion.tipo === 'DESPLAZAMIENTO_BANDEJA_TRIANGULAR') {
    categoria = 'ENROQUE_TRIANGULAR';
    identificadorColor = 'VIOLETA';
    tituloOperacion = 'Enroque en Cadena Triangular (Bandeja → B → C → Libre)';

    const matA = materiasMap.get(operacion.materiaAId);
    const matB = materiasMap.get(operacion.materiaBId);
    const matC = materiasMap.get(operacion.materiaCId);
    if (operacion.materiaAId) materiasInvolucradasIds.add(operacion.materiaAId);
    if (operacion.materiaBId) materiasInvolucradasIds.add(operacion.materiaBId);
    if (operacion.materiaCId) materiasInvolucradasIds.add(operacion.materiaCId);
    diasInvolucradosSet.add(operacion.diaB);
    diasInvolucradosSet.add(operacion.diaC);
    diasInvolucradosSet.add(operacion.diaD);

    const rangoB = formatearRangoBloques(bloques, operacion.bloquesB);
    const rangoC = formatearRangoBloques(bloques, operacion.bloquesC);
    const rangoD = formatearRangoBloques(bloques, operacion.bloquesD);

    if (matA) {
      pasosMovimiento.push({
        orden: 1,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matA.id,
        materiaNombre: matA.nombre,
        materiaColor: matA.color || '#8b5cf6',
        docentesNombres: formatearDocentes(matA),
        cantidadHoras: (operacion.bloquesB || []).length,
        origenDia: null,
        origenTexto: 'Bandeja de Materias (Horas pendientes)',
        destinoDia: operacion.diaB,
        destinoTexto: `${operacion.diaB} · ${rangoB}`
      });
    }
    if (matB) {
      pasosMovimiento.push({
        orden: 2,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matB.id,
        materiaNombre: matB.nombre,
        materiaColor: matB.color || '#3b82f6',
        docentesNombres: formatearDocentes(matB),
        cantidadHoras: (operacion.bloquesC || []).length,
        origenDia: operacion.diaB,
        origenTexto: `${operacion.diaB} · ${rangoB}`,
        destinoDia: operacion.diaC,
        destinoTexto: `${operacion.diaC} · ${rangoC}`
      });
    }
    if (matC) {
      pasosMovimiento.push({
        orden: 3,
        cursoId: operacion.cursoId,
        cursoNombre,
        materiaId: matC.id,
        materiaNombre: matC.nombre,
        materiaColor: matC.color || '#10b981',
        docentesNombres: formatearDocentes(matC),
        cantidadHoras: (operacion.bloquesD || []).length,
        origenDia: operacion.diaC,
        origenTexto: `${operacion.diaC} · ${rangoC}`,
        destinoDia: operacion.diaD,
        destinoTexto: `${operacion.diaD} · ${rangoD} (Horario Libre)`
      });
    }

    descripcionHistorial = `Enroque Triangular en ${cursoNombre}: ${matA ? matA.nombre : 'A'} → ${matB ? matB.nombre : 'B'} → ${matC ? matC.nombre : 'C'} → Libre (${operacion.diaD})`;
  } else if (operacion.tipo === 'OPERACION_COMPUESTA') {
    categoria = operacion.categoria || 'ENROQUE_TRIANGULAR';
    identificadorColor = operacion.identificadorColor || 'VIOLETA';
    tituloOperacion = operacion.tituloOperacion || 'Movimiento Coordinado Multi-Paso';

    let ordenPaso = 1;
    if (Array.isArray(operacion.cambiosDisponibilidad) && operacion.cambiosDisponibilidad.length > 0) {
      const porDoc = new Map();
      for (const c of operacion.cambiosDisponibilidad) {
        diasInvolucradosSet.add(c.dia);
        const key = `${c.docenteId}|${c.dia}`;
        if (!porDoc.has(key)) porDoc.set(key, { docId: c.docenteId, dia: c.dia, indices: [] });
        porDoc.get(key).indices.push(c.bloqueIndice);
      }
      for (const item of porDoc.values()) {
        const doc = docentesMap.get(item.docId);
        pasosMovimiento.push({
          orden: ordenPaso++,
          cursoId: operacion.cursoId,
          cursoNombre,
          materiaId: null,
          materiaNombre: `Habilitar disponibilidad de ${doc ? doc.nombre : item.docId}`,
          materiaColor: '#10b981',
          docentesNombres: doc ? doc.nombre : item.docId,
          cantidadHoras: item.indices.length,
          origenDia: item.dia,
          origenTexto: 'No disponible en grilla',
          destinoDia: item.dia,
          destinoTexto: `Disponible en ${item.dia} · ${formatearRangoBloques(bloques, item.indices)}`
        });
      }
    }

    let estadoCursor = estado;
    for (const subOp of operacion.operaciones || []) {
      const subImpacto = evaluarImpactoOperacionHorario(estadoCursor, subOp);
      for (const p of subImpacto.pasosMovimiento) {
        if (p.materiaId) materiasInvolucradasIds.add(p.materiaId);
        if (p.origenDia) diasInvolucradosSet.add(p.origenDia);
        if (p.destinoDia) diasInvolucradosSet.add(p.destinoDia);
        pasosMovimiento.push({
          ...p,
          orden: ordenPaso++
        });
      }
      estadoCursor = simularEstadoConOperacion(estadoCursor, subOp);
    }

    descripcionHistorial =
      operacion.descripcionHistorial ||
      `Movimiento coordinado (${pasosMovimiento.length} pasos) en ${cursoNombre}`;
  }

  // Recolectar todos los docentes involucrados en las materias afectadas
  const docentesInvolucradosMap = new Map();
  for (const matId of materiasInvolucradasIds) {
    const mat = materiasMap.get(matId);
    if (!mat) continue;
    for (const docId of mat.docentesIds || []) {
      const doc = docentesMap.get(docId);
      if (!doc) continue;
      if (!docentesInvolucradosMap.has(docId)) {
        docentesInvolucradosMap.set(docId, {
          docente: doc,
          materiasNombres: new Set()
        });
      }
      docentesInvolucradosMap.get(docId).materiasNombres.add(`${mat.nombre} (${cursoNombre})`);
    }
  }

  // Calcular impacto detallado en Horas Libres por Docente y por Día
  const docentesAfectados = [];
  let deltaHorasPuenteTotal = 0;

  for (const [docId, infoDoc] of docentesInvolucradosMap.entries()) {
    const { docente, materiasNombres } = infoDoc;
    const antesMapa = calcularMapaHorasPuenteDocente(
      estado,
      estado.asignaciones,
      docId,
      materiasMap
    );
    const despuesMapa = calcularMapaHorasPuenteDocente(
      estadoSimulado,
      estadoSimulado.asignaciones,
      docId,
      materiasMap
    );

    const deltaSemana = despuesMapa.totalSemana - antesMapa.totalSemana;
    deltaHorasPuenteTotal += deltaSemana;

    const cambiosPorDia = [];
    for (const dia of estado.configuracion.diasHabiles) {
      const antesDia = antesMapa.porDia[dia] || 0;
      const despuesDia = despuesMapa.porDia[dia] || 0;
      const deltaDia = despuesDia - antesDia;

      if (deltaDia !== 0 || diasInvolucradosSet.has(dia)) {
        let estadoImpacto = 'NEUTRO';
        let textoImpactoDia = `${docente.nombre}: Mantiene ${despuesDia} ${despuesDia === 1 ? 'hora libre' : 'horas libres'} los ${dia} (Sin cambio ✅)`;

        if (deltaDia < 0) {
          estadoImpacto = 'MEJORA';
          textoImpactoDia = `${docente.nombre}: Pasa de ${antesDia} ${antesDia === 1 ? 'hora libre' : 'horas libres'} a ${despuesDia} ${despuesDia === 1 ? 'hora libre' : 'horas libres'} los ${dia} (Mejora ✅)`;
        } else if (deltaDia > 0) {
          estadoImpacto = 'EMPEORA';
          textoImpactoDia = `${docente.nombre}: Pasa de ${antesDia} ${antesDia === 1 ? 'hora libre' : 'horas libres'} a ${despuesDia} ${despuesDia === 1 ? 'hora libre' : 'horas libres'} los ${dia} (Suma +${deltaDia}h libre ⚠️)`;
        }

        cambiosPorDia.push({
          dia,
          horasPuenteAntes: antesDia,
          horasPuenteDespues: despuesDia,
          deltaDia,
          estadoImpacto,
          textoImpactoDia
        });
      }
    }

    docentesAfectados.push({
      docenteId: docId,
      docenteNombre: docente.nombre,
      especialidad: docente.especialidad,
      materiasInvolucradas: Array.from(materiasNombres),
      horasPuenteAntesSemana: antesMapa.totalSemana,
      horasPuenteDespuesSemana: despuesMapa.totalSemana,
      deltaSemana,
      cambiosPorDia
    });
  }

  // Evaluar posibles alertas en el estado simulado para las materias y docentes involucrados
  const alertasRecreos = [];
  const alertasChoques = [];
  const alertasDisponibilidad = [];
  const alertasExceso = [];

  for (const matId of materiasInvolucradasIds) {
    const mat = materiasMap.get(matId);
    if (!mat) continue;

    // 1. Evaluar exceso de horas semanales
    const cantAntes = estado.asignaciones.filter((a) => a.materiaId === matId).length;
    const cantDespues = estadoSimulado.asignaciones.filter((a) => a.materiaId === matId).length;
    if (params.alertarExcesoHoras && cantDespues > mat.horasSemanales && cantDespues > cantAntes) {
      alertasExceso.push(
        `🚨 Exceso de carga horaria: "${mat.nombre}" (${cursoNombre}) pasa a tener ${cantDespues}/${mat.horasSemanales} hs asignadas (+${cantDespues - mat.horasSemanales} hs sobre el plan).`
      );
    }

    // 2. Evaluar continuidad de recreos en los días involucrados
    if (params.alertarCortePorRecreo) {
      for (const dia of diasInvolucradosSet) {
        const indicesMatDia = estadoSimulado.asignaciones
          .filter((a) => a.cursoId === mat.cursoId && a.dia === dia && a.materiaId === matId)
          .map((a) => a.bloqueIndice);

        const evalRec = evaluarContinuidadRecreos(indicesMatDia, bloques);
        if (evalRec.cruzaRecreoInjustificado && evalRec.advertencia) {
          alertasRecreos.push(
            `☕ ${mat.nombre} (${dia}): ${evalRec.advertencia}`
          );
        }
      }
    }
  }

  // 3. Evaluar choques y disponibilidad de los docentes involucrados en los días afectados
  const docentesSimuladosMap = new Map((estadoSimulado.docentes || estado.docentes).map((d) => [d.id, d]));
  for (const [docId, infoDoc] of docentesInvolucradosMap.entries()) {
    const docente = docentesSimuladosMap.get(docId) || infoDoc.docente;
    for (const dia of diasInvolucradosSet) {
      const asigsDocDia = estadoSimulado.asignaciones.filter((a) => {
        if (a.dia !== dia) return false;
        const m = materiasMap.get(a.materiaId);
        return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(docId);
      });

      const porBloque = new Map();
      for (const a of asigsDocDia) {
        if (!porBloque.has(a.bloqueIndice)) porBloque.set(a.bloqueIndice, []);
        porBloque.get(a.bloqueIndice).push(a);

        if (params.alertarDisponibilidadDocente) {
          const disp = Boolean(docente.disponibilidad?.[dia]?.[a.bloqueIndice]);
          if (!disp) {
            const bObj = bloques[a.bloqueIndice];
            const mObj = materiasMap.get(a.materiaId);
            alertasDisponibilidad.push(
              `🚫 ${docente.nombre} figura como NO DISPONIBLE el ${dia} en ${bObj ? bObj.nombre : `Bloque ${a.bloqueIndice + 1}`} (para dictar "${mObj ? mObj.nombre : ''}").`
            );
          }
        }
      }

      if (params.alertarChoquesDocentes) {
        for (const [bIdx, lista] of porBloque.entries()) {
          if (lista.length > 1) {
            const bObj = bloques[bIdx];
            const cursosChoque = lista
              .map((item) => {
                const cObj = cursosMap.get(item.cursoId);
                const mObj = materiasMap.get(item.materiaId);
                return `${cObj ? cObj.nombre : item.cursoId} (${mObj ? mObj.nombre : item.materiaId})`;
              })
              .join(' ⚡ ');
            alertasChoques.push(
              `🚨 Choque Docente: ${docente.nombre} queda asignado/a simultáneamente el ${dia} en ${bObj ? bObj.nombre : `Bloque ${bIdx + 1}`} en: ${cursosChoque}.`
            );
          }
        }
      }
    }
  }

  let resumenImpactoPuente = 'Sin variación en Horas Libres (Δ = 0 ✅)';
  if (deltaHorasPuenteTotal < 0) {
    resumenImpactoPuente = `✨ ¡Mejora! Reduce en ${Math.abs(deltaHorasPuenteTotal)} hora(s) libre(s) los huecos docentes (Δ = ${deltaHorasPuenteTotal})`;
  } else if (deltaHorasPuenteTotal > 0) {
    resumenImpactoPuente = `⚠️ Atención: Incrementa en +${deltaHorasPuenteTotal} hora(s) libre(s) los huecos docentes (Δ = +${deltaHorasPuenteTotal})`;
  }

  return {
    operacion,
    categoria,
    identificadorColor,
    tituloOperacion,
    descripcionHistorial,
    cursoId: operacion.cursoId,
    cursoNombre,
    pasosMovimiento,
    docentesAfectados,
    deltaHorasPuenteTotal,
    resumenImpactoPuente,
    alertasRecreos,
    alertasChoques,
    alertasDisponibilidad,
    alertasExceso,
    cruzaRecreoInjustificado: alertasRecreos.length > 0,
    tieneConflictosDuros: alertasChoques.length > 0 || alertasDisponibilidad.length > 0
  };
}

/**
 * Verifica que TODOS los docentes asociados a `materia` estén disponibles en `(dia, bloquesIndices)`
 * y no tengan asignaciones en ningún otro curso en esos mismos bloques dentro de `asignacionesBase`.
 */
function verificarDisponibilidadYChoquesMultiDocente(
  estado,
  asignacionesBase,
  materia,
  dia,
  bloquesIndices,
  materiasMap,
  docentesMap
) {
  if (!materia) return { ok: false, motivo: 'Materia inexistente' };

  for (const docId of materia.docentesIds || []) {
    const doc = docentesMap.get(docId);
    if (!doc) continue;

    for (const bIdx of bloquesIndices) {
      const disp = Boolean(doc.disponibilidad?.[dia]?.[bIdx]);
      if (!disp) {
        return {
          ok: false,
          motivo: `${doc.nombre} no está disponible el ${dia} en Bloque ${bIdx + 1}`
        };
      }

      const choque = asignacionesBase.some((a) => {
        if (a.dia !== dia || a.bloqueIndice !== bIdx) return false;
        const m = materiasMap.get(a.materiaId);
        return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(docId);
      });

      if (choque) {
        return {
          ok: false,
          motivo: `${doc.nombre} ya dicta clase en otro curso el ${dia} en Bloque ${bIdx + 1}`
        };
      }
    }
  }

  return { ok: true, motivo: null };
}

/**
 * Verifica si las asignaciones de una materia en un curso y día respetan la Regla 3.3 (No-Interrupción por Recreos)
 */
function verificarContinuidadRecreosMateriaEnDia(
  asignacionesSimuladas,
  cursoId,
  dia,
  materia,
  bloquesHorarios
) {
  const indicesDia = asignacionesSimuladas
    .filter((a) => a.cursoId === cursoId && a.dia === dia && a.materiaId === materia.id)
    .map((a) => a.bloqueIndice);

  const evalRec = evaluarContinuidadRecreos(indicesDia, bloquesHorarios);
  return {
    ok: !evalRec.cruzaRecreoInjustificado,
    cruzaRecreoInjustificado: evalRec.cruzaRecreoInjustificado,
    advertencia: evalRec.advertencia
  };
}

/**
 * Ordena una lista de propuestas priorizando siempre:
 * 1. Sin corte de recreo injustificado
 * 2. Eliminación de Horas Libres (Δ < 0, más negativo primero)
 * 3. Neutras en Horas Libres (Δ = 0)
 * 4. Las que suman Horas Libres (Δ > 0) quedan al final con advertencia clara
 */
function ordenarPropuestasPorOptimizacion(propuestas) {
  const prioridadCategoria = {
    LIBRE: 1,
    ENROQUE_1_A_1: 2,
    ENROQUE_TRIANGULAR: 3
  };

  return [...propuestas].sort((a, b) => {
    if (a.cruzaRecreoInjustificado !== b.cruzaRecreoInjustificado) {
      return a.cruzaRecreoInjustificado ? 1 : -1;
    }
    if (a.deltaHorasPuenteTotal !== b.deltaHorasPuenteTotal) {
      return a.deltaHorasPuenteTotal - b.deltaHorasPuenteTotal;
    }
    const catA = prioridadCategoria[a.categoria] || 9;
    const catB = prioridadCategoria[b.categoria] || 9;
    if (catA !== catB) return catA - catB;

    if (a.destinoDia !== b.destinoDia) {
      return String(a.destinoDia).localeCompare(String(b.destinoDia));
    }
    return (a.destinoBloqueInicial || 0) - (b.destinoBloqueInicial || 0);
  });
}

/**
 * Obtiene todas las corridas contiguas ya asignadas de una materia en un curso
 */
function obtenerCorridasAsignadasMateria(estado, cursoId, materiaId) {
  const dias = estado.configuracion.diasHabiles || [];
  const bloques = estado.configuracion.bloquesHorarios || [];
  const corridas = [];
  for (const dia of dias) {
    const indicesDia = estado.asignaciones
      .filter((a) => a.cursoId === cursoId && a.dia === dia && a.materiaId === materiaId)
      .map((a) => a.bloqueIndice)
      .sort((a, b) => a - b);
    const grupos = agruparEnCorridasContiguas(indicesDia);
    for (const grp of grupos) {
      corridas.push({
        clave: `${dia}|${grp.join(',')}`,
        dia,
        bloqueInicial: grp[0],
        bloqueInicio: grp[0],
        bloquesIndices: grp,
        indices: grp,
        cantidadHoras: grp.length,
        rangoTexto: formatearRangoBloques(bloques, grp),
        rangoCompletoTexto: `${dia} · ${formatearRangoBloques(bloques, grp)}`
      });
    }
  }
  return corridas;
}

/**
 * Motor Inteligente de Propuestas de Movimiento (Sección 4 de SPEC_SGH.md):
 * Evalúa todas las combinaciones válidas para ubicar o mover una materia (de a 1 hora o como bloque agrupado de 2/3 hs)
 * y las clasifica en:
 * - Categoría 1: Movimientos a "Cursos con Horario Libre" (Identificador Verde)
 * - Categoría 2A: Enroques Directos 1 a 1 entre Materias/Docentes (Identificador Azul)
 * - Categoría 2B: Enroques en Cadena Corta Triangular A → B → C → A (Identificador Violeta)
 */
function generarPropuestasMovimiento(
  estado,
  {
    cursoId,
    materiaId = null,
    origenDia = null,
    origenBloquesIndices = null,
    origenBloqueIndice = null,
    cantidadBloques = null,
    expandirCorridaCompleta = false
  }
) {
  const bloques = estado.configuracion.bloquesHorarios || [];
  const dias = estado.configuracion.diasHabiles || [];
  const params = obtenerParametrosSistema(estado);
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));
  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));

  const curso = cursosMap.get(cursoId);
  if (!curso) return null;

  // Resolver bloque(s) de origen y materia objetivo
  let indicesOrigen = [];
  if (Array.isArray(origenBloquesIndices) && origenBloquesIndices.length > 0) {
    indicesOrigen = [...origenBloquesIndices].sort((a, b) => a - b);
  } else if (Number.isInteger(origenBloqueIndice) && origenDia) {
    indicesOrigen = [origenBloqueIndice];
  }

  let matIdObjetivo = materiaId;
  if (!matIdObjetivo && origenDia && indicesOrigen.length > 0) {
    const asigOrig = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === origenDia && a.bloqueIndice === indicesOrigen[0]
    );
    if (asigOrig) matIdObjetivo = asigOrig.materiaId;
  }

  const materiaA = materiasMap.get(matIdObjetivo);
  if (!materiaA) return null;

  const corridasAsignadasMateria = obtenerCorridasAsignadasMateria(estado, cursoId, materiaA.id);
  const horasAsignadasMateria = estado.asignaciones.filter(
    (a) => a.cursoId === cursoId && a.materiaId === materiaA.id
  ).length;
  const horasPendientesMateria = Math.max(0, (materiaA.horasSemanales || 0) - horasAsignadasMateria);

  // Si se solicita expandir la corrida contigua completa del bloque seleccionado en ese día
  let corridaContenedoraOrigen = null;
  if (origenDia && indicesOrigen.length > 0) {
    const indicesMatDia = estado.asignaciones
      .filter((a) => a.cursoId === cursoId && a.dia === origenDia && a.materiaId === materiaA.id)
      .map((a) => a.bloqueIndice);
    const corridas = agruparEnCorridasContiguas(indicesMatDia);
    corridaContenedoraOrigen = corridas.find((c) => c.includes(indicesOrigen[0])) || indicesOrigen;
    if (indicesOrigen.length === 1 && expandirCorridaCompleta && corridaContenedoraOrigen.length > 1) {
      indicesOrigen = [...corridaContenedoraOrigen];
    }
  }

  const esMovimientoDesdeGrilla = Boolean(origenDia && indicesOrigen.length > 0);
  const tamanoBloque = esMovimientoDesdeGrilla
    ? indicesOrigen.length
    : Math.max(1, parseInt(cantidadBloques, 10) || 1);

  const propuestasLibres = [];
  const propuestasEnroqueDirecto = [];
  const propuestasEnroqueTriangular = [];

  const setOrigenKey = new Set(
    esMovimientoDesdeGrilla ? indicesOrigen.map((idx) => `${origenDia}|${idx}`) : []
  );

  // Asignaciones base sin el bloque origen (si se está moviendo desde la grilla)
  const asignacionesSinOrigen = esMovimientoDesdeGrilla
    ? estado.asignaciones.filter(
        (a) => !(a.cursoId === cursoId && setOrigenKey.has(`${a.dia}|${a.bloqueIndice}`))
      )
    : estado.asignaciones;

  // Recolectar todos los candidatos de ventana de tamaño `tamanoBloque` en el curso
  const ventanasCurso = [];
  const ventanasLibresCurso = [];
  for (const dia of dias) {
    for (let bStart = 0; bStart <= bloques.length - tamanoBloque; bStart++) {
      const indicesVentana = [];
      for (let k = 0; k < tamanoBloque; k++) {
        indicesVentana.push(bStart + k);
      }

      // Ignorar si se superpone con el propio origen
      if (
        esMovimientoDesdeGrilla &&
        dia === origenDia &&
        indicesVentana.some((idx) => indicesOrigen.includes(idx))
      ) {
        continue;
      }

      // Ignorar si alguno de los bloques está reservado como espacio de Almuerzo
      if (indicesVentana.some((idx) => esBloqueAlmuerzo(estado, cursoId, dia, idx))) {
        continue;
      }

      const asigsEnVentana = asignacionesSinOrigen.filter(
        (a) => a.cursoId === cursoId && a.dia === dia && indicesVentana.includes(a.bloqueIndice)
      );

      const vObj = {
        dia,
        bStart,
        indicesVentana,
        asigsEnVentana
      };
      ventanasCurso.push(vObj);
      if (asigsEnVentana.length === 0) {
        ventanasLibresCurso.push(vObj);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 1. EVALUAR CATEGORÍA 1: MOVIMIENTOS A HORARIOS LIBRES (VERDE)
  // y CATEGORÍA 2A: ENROQUES DIRECTOS 1 A 1 (AZUL)
  // -------------------------------------------------------------------------
  const candidatosOcupadosParaTriangular = [];

  for (const ventana of ventanasCurso) {
    const { dia, bStart, indicesVentana, asigsEnVentana } = ventana;

    // CASO 1: Ventana completamente vacía en el curso -> Categoría 1 (Horario Libre)
    if (asigsEnVentana.length === 0) {
      const dispCheck = verificarDisponibilidadYChoquesMultiDocente(
        estado,
        asignacionesSinOrigen,
        materiaA,
        dia,
        indicesVentana,
        materiasMap,
        docentesMap
      );
      if (!dispCheck.ok) continue;

      const operacion = esMovimientoDesdeGrilla
        ? {
            tipo: 'MOVER_A_LIBRE',
            cursoId,
            materiaId: materiaA.id,
            origenDia,
            origenBloquesIndices: indicesOrigen,
            destinoDia: dia,
            destinoBloquesIndices: indicesVentana
          }
        : {
            tipo: 'ASIGNAR_LIBRE',
            cursoId,
            materiaId: materiaA.id,
            destinoDia: dia,
            destinoBloquesIndices: indicesVentana
          };

      const estadoSim = simularEstadoConOperacion(estado, operacion);
      const recCheck = verificarContinuidadRecreosMateriaEnDia(
        estadoSim.asignaciones,
        cursoId,
        dia,
        materiaA,
        bloques
      );

      if (
        params.alertarCortePorRecreo &&
        recCheck.cruzaRecreoInjustificado &&
        materiaA.modoExigencia === 'OBLIGATORIO'
      ) {
        continue;
      }

      const impacto = evaluarImpactoOperacionHorario(estado, operacion);
      propuestasLibres.push({
        idPropuesta: `LIBRE_${dia}_b${bStart}`,
        categoria: 'LIBRE',
        identificadorColor: 'VERDE',
        etiquetaCategoria: 'Horario Libre',
        destinoDia: dia,
        destinoBloqueInicial: bStart,
        destinoBloquesIndices: indicesVentana,
        destinoRangoTexto: formatearRangoBloques(bloques, indicesVentana),
        deltaHorasPuenteTotal: impacto.deltaHorasPuenteTotal,
        cruzaRecreoInjustificado: impacto.cruzaRecreoInjustificado,
        impacto
      });
      continue;
    }

    // CASO 2: La ventana destino está ocupada exactamente por una única Materia B (distinta de Materia A)
    if (asigsEnVentana.length === tamanoBloque) {
      const materiasEnVentana = Array.from(new Set(asigsEnVentana.map((a) => a.materiaId)));
      if (materiasEnVentana.length !== 1) continue;
      const materiaBId = materiasEnVentana[0];
      if (materiaBId === materiaA.id) continue;

      const materiaB = materiasMap.get(materiaBId);
      if (!materiaB) continue;

      const setDestKey = new Set(indicesVentana.map((idx) => `${dia}|${idx}`));
      const asignacionesSinAyB = asignacionesSinOrigen.filter(
        (a) => !(a.cursoId === cursoId && setDestKey.has(`${a.dia}|${a.bloqueIndice}`))
      );

      // Verificar primero si los docentes de la Materia A pueden ir al horario actual de la Materia B
      const dispAenB = verificarDisponibilidadYChoquesMultiDocente(
        estado,
        asignacionesSinAyB,
        materiaA,
        dia,
        indicesVentana,
        materiasMap,
        docentesMap
      );

      if (!dispAenB.ok) continue;

      // Guardar como candidato potencial para Enroque Triangular (ya sabemos que A puede ir a B)
      candidatosOcupadosParaTriangular.push({
        diaB: dia,
        bStartB: bStart,
        bloquesB: indicesVentana,
        materiaB,
        asignacionesSinAyB
      });

      if (esMovimientoDesdeGrilla) {
        // Enroque 1 a 1 clásico entre dos bloques de la grilla (A <-> B)
        const dispBenA = verificarDisponibilidadYChoquesMultiDocente(
          estado,
          asignacionesSinAyB,
          materiaB,
          origenDia,
          indicesOrigen,
          materiasMap,
          docentesMap
        );

        if (dispBenA.ok) {
          const opEnroque = {
            tipo: 'ENROQUE_1_A_1',
            cursoId,
            materiaAId: materiaA.id,
            materiaBId: materiaB.id,
            origenDia,
            origenBloquesIndices: indicesOrigen,
            destinoDia: dia,
            destinoBloquesIndices: indicesVentana
          };

          const estadoSim = simularEstadoConOperacion(estado, opEnroque);
          const recA = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            dia,
            materiaA,
            bloques
          );
          const recB = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            origenDia,
            materiaB,
            bloques
          );
          const recBEnDiaOriginal =
            origenDia !== dia
              ? verificarContinuidadRecreosMateriaEnDia(
                  estadoSim.asignaciones,
                  cursoId,
                  dia,
                  materiaB,
                  bloques
                )
              : { cruzaRecreoInjustificado: false };

          const violaRecreoObligatorio =
            params.alertarCortePorRecreo &&
            ((recA.cruzaRecreoInjustificado && materiaA.modoExigencia === 'OBLIGATORIO') ||
              (recB.cruzaRecreoInjustificado && materiaB.modoExigencia === 'OBLIGATORIO') ||
              (recBEnDiaOriginal.cruzaRecreoInjustificado && materiaB.modoExigencia === 'OBLIGATORIO'));

          if (!violaRecreoObligatorio) {
            const impacto = evaluarImpactoOperacionHorario(estado, opEnroque);
            propuestasEnroqueDirecto.push({
              idPropuesta: `ENROQUE_1A1_${dia}_b${bStart}`,
              categoria: 'ENROQUE_1_A_1',
              identificadorColor: 'AZUL',
              etiquetaCategoria: 'Enroque 1 a 1',
              materiaIntercambioId: materiaB.id,
              materiaIntercambioNombre: materiaB.nombre,
              docentesIntercambioNombres: (materiaB.docentesIds || [])
                .map((id) => docentesMap.get(id)?.nombre || id)
                .join(' + '),
              destinoDia: dia,
              destinoBloqueInicial: bStart,
              destinoBloquesIndices: indicesVentana,
              destinoRangoTexto: formatearRangoBloques(bloques, indicesVentana),
              deltaHorasPuenteTotal: impacto.deltaHorasPuenteTotal,
              cruzaRecreoInjustificado: impacto.cruzaRecreoInjustificado,
              impacto
            });
          }
        }
      } else {
        // Desplazamiento 1 a 1 desde Bandeja: A ingresa en B y B se desplaza al mejor Horario Libre C del curso
        let mejorDesplazamientoB = null;
        for (const vLibre of ventanasLibresCurso) {
          const dispBenLibre = verificarDisponibilidadYChoquesMultiDocente(
            estado,
            asignacionesSinAyB,
            materiaB,
            vLibre.dia,
            vLibre.indicesVentana,
            materiasMap,
            docentesMap
          );
          if (!dispBenLibre.ok) continue;

          const opDesp = {
            tipo: 'DESPLAZAMIENTO_BANDEJA_1_A_1',
            cursoId,
            materiaAId: materiaA.id,
            diaB: dia,
            bloquesB: indicesVentana,
            materiaBId: materiaB.id,
            diaC: vLibre.dia,
            bloquesC: vLibre.indicesVentana
          };

          const estadoSim = simularEstadoConOperacion(estado, opDesp);
          const recA = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            dia,
            materiaA,
            bloques
          );
          const recB = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            vLibre.dia,
            materiaB,
            bloques
          );

          const violaRecreo =
            params.alertarCortePorRecreo &&
            ((recA.cruzaRecreoInjustificado && materiaA.modoExigencia === 'OBLIGATORIO') ||
              (recB.cruzaRecreoInjustificado && materiaB.modoExigencia === 'OBLIGATORIO'));
          if (violaRecreo) continue;

          const impacto = evaluarImpactoOperacionHorario(estado, opDesp);
          const candDesp = {
            idPropuesta: `ENROQUE_1A1_BANDEJA_${dia}_b${bStart}_a_${vLibre.dia}_b${vLibre.bStart}`,
            categoria: 'ENROQUE_1_A_1',
            identificadorColor: 'AZUL',
            etiquetaCategoria: 'Enroque 1 a 1',
            materiaIntercambioId: materiaB.id,
            materiaIntercambioNombre: `${materiaB.nombre} → ${vLibre.dia} B${vLibre.bStart + 1}`,
            docentesIntercambioNombres: (materiaB.docentesIds || [])
              .map((id) => docentesMap.get(id)?.nombre || id)
              .join(' + '),
            destinoDia: dia,
            destinoBloqueInicial: bStart,
            destinoBloquesIndices: indicesVentana,
            destinoRangoTexto: formatearRangoBloques(bloques, indicesVentana),
            deltaHorasPuenteTotal: impacto.deltaHorasPuenteTotal,
            cruzaRecreoInjustificado: impacto.cruzaRecreoInjustificado,
            impacto
          };

          if (
            !mejorDesplazamientoB ||
            candDesp.deltaHorasPuenteTotal < mejorDesplazamientoB.deltaHorasPuenteTotal ||
            (!candDesp.cruzaRecreoInjustificado && mejorDesplazamientoB.cruzaRecreoInjustificado)
          ) {
            mejorDesplazamientoB = candDesp;
          }
        }

        if (mejorDesplazamientoB) {
          propuestasEnroqueDirecto.push(mejorDesplazamientoB);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. EVALUAR CATEGORÍA 2B: ENROQUES EN CADENA CORTA TRIANGULAR (A → B → C → A) (VIOLETA)
  // -------------------------------------------------------------------------
  if (candidatosOcupadosParaTriangular.length > 0) {
    // Recolectar todas las ventanas ocupadas por una sola materia C para usar como tercer vértice
    const posiblesVerticesC = [];
    for (const ventana of ventanasCurso) {
      if (ventana.asigsEnVentana.length === tamanoBloque) {
        const mats = Array.from(new Set(ventana.asigsEnVentana.map((a) => a.materiaId)));
        if (mats.length === 1 && mats[0] !== materiaA.id) {
          const matC = materiasMap.get(mats[0]);
          if (matC) {
            posiblesVerticesC.push({
              diaC: ventana.dia,
              bStartC: ventana.bStart,
              bloquesC: ventana.indicesVentana,
              materiaC: matC
            });
          }
        }
      }
    }

    for (const candB of candidatosOcupadosParaTriangular) {
      const { diaB, bStartB, bloquesB, materiaB, asignacionesSinAyB } = candB;
      let mejorTriangularParaB = null;

      for (const candC of posiblesVerticesC) {
        const { diaC, bStartC, bloquesC, materiaC } = candC;

        // C debe ser una materia distinta de A y de B, y no superponerse con B
        if (materiaC.id === materiaB.id || materiaC.id === materiaA.id) continue;
        if (diaC === diaB && bloquesC.some((idx) => bloquesB.includes(idx))) continue;

        const setCKey = new Set(bloquesC.map((idx) => `${diaC}|${idx}`));
        const asignacionesSinABC = asignacionesSinAyB.filter(
          (a) => !(a.cursoId === cursoId && setCKey.has(`${a.dia}|${a.bloqueIndice}`))
        );

        // 1. Verificar que los docentes de B estén disponibles y sin choques en C
        const dispBenC = verificarDisponibilidadYChoquesMultiDocente(
          estado,
          asignacionesSinABC,
          materiaB,
          diaC,
          bloquesC,
          materiasMap,
          docentesMap
        );
        if (!dispBenC.ok) continue;

        if (esMovimientoDesdeGrilla) {
          // 2. Verificar que los docentes de C estén disponibles y sin choques en A (origen)
          const dispCenA = verificarDisponibilidadYChoquesMultiDocente(
            estado,
            asignacionesSinABC,
            materiaC,
            origenDia,
            indicesOrigen,
            materiasMap,
            docentesMap
          );
          if (!dispCenA.ok) continue;

          const opTriangular = {
            tipo: 'ENROQUE_TRIANGULAR',
            cursoId,
            diaA: origenDia,
            bloquesA: indicesOrigen,
            materiaAId: materiaA.id,
            diaB,
            bloquesB,
            materiaBId: materiaB.id,
            diaC,
            bloquesC,
            materiaCId: materiaC.id
          };

          const estadoSim = simularEstadoConOperacion(estado, opTriangular);
          const recA = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            diaB,
            materiaA,
            bloques
          );
          const recB = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            diaC,
            materiaB,
            bloques
          );
          const recC = verificarContinuidadRecreosMateriaEnDia(
            estadoSim.asignaciones,
            cursoId,
            origenDia,
            materiaC,
            bloques
          );

          const violaRecreo =
            params.alertarCortePorRecreo &&
            ((recA.cruzaRecreoInjustificado && materiaA.modoExigencia === 'OBLIGATORIO') ||
              (recB.cruzaRecreoInjustificado && materiaB.modoExigencia === 'OBLIGATORIO') ||
              (recC.cruzaRecreoInjustificado && materiaC.modoExigencia === 'OBLIGATORIO'));

          if (violaRecreo) continue;

          const impacto = evaluarImpactoOperacionHorario(estado, opTriangular);
          const propTriangular = {
            idPropuesta: `TRIANG_${diaB}_b${bStartB}_via_${diaC}_b${bStartC}`,
            categoria: 'ENROQUE_TRIANGULAR',
            identificadorColor: 'VIOLETA',
            etiquetaCategoria: 'Enroque Triangular (A→B→C→A)',
            materiaIntercambioId: materiaB.id,
            materiaIntercambioNombre: materiaB.nombre,
            materiaTercerVerticeId: materiaC.id,
            materiaTercerVerticeNombre: materiaC.nombre,
            tercerVerticeDia: diaC,
            tercerVerticeBloquesIndices: bloquesC,
            tercerVerticeRangoTexto: `${diaC} · ${formatearRangoBloques(bloques, bloquesC)}`,
            cadenaResumenTexto: `${materiaA.nombre} → ${materiaB.nombre} (${diaB} B${bStartB + 1}) → ${materiaC.nombre} (${diaC} B${bStartC + 1}) → ${origenDia} B${indicesOrigen[0] + 1}`,
            destinoDia: diaB,
            destinoBloqueInicial: bStartB,
            destinoBloquesIndices: bloquesB,
            destinoRangoTexto: formatearRangoBloques(bloques, bloquesB),
            deltaHorasPuenteTotal: impacto.deltaHorasPuenteTotal,
            cruzaRecreoInjustificado: impacto.cruzaRecreoInjustificado,
            impacto
          };

          if (
            !mejorTriangularParaB ||
            propTriangular.deltaHorasPuenteTotal < mejorTriangularParaB.deltaHorasPuenteTotal ||
            (!propTriangular.cruzaRecreoInjustificado && mejorTriangularParaB.cruzaRecreoInjustificado)
          ) {
            mejorTriangularParaB = propTriangular;
          }
        } else {
          // Enroque Triangular desde Bandeja: A -> B -> C -> Libre D
          for (const vLibre of ventanasLibresCurso) {
            const dispCenLibre = verificarDisponibilidadYChoquesMultiDocente(
              estado,
              asignacionesSinABC,
              materiaC,
              vLibre.dia,
              vLibre.indicesVentana,
              materiasMap,
              docentesMap
            );
            if (!dispCenLibre.ok) continue;

            const opTriBandeja = {
              tipo: 'DESPLAZAMIENTO_BANDEJA_TRIANGULAR',
              cursoId,
              materiaAId: materiaA.id,
              diaB,
              bloquesB,
              materiaBId: materiaB.id,
              diaC,
              bloquesC,
              materiaCId: materiaC.id,
              diaD: vLibre.dia,
              bloquesD: vLibre.indicesVentana
            };

            const estadoSim = simularEstadoConOperacion(estado, opTriBandeja);
            const recA = verificarContinuidadRecreosMateriaEnDia(
              estadoSim.asignaciones,
              cursoId,
              diaB,
              materiaA,
              bloques
            );
            const recB = verificarContinuidadRecreosMateriaEnDia(
              estadoSim.asignaciones,
              cursoId,
              diaC,
              materiaB,
              bloques
            );
            const recC = verificarContinuidadRecreosMateriaEnDia(
              estadoSim.asignaciones,
              cursoId,
              vLibre.dia,
              materiaC,
              bloques
            );

            const violaRecreo =
              params.alertarCortePorRecreo &&
              ((recA.cruzaRecreoInjustificado && materiaA.modoExigencia === 'OBLIGATORIO') ||
                (recB.cruzaRecreoInjustificado && materiaB.modoExigencia === 'OBLIGATORIO') ||
                (recC.cruzaRecreoInjustificado && materiaC.modoExigencia === 'OBLIGATORIO'));
            if (violaRecreo) continue;

            const impacto = evaluarImpactoOperacionHorario(estado, opTriBandeja);
            const propTriangular = {
              idPropuesta: `TRIANG_BANDEJA_${diaB}_b${bStartB}_via_${diaC}_b${bStartC}_a_${vLibre.dia}_b${vLibre.bStart}`,
              categoria: 'ENROQUE_TRIANGULAR',
              identificadorColor: 'VIOLETA',
              etiquetaCategoria: 'Enroque Triangular',
              materiaIntercambioId: materiaB.id,
              materiaIntercambioNombre: materiaB.nombre,
              materiaTercerVerticeId: materiaC.id,
              materiaTercerVerticeNombre: `${materiaC.nombre} → ${vLibre.dia} B${vLibre.bStart + 1}`,
              tercerVerticeDia: diaC,
              tercerVerticeBloquesIndices: bloquesC,
              tercerVerticeRangoTexto: `${diaC} · ${formatearRangoBloques(bloques, bloquesC)}`,
              cadenaResumenTexto: `${materiaA.nombre} → ${materiaB.nombre} (${diaB} B${bStartB + 1}) → ${materiaC.nombre} (${diaC} B${bStartC + 1}) → Libre (${vLibre.dia} B${vLibre.bStart + 1})`,
              destinoDia: diaB,
              destinoBloqueInicial: bStartB,
              destinoBloquesIndices: bloquesB,
              destinoRangoTexto: formatearRangoBloques(bloques, bloquesB),
              deltaHorasPuenteTotal: impacto.deltaHorasPuenteTotal,
              cruzaRecreoInjustificado: impacto.cruzaRecreoInjustificado,
              impacto
            };

            if (
              !mejorTriangularParaB ||
              propTriangular.deltaHorasPuenteTotal < mejorTriangularParaB.deltaHorasPuenteTotal ||
              (!propTriangular.cruzaRecreoInjustificado && mejorTriangularParaB.cruzaRecreoInjustificado)
            ) {
              mejorTriangularParaB = propTriangular;
            }
          }
        }
      }

      if (mejorTriangularParaB) {
        propuestasEnroqueTriangular.push(mejorTriangularParaB);
      }
    }
  }

  const libresOrdenadas = ordenarPropuestasPorOptimizacion(propuestasLibres);
  const directosOrdenados = ordenarPropuestasPorOptimizacion(propuestasEnroqueDirecto);
  const triangularesOrdenados = ordenarPropuestasPorOptimizacion(propuestasEnroqueTriangular);
  const todasOrdenadas = ordenarPropuestasPorOptimizacion([
    ...libresOrdenadas,
    ...directosOrdenados,
    ...triangularesOrdenados
  ]);

  // Mapa rápido por celda `${dia}|${bloqueIndice}` para iluminar la grilla en tiempo real
  const mapaCeldasDestino = {};
  for (const p of libresOrdenadas) {
    const key = `${p.destinoDia}|${p.destinoBloqueInicial}`;
    if (!mapaCeldasDestino[key]) {
      mapaCeldasDestino[key] = p;
    }
  }
  for (const p of directosOrdenados) {
    const key = `${p.destinoDia}|${p.destinoBloqueInicial}`;
    if (!mapaCeldasDestino[key]) {
      mapaCeldasDestino[key] = p;
    }
  }
  for (const p of triangularesOrdenados) {
    const key = `${p.destinoDia}|${p.destinoBloqueInicial}`;
    if (!mapaCeldasDestino[key]) {
      mapaCeldasDestino[key] = p;
    }
  }

  return {
    cursoId,
    cursoNombre: curso.nombre,
    materiaId: materiaA.id,
    materiaNombre: materiaA.nombre,
    materiaColor: materiaA.color,
    docentesNombres: (materiaA.docentesIds || [])
      .map((id) => docentesMap.get(id)?.nombre || id)
      .join(' + '),
    esMovimientoDesdeGrilla,
    origenDia,
    origenBloquesIndices: indicesOrigen,
    corridaContenedoraOrigen,
    corridasAsignadasMateria,
    horasAsignadasMateria,
    horasPendientesMateria,
    origenRangoTexto: esMovimientoDesdeGrilla
      ? `${origenDia} · ${formatearRangoBloques(bloques, indicesOrigen)}`
      : 'Bandeja de Materias (Horas por ubicar)',
    tamanoBloque,
    propuestasLibres: libresOrdenadas,
    propuestasEnroqueDirecto: directosOrdenados,
    propuestasEnroqueTriangular: triangularesOrdenados,
    todasLasPropuestas: todasOrdenadas,
    mapaCeldasDestino
  };
}

/**
 * Construye una operación y evalúa su impacto a partir de una acción interactiva del usuario
 * en la grilla (clic o Drag & Drop sobre un casillero destino).
 * Si el casillero destino ocupado no admite un enroque 1 a 1 limpio pero sí tiene un Enroque Triangular válido,
 * puede sugerir o previsualizar tanto el enroque directo como la alternativa triangular sin choques.
 */
function previsualizarInteraccionMovimiento(
  estado,
  {
    cursoId,
    materiaId = null,
    origenDia = null,
    origenBloquesIndices = null,
    origenBloqueIndice = null,
    destinoDia,
    destinoBloquesIndices = null,
    destinoBloqueIndice = null,
    cantidadBloques = 1
  }
) {
  const bloques = estado.configuracion.bloquesHorarios || [];
  const origIndices = Array.isArray(origenBloquesIndices) && origenBloquesIndices.length > 0
    ? [...origenBloquesIndices].sort((a, b) => a - b)
    : Number.isInteger(origenBloqueIndice) && origenDia
      ? [origenBloqueIndice]
      : [];

  const tamano = origIndices.length > 0
    ? origIndices.length
    : Math.max(1, parseInt(cantidadBloques, 10) || 1);

  let destIndices = Array.isArray(destinoBloquesIndices) && destinoBloquesIndices.length > 0
    ? [...destinoBloquesIndices].sort((a, b) => a - b)
    : [];

  if (destIndices.length === 0 && Number.isInteger(destinoBloqueIndice)) {
    for (let i = 0; i < tamano && destinoBloqueIndice + i < bloques.length; i++) {
      destIndices.push(destinoBloqueIndice + i);
    }
  }

  const esDesdeGrilla = Boolean(origenDia && origIndices.length > 0);
  let matAId = materiaId;
  if (!matAId && esDesdeGrilla) {
    const asigOrig = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === origenDia && a.bloqueIndice === origIndices[0]
    );
    if (asigOrig) matAId = asigOrig.materiaId;
  }

  const asigDestino = estado.asignaciones.find(
    (a) => a.cursoId === cursoId && a.dia === destinoDia && a.bloqueIndice === destIndices[0]
  );

  if (!matAId) {
    return { error: 'Selecciona primero una clase o una materia para mover.' };
  }
  if (destIndices.length !== tamano) {
    return { error: `Un bloque de ${tamano} hs no entra a partir de ese casillero (supera el final del día).` };
  }
  if (destIndices.some((idx) => esBloqueAlmuerzo(estado, cursoId, destinoDia, idx))) {
    return {
      error:
        'Ese horario está reservado para Almuerzo en este curso. Quita primero el bloque de Almuerzo (clic derecho o ✕) si deseas asignar una clase allí.'
    };
  }
  if (
    esDesdeGrilla &&
    destinoDia === origenDia &&
    destIndices.some((idx) => origIndices.includes(idx))
  ) {
    return { error: 'El destino se superpone con el bloque de origen. Elige otro casillero.' };
  }

  if (esDesdeGrilla) {
    const asigsVentana = estado.asignaciones.filter(
      (a) => a.cursoId === cursoId && a.dia === destinoDia && destIndices.includes(a.bloqueIndice)
    );
    const matsVentana = Array.from(new Set(asigsVentana.map((a) => a.materiaId)));
    if (asigsVentana.length > 0) {
      if (matsVentana.length > 1 || asigsVentana.length !== tamano) {
        return {
          error: `El destino tiene clases mezcladas o parcialmente ocupadas; para mover un bloque de ${tamano} hs elige un espacio totalmente libre o ocupado por una sola materia.`
        };
      }
      if (matsVentana[0] === matAId) {
        return { error: 'El destino ya contiene la misma materia.' };
      }
    }
  }

  // Si se arrastra/clica desde la Bandeja sobre una celda OCUPADA por otra materia,
  // priorizar el Enroque / Desplazamiento limpio (1 a 1 o Triangular) para no desasignar la materia ocupante
  if (!esDesdeGrilla && asigDestino && asigDestino.materiaId !== matAId) {
    const motorBandeja = generarPropuestasMovimiento(estado, {
      cursoId,
      materiaId: matAId,
      cantidadBloques: tamano
    });
    if (motorBandeja) {
      const matchDirecto = motorBandeja.propuestasEnroqueDirecto.find(
        (p) => p.destinoDia === destinoDia && p.destinoBloqueInicial === destIndices[0]
      );
      const matchTri = motorBandeja.propuestasEnroqueTriangular.find(
        (p) => p.destinoDia === destinoDia && p.destinoBloqueInicial === destIndices[0]
      );
      if (matchDirecto) {
        return {
          impactoPrincipal: matchDirecto.impacto,
          alternativaTriangular: matchTri ? matchTri.impacto : null
        };
      }
      if (matchTri) {
        return {
          impactoPrincipal: matchTri.impacto,
          alternativaTriangular: null
        };
      }
    }
  }

  let operacion;
  if (!esDesdeGrilla) {
    operacion = {
      tipo: 'ASIGNAR_LIBRE',
      cursoId,
      materiaId: matAId,
      destinoDia,
      destinoBloquesIndices: destIndices
    };
  } else if (!asigDestino) {
    operacion = {
      tipo: 'MOVER_A_LIBRE',
      cursoId,
      materiaId: matAId,
      origenDia,
      origenBloquesIndices: origIndices,
      destinoDia,
      destinoBloquesIndices: destIndices
    };
  } else {
    operacion = {
      tipo: 'ENROQUE_1_A_1',
      cursoId,
      materiaAId: matAId,
      materiaBId: asigDestino.materiaId,
      origenDia,
      origenBloquesIndices: origIndices,
      destinoDia,
      destinoBloquesIndices: destIndices
    };
  }

  const impactoPrincipal = evaluarImpactoOperacionHorario(estado, operacion);

  // Si es un enroque entre dos celdas ocupadas y el 1 a 1 genera conflicto duro, verificar si existe un Enroque Triangular limpio para ese mismo destino
  let alternativaTriangular = null;
  if (operacion.tipo === 'ENROQUE_1_A_1' && impactoPrincipal.tieneConflictosDuros) {
    const motor = generarPropuestasMovimiento(estado, {
      cursoId,
      materiaId: matAId,
      origenDia,
      origenBloquesIndices: origIndices
    });
    if (motor && motor.propuestasEnroqueTriangular.length > 0) {
      const matchTri = motor.propuestasEnroqueTriangular.find(
        (p) => p.destinoDia === destinoDia && p.destinoBloqueInicial === destIndices[0]
      );
      if (matchTri) {
        alternativaTriangular = matchTri.impacto;
      }
    }
  }

  return {
    impactoPrincipal,
    alternativaTriangular
  };
}

/**
 * Asistente de "Movimiento Deseado / Cobertura de Bloque Objetivo":
 * Dado un curso, una materia (o docente) y un bloque horario específico que el usuario desea cubrir,
 * diagnostica qué impedimentos existen hoy y sugiere las cadenas exactas de cambios (movimiento directo,
 * enroque 1 a 1, enroque triangular, liberación de choque en otro curso o habilitación de disponibilidad)
 * necesarias para hacer posible el movimiento.
 */
function diagnosticarMovimientoDeseado(
  estado,
  {
    cursoId,
    materiaId = null,
    docenteId = null,
    destinoDia,
    destinoBloqueIndice = 0,
    cantidadBloques = 1,
    origenClave = 'AUTO'
  }
) {
  const bloques = estado.configuracion.bloquesHorarios || [];
  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));

  const curso = cursosMap.get(cursoId) || estado.cursos[0];
  if (!curso) return null;

  // Resolver la materia objetivo (por materiaId directo o buscando la materia del docente en ese curso)
  let materiaObjetivo = materiaId ? materiasMap.get(materiaId) : null;
  if (materiaObjetivo && materiaObjetivo.cursoId !== curso.id) {
    materiaObjetivo = null;
  }

  if (!materiaObjetivo && docenteId) {
    materiaObjetivo =
      estado.materias.find(
        (m) => m.cursoId === curso.id && Array.isArray(m.docentesIds) && m.docentesIds.includes(docenteId)
      ) || null;

    if (!materiaObjetivo) {
      const docObj = docentesMap.get(docenteId);
      const otrasMateriasDoc = estado.materias.filter(
        (m) => Array.isArray(m.docentesIds) && m.docentesIds.includes(docenteId)
      );
      const cursosDondeDicta = otrasMateriasDoc.map((m) => {
        const c = cursosMap.get(m.cursoId);
        return `${c ? c.nombre : m.cursoId} (${m.nombre})`;
      });
      return {
        error: `${docObj ? docObj.nombre : 'El docente seleccionado'} no tiene ninguna materia asignada en ${curso.nombre}.${
          cursosDondeDicta.length > 0
            ? ` Dicta clases en: ${cursosDondeDicta.join(', ')}. Cambia el curso en el selector 1.`
            : ''
        }`,
        cursosSugeridosDocente: otrasMateriasDoc.map((m) => m.cursoId)
      };
    }
  }

  if (!materiaObjetivo) {
    materiaObjetivo = estado.materias.find((m) => m.cursoId === curso.id) || null;
  }
  if (!materiaObjetivo) {
    return { error: `El curso ${curso.nombre} aún no tiene materias registradas.` };
  }

  const tamano = Math.max(1, Math.min(3, parseInt(cantidadBloques, 10) || 1));
  const bInicio = Math.max(0, Math.min(bloques.length - tamano, parseInt(destinoBloqueIndice, 10) || 0));
  const indicesDestino = [];
  for (let i = 0; i < tamano; i++) {
    indicesDestino.push(bInicio + i);
  }
  const diaDest = destinoDia || estado.configuracion.diasHabiles[0];
  const rangoDestinoTexto = `${diaDest} · ${formatearRangoBloques(bloques, indicesDestino)}`;

  const docentesNombres = (materiaObjetivo.docentesIds || [])
    .map((id) => docentesMap.get(id)?.nombre || id)
    .join(' + ');

  // Recolectar los posibles orígenes de esta materia en el curso para un tamaño dado
  const corridasActuales = obtenerCorridasAsignadasMateria(estado, curso.id, materiaObjetivo.id);
  const horasAsignadas = estado.asignaciones.filter(
    (a) => a.cursoId === curso.id && a.materiaId === materiaObjetivo.id
  ).length;
  const horasPendientes = Math.max(0, (materiaObjetivo.horasSemanales || 0) - horasAsignadas);

  function construirOrigenesParaVentana(tamVentana, indicesDestVentana) {
    const lista = [];
    const clavesVistas = new Set();
    for (const corr of corridasActuales) {
      if (corr.dia === diaDest && corr.bloquesIndices.some((idx) => indicesDestVentana.includes(idx))) {
        continue;
      }
      if (corr.bloquesIndices.length >= tamVentana) {
        const subInicio = corr.bloquesIndices.slice(0, tamVentana);
        const kIni = `${corr.dia}|${subInicio.join(',')}`;
        if (!clavesVistas.has(kIni)) {
          clavesVistas.add(kIni);
          lista.push({
            clave: kIni,
            esDesdeGrilla: true,
            origenDia: corr.dia,
            origenBloquesIndices: subInicio,
            etiqueta: `Tomar de ${corr.dia} · ${formatearRangoBloques(bloques, subInicio)}`
          });
        }
        if (corr.bloquesIndices.length > tamVentana) {
          const subFin = corr.bloquesIndices.slice(-tamVentana);
          const kFin = `${corr.dia}|${subFin.join(',')}`;
          if (!clavesVistas.has(kFin)) {
            clavesVistas.add(kFin);
            lista.push({
              clave: kFin,
              esDesdeGrilla: true,
              origenDia: corr.dia,
              origenBloquesIndices: subFin,
              etiqueta: `Tomar de ${corr.dia} · ${formatearRangoBloques(bloques, subFin)}`
            });
          }
        }
      }
    }

    if (horasPendientes >= tamVentana || lista.length === 0) {
      lista.push({
        clave: 'BANDEJA',
        esDesdeGrilla: false,
        origenDia: null,
        origenBloquesIndices: [],
        etiqueta:
          horasPendientes >= tamVentana
            ? `Desde Bandeja (${horasPendientes} hs pendientes)`
            : 'Desde Bandeja (agrega horas al curso)'
      });
    }

    if (origenClave && origenClave !== 'AUTO') {
      const filtrados = lista.filter((o) => o.clave === origenClave);
      return filtrados.length > 0 ? filtrados : lista;
    }
    return lista;
  }

  const origenesCandidatos = construirOrigenesParaVentana(tamano, indicesDestino);

  // -------------------------------------------------------------------------
  // 1. DIAGNÓSTICO DE OBSTÁCULOS EN EL BLOQUE DESEADO
  // -------------------------------------------------------------------------
  const diagnosticoObstaculos = [];

  const bloquesAlmuerzoEnDestino = indicesDestino.filter((bIdx) =>
    esBloqueAlmuerzo(estado, curso.id, diaDest, bIdx)
  );
  const hayAlmuerzoEnDestino = bloquesAlmuerzoEnDestino.length > 0;

  if (hayAlmuerzoEnDestino) {
    diagnosticoObstaculos.push({
      tipo: 'BLOQUE_ALMUERZO',
      titulo: 'Horario reservado para Almuerzo',
      detalle: `El horario ${formatearRangoBloques(bloques, bloquesAlmuerzoEnDestino)} está marcado como espacio de 🍽️ Almuerzo en ${curso.nombre}. Debes quitar el Almuerzo si deseas dictar clases allí.`
    });
  }

  // 1A. ¿Qué hay actualmente en el curso en ese bloque?
  const asigsEnDestinoCurso = estado.asignaciones.filter(
    (a) => a.cursoId === curso.id && a.dia === diaDest && indicesDestino.includes(a.bloqueIndice)
  );
  const materiasOcupantesIds = Array.from(new Set(asigsEnDestinoCurso.map((a) => a.materiaId)));
  const yaAsignadoEnDestino =
    !hayAlmuerzoEnDestino &&
    materiasOcupantesIds.length === 1 &&
    materiasOcupantesIds[0] === materiaObjetivo.id &&
    asigsEnDestinoCurso.length === indicesDestino.length;

  if (!hayAlmuerzoEnDestino && asigsEnDestinoCurso.length === 0) {
    diagnosticoObstaculos.push({
      tipo: 'OK',
      titulo: 'Casillero libre en el curso',
      detalle: `En ${curso.nombre} el horario ${rangoDestinoTexto} está vacío.`
    });
  } else if (yaAsignadoEnDestino) {
    diagnosticoObstaculos.push({
      tipo: 'OK',
      titulo: 'La materia ya ocupa este bloque',
      detalle: `«${materiaObjetivo.nombre}» (${docentesNombres}) ya está asignada cubriendo ${rangoDestinoTexto}.`
    });
  } else if (asigsEnDestinoCurso.length > 0) {
    const nombresOcup = materiasOcupantesIds
      .map((id) => {
        const m = materiasMap.get(id);
        const docs = (m?.docentesIds || []).map((dId) => docentesMap.get(dId)?.nombre || dId).join(' + ');
        return m ? `«${m.nombre}» (${docs})` : id;
      })
      .join(', ');
    diagnosticoObstaculos.push({
      tipo: 'REQUIERE_ENROQUE',
      titulo: 'Bloque ocupado en el curso',
      detalle: `Actualmente en ${curso.nombre} se dicta ${nombresOcup}. Se requiere reubicar esa materia mediante un Enroque 1 a 1 o Triangular.`
    });
  }

  // 1B. ¿Los docentes de la materia objetivo tienen disponibilidad declarada?
  const cambiosDisponibilidadRequeridos = [];
  for (const docId of materiaObjetivo.docentesIds || []) {
    const doc = docentesMap.get(docId);
    if (!doc) continue;
    for (const bIdx of indicesDestino) {
      if (!doc.disponibilidad?.[diaDest]?.[bIdx]) {
        cambiosDisponibilidadRequeridos.push({
          docenteId: doc.id,
          docenteNombre: doc.nombre,
          dia: diaDest,
          bloqueIndice: bIdx,
          disponible: true
        });
      }
    }
  }

  if (cambiosDisponibilidadRequeridos.length === 0) {
    diagnosticoObstaculos.push({
      tipo: 'OK',
      titulo: 'Disponibilidad declarada compatible',
      detalle: `${docentesNombres} tiene disponibilidad habilitada en ${rangoDestinoTexto}.`
    });
  } else {
    const detalleIndisp = cambiosDisponibilidadRequeridos
      .map((c) => `${c.docenteNombre} (${c.dia} B${c.bloqueIndice + 1})`)
      .join(', ');
    diagnosticoObstaculos.push({
      tipo: 'DOCENTE_NO_DISPONIBLE',
      titulo: 'Docente marcado como No Disponible',
      detalle: `Falta disponibilidad declarada en: ${detalleIndisp}. Para cubrir este horario se debe habilitar su disponibilidad en ese bloque.`
    });
  }

  // 1C. ¿Los docentes de la materia objetivo están dictando clase en OTRO curso en ese mismo horario?
  const choquesOtrosCursos = [];
  for (const docId of materiaObjetivo.docentesIds || []) {
    const doc = docentesMap.get(docId);
    if (!doc) continue;
    for (const bIdx of indicesDestino) {
      const asigsConflicto = estado.asignaciones.filter((a) => {
        if (a.cursoId === curso.id || a.dia !== diaDest || a.bloqueIndice !== bIdx) return false;
        const m = materiasMap.get(a.materiaId);
        return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(docId);
      });
      for (const aConf of asigsConflicto) {
        const cExt = cursosMap.get(aConf.cursoId);
        const mExt = materiasMap.get(aConf.materiaId);
        choquesOtrosCursos.push({
          docenteId: doc.id,
          docenteNombre: doc.nombre,
          cursoExternoId: aConf.cursoId,
          cursoExternoNombre: cExt ? cExt.nombre : aConf.cursoId,
          materiaExternaId: aConf.materiaId,
          materiaExternaNombre: mExt ? mExt.nombre : aConf.materiaId,
          dia: diaDest,
          bloqueIndice: bIdx
        });
      }
    }
  }

  if (choquesOtrosCursos.length === 0) {
    diagnosticoObstaculos.push({
      tipo: 'OK',
      titulo: 'Sin superposición en otros cursos',
      detalle: `${docentesNombres} no dicta clases en otros cursos durante ${rangoDestinoTexto}.`
    });
  } else {
    const resumenChoques = Array.from(
      new Set(
        choquesOtrosCursos.map(
          (c) => `${c.docenteNombre} dicta «${c.materiaExternaNombre}» en ${c.cursoExternoNombre} (B${c.bloqueIndice + 1})`
        )
      )
    ).join('; ');
    diagnosticoObstaculos.push({
      tipo: 'CHOQUE_OTRO_CURSO',
      titulo: 'Docente ocupado en otro curso en ese mismo bloque',
      detalle: `${resumenChoques}. Primero se debe mover o enrocar esa clase en el otro curso para liberar al docente.`
    });
  }

  const obstaculosReales = diagnosticoObstaculos.filter((o) => o.tipo !== 'OK');
  const esViableDirecto = !yaAsignadoEnDestino && obstaculosReales.length === 0;

  // -------------------------------------------------------------------------
  // 2. BUSCADOR DE SOLUCIONES PARA HACER POSIBLE EL MOVIMIENTO DESEADO
  // -------------------------------------------------------------------------
  const solucionesPropuestas = [];
  const idsVistos = new Set();

  function agregarSolucion(sol) {
    if (!sol || !sol.impacto) return;
    const firma = JSON.stringify(sol.impacto.operacion);
    if (idsVistos.has(firma)) return;
    idsVistos.add(firma);
    solucionesPropuestas.push(sol);
  }

  function formatearPasosExplicativos(impactoFinal) {
    return (impactoFinal.pasosMovimiento || []).map((p) => {
      if (!p.materiaId) {
        return `${p.materiaNombre}: ${p.destinoTexto}`;
      }
      return `${p.materiaNombre}${p.docentesNombres ? ` (${p.docentesNombres})` : ''}: sale de ${p.origenTexto} → ingresa a ${p.destinoTexto}`;
    });
  }

  // Función auxiliar que busca en `estadoBase` cómo colocar `materiaObjetivo` en `(diaDest, bIniEval, tamEval)`
  function buscarMovimientosEnCurso(
    estadoBase,
    prefijoOperaciones = [],
    cambiosDisp = [],
    etiquetaPrevia = null,
    bIniEval = bInicio,
    tamEval = tamano,
    notaBloqueCompleto = null
  ) {
    const indicesEval = [];
    for (let k = 0; k < tamEval; k++) indicesEval.push(bIniEval + k);
    const origenesEval = construirOrigenesParaVentana(tamEval, indicesEval);

    for (const orig of origenesEval) {
      const motor = generarPropuestasMovimiento(estadoBase, {
        cursoId: curso.id,
        materiaId: materiaObjetivo.id,
        origenDia: orig.esDesdeGrilla ? orig.origenDia : null,
        origenBloquesIndices: orig.esDesdeGrilla ? orig.origenBloquesIndices : null,
        cantidadBloques: tamEval
      });
      if (!motor) continue;

      const candidatasDestino = motor.todasLasPropuestas.filter(
        (p) => p.destinoDia === diaDest && p.destinoBloqueInicial === bIniEval
      );

      for (const prop of candidatasDestino) {
        const esCompuesta = prefijoOperaciones.length > 0 || cambiosDisp.length > 0;
        const operacionFinal = esCompuesta
          ? {
              tipo: 'OPERACION_COMPUESTA',
              cursoId: curso.id,
              categoria: prop.categoria,
              identificadorColor: prop.identificadorColor,
              tituloOperacion: etiquetaPrevia
                ? `${etiquetaPrevia} + ${prop.etiquetaCategoria}`
                : prop.impacto.tituloOperacion,
              cambiosDisponibilidad: cambiosDisp,
              operaciones: [...prefijoOperaciones, prop.impacto.operacion]
            }
          : prop.impacto.operacion;

        const impactoFinal = evaluarImpactoOperacionHorario(estado, operacionFinal);
        if (impactoFinal.tieneConflictosDuros) continue;

        let tituloCorto = '';
        let resumenSolucion = '';
        if (prop.categoria === 'LIBRE') {
          tituloCorto = orig.esDesdeGrilla
            ? `Mover directo a horario libre (${tamEval}h)`
            : `Asignar desde Bandeja a horario libre (${tamEval}h)`;
          resumenSolucion = orig.esDesdeGrilla
            ? `Mover directamente desde ${orig.origenDia} (${formatearRangoBloques(bloques, orig.origenBloquesIndices)}) hacia el horario libre.`
            : 'Asignar directamente desde la Bandeja al horario libre.';
        } else if (prop.categoria === 'ENROQUE_1_A_1') {
          tituloCorto = `Enroque 1 a 1 con «${prop.materiaIntercambioNombre}» (${tamEval}h)`;
          resumenSolucion = `Enroque 1 a 1 con «${prop.materiaIntercambioNombre}» (${orig.etiqueta}).`;
        } else {
          tituloCorto = `Enroque Triangular con «${prop.materiaIntercambioNombre}» (${tamEval}h)`;
          resumenSolucion = `Enroque Triangular: ${prop.cadenaResumenTexto || prop.etiquetaCategoria}.`;
        }

        if (notaBloqueCompleto) {
          tituloCorto = `${tituloCorto} · ${notaBloqueCompleto}`;
        }
        if (etiquetaPrevia) {
          tituloCorto = `${etiquetaPrevia} → ${tituloCorto}`;
          resumenSolucion = `${etiquetaPrevia} → ${resumenSolucion}`;
        }

        agregarSolucion({
          idSolucion: `SOL_${solucionesPropuestas.length + 1}`,
          categoria: prop.categoria,
          identificadorColor: prop.identificadorColor,
          etiquetaTipo: etiquetaPrevia ? `Coordinado` : prop.etiquetaCategoria,
          titulo: tituloCorto,
          origenEtiqueta: orig.etiqueta,
          origenUsadoTexto: orig.etiqueta,
          resumenSolucion,
          explicacionPasos: formatearPasosExplicativos(impactoFinal),
          deltaHorasPuenteTotal: impactoFinal.deltaHorasPuenteTotal,
          cruzaRecreoInjustificado: impactoFinal.cruzaRecreoInjustificado,
          requiereCambioDisponibilidad: cambiosDisp.length > 0,
          requiereMovimientoOtroCurso: prefijoOperaciones.length > 0,
          esSugerenciaBloqueCompleto: Boolean(notaBloqueCompleto),
          impacto: impactoFinal
        });
      }
    }
  }

  if (!hayAlmuerzoEnDestino && !yaAsignadoEnDestino) {
    // Nivel 1: Búsqueda directa en el estado actual (sin tocar otros cursos ni disponibilidad)
    if (cambiosDisponibilidadRequeridos.length === 0 && choquesOtrosCursos.length === 0) {
      buscarMovimientosEnCurso(estado, [], [], null, bInicio, tamano, null);
    }

    // Nivel 1B: Si el usuario consultó por 1h (o 2h) sobre un bloque que pertenece a una corrida mayor
    // (por ejemplo, un bloque de 3 hs como Taller de Robótica I en Martes B5-B7), evaluar también
    // el intercambio del bloque completo contenedor para ofrecer sugerencias limpias sin partir bloques.
    if (asigsEnDestinoCurso.length > 0) {
      const matOcupId = asigsEnDestinoCurso[0].materiaId;
      if (matOcupId && matOcupId !== materiaObjetivo.id) {
        const corridasOcup = obtenerCorridasAsignadasMateria(estado, curso.id, matOcupId);
        const corridaContenedora = corridasOcup.find(
          (c) => c.dia === diaDest && c.bloquesIndices.includes(bInicio)
        );
        if (
          corridaContenedora &&
          (corridaContenedora.cantidadHoras !== tamano || corridaContenedora.bloqueInicial !== bInicio)
        ) {
          const bIniCont = corridaContenedora.bloqueInicial;
          const tamCont = corridaContenedora.cantidadHoras;
          const dispCompletaOk = (materiaObjetivo.docentesIds || []).every((dId) => {
            const dObj = docentesMap.get(dId);
            return corridaContenedora.bloquesIndices.every((idx) => Boolean(dObj?.disponibilidad?.[diaDest]?.[idx]));
          });
          const sinChoqueExtCompleto = (materiaObjetivo.docentesIds || []).every((dId) =>
            corridaContenedora.bloquesIndices.every(
              (idx) =>
                !estado.asignaciones.some((a) => {
                  if (a.cursoId === curso.id || a.dia !== diaDest || a.bloqueIndice !== idx) return false;
                  const m = materiasMap.get(a.materiaId);
                  return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(dId);
                })
            )
          );
          if (dispCompletaOk && sinChoqueExtCompleto) {
            buscarMovimientosEnCurso(
              estado,
              [],
              [],
              null,
              bIniCont,
              tamCont,
              `Bloque completo ${formatearRangoBloques(bloques, corridaContenedora.bloquesIndices)}`
            );
          }
        }
      }
    }

    // Nivel 2: Si hay choque en otro curso (y disponibilidad OK o habilitable), buscar cómo liberar al docente en el otro curso
    if (choquesOtrosCursos.length > 0) {
      const gruposExternos = new Map();
      for (const ch of choquesOtrosCursos) {
        const k = `${ch.cursoExternoId}|${ch.materiaExternaId}`;
        if (!gruposExternos.has(k)) {
          gruposExternos.set(k, {
            cursoExternoId: ch.cursoExternoId,
            cursoExternoNombre: ch.cursoExternoNombre,
            materiaExternaId: ch.materiaExternaId,
            materiaExternaNombre: ch.materiaExternaNombre,
            dia: ch.dia,
            bloques: []
          });
        }
        if (!gruposExternos.get(k).bloques.includes(ch.bloqueIndice)) {
          gruposExternos.get(k).bloques.push(ch.bloqueIndice);
        }
      }

      if (gruposExternos.size === 1) {
        const ext = Array.from(gruposExternos.values())[0];
        ext.bloques.sort((a, b) => a - b);

        const estadoConDisp =
          cambiosDisponibilidadRequeridos.length > 0
            ? simularEstadoConOperacion(estado, {
                tipo: 'OPERACION_COMPUESTA',
                cursoId: curso.id,
                cambiosDisponibilidad: cambiosDisponibilidadRequeridos,
                operaciones: []
              })
            : estado;

        // Evaluar tanto mover solo los bloques en choque como mover toda la corrida externa si pertenece a un bloque de 2h/3h
        const corridasExt = obtenerCorridasAsignadasMateria(
          estadoConDisp,
          ext.cursoExternoId,
          ext.materiaExternaId
        );
        const corridaExtCompleta = corridasExt.find(
          (c) => c.dia === ext.dia && ext.bloques.every((b) => c.bloquesIndices.includes(b))
        );
        const variantesBloquesExt = [ext.bloques];
        if (corridaExtCompleta && corridaExtCompleta.bloquesIndices.length > ext.bloques.length) {
          variantesBloquesExt.push(corridaExtCompleta.bloquesIndices);
        }

        for (const blqExt of variantesBloquesExt) {
          const motorExterno = generarPropuestasMovimiento(estadoConDisp, {
            cursoId: ext.cursoExternoId,
            materiaId: ext.materiaExternaId,
            origenDia: ext.dia,
            origenBloquesIndices: blqExt
          });

          if (motorExterno) {
            const mejoresExternas = [
              ...motorExterno.propuestasLibres.slice(0, 3),
              ...motorExterno.propuestasEnroqueDirecto.slice(0, 3)
            ];
            for (const propExt of mejoresExternas) {
              const opExt = propExt.impacto.operacion;
              const estadoTrasLiberarExt = simularEstadoConOperacion(estadoConDisp, opExt);
              const etiq = `Liberar en ${ext.cursoExternoNombre} (${ext.materiaExternaNombre} → ${propExt.destinoDia} B${propExt.destinoBloqueInicial + 1})`;
              buscarMovimientosEnCurso(
                estadoTrasLiberarExt,
                [opExt],
                cambiosDisponibilidadRequeridos,
                etiq,
                bInicio,
                tamano,
                null
              );
            }
          }
        }
      }
    }

    // Nivel 3: Si faltaba disponibilidad declarada del docente (y no tenía choque en otro curso)
    if (cambiosDisponibilidadRequeridos.length > 0 && choquesOtrosCursos.length === 0) {
      const estadoConDisp = simularEstadoConOperacion(estado, {
        tipo: 'OPERACION_COMPUESTA',
        cursoId: curso.id,
        cambiosDisponibilidad: cambiosDisponibilidadRequeridos,
        operaciones: []
      });
      buscarMovimientosEnCurso(
        estadoConDisp,
        [],
        cambiosDisponibilidadRequeridos,
        'Habilitar disponibilidad docente',
        bInicio,
        tamano,
        null
      );
    }
  }

  // Ordenar soluciones priorizando sin cambios de disponibilidad, menor cantidad de pasos y mejor ΔHorasLibres
  solucionesPropuestas.sort((a, b) => {
    if (a.requiereCambioDisponibilidad !== b.requiereCambioDisponibilidad) {
      return a.requiereCambioDisponibilidad ? 1 : -1;
    }
    if (a.requiereMovimientoOtroCurso !== b.requiereMovimientoOtroCurso) {
      return a.requiereMovimientoOtroCurso ? 1 : -1;
    }
    if (a.cruzaRecreoInjustificado !== b.cruzaRecreoInjustificado) {
      return a.cruzaRecreoInjustificado ? 1 : -1;
    }
    return a.deltaHorasPuenteTotal - b.deltaHorasPuenteTotal;
  });

  const solucionesRecortadas = solucionesPropuestas.slice(0, 12);

  return {
    cursoId: curso.id,
    cursoNombre: curso.nombre,
    materiaId: materiaObjetivo.id,
    materiaNombre: materiaObjetivo.nombre,
    docentesNombres,
    destinoRangoTexto: rangoDestinoTexto,
    esViableDirecto,
    yaAsignadoEnDestino,
    obstaculos: obstaculosReales,
    soluciones: solucionesRecortadas,
    resumenObjetivo: {
      cursoId: curso.id,
      cursoNombre: curso.nombre,
      materiaId: materiaObjetivo.id,
      materiaNombre: materiaObjetivo.nombre,
      materiaColor: materiaObjetivo.color,
      docentesNombres,
      destinoDia: diaDest,
      destinoBloqueIndice: bInicio,
      destinoBloquesIndices: indicesDestino,
      destinoRangoTexto: rangoDestinoTexto,
      cantidadBloques: tamano
    },
    origenesDisponibles: origenesCandidatos,
    diagnosticoObstaculos,
    solucionesPropuestas: solucionesRecortadas
  };
}

/**
 * Ejecuta de forma atómica una operación de movimiento/enroque ya confirmada por el usuario,
 * registrándola en el historial Undo/Redo y en el Modo Simulación / Horario Oficial.
 */
function aplicarOperacionHorarioConfirmada(stateManager, operacion) {
  if (!stateManager || !operacion) return null;
  const estadoActual = stateManager.obtenerEstado();
  const impacto = evaluarImpactoOperacionHorario(estadoActual, operacion);

  return stateManager.aplicarMutacion(impacto.descripcionHistorial, (draft) => {
    const simulado = simularEstadoConOperacion(draft, operacion);
    draft.asignaciones = simulado.asignaciones;
    if (simulado.docentes) {
      draft.docentes = simulado.docentes;
    }
  });
}

module.exports = {
  formatearRangoBloques,
  simularEstadoConOperacion,
  evaluarImpactoOperacionHorario,
  generarPropuestasMovimiento,
  previsualizarInteraccionMovimiento,
  diagnosticarMovimientoDeseado,
  aplicarOperacionHorarioConfirmada
};
