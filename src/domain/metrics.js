/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo: Motor de Reglas de Negocio, Horas Libres (Puente), Continuidad de Recreos y Métricas
 */

const { obtenerParametrosSistema, esBloqueAlmuerzo } = require('./schema');

/**
 * Divide un arreglo de índices de bloques de un día en corridas contiguas (ej. [0, 1, 7, 8] -> [[0, 1], [7, 8]]).
 */
function agruparEnCorridasContiguas(indicesBloquesDia) {
  const ordenados = Array.from(new Set(indicesBloquesDia || [])).sort((a, b) => a - b);
  if (ordenados.length === 0) return [];

  const corridas = [];
  let actual = [ordenados[0]];
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i] === ordenados[i - 1] + 1) {
      actual.push(ordenados[i]);
    } else {
      corridas.push(actual);
      actual = [ordenados[i]];
    }
  }
  corridas.push(actual);
  return corridas;
}

/**
 * Calcula las Horas Libres (Horas Puente) de un docente en un día específico aplicando la fórmula oficial:
 * HorasPuente(p, d) = (IndiceUltimoBloqueAsignado - IndicePrimerBloqueAsignado + 1) - CantidadBloquesAsignadosEnElDia
 *
 * @param {number[]} indicesAsignados Array ordenado de índices de bloque (0..N-1) donde el docente dicta clase ese día
 * @returns {{ cantidadHorasPuente: number, primerIndice: number|null, ultimoIndice: number|null, indicesPuente: number[] }}
 */
function calcularHorasPuenteDia(indicesAsignados) {
  const unicosOrdenados = Array.from(new Set(indicesAsignados)).sort((a, b) => a - b);
  const cantidad = unicosOrdenados.length;

  if (cantidad <= 1) {
    return {
      cantidadHorasPuente: 0,
      primerIndice: cantidad === 1 ? unicosOrdenados[0] : null,
      ultimoIndice: cantidad === 1 ? unicosOrdenados[0] : null,
      indicesPuente: []
    };
  }

  const primerIndice = unicosOrdenados[0];
  const ultimoIndice = unicosOrdenados[cantidad - 1];
  const setOcupados = new Set(unicosOrdenados);
  const indicesPuente = [];

  for (let idx = primerIndice; idx <= ultimoIndice; idx++) {
    if (!setOcupados.has(idx)) {
      indicesPuente.push(idx);
    }
  }

  const cantidadHorasPuente = (ultimoIndice - primerIndice + 1) - cantidad;

  return {
    cantidadHorasPuente,
    primerIndice,
    ultimoIndice,
    indicesPuente
  };
}

/**
 * Obtiene el mapa completo de ocupación, choques, violaciones y horas libres detalladas de un docente en toda la semana
 */
function calcularMetricasDocente(estado, docenteId) {
  const docente = estado.docentes.find((d) => d.id === docenteId);
  if (!docente) return null;

  const params = obtenerParametrosSistema(estado);
  const dias = estado.configuracion.diasHabiles;
  const bloques = estado.configuracion.bloquesHorarios;
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));

  // Materias donde participa este docente (individual o pareja pedagógica)
  const materiasDelDocente = estado.materias.filter(
    (m) => Array.isArray(m.docentesIds) && m.docentesIds.includes(docenteId)
  );
  const materiasIdsSet = new Set(materiasDelDocente.map((m) => m.id));

  const materiasACargo = materiasDelDocente.map((m) => {
    const cursoObj = cursosMap.get(m.cursoId);
    const horasAsignadas = estado.asignaciones.filter((a) => a.materiaId === m.id).length;
    const horasSemanales = m.horasSemanales || 0;
    const horasPendientes = Math.max(0, horasSemanales - horasAsignadas);
    const horasExceso = Math.max(0, horasAsignadas - horasSemanales);
    const coDocentesNombres = (m.docentesIds || [])
      .filter((id) => id !== docenteId)
      .map((id) => docentesMap.get(id)?.nombre || id);
    const analisisFormato = analizarFormatoBloquesMateria(estado, m.id);

    return {
      ...m,
      cursoNombre: cursoObj ? cursoObj.nombre : m.cursoId,
      cursoDivision: cursoObj ? cursoObj.division : '',
      horasAsignadas,
      horasPendientes,
      horasExceso,
      completada: horasAsignadas === horasSemanales,
      excedida: params.alertarExcesoHoras ? horasAsignadas > horasSemanales : false,
      coDocentesNombres,
      analisisFormato
    };
  });

  const totalHorasPlanDocente = materiasACargo.reduce((acc, m) => acc + (m.horasSemanales || 0), 0);

  // Asignaciones del docente
  const asignacionesDocente = estado.asignaciones.filter((a) => materiasIdsSet.has(a.materiaId));

  const porDia = {};
  const detalleHorasPuentePorDia = [];
  let totalHorasAsignadas = 0;
  let totalHorasDisponiblesLibres = 0;
  let totalHorasPuente = 0;
  let totalHorasDisponibles = 0;
  let totalChoquesDocente = 0;
  let totalViolacionesDisponibilidad = 0;

  for (const dia of dias) {
    const asigDia = asignacionesDocente.filter((a) => a.dia === dia);
    const indicesAsignados = asigDia.map((a) => a.bloqueIndice);
    const infoPuente = params.alertarHorasLibresDocentes
      ? calcularHorasPuenteDia(indicesAsignados)
      : { cantidadHorasPuente: 0, primerIndice: null, ultimoIndice: null, indicesPuente: [] };
    const puenteSet = new Set(infoPuente.indicesPuente);

    const celdas = bloques.map((bloque) => {
      const dispArray = (docente.disponibilidad && docente.disponibilidad[dia]) || [];
      const disponible = Boolean(dispArray[bloque.indice]);
      const asigsEnSlot = asigDia.filter((a) => a.bloqueIndice === bloque.indice);
      const asig = asigsEnSlot[0] || null;
      const tieneChoque = params.alertarChoquesDocentes && asigsEnSlot.length > 1;
      const violacionDisponibilidad =
        params.alertarDisponibilidadDocente && asigsEnSlot.length > 0 && !disponible;
      const esHoraPuente =
        params.alertarHorasLibresDocentes &&
        asigsEnSlot.length === 0 &&
        puenteSet.has(bloque.indice);

      if (disponible) totalHorasDisponibles++;
      if (asigsEnSlot.length > 0) {
        totalHorasAsignadas += asigsEnSlot.length;
      } else if (disponible) {
        totalHorasDisponiblesLibres++;
      }

      if (tieneChoque) totalChoquesDocente++;
      if (violacionDisponibilidad) totalViolacionesDisponibilidad++;

      const materia = asig ? materiasMap.get(asig.materiaId) : null;
      const curso = asig ? cursosMap.get(asig.cursoId) : null;

      const detallesSlot = asigsEnSlot.map((item) => {
        const mObj = materiasMap.get(item.materiaId);
        const cObj = cursosMap.get(item.cursoId);
        return {
          cursoId: item.cursoId,
          cursoNombre: cObj ? cObj.nombre : item.cursoId,
          materiaId: item.materiaId,
          materiaNombre: mObj ? mObj.nombre : item.materiaId
        };
      });

      // Evaluar si la materia en este día tiene cruce de recreo injustificado o posición dentro de bloque contiguo
      let cruzaRecreoInjustificado = false;
      let advertenciaRecreoCelda = null;
      let posicionEnBloqueDia = null;
      let duracionBloqueDia = 1;

      if (asig && materia) {
        const indicesMatDia = estado.asignaciones
          .filter((a) => a.cursoId === asig.cursoId && a.dia === dia && a.materiaId === materia.id)
          .map((a) => a.bloqueIndice)
          .sort((a, b) => a - b);

        const corridasMat = agruparEnCorridasContiguas(indicesMatDia);
        const corridaDeCelda = corridasMat.find((c) => c.includes(bloque.indice)) || [bloque.indice];
        duracionBloqueDia = corridaDeCelda.length;
        const posIdx = corridaDeCelda.indexOf(bloque.indice);
        if (posIdx !== -1 && duracionBloqueDia > 1) {
          posicionEnBloqueDia = `${posIdx + 1}/${duracionBloqueDia}`;
        }

        if (params.alertarCortePorRecreo) {
          const evalRec = evaluarContinuidadRecreos(corridaDeCelda, bloques);
          if (evalRec.advertencia) {
            cruzaRecreoInjustificado = true;
            advertenciaRecreoCelda = evalRec.advertencia;
          }
        }
      }

      return {
        dia,
        bloqueIndice: bloque.indice,
        bloqueNumero: bloque.numero,
        bloqueNombre: bloque.nombre,
        horario: `${bloque.inicio} - ${bloque.fin}`,
        segmento: bloque.segmento,
        capacidadSegmento: bloque.capacidadSegmento,
        disponible,
        ocupado: asigsEnSlot.length > 0,
        tieneChoque,
        violacionDisponibilidad,
        cruzaRecreoInjustificado,
        advertenciaRecreoCelda,
        posicionEnBloqueDia,
        duracionBloqueDia,
        esHoraPuente,
        asignacion: asig,
        detallesSlot,
        materiaNombre: materia ? materia.nombre : null,
        materiaColor: materia ? materia.color : null,
        materiaFormato: materia ? materia.formatoBloques : null,
        cursoId: curso ? curso.id : null,
        cursoNombre: curso ? curso.nombre : null,
        etiquetaCompleta:
          detallesSlot.length > 1
            ? detallesSlot.map((d) => `${d.cursoNombre} (${d.materiaNombre})`).join(' ⚡ ')
            : curso && materia
              ? `${curso.nombre} - ${materia.nombre}`
              : null
      };
    });

    totalHorasPuente += infoPuente.cantidadHorasPuente;

    if (infoPuente.cantidadHorasPuente > 0) {
      const primerBloqueObj = bloques[infoPuente.primerIndice];
      const ultimoBloqueObj = bloques[infoPuente.ultimoIndice];
      const celdaPrimera = celdas[infoPuente.primerIndice];
      const celdaUltima = celdas[infoPuente.ultimoIndice];
      const bloquesPuenteNombres = infoPuente.indicesPuente.map((idx) => {
        const b = bloques[idx];
        return b ? `${b.nombre} (${b.inicio}-${b.fin})` : `Bloque ${idx + 1}`;
      });

      detalleHorasPuentePorDia.push({
        dia,
        cantidadHorasPuente: infoPuente.cantidadHorasPuente,
        primerIndice: infoPuente.primerIndice,
        ultimoIndice: infoPuente.ultimoIndice,
        indicesPuente: infoPuente.indicesPuente,
        bloquesPuenteNombres,
        primeraClaseTexto: primerBloqueObj
          ? `${primerBloqueObj.nombre} (${primerBloqueObj.inicio}) en ${celdaPrimera?.cursoNombre || ''}`
          : '',
        ultimaClaseTexto: ultimoBloqueObj
          ? `${ultimoBloqueObj.nombre} (${ultimoBloqueObj.fin}) en ${celdaUltima?.cursoNombre || ''}`
          : '',
        explicacion: `Inicia en ${primerBloqueObj ? primerBloqueObj.nombre : ''} (${primerBloqueObj ? primerBloqueObj.inicio : ''}) y termina en ${ultimoBloqueObj ? ultimoBloqueObj.nombre : ''} (${ultimoBloqueObj ? ultimoBloqueObj.fin : ''}), con horas libres en: ${bloquesPuenteNombres.join(', ')}.`
      });
    }

    porDia[dia] = {
      ...infoPuente,
      celdas
    };
  }

  return {
    docenteId: docente.id,
    nombre: docente.nombre,
    especialidad: docente.especialidad,
    color: docente.color,
    totalHorasAsignadas,
    totalHorasDisponibles,
    totalHorasDisponiblesLibres,
    totalHorasPuente,
    totalChoquesDocente,
    totalViolacionesDisponibilidad,
    cantidadMaterias: materiasDelDocente.length,
    totalHorasPlanDocente,
    materiasACargo,
    detalleHorasPuentePorDia,
    porDia
  };
}

/**
 * Analiza la agrupación diaria actual de una materia frente a su formatoBloques configurado (ej. '3+3', '2+2+2', '2+1').
 * Permite múltiples bloques contiguos válidos en un mismo día (ej. 2h a la mañana y 2h a la tarde) sin emitir falso positivo.
 */
function analizarFormatoBloquesMateria(estado, materiaId) {
  const materia = estado.materias.find((m) => m.id === materiaId);
  if (!materia) return null;

  const params = obtenerParametrosSistema(estado);
  const bloques = estado.configuracion.bloquesHorarios || [];
  const partesEsperadas = String(materia.formatoBloques || '1')
    .split('+')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);

  const asigsMateria = estado.asignaciones.filter((a) => a.materiaId === materia.id);
  const horasAsignadas = asigsMateria.length;
  const horasSemanales = materia.horasSemanales || 0;
  const horasPendientes = Math.max(0, horasSemanales - horasAsignadas);

  const corridasPorDia = [];

  for (const dia of estado.configuracion.diasHabiles) {
    const indicesDia = asigsMateria
      .filter((a) => a.dia === dia)
      .map((a) => a.bloqueIndice)
      .sort((a, b) => a - b);

    if (indicesDia.length === 0) continue;

    const corridas = agruparEnCorridasContiguas(indicesDia);

    for (const c of corridas) {
      const evalRecreo = evaluarContinuidadRecreos(c, bloques);
      corridasPorDia.push({
        dia,
        indices: c,
        duracion: c.length,
        cruzaRecreo: evalRecreo.cruzaRecreo,
        cruceRecreoJustificado: evalRecreo.cruceRecreoJustificado,
        advertenciaRecreo: params.alertarCortePorRecreo ? evalRecreo.advertencia : null
      });
    }
  }

  // Emparejar las corridas actuales con las partes esperadas del formato (ej. [3, 3] o [2, 2, 2])
  const pendientesCopia = [...partesEsperadas];
  const corridasNoEmparejadas = [];

  for (const corrida of corridasPorDia) {
    const idxExacto = pendientesCopia.indexOf(corrida.duracion);
    if (idxExacto !== -1) {
      pendientesCopia.splice(idxExacto, 1);
    } else {
      corridasNoEmparejadas.push(corrida);
    }
  }

  // Detectar si un día tiene múltiples corridas fragmentadas que no corresponden a bloques completos del formato esperado
  const diasConNoEmparejadas = new Map();
  for (const c of corridasNoEmparejadas) {
    diasConNoEmparejadas.set(c.dia, (diasConNoEmparejadas.get(c.dia) || 0) + 1);
  }
  const tieneBloquesSeparadosMismoDia = Array.from(diasConNoEmparejadas.values()).some(
    (cant) => cant > 1
  );

  const formatoActualTexto =
    corridasPorDia.length > 0 ? corridasPorDia.map((c) => c.duracion).join('+') : 'Sin asignar';

  const cumpleFormatoCompleto =
    horasAsignadas === horasSemanales &&
    pendientesCopia.length === 0 &&
    corridasNoEmparejadas.length === 0;

  let proximoTamanoSugerido = 1;
  if (horasPendientes > 0) {
    if (pendientesCopia.length > 0) {
      proximoTamanoSugerido = Math.min(horasPendientes, pendientesCopia[0]);
    } else {
      proximoTamanoSugerido = Math.min(horasPendientes, partesEsperadas[0] || 1);
    }
  }

  let advertenciaFormato = null;
  if (params.alertarFormatoBloques) {
    if (tieneBloquesSeparadosMismoDia) {
      advertenciaFormato = `Tiene horas fragmentadas en un mismo día (${formatoActualTexto}). Formato ${materia.modoExigencia}: ${materia.formatoBloques}.`;
    } else if (horasAsignadas === horasSemanales && !cumpleFormatoCompleto) {
      advertenciaFormato = `Agrupación actual (${formatoActualTexto}) difiere del formato ${materia.modoExigencia} (${materia.formatoBloques}).`;
    }
  }

  return {
    materiaId: materia.id,
    formatoEsperado: materia.formatoBloques,
    modoExigencia: materia.modoExigencia,
    partesEsperadas,
    corridasPorDia,
    formatoActualTexto,
    paquetesPendientes: pendientesCopia,
    proximoTamanoSugerido,
    tieneBloquesSeparadosMismoDia,
    cumpleFormatoCompleto,
    advertenciaFormato
  };
}

/**
 * Calcula el diferencial neto ΔHorasPuente para todos los docentes de una materia en un día dado
 * si se agregan `bloquesNuevosIndices` (y opcionalmente se remueven `bloquesRemovidosDia`).
 */
function calcularDeltaHorasPuentePorAsignacion(
  estado,
  { materiaId, dia, bloquesNuevosIndices = [], bloquesRemovidosDia = [] }
) {
  const materia = estado.materias.find((m) => m.id === materiaId);
  if (!materia) return { deltaTotal: 0, detallePorDocente: [] };

  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));
  const removidosSet = new Set(bloquesRemovidosDia);

  let deltaTotal = 0;
  const detallePorDocente = [];

  for (const docId of materia.docentesIds || []) {
    const doc = docentesMap.get(docId);
    if (!doc) continue;

    const indicesAntes = estado.asignaciones
      .filter((a) => {
        if (a.dia !== dia) return false;
        const m = materiasMap.get(a.materiaId);
        return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(docId);
      })
      .map((a) => a.bloqueIndice);

    const puenteAntes = calcularHorasPuenteDia(indicesAntes).cantidadHorasPuente;

    // Filtrar los removidos (solo de la materia que se mueve) y agregar los nuevos
    const indicesSinRemovidos = indicesAntes.filter((idx) => !removidosSet.has(idx));
    const indicesDespues = Array.from(new Set([...indicesSinRemovidos, ...bloquesNuevosIndices]));
    const puenteDespues = calcularHorasPuenteDia(indicesDespues).cantidadHorasPuente;

    const delta = puenteDespues - puenteAntes;
    deltaTotal += delta;
    detallePorDocente.push({
      docenteId: docId,
      docenteNombre: doc.nombre,
      antes: puenteAntes,
      despues: puenteDespues,
      delta
    });
  }

  return {
    deltaTotal,
    detallePorDocente
  };
}

/**
 * Evalúa en tiempo real un casillero (o paquete contiguo de N bloques) en la Vista por Curso
 * cuando el usuario selecciona o arrastra una materia de la bandeja (o mueve un bloque).
 * Devuelve el estado del semáforo visual (Verde Óptimo, Verde Disponible, Ámbar con Horas Libres/Recreo, o Rojo Bloqueado).
 */
function evaluarSlotEnVistaCurso(
  estado,
  {
    cursoId,
    materiaId,
    dia,
    bloqueIndice,
    cantidadBloques = 1,
    origenMovimiento = null,
    origenBloquesIndices = null
  }
) {
  const materia = estado.materias.find((m) => m.id === materiaId);
  if (!materia) return null;

  const params = obtenerParametrosSistema(estado);
  const bloques = estado.configuracion.bloquesHorarios || [];
  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));

  const cant = Math.max(1, parseInt(cantidadBloques, 10) || 1);
  if (bloqueIndice + cant > bloques.length) {
    return {
      valido: false,
      semaforo: 'FUERA_DE_RANGO',
      indicesObjetivo: [],
      etiquetaCorta: '⛔ Fin de jornada',
      motivo: `Un paquete de ${cant} hs desde ${bloques[bloqueIndice]?.nombre || ''} excede los ${bloques.length} bloques del día.`
    };
  }

  const indicesObjetivo = [];
  for (let i = 0; i < cant; i++) {
    indicesObjetivo.push(bloqueIndice + i);
  }

  const indicesOrigenSet = new Set(
    Array.isArray(origenBloquesIndices) && origenBloquesIndices.length > 0
      ? origenBloquesIndices
      : origenMovimiento && Number.isInteger(origenMovimiento.bloqueIndice)
        ? [origenMovimiento.bloqueIndice]
        : []
  );

  // 1. Verificar si alguno de los bloques destino en el curso ya está ocupado o es Almuerzo (ignorando origen si se está moviendo)
  for (const bIdx of indicesObjetivo) {
    const esMismoOrigen =
      origenMovimiento &&
      origenMovimiento.dia === dia &&
      indicesOrigenSet.has(bIdx);

    if (esMismoOrigen) continue;

    if (esBloqueAlmuerzo(estado, cursoId, dia, bIdx)) {
      return {
        valido: false,
        semaforo: 'BLOQUE_ALMUERZO',
        indicesObjetivo,
        etiquetaCorta: '🍽️ Almuerzo',
        motivo: `🍽️ El ${bloques[bIdx]?.nombre || `Bloque ${bIdx + 1}`} está reservado como espacio de Almuerzo.`
      };
    }

    const asigCurso = estado.asignaciones.find(
      (a) => a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bIdx
    );
    if (asigCurso) {
      const matOcupante = materiasMap.get(asigCurso.materiaId);
      return {
        valido: false,
        semaforo: 'CURSO_OCUPADO',
        indicesObjetivo,
        materiaOcupanteId: asigCurso.materiaId,
        materiaOcupanteNombre: matOcupante ? matOcupante.nombre : asigCurso.materiaId,
        etiquetaCorta: `🔄 Enrocar con ${matOcupante ? matOcupante.codigo || matOcupante.nombre : ''}`,
        motivo: `El bloque ${bloques[bIdx]?.nombre || bIdx + 1} está ocupado por "${matOcupante ? matOcupante.nombre : ''}".`
      };
    }
  }

  // 2. Verificar disponibilidad y choques de TODOS los docentes de la materia en los bloques objetivo
  for (const docId of materia.docentesIds || []) {
    const doc = docentesMap.get(docId);
    if (!doc) continue;

    for (const bIdx of indicesObjetivo) {
      if (params.alertarChoquesDocentes) {
        const asigOtroCurso = estado.asignaciones.find((a) => {
          if (a.dia !== dia || a.bloqueIndice !== bIdx || a.cursoId === cursoId) return false;
          const m = materiasMap.get(a.materiaId);
          return m && Array.isArray(m.docentesIds) && m.docentesIds.includes(docId);
        });

        if (asigOtroCurso) {
          const otroCurso = cursosMap.get(asigOtroCurso.cursoId);
          const otraMat = materiasMap.get(asigOtroCurso.materiaId);
          return {
            valido: false,
            semaforo: 'CHOQUE_DOCENTE',
            indicesObjetivo,
            docenteConflictoNombre: doc.nombre,
            cursoConflictoNombre: otroCurso ? otroCurso.nombre : asigOtroCurso.cursoId,
            etiquetaCorta: `🚨 En ${otroCurso ? otroCurso.nombre : 'otro curso'}`,
            motivo: `🚨 Choque Docente: ${doc.nombre} dicta "${otraMat ? otraMat.nombre : ''}" en ${otroCurso ? otroCurso.nombre : ''} (${dia} · ${bloques[bIdx]?.nombre || ''}).`
          };
        }
      }

      if (params.alertarDisponibilidadDocente) {
        const disp = Boolean(doc.disponibilidad?.[dia]?.[bIdx]);
        if (!disp) {
          return {
            valido: false,
            semaforo: 'DOCENTE_NO_DISPONIBLE',
            indicesObjetivo,
            docenteConflictoNombre: doc.nombre,
            etiquetaCorta: `🚫 ${doc.nombre.replace('Prof. ', '')} No Disp.`,
            motivo: `🚫 Docente No Disponible: ${doc.nombre} no asiste los ${dia} en ${bloques[bIdx]?.nombre || ''}.`
          };
        }
      }
    }
  }

  // 3. Evaluar impacto en Horas Libres y Regla 3.3 de Continuidad / Recreos
  const bloquesRemovidosMismoDia =
    origenMovimiento && origenMovimiento.dia === dia ? Array.from(indicesOrigenSet) : [];

  const impactoPuente = params.alertarHorasLibresDocentes
    ? calcularDeltaHorasPuentePorAsignacion(estado, {
        materiaId: materia.id,
        dia,
        bloquesNuevosIndices: indicesObjetivo,
        bloquesRemovidosDia: bloquesRemovidosMismoDia
      })
    : { deltaTotal: 0, detallePorDocente: [] };

  const indicesActualesDia = estado.asignaciones
    .filter(
      (a) =>
        a.cursoId === cursoId &&
        a.dia === dia &&
        a.materiaId === materia.id &&
        !bloquesRemovidosMismoDia.includes(a.bloqueIndice)
    )
    .map((a) => a.bloqueIndice);

  const indicesSimuladosDia = Array.from(new Set([...indicesActualesDia, ...indicesObjetivo]));
  // Evaluar continuidad de recreos solo sobre la corrida contigua que contiene a indicesObjetivo
  const corridasSimuladas = agruparEnCorridasContiguas(indicesSimuladosDia);
  const corridaObjetivo =
    corridasSimuladas.find((c) => indicesObjetivo.some((idx) => c.includes(idx))) || indicesObjetivo;
  const evalRecreo = params.alertarCortePorRecreo
    ? evaluarContinuidadRecreos(corridaObjetivo, bloques)
    : { advertencia: null, cruzaRecreo: false, cruceRecreoJustificado: true };
  const cruzaRecreoInjustificado = Boolean(evalRecreo.advertencia);

  let semaforo = 'DISPONIBLE_IDEAL';
  let etiquetaCorta =
    cant > 1 ? `✅ + Asignar Bloque (${cant}h)` : '✅ Docente Disponible';

  if (cruzaRecreoInjustificado) {
    semaforo = 'ADVERTENCIA_PUENTE_O_RECREO';
    etiquetaCorta = '☕ Corta por recreo';
  } else if (impactoPuente.deltaTotal < 0) {
    semaforo = 'OPTIMO_CIERRA_PUENTE';
    etiquetaCorta = `✨ Cierra ${Math.abs(impactoPuente.deltaTotal)}h libre`;
  } else if (impactoPuente.deltaTotal > 0) {
    semaforo = 'ADVERTENCIA_PUENTE_O_RECREO';
    etiquetaCorta = `⚠️ Genera +${impactoPuente.deltaTotal}h libre`;
  } else {
    etiquetaCorta = cant > 1 ? `✅ + Bloque ${cant}h (0h libres)` : '✅ Disponible (0h libres)';
  }

  return {
    valido: true,
    semaforo,
    indicesObjetivo,
    cantidadBloques: cant,
    deltaHorasPuente: impactoPuente.deltaTotal,
    detalleDeltaDocentes: impactoPuente.detallePorDocente,
    cruzaRecreoInjustificado,
    advertenciaRecreo: evalRecreo.advertencia,
    etiquetaCorta,
    motivo: evalRecreo.advertencia
      ? `⚠️ ${evalRecreo.advertencia}`
      : impactoPuente.deltaTotal < 0
        ? `✨ Óptimo: Reduce en ${Math.abs(impactoPuente.deltaTotal)} hs las horas libres de ${materia.docentesIds.length > 1 ? 'los docentes' : 'el/la docente'}.`
        : impactoPuente.deltaTotal > 0
          ? `⚠️ Atención: Asignar aquí suma +${impactoPuente.deltaTotal} hs libres en el día ${dia}.`
          : `✅ Sin choques ni nuevas horas libres (Δ = 0).`
  };
}

/**
 * Valida si una materia a cargo de un docente puede asignarse en un (dia, bloqueIndice)
 * (de a 1 hora o en paquete de cantidadBloques) desde la Vista por Docente, verificando:
 * 1. Disponibilidad del Curso (si el curso está libre u ocupado por otra materia en ese bloque).
 * 2. Ocupación simultánea del Docente y de su Pareja Pedagógica en otros cursos.
 * 3. Disponibilidad horaria del Docente y de su Pareja Pedagógica en ese bloque.
 * 4. Cupo de horas semanales de la materia (impidiendo superar horasSemanales salvo permiso explícito o reubicación).
 * 5. Diferencial neto ΔHorasPuente y continuidad de recreos (Regla 3.3).
 */
function validarAsignacionDesdeVistaDocente(
  estado,
  {
    docenteId,
    materiaId,
    dia,
    bloqueIndice,
    cantidadBloques = 1,
    permitirExcesoHoras = false,
    esReubicacion = false
  }
) {
  const materia = estado.materias.find((m) => m.id === materiaId);
  if (!materia) {
    return {
      valido: false,
      codigoError: 'MATERIA_INEXISTENTE',
      cursoDisponible: false,
      motivo: 'La materia seleccionada no existe.'
    };
  }

  const params = obtenerParametrosSistema(estado);
  const bloques = estado.configuracion.bloquesHorarios || [];
  const cantSolicitada = Math.max(1, parseInt(cantidadBloques, 10) || 1);
  if (bloqueIndice + cantSolicitada > bloques.length) {
    return {
      valido: false,
      codigoError: 'FUERA_DE_RANGO',
      cursoDisponible: false,
      motivo: `Un bloque de ${cantSolicitada} hs desde este casillero supera el final del día escolar.`
    };
  }

  const indicesObjetivo = [];
  for (let i = 0; i < cantSolicitada; i++) {
    indicesObjetivo.push(bloqueIndice + i);
  }

  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));
  const curso = cursosMap.get(materia.cursoId);
  const cursoNombre = curso ? curso.nombre : materia.cursoId;
  const bloque = bloques[bloqueIndice];
  const bloqueTexto = bloque ? `${bloque.nombre} (${bloque.inicio}-${bloque.fin})` : `Bloque ${bloqueIndice + 1}`;

  const horasAsignadas = estado.asignaciones.filter((a) => a.materiaId === materia.id).length;
  const horasSemanales = materia.horasSemanales || 0;

  // 1. Verificar qué ocurre en el Curso destino en todos los indicesObjetivo
  for (const bIdx of indicesObjetivo) {
    if (esBloqueAlmuerzo(estado, materia.cursoId, dia, bIdx)) {
      return {
        valido: false,
        codigoError: 'BLOQUE_ALMUERZO',
        cursoDisponible: false,
        mismaMateriaEnSlot: false,
        horasAsignadas,
        horasSemanales,
        motivo: `🍽️ Bloque de Almuerzo: ${cursoNombre} tiene reservado el ${bloques[bIdx]?.nombre || bloqueTexto} (${dia}) para Almuerzo.`
      };
    }

    const asigCursoEnSlot = estado.asignaciones.find(
      (a) => a.cursoId === materia.cursoId && a.dia === dia && a.bloqueIndice === bIdx
    );

    if (asigCursoEnSlot) {
      if (asigCursoEnSlot.materiaId === materia.id) {
        return {
          valido: false,
          codigoError: 'YA_ASIGNADA_EN_SLOT',
          cursoDisponible: false,
          mismaMateriaEnSlot: true,
          horasAsignadas,
          horasSemanales,
          motivo: `"${materia.nombre}" ya se encuentra asignada en ${cursoNombre} (${dia} · ${bloques[bIdx]?.nombre || bIdx + 1}).`
        };
      }

      const otraMat = materiasMap.get(asigCursoEnSlot.materiaId);
      const docentesOtraNombres = (otraMat?.docentesIds || [])
        .map((id) => docentesMap.get(id)?.nombre || id)
        .join(' + ');

      return {
        valido: false,
        codigoError: 'CURSO_OCUPADO',
        cursoDisponible: false,
        mismaMateriaEnSlot: false,
        bloqueConflictoIndice: bIdx,
        materiaOcupanteId: asigCursoEnSlot.materiaId,
        materiaOcupanteNombre: otraMat ? otraMat.nombre : asigCursoEnSlot.materiaId,
        docentesOcupantesNombres: docentesOtraNombres,
        horasAsignadas,
        horasSemanales,
        motivo: `🚫 Curso no disponible: ${cursoNombre} ya tiene clase de "${otraMat ? otraMat.nombre : asigCursoEnSlot.materiaId}" (${docentesOtraNombres}) el ${dia} en ${bloques[bIdx]?.nombre || bloqueTexto}.`
      };
    }
  }

  // 2. Verificar si el docente (o su pareja pedagógica) ya dicta clase en otro curso en alguno de los bloques objetivo
  const docentesDeLaMateria = Array.isArray(materia.docentesIds) ? materia.docentesIds : [docenteId];
  if (params.alertarChoquesDocentes) {
    for (const dId of docentesDeLaMateria) {
      for (const bIdx of indicesObjetivo) {
        const asigSimultanea = estado.asignaciones.find((a) => {
          if (a.dia !== dia || a.bloqueIndice !== bIdx) return false;
          const matAsig = materiasMap.get(a.materiaId);
          return matAsig && Array.isArray(matAsig.docentesIds) && matAsig.docentesIds.includes(dId);
        });

        if (asigSimultanea) {
          const docObj = docentesMap.get(dId);
          const otroCurso = cursosMap.get(asigSimultanea.cursoId);
          const otraMat = materiasMap.get(asigSimultanea.materiaId);
          return {
            valido: false,
            codigoError: 'DOCENTE_OCUPADO_OTRO_CURSO',
            cursoDisponible: true,
            docenteEnConflictoId: dId,
            docenteEnConflictoNombre: docObj ? docObj.nombre : dId,
            esParejaPedagogica: dId !== docenteId,
            cursoOcupadoSimultaneoNombre: otroCurso ? otroCurso.nombre : asigSimultanea.cursoId,
            materiaSimultaneaNombre: otraMat ? otraMat.nombre : asigSimultanea.materiaId,
            horasAsignadas,
            horasSemanales,
            motivo: `🚨 Choque Docente: ${docObj ? docObj.nombre : dId} ya dicta "${otraMat ? otraMat.nombre : ''}" en ${otroCurso ? otroCurso.nombre : asigSimultanea.cursoId} el ${dia} en ${bloques[bIdx]?.nombre || bloqueTexto}.`
          };
        }
      }
    }
  }

  // 3. Verificar disponibilidad horaria declarada del docente (y de su pareja pedagógica)
  if (params.alertarDisponibilidadDocente) {
    for (const dId of docentesDeLaMateria) {
      const docObj = docentesMap.get(dId);
      for (const bIdx of indicesObjetivo) {
        const estaDisp = Boolean(docObj?.disponibilidad?.[dia]?.[bIdx]);
        if (!estaDisp) {
          return {
            valido: false,
            codigoError: 'DOCENTE_NO_DISPONIBLE',
            cursoDisponible: true,
            docenteEnConflictoId: dId,
            docenteEnConflictoNombre: docObj ? docObj.nombre : dId,
            esParejaPedagogica: dId !== docenteId,
            horasAsignadas,
            horasSemanales,
            motivo: `🚫 Docente no disponible: ${docObj ? docObj.nombre : dId} figura como NO DISPONIBLE el ${dia} en ${bloques[bIdx]?.nombre || bloqueTexto}.`
          };
        }
      }
    }
  }

  // 4. Validar cantidad de horas semanales de la materia
  if (
    params.validarCupoHorasEnVistaDocente &&
    !esReubicacion &&
    horasAsignadas + cantSolicitada > horasSemanales &&
    !permitirExcesoHoras
  ) {
    return {
      valido: false,
      codigoError: 'CUPO_HORAS_COMPLETO',
      cursoDisponible: true,
      horasAsignadas,
      horasSemanales,
      motivo: `⚠️ Carga horaria completa: "${materia.nombre}" (${cursoNombre}) tiene ${horasAsignadas}/${horasSemanales} hs asignadas y no admite sumar ${cantSolicitada} hs sin exceder el plan. Libera un bloque actual (✕) o marca "Permitir exceso de horas".`
    };
  }

  // 5. Evaluar impacto en Horas Libres y Continuidad de Recreos en ese día
  const impactoPuente = params.alertarHorasLibresDocentes
    ? calcularDeltaHorasPuentePorAsignacion(estado, {
        materiaId: materia.id,
        dia,
        bloquesNuevosIndices: indicesObjetivo
      })
    : { deltaTotal: 0, detallePorDocente: [] };

  const indicesActualesMatDia = estado.asignaciones
    .filter((a) => a.cursoId === materia.cursoId && a.dia === dia && a.materiaId === materia.id)
    .map((a) => a.bloqueIndice);
  const indicesSimuladosDia = Array.from(new Set([...indicesActualesMatDia, ...indicesObjetivo]));
  const corridasSimuladas = agruparEnCorridasContiguas(indicesSimuladosDia);
  const corridaObjetivo =
    corridasSimuladas.find((c) => indicesObjetivo.some((idx) => c.includes(idx))) || indicesObjetivo;
  const evalRecreo = params.alertarCortePorRecreo
    ? evaluarContinuidadRecreos(corridaObjetivo, estado.configuracion.bloquesHorarios)
    : { advertencia: null, cruzaRecreo: false, cruceRecreoJustificado: true };

  return {
    valido: true,
    codigoError: null,
    cursoDisponible: true,
    indicesObjetivo,
    cantidadBloques: cantSolicitada,
    generaExceso: !esReubicacion && horasAsignadas + cantSolicitada > horasSemanales,
    horasAsignadas,
    horasAsignadasDespues: esReubicacion ? horasAsignadas : horasAsignadas + cantSolicitada,
    horasSemanales,
    deltaHorasPuente: impactoPuente.deltaTotal,
    detalleDeltaDocentes: impactoPuente.detallePorDocente,
    cruzaRecreoInjustificado: Boolean(evalRecreo.advertencia),
    advertenciaRecreo: evalRecreo.advertencia,
    cursoNombre,
    motivo: `✅ ${cursoNombre} Libre: Clic para asignar "${materia.nombre}" (${esReubicacion ? horasAsignadas : horasAsignadas + cantSolicitada}/${horasSemanales} hs).`
  };
}

/**
 * Evalúa si los bloques de una misma materia en un día respetan la Regla 3.3
 * (No-Interrupción por Recreos salvo exceso de capacidad del segmento).
 * Importante: Una materia puede dictarse más de una vez en el mismo día en bloques no contiguos
 * (ej. 2 hs en bloques 1-2 y 2 hs en bloques 8-9) sin emitir advertencia de corte por recreo.
 * Solo se advierte cuando un bloque contiguo queda partido por un recreo innecesariamente.
 */
function evaluarContinuidadRecreos(indicesBloquesDia, bloquesHorarios) {
  if (!indicesBloquesDia || indicesBloquesDia.length <= 1) {
    return {
      esContiguo: true,
      cruzaRecreo: false,
      cruceRecreoJustificado: true,
      cruzaRecreoInjustificado: false,
      indicesEnConflicto: [],
      advertencia: null
    };
  }

  const corridas = agruparEnCorridasContiguas(indicesBloquesDia);
  const esContiguo = corridas.length <= 1;

  let algunCruceRecreo = false;
  let todosCrucesJustificados = true;
  let segmentoInicialReportado = null;
  let capacidadSegmentoReportada = null;
  let duracionBloqueReportada = 0;
  const indicesEnConflicto = [];
  const advertenciasCorridas = [];

  for (const corrida of corridas) {
    if (corrida.length <= 1) continue;

    const bloquesObjs = corrida.map((idx) => bloquesHorarios[idx]).filter(Boolean);
    if (bloquesObjs.length <= 1) continue;

    const segmentosUsados = Array.from(new Set(bloquesObjs.map((b) => b.segmento)));
    const cruza = segmentosUsados.length > 1;

    if (cruza) {
      algunCruceRecreo = true;
      const duracionCorrida = corrida.length;
      const segInicial = bloquesObjs[0].segmento;
      const capInicial = bloquesObjs[0].capacidadSegmento || 2;
      const justificado = duracionCorrida > capInicial;

      if (segmentoInicialReportado === null) {
        segmentoInicialReportado = segInicial;
        capacidadSegmentoReportada = capInicial;
        duracionBloqueReportada = duracionCorrida;
      }

      if (!justificado) {
        todosCrucesJustificados = false;
        indicesEnConflicto.push(...corrida);
        segmentoInicialReportado = segInicial;
        capacidadSegmentoReportada = capInicial;
        duracionBloqueReportada = duracionCorrida;
        advertenciasCorridas.push(
          `Bloque de ${duracionCorrida} hs dividido por recreo innecesariamente (Segmento ${segInicial} tiene capacidad de ${capInicial} hs).`
        );
      }
    }
  }

  if (!algunCruceRecreo) {
    return {
      esContiguo,
      cruzaRecreo: false,
      cruceRecreoJustificado: true,
      cruzaRecreoInjustificado: false,
      indicesEnConflicto: [],
      advertencia: null
    };
  }

  return {
    esContiguo,
    cruzaRecreo: true,
    cruceRecreoJustificado: todosCrucesJustificados,
    cruzaRecreoInjustificado: !todosCrucesJustificados,
    segmentoInicial: segmentoInicialReportado,
    capacidadSegmentoInicial: capacidadSegmentoReportada,
    duracionBloqueDiario: duracionBloqueReportada,
    indicesEnConflicto,
    advertencia: advertenciasCorridas.length > 0 ? advertenciasCorridas.join(' ') : null
  };
}

/**
 * Audita todo el horario buscando conflictos duros (choques docentes, indisponibilidad)
 * y advertencias blandas (horas libres, cruces de recreo, excesos horarios).
 */
function auditarEstadoHorario(estado) {
  const params = obtenerParametrosSistema(estado);
  const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
  const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));
  const cursosMap = new Map(estado.cursos.map((c) => [c.id, c]));
  const bloques = estado.configuracion.bloquesHorarios;

  const choquesDocentes = [];
  const violacionesDisponibilidad = [];
  const advertenciasRecreos = [];

  // 1. Verificar choques de docentes en el mismo (dia, bloqueIndice) y disponibilidad
  const ocupacionDocenteSlot = new Map(); // key: `${docenteId}|${dia}|${bloqueIndice}` -> item[]

  for (const asig of estado.asignaciones) {
    const materia = materiasMap.get(asig.materiaId);
    if (!materia) continue;
    const bloqueObj = bloques[asig.bloqueIndice];

    for (const docId of materia.docentesIds) {
      const doc = docentesMap.get(docId);
      if (!doc) continue;

      const cursoNombre = cursosMap.get(asig.cursoId)?.nombre || asig.cursoId;

      // Verificar disponibilidad
      if (params.alertarDisponibilidadDocente) {
        const dispDia = doc.disponibilidad && doc.disponibilidad[asig.dia];
        const estaDisponible = dispDia ? Boolean(dispDia[asig.bloqueIndice]) : false;
        if (!estaDisponible) {
          violacionesDisponibilidad.push({
            docenteId: doc.id,
            docenteNombre: doc.nombre,
            cursoId: asig.cursoId,
            cursoNombre,
            materiaId: materia.id,
            materiaNombre: materia.nombre,
            dia: asig.dia,
            bloqueIndice: asig.bloqueIndice,
            bloqueNombre: bloqueObj ? bloqueObj.nombre : `Bloque ${asig.bloqueIndice + 1}`,
            horario: bloqueObj ? `${bloqueObj.inicio} - ${bloqueObj.fin}` : '',
            explicacion: `${doc.nombre} figura como NO DISPONIBLE los ${asig.dia} en ${bloqueObj ? bloqueObj.nombre : ''} (${bloqueObj ? `${bloqueObj.inicio}-${bloqueObj.fin}` : ''}), pero tiene asignada "${materia.nombre}" en ${cursoNombre}.`
          });
        }
      }

      // Registrar en mapa de choques
      if (params.alertarChoquesDocentes) {
        const key = `${docId}|${asig.dia}|${asig.bloqueIndice}`;
        if (!ocupacionDocenteSlot.has(key)) {
          ocupacionDocenteSlot.set(key, []);
        }
        ocupacionDocenteSlot.get(key).push({
          asignacion: asig,
          cursoId: asig.cursoId,
          cursoNombre,
          materiaId: materia.id,
          materiaNombre: materia.nombre,
          docenteId: doc.id,
          docenteNombre: doc.nombre
        });
      }
    }
  }

  if (params.alertarChoquesDocentes) {
    for (const [key, lista] of ocupacionDocenteSlot.entries()) {
      if (lista.length > 1) {
        const [docId, dia, bloqueIdxStr] = key.split('|');
        const bloqueIdx = parseInt(bloqueIdxStr, 10);
        const bloqueObj = bloques[bloqueIdx];
        const conflictosTexto = lista.map((x) => `${x.cursoNombre} (${x.materiaNombre})`);
        choquesDocentes.push({
          docenteId: docId,
          docenteNombre: lista[0].docenteNombre,
          dia,
          bloqueIndice: bloqueIdx,
          bloqueNombre: bloqueObj ? bloqueObj.nombre : `Bloque ${bloqueIdx + 1}`,
          horario: bloqueObj ? `${bloqueObj.inicio} - ${bloqueObj.fin}` : '',
          cursosIds: lista.map((x) => x.cursoId),
          itemsConflicto: lista,
          conflictos: conflictosTexto,
          explicacion: `${lista[0].docenteNombre} está asignado/a al mismo tiempo el día ${dia} en ${bloqueObj ? `${bloqueObj.nombre} (${bloqueObj.inicio}-${bloqueObj.fin})` : `Bloque ${bloqueIdx + 1}`} en: ${conflictosTexto.join(' ⚡ ')}.`
        });
      }
    }
  }

  // 2. Verificar continuidad de recreos por curso, día y materia
  if (params.alertarCortePorRecreo) {
    for (const curso of estado.cursos) {
      for (const dia of estado.configuracion.diasHabiles) {
        const asigCursoDia = estado.asignaciones.filter(
          (a) => a.cursoId === curso.id && a.dia === dia
        );
        const porMateria = new Map();
        for (const a of asigCursoDia) {
          if (!porMateria.has(a.materiaId)) porMateria.set(a.materiaId, []);
          porMateria.get(a.materiaId).push(a.bloqueIndice);
        }

        for (const [materiaId, indices] of porMateria.entries()) {
          const evalRecreo = evaluarContinuidadRecreos(indices, bloques);
          if (evalRecreo.advertencia) {
            const mat = materiasMap.get(materiaId);
            const indicesMostrar =
              evalRecreo.indicesEnConflicto && evalRecreo.indicesEnConflicto.length > 0
                ? evalRecreo.indicesEnConflicto
                : indices;
            const bloquesNombres = [...indicesMostrar]
              .sort((a, b) => a - b)
              .map((i) => bloques[i]?.nombre || `Bloque ${i + 1}`)
              .join(', ');
            advertenciasRecreos.push({
              cursoId: curso.id,
              cursoNombre: curso.nombre,
              materiaId,
              materiaNombre: mat ? mat.nombre : materiaId,
              modoExigencia: mat ? mat.modoExigencia : 'OBLIGATORIO',
              dia,
              indices: indicesMostrar,
              bloquesNombres,
              detalle: evalRecreo.advertencia
            });
          }
        }
      }
    }
  }

  // 3. Resumen de carga horaria y horas libres globales
  const totalHorasRequeridas = estado.materias.reduce((acc, m) => acc + (m.horasSemanales || 0), 0);
  const totalHorasAsignadas = estado.asignaciones.length;
  const porcentajeCompletitud =
    totalHorasRequeridas > 0 ? Math.round((totalHorasAsignadas / totalHorasRequeridas) * 100) : 0;

  const metricasDocentes = estado.docentes.map((d) => calcularMetricasDocente(estado, d.id));
  const totalHorasPuenteEscuela = params.alertarHorasLibresDocentes
    ? metricasDocentes.reduce((acc, md) => acc + (md ? md.totalHorasPuente : 0), 0)
    : 0;

  const docentesConHorasPuente = params.alertarHorasLibresDocentes
    ? metricasDocentes
        .filter((md) => md && md.totalHorasPuente > 0)
        .sort((a, b) => b.totalHorasPuente - a.totalHorasPuente)
    : [];

  // 4. Progreso por materia y por curso (incluyendo análisis de Formato de Bloques 2+2, 3+3, etc.)
  const progresoMaterias = estado.materias.map((m) => {
    const asignadas = estado.asignaciones.filter((a) => a.materiaId === m.id).length;
    const pendientes = Math.max(0, m.horasSemanales - asignadas);
    const exceso = Math.max(0, asignadas - m.horasSemanales);
    const docentesNombres = (m.docentesIds || [])
      .map((id) => docentesMap.get(id)?.nombre || id)
      .join(' + ');
    const analisisFormato = analizarFormatoBloquesMateria(estado, m.id);
    return {
      ...m,
      cursoNombre: cursosMap.get(m.cursoId)?.nombre || m.cursoId,
      horasAsignadas: asignadas,
      horasPendientes: pendientes,
      horasExceso: exceso,
      completada: asignadas === m.horasSemanales,
      excedida: params.alertarExcesoHoras ? asignadas > m.horasSemanales : false,
      docentesNombres,
      analisisFormato
    };
  });

  const materiasExcedidas = params.alertarExcesoHoras
    ? progresoMaterias.filter((m) => m.excedida)
    : [];
  const advertenciasFormatoBloques = params.alertarFormatoBloques
    ? progresoMaterias
        .filter((m) => m.analisisFormato && m.analisisFormato.advertenciaFormato)
        .map((m) => ({
          cursoId: m.cursoId,
          cursoNombre: m.cursoNombre,
          materiaId: m.id,
          materiaNombre: m.nombre,
          modoExigencia: m.modoExigencia,
          formatoEsperado: m.formatoBloques,
          formatoActual: m.analisisFormato.formatoActualTexto,
          detalle: m.analisisFormato.advertenciaFormato
        }))
    : [];

  return {
    totalHorasRequeridas,
    totalHorasAsignadas,
    horasPendientesTotales: Math.max(0, totalHorasRequeridas - totalHorasAsignadas),
    porcentajeCompletitud,
    totalHorasPuenteEscuela,
    choquesDocentes,
    violacionesDisponibilidad,
    advertenciasRecreos,
    advertenciasFormatoBloques,
    materiasExcedidas,
    docentesConHorasPuente,
    metricasDocentes,
    progresoMaterias,
    parametrosSistema: params
  };
}

module.exports = {
  agruparEnCorridasContiguas,
  calcularHorasPuenteDia,
  calcularMetricasDocente,
  analizarFormatoBloquesMateria,
  calcularDeltaHorasPuentePorAsignacion,
  evaluarSlotEnVistaCurso,
  validarAsignacionDesdeVistaDocente,
  evaluarContinuidadRecreos,
  auditarEstadoHorario
};
