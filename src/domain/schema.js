/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo: Modelo de Dominio, Esquema y Plantilla Preconfigurada (Multi-Colegio)
 */

const DIAS_HABILES_DEFAULT = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

/**
 * Plantilla oficial por defecto:
 * 12 Horas Cátedra de 40 min (07:50 a 16:40) divididas en 5 Segmentos Continuos y 4 Recreos.
 */
const BLOQUES_HORARIOS_DEFAULT = [
  {
    id: 'b1',
    indice: 0,
    numero: 1,
    nombre: 'Bloque 1',
    inicio: '07:50',
    fin: '08:30',
    duracionMin: 40,
    segmento: 1,
    capacidadSegmento: 2,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b2',
    indice: 1,
    numero: 2,
    nombre: 'Bloque 2',
    inicio: '08:30',
    fin: '09:10',
    duracionMin: 40,
    segmento: 1,
    capacidadSegmento: 2,
    recreoPosterior: {
      duracionMin: 10,
      inicio: '09:10',
      fin: '09:20',
      etiqueta: 'Recreo 10 min (09:10 - 09:20)'
    },
    finDeJornada: false
  },
  {
    id: 'b3',
    indice: 2,
    numero: 3,
    nombre: 'Bloque 3',
    inicio: '09:20',
    fin: '10:00',
    duracionMin: 40,
    segmento: 2,
    capacidadSegmento: 2,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b4',
    indice: 3,
    numero: 4,
    nombre: 'Bloque 4',
    inicio: '10:00',
    fin: '10:40',
    duracionMin: 40,
    segmento: 2,
    capacidadSegmento: 2,
    recreoPosterior: {
      duracionMin: 15,
      inicio: '10:40',
      fin: '10:55',
      etiqueta: 'Recreo 15 min (10:40 - 10:55)'
    },
    finDeJornada: false
  },
  {
    id: 'b5',
    indice: 4,
    numero: 5,
    nombre: 'Bloque 5',
    inicio: '10:55',
    fin: '11:35',
    duracionMin: 40,
    segmento: 3,
    capacidadSegmento: 3,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b6',
    indice: 5,
    numero: 6,
    nombre: 'Bloque 6',
    inicio: '11:35',
    fin: '12:15',
    duracionMin: 40,
    segmento: 3,
    capacidadSegmento: 3,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b7',
    indice: 6,
    numero: 7,
    nombre: 'Bloque 7',
    inicio: '12:15',
    fin: '12:55',
    duracionMin: 40,
    segmento: 3,
    capacidadSegmento: 3,
    recreoPosterior: {
      duracionMin: 15,
      inicio: '12:55',
      fin: '13:10',
      etiqueta: 'Corte/Recreo 15 min (12:55 - 13:10)'
    },
    finDeJornada: false
  },
  {
    id: 'b8',
    indice: 7,
    numero: 8,
    nombre: 'Bloque 8',
    inicio: '13:10',
    fin: '13:50',
    duracionMin: 40,
    segmento: 4,
    capacidadSegmento: 2,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b9',
    indice: 8,
    numero: 9,
    nombre: 'Bloque 9',
    inicio: '13:50',
    fin: '14:30',
    duracionMin: 40,
    segmento: 4,
    capacidadSegmento: 2,
    recreoPosterior: {
      duracionMin: 10,
      inicio: '14:30',
      fin: '14:40',
      etiqueta: 'Recreo 10 min (14:30 - 14:40)'
    },
    finDeJornada: false
  },
  {
    id: 'b10',
    indice: 9,
    numero: 10,
    nombre: 'Bloque 10',
    inicio: '14:40',
    fin: '15:20',
    duracionMin: 40,
    segmento: 5,
    capacidadSegmento: 3,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b11',
    indice: 10,
    numero: 11,
    nombre: 'Bloque 11',
    inicio: '15:20',
    fin: '16:00',
    duracionMin: 40,
    segmento: 5,
    capacidadSegmento: 3,
    recreoPosterior: null,
    finDeJornada: false
  },
  {
    id: 'b12',
    indice: 11,
    numero: 12,
    nombre: 'Bloque 12',
    inicio: '16:00',
    fin: '16:40',
    duracionMin: 40,
    segmento: 5,
    capacidadSegmento: 3,
    recreoPosterior: null,
    finDeJornada: true
  }
];

const CURSOS_DEFAULT = [
  { id: 'c1', nombre: '1° Año', division: 'A', nivel: 1, aula: 'Aula 101', activo: true },
  { id: 'c2', nombre: '2° Año', division: 'A', nivel: 2, aula: 'Aula 102', activo: true },
  { id: 'c3', nombre: '3° Año', division: 'A', nivel: 3, aula: 'Aula 201', activo: true },
  { id: 'c4', nombre: '4° Año', division: 'A', nivel: 4, aula: 'Aula 202', activo: true },
  { id: 'c5', nombre: '5° Año', division: 'A', nivel: 5, aula: 'Aula 203', activo: true }
];

const MODOS_EXIGENCIA = {
  OBLIGATORIO: 'OBLIGATORIO',
  IDEAL: 'IDEAL'
};

const PARAMETROS_SISTEMA_DEFAULT = {
  alertarChoquesDocentes: true,
  alertarDisponibilidadDocente: true,
  alertarCortePorRecreo: true,
  alertarExcesoHoras: true,
  alertarHorasLibresDocentes: true,
  alertarFormatoBloques: true,
  validarCupoHorasEnVistaDocente: true,
  confirmarMovimientosConModal: true,
  mostrarNotificacionesToast: true,
  habilitarBloquesAlmuerzo: true,
  temaVisual: 'OSCURO'
};

function obtenerParametrosSistema(estado) {
  return {
    ...PARAMETROS_SISTEMA_DEFAULT,
    ...(estado && estado.configuracion && estado.configuracion.parametrosSistema
      ? estado.configuracion.parametrosSistema
      : {})
  };
}

function esBloqueAlmuerzo(estado, cursoId, dia, bloqueIndice) {
  const params = obtenerParametrosSistema(estado);
  if (params.habilitarBloquesAlmuerzo === false) return false;
  if (!estado || !Array.isArray(estado.almuerzos)) return false;
  return estado.almuerzos.some(
    (a) => a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === bloqueIndice
  );
}

/**
 * Recalcula dinámicamente los segmentos continuos y sus capacidades a partir de la lista de bloques
 * para mantener la parametrización multi-colegio consistente si el usuario agrega/quita recreos.
 */
function recalcularSegmentos(bloques) {
  const copia = bloques.map((b, idx) => ({ ...b, indice: idx, numero: idx + 1 }));
  let segmentoActual = 1;
  const bloquesPorSegmento = {};

  for (const b of copia) {
    b.segmento = segmentoActual;
    bloquesPorSegmento[segmentoActual] = (bloquesPorSegmento[segmentoActual] || 0) + 1;
    if (b.recreoPosterior) {
      segmentoActual++;
    }
  }

  for (const b of copia) {
    b.capacidadSegmento = bloquesPorSegmento[b.segmento] || 1;
    b.finDeJornada = b.indice === copia.length - 1;
  }

  return copia;
}

/**
 * Obtiene el resumen de los segmentos continuos definidos en una configuración de bloques
 */
function obtenerResumenSegmentos(bloques) {
  const mapa = new Map();
  for (const b of bloques) {
    if (!mapa.has(b.segmento)) {
      mapa.set(b.segmento, {
        segmento: b.segmento,
        capacidad: 0,
        bloques: [],
        inicio: b.inicio,
        fin: b.fin,
        recreoPosterior: null
      });
    }
    const seg = mapa.get(b.segmento);
    seg.capacidad++;
    seg.bloques.push(b.numero);
    seg.fin = b.fin;
    if (b.recreoPosterior) {
      seg.recreoPosterior = b.recreoPosterior;
    }
  }
  return Array.from(mapa.values());
}

/**
 * Parsea un formato de bloques (ej. "2+2", "2+1", "3") a un array numérico [2, 2]
 */
function parsearFormatoBloques(formatoStr) {
  if (!formatoStr || typeof formatoStr !== 'string') return [];
  return formatoStr
    .split('+')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

/**
 * Valida la integridad estructural de un estado completo de SGH
 */
function validarEstadoSGH(estado) {
  const errores = [];
  if (!estado || typeof estado !== 'object') {
    return { valido: false, errores: ['El estado raíz no es un objeto válido.'] };
  }
  if (!estado.configuracion || !Array.isArray(estado.configuracion.diasHabiles)) {
    errores.push('Falta configuración de días hábiles.');
  }
  if (!estado.configuracion || !Array.isArray(estado.configuracion.bloquesHorarios)) {
    errores.push('Falta grilla de bloques horarios.');
  }
  if (!Array.isArray(estado.cursos)) {
    errores.push('La colección de cursos no es un array.');
  }
  if (!Array.isArray(estado.docentes)) {
    errores.push('La colección de docentes no es un array.');
  }
  if (!Array.isArray(estado.materias)) {
    errores.push('La colección de materias no es un array.');
  }
  if (!Array.isArray(estado.asignaciones)) {
    errores.push('La colección de asignaciones horarias no es un array.');
  }

  return {
    valido: errores.length === 0,
    errores
  };
}

/**
 * Normaliza la matriz de disponibilidad de todos los docentes cuando cambian los días hábiles o la cantidad de bloques
 */
function normalizarDisponibilidadDocentes(docentes, diasHabiles, cantidadBloques) {
  for (const doc of docentes) {
    if (!doc.disponibilidad || typeof doc.disponibilidad !== 'object') {
      doc.disponibilidad = {};
    }
    for (const dia of diasHabiles) {
      const actual = Array.isArray(doc.disponibilidad[dia]) ? doc.disponibilidad[dia] : [];
      const nuevo = [];
      for (let i = 0; i < cantidadBloques; i++) {
        nuevo.push(i < actual.length ? Boolean(actual[i]) : true);
      }
      doc.disponibilidad[dia] = nuevo;
    }
  }
}

module.exports = {
  DIAS_HABILES_DEFAULT,
  BLOQUES_HORARIOS_DEFAULT,
  CURSOS_DEFAULT,
  MODOS_EXIGENCIA,
  PARAMETROS_SISTEMA_DEFAULT,
  obtenerParametrosSistema,
  esBloqueAlmuerzo,
  recalcularSegmentos,
  obtenerResumenSegmentos,
  parsearFormatoBloques,
  normalizarDisponibilidadDocentes,
  validarEstadoSGH
};
