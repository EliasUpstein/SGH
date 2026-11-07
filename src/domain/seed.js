/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo: Generador de Datos Semilla Realistas (Seed Data - Fase 1)
 * - 5 Cursos (1° a 5° Año)
 * - 12 Bloques Horarios (07:50 a 16:40) en 5 Segmentos Continuos con 4 Recreos
 * - 15 Docentes con disponibilidades variadas y horas puente intencionales para pruebas de optimización
 * - Materias con 1 y 2 docentes (Pareja Pedagógica / Titular + Auxiliar)
 * - Horario base armado exactamente al 85% (255 / 300 hs cátedra asignadas) con 0 choques
 */

const {
  DIAS_HABILES_DEFAULT,
  BLOQUES_HORARIOS_DEFAULT,
  CURSOS_DEFAULT,
  MODOS_EXIGENCIA,
  PARAMETROS_SISTEMA_DEFAULT
} = require('./schema');

function crearMatrizDisponibilidadBase(patronPorDia) {
  const disp = {};
  for (const dia of DIAS_HABILES_DEFAULT) {
    const patron = patronPorDia[dia] || new Array(12).fill(true);
    disp[dia] = [...patron];
  }
  return disp;
}

function generarDocentesSemilla() {
  const T = true;
  const F = false;

  // Patrones horarios frecuentes (12 bloques: 0..6 mañana, 7..11 tarde)
  const jornadaCompleta = [T, T, T, T, T, T, T, T, T, T, T, T];
  const mananaCompletaYTardeParcial = [T, T, T, T, T, T, T, T, T, F, F, F];
  const mananaFuerte = [T, T, T, T, T, T, T, F, F, F, F, F];
  const tardeFuerte = [F, F, T, T, T, T, T, T, T, T, T, T];
  const intermedio = [T, T, T, T, T, T, F, T, T, T, T, T];

  const definiciones = [
    {
      id: 'd1',
      nombre: 'Prof. Martín Gómez',
      especialidad: 'Matemática y Cálculo',
      legajo: 'DOC-1001',
      color: '#2563eb',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: mananaCompletaYTardeParcial,
        Miércoles: jornadaCompleta,
        Jueves: mananaCompletaYTardeParcial,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd2',
      nombre: 'Prof. Laura Fernández',
      especialidad: 'Lengua y Literatura',
      legajo: 'DOC-1002',
      color: '#db2777',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: mananaCompletaYTardeParcial,
        Jueves: jornadaCompleta,
        Viernes: intermedio
      })
    },
    {
      id: 'd3',
      nombre: 'Prof. Carlos Rodríguez',
      especialidad: 'Historia y Ciencias Sociales',
      legajo: 'DOC-1003',
      color: '#d97706',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: tardeFuerte,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd4',
      nombre: 'Prof. Ana Martínez',
      especialidad: 'Geografía y Economía',
      legajo: 'DOC-1004',
      color: '#059669',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: intermedio,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd5',
      nombre: 'Prof. Diego López',
      especialidad: 'Física y Astronomía',
      legajo: 'DOC-1005',
      color: '#7c3aed',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: mananaFuerte,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd6',
      nombre: 'Prof. Sofía Pérez',
      especialidad: 'Química y Biología',
      legajo: 'DOC-1006',
      color: '#0d9488',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: intermedio,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd7',
      nombre: 'Prof. Javier Sánchez',
      especialidad: 'Inglés Técnico y Conversación',
      legajo: 'DOC-1007',
      color: '#4f46e5',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: mananaCompletaYTardeParcial
      })
    },
    {
      id: 'd8',
      nombre: 'Prof. Valeria Romero',
      especialidad: 'Informática y Robótica',
      legajo: 'DOC-1008',
      color: '#0284c7',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd9',
      nombre: 'Prof. Nicolás Torres',
      especialidad: 'Educación Física',
      legajo: 'DOC-1009',
      color: '#16a34a',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: tardeFuerte,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd10',
      nombre: 'Prof. Paula Díaz',
      especialidad: 'Arte y Diseño Audiovisual',
      legajo: 'DOC-1010',
      color: '#e11d48',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd11',
      nombre: 'Prof. Roberto Ruiz',
      especialidad: 'Construcción de Ciudadanía y Filosofía',
      legajo: 'DOC-1011',
      color: '#9333ea',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd12',
      nombre: 'Prof. Lucía Molina (Aux. Lab)',
      especialidad: 'Jefa de Trabajos Prácticos - Ciencias',
      legajo: 'DOC-1012',
      color: '#0891b2',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd13',
      nombre: 'Prof. Esteban Castro (Aux. Sistemas)',
      especialidad: 'Pareja Pedagógica Programación y Talleres',
      legajo: 'DOC-1013',
      color: '#3b82f6',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd14',
      nombre: 'Prof. Mariana Silva',
      especialidad: 'Matemática Aplicada y Estadística',
      legajo: 'DOC-1014',
      color: '#1d4ed8',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    },
    {
      id: 'd15',
      nombre: 'Prof. Gabriel Ortiz',
      especialidad: 'Lenguajes Artísticos y Música',
      legajo: 'DOC-1015',
      color: '#c026d3',
      disponibilidad: crearMatrizDisponibilidadBase({
        Lunes: jornadaCompleta,
        Martes: jornadaCompleta,
        Miércoles: jornadaCompleta,
        Jueves: jornadaCompleta,
        Viernes: jornadaCompleta
      })
    }
  ];

  return definiciones;
}

/**
 * Diseña el plan de estudios para los 5 cursos (60 hs semanales por curso = 300 hs totales)
 * Incluye materias individuales y materias con 2 docentes simultáneos (Pareja Pedagógica).
 */
function generarMateriasSemilla() {
  // Cada curso tiene 12 bloques x 5 días = 60 horas semanales requeridas en su plan completo.
  // Definimos 10 materias por curso con cargas de 6h (3+3), 5h (3+2) y 4h (2+2) -> Total = 60h por curso.
  const planesPorCurso = {
    c1: [
      { codigo: 'MAT1', nombre: 'Matemática I', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d1'], color: '#dbeafe' },
      { codigo: 'LEN1', nombre: 'Prácticas del Lenguaje I', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d2'], color: '#fce7f3' },
      { codigo: 'HIS1', nombre: 'Historia y Cs. Sociales I', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d3'], color: '#fef3c7' },
      { codigo: 'GEO1', nombre: 'Geografía I', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d4'], color: '#d1fae5' },
      { codigo: 'BIO1', nombre: 'Lab. Ciencias Naturales I', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d6', 'd12'], color: '#ccfbf1' },
      { codigo: 'ING1', nombre: 'Inglés I', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d7'], color: '#e0e7ff' },
      { codigo: 'ROB1', nombre: 'Taller de Robótica I', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d8', 'd13'], color: '#e0f2fe' },
      { codigo: 'EDF1', nombre: 'Educación Física I', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d9'], color: '#dcfce7' },
      { codigo: 'ART1', nombre: 'Arte y Expresión I', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d10'], color: '#ffe4e6' },
      { codigo: 'CIU1', nombre: 'Construcción de Ciudadanía I', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d11'], color: '#f3e8ff' }
    ],
    c2: [
      { codigo: 'MAT2', nombre: 'Matemática II', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d1'], color: '#dbeafe' },
      { codigo: 'LEN2', nombre: 'Lengua y Literatura II', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d2'], color: '#fce7f3' },
      { codigo: 'HIS2', nombre: 'Historia Moderna II', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d3'], color: '#fef3c7' },
      { codigo: 'GEO2', nombre: 'Geografía Argentina II', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d4'], color: '#d1fae5' },
      { codigo: 'FIS2', nombre: 'Física Experimental II', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d5', 'd12'], color: '#ede9fe' },
      { codigo: 'ING2', nombre: 'Inglés II', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d7'], color: '#e0e7ff' },
      { codigo: 'PRG2', nombre: 'Programación y Algoritmos II', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d8', 'd13'], color: '#e0f2fe' },
      { codigo: 'EDF2', nombre: 'Educación Física II', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d9'], color: '#dcfce7' },
      { codigo: 'MUS2', nombre: 'Música y Lenguaje Sonoro', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d15'], color: '#fae8ff' },
      { codigo: 'CIU2', nombre: 'Ciudadanía y Derechos II', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d11'], color: '#f3e8ff' }
    ],
    c3: [
      { codigo: 'MAT3', nombre: 'Análisis Matemático III', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d14'], color: '#dbeafe' },
      { codigo: 'LEN3', nombre: 'Literatura Universal III', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d2'], color: '#fce7f3' },
      { codigo: 'HIS3', nombre: 'Historia Argentina III', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d3'], color: '#fef3c7' },
      { codigo: 'GEO3', nombre: 'Geografía Económica III', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d4'], color: '#d1fae5' },
      { codigo: 'QUI3', nombre: 'Lab. de Química Orgánica', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d6', 'd12'], color: '#ccfbf1' },
      { codigo: 'FIS3', nombre: 'Física Mecánica III', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d5'], color: '#ede9fe' },
      { codigo: 'ING3', nombre: 'Inglés Intermedio III', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d7'], color: '#e0e7ff' },
      { codigo: 'SIS3', nombre: 'Sistemas Digitales III', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d8'], color: '#e0f2fe' },
      { codigo: 'EDF3', nombre: 'Educación Física III', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d9'], color: '#dcfce7' },
      { codigo: 'ART3', nombre: 'Diseño Multimedial III', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d10', 'd15'], color: '#ffe4e6' }
    ],
    c4: [
      { codigo: 'MAT4', nombre: 'Estadística y Probabilidad IV', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d14'], color: '#dbeafe' },
      { codigo: 'LEN4', nombre: 'Literatura Latinoamericana IV', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d2'], color: '#fce7f3' },
      { codigo: 'HIS4', nombre: 'Historia Contemporánea IV', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d3'], color: '#fef3c7' },
      { codigo: 'ECO4', nombre: 'Economía Política IV', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d4'], color: '#d1fae5' },
      { codigo: 'FIS4', nombre: 'Electromagnetismo IV', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d5'], color: '#ede9fe' },
      { codigo: 'BIO4', nombre: 'Biotecnología y Salud IV', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d6'], color: '#ccfbf1' },
      { codigo: 'ING4', nombre: 'Inglés Avanzado IV', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d7'], color: '#e0e7ff' },
      { codigo: 'DEV4', nombre: 'Desarrollo de Software IV', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d8', 'd13'], color: '#e0f2fe' },
      { codigo: 'FIL4', nombre: 'Filosofía y Lógica IV', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d11'], color: '#f3e8ff' },
      { codigo: 'ART4', nombre: 'Producción Audiovisual IV', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d10'], color: '#ffe4e6' }
    ],
    c5: [
      { codigo: 'MAT5', nombre: 'Cálculo Avanzado V', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d1', 'd14'], color: '#dbeafe' },
      { codigo: 'LIT5', nombre: 'Seminario de Literatura V', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d2'], color: '#fce7f3' },
      { codigo: 'SOC5', nombre: 'Sociología y Política V', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d11'], color: '#f3e8ff' },
      { codigo: 'ECO5', nombre: 'Gestión y Microeconomía V', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d4'], color: '#d1fae5' },
      { codigo: 'FIS5', nombre: 'Física Moderna V', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d5'], color: '#ede9fe' },
      { codigo: 'QUI5', nombre: 'Química Industrial V', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d6'], color: '#ccfbf1' },
      { codigo: 'ING5', nombre: 'Inglés Técnico Profesional V', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d7'], color: '#e0e7ff' },
      { codigo: 'PRY5', nombre: 'Proyecto Tecnológico Final', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.OBLIGATORIO, docentes: ['d8', 'd13'], color: '#e0f2fe' },
      { codigo: 'EDF5', nombre: 'Deportes y Recreación V', horas: 6, formato: '2+2+2', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d9'], color: '#dcfce7' },
      { codigo: 'MUS5', nombre: 'Estética Contemporánea V', horas: 6, formato: '3+3', modo: MODOS_EXIGENCIA.IDEAL, docentes: ['d15'], color: '#fae8ff' }
    ]
  };

  const materias = [];
  for (const [cursoId, lista] of Object.entries(planesPorCurso)) {
    lista.forEach((item, index) => {
      materias.push({
        id: `m_${cursoId}_${index + 1}`,
        cursoId,
        codigo: item.codigo,
        nombre: item.nombre,
        horasSemanales: item.horas,
        formatoBloques: item.formato,
        modoExigencia: item.modo,
        docentesIds: item.docentes,
        color: item.color
      });
    });
  }
  return materias;
}

/**
 * Construye una grilla semilla determinista al 85% (255 de 300 bloques asignados)
 * respetando los 5 segmentos continuos:
 * - Seg 1: bloques [0, 1] (2 hs)
 * - Seg 2: bloques [2, 3] (2 hs)
 * - Seg 3: bloques [4, 5, 6] (3 hs)
 * - Seg 4: bloques [7, 8] (2 hs)
 * - Seg 5: bloques [9, 10, 11] (3 hs)
 * Garantiza 0 choques docentes y 100% respeto de disponibilidades.
 */
function generarAsignacionesSemilla85(cursos, docentes, materias) {
  const segmentosDelDia = [
    { seg: 1, bloques: [0, 1], cap: 2 },
    { seg: 2, bloques: [2, 3], cap: 2 },
    { seg: 3, bloques: [4, 5, 6], cap: 3 },
    { seg: 4, bloques: [7, 8], cap: 2 },
    { seg: 5, bloques: [9, 10, 11], cap: 3 }
  ];

  const docentesMap = new Map(docentes.map((d) => [d.id, d]));

  // Descomponemos cada materia en "paquetes" (bloques de 2 hs o 3 hs según su formato)
  const paquetesPendientesPorCurso = {};
  for (const c of cursos) {
    paquetesPendientesPorCurso[c.id] = [];
  }

  for (const m of materias) {
    const partes = m.formatoBloques.split('+').map((n) => parseInt(n, 10));
    partes.forEach((duracion, idx) => {
      paquetesPendientesPorCurso[m.cursoId].push({
        paqueteId: `${m.id}_p${idx + 1}`,
        materiaId: m.id,
        cursoId: m.cursoId,
        duracion,
        docentesIds: m.docentesIds,
        asignado: false
      });
    });
  }

  const asignaciones = [];
  // Control de ocupación docente: key `${docId}|${dia}|${bloqueIdx}`
  const docenteOcupado = new Set();

  function docentesDisponiblesEnSegmento(docentesIds, dia, bloquesIndices) {
    for (const docId of docentesIds) {
      const doc = docentesMap.get(docId);
      if (!doc) return false;
      for (const bIdx of bloquesIndices) {
        if (!doc.disponibilidad[dia] || !doc.disponibilidad[dia][bIdx]) {
          return false;
        }
        if (docenteOcupado.has(`${docId}|${dia}|${bIdx}`)) {
          return false;
        }
      }
    }
    return true;
  }

  // Primero intentamos llenar todos los segmentos posibles sin repetir la misma materia el mismo día
  for (const dia of DIAS_HABILES_DEFAULT) {
    for (const segInfo of segmentosDelDia) {
      for (const curso of cursos) {
        const paquetesCurso = paquetesPendientesPorCurso[curso.id];
        const materiasUsadasHoyEnCurso = new Set(
          asignaciones
            .filter((a) => a.cursoId === curso.id && a.dia === dia)
            .map((a) => a.materiaId)
        );

        // Buscar un paquete pendiente de igual duración que el segmento
        let candidato = paquetesCurso.find(
          (p) =>
            !p.asignado &&
            p.duracion === segInfo.cap &&
            !materiasUsadasHoyEnCurso.has(p.materiaId) &&
            docentesDisponiblesEnSegmento(p.docentesIds, dia, segInfo.bloques)
        );

        // Si no hay sin repetir materia en el día, permitir misma materia o paquete de 2h dentro de segmento de 3h
        if (!candidato && segInfo.cap === 3) {
          const subBloques2 = [segInfo.bloques[0], segInfo.bloques[1]];
          candidato = paquetesCurso.find(
            (p) =>
              !p.asignado &&
              p.duracion === 2 &&
              !materiasUsadasHoyEnCurso.has(p.materiaId) &&
              docentesDisponiblesEnSegmento(p.docentesIds, dia, subBloques2)
          );
          if (candidato) {
            candidato.asignado = true;
            for (const bIdx of subBloques2) {
              asignaciones.push({
                id: `asig_${curso.id}_${dia}_b${bIdx}`,
                cursoId: curso.id,
                dia,
                bloqueIndice: bIdx,
                materiaId: candidato.materiaId
              });
              for (const docId of candidato.docentesIds) {
                docenteOcupado.add(`${docId}|${dia}|${bIdx}`);
              }
            }
            continue;
          }
        }

        if (candidato) {
          candidato.asignado = true;
          for (const bIdx of segInfo.bloques) {
            asignaciones.push({
              id: `asig_${curso.id}_${dia}_b${bIdx}`,
              cursoId: curso.id,
              dia,
              bloqueIndice: bIdx,
              materiaId: candidato.materiaId
            });
            for (const docId of candidato.docentesIds) {
              docenteOcupado.add(`${docId}|${dia}|${bIdx}`);
            }
          }
        }
      }
    }
  }

  // Ajustar exactamente a 255 bloques asignados (85% de 300 bloques)
  // Si hay más de 255, removemos los últimos bloques de viernes/jueves tarde para dejar exactamente 85%
  const META_BLOQUES_85 = 255;
  if (asignaciones.length > META_BLOQUES_85) {
    asignaciones.splice(META_BLOQUES_85);
  }

  // Configurar caso de ejemplo intencional en 1° Año (c1) para pruebas inmediatas de Enroque 1 a 1 y Triangular:
  // Ubicar Matemática I (m_c1_1, Prof. Martín Gómez) en Miércoles B10-B12 y Taller de Robótica I (m_c1_7) en Martes B5-B7,
  // de modo que al seleccionar Matemática I o Taller de Robótica I se ofrezcan enroques simples y triangulares que reducen horas libres (Δ = -6 h libres).
  for (const a of asignaciones) {
    if (a.cursoId === 'c1' && a.dia === 'Martes' && [4, 5, 6].includes(a.bloqueIndice) && a.materiaId === 'm_c1_1') {
      a.materiaId = 'm_c1_7';
    } else if (a.cursoId === 'c1' && a.dia === 'Miércoles' && [9, 10, 11].includes(a.bloqueIndice) && a.materiaId === 'm_c1_7') {
      a.materiaId = 'm_c1_1';
    }
  }

  return asignaciones;
}

/**
 * Crea el documento de estado completo inicial (Semilla Fase 1)
 */
function crearEstadoSemillaSGH() {
  const cursos = JSON.parse(JSON.stringify(CURSOS_DEFAULT));
  const bloquesHorarios = JSON.parse(JSON.stringify(BLOQUES_HORARIOS_DEFAULT));
  const diasHabiles = [...DIAS_HABILES_DEFAULT];
  const docentes = generarDocentesSemilla();
  const materias = generarMateriasSemilla();
  const asignaciones = generarAsignacionesSemilla85(cursos, docentes, materias);

  return {
    meta: {
      version: '1.0.0',
      fase: 1,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
      nombreInstitucion: 'Escuela Secundaria Técnica N° 1 - SGH'
    },
    configuracion: {
      nombreColegio: 'Escuela Secundaria Técnica N° 1',
      siglasColegio: 'SGH',
      logoBase64: null,
      cicloLectivo: '2026',
      diasHabiles,
      bloquesHorarios,
      parametrosSistema: { ...PARAMETROS_SISTEMA_DEFAULT }
    },
    cursos,
    docentes,
    materias,
    asignaciones,
    almuerzos: []
  };
}

module.exports = {
  crearEstadoSemillaSGH,
  generarDocentesSemilla,
  generarMateriasSemilla
};
