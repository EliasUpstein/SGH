/**
 * SGH - Suite de Pruebas Automatizadas de Fase 2
 * Verifica:
 * 1. Parametrización Escolar Multi-Colegio (Institución, Días Hábiles y Recálculo de Segmentos/Recreos)
 * 2. ABM de Cursos y Divisiones
 * 3. ABM de Materias (Formato de bloques '2+2', OBLIGATORIO/IDEAL y Pareja Pedagógica Multi-Docente)
 * 4. ABM de Docentes y Motor "Pintar con el Mouse" (Actualización en lote transaccional con Undo en 1 paso y Plantillas)
 */

const assert = require('assert');
const { crearEstadoSemillaSGH } = require('../src/domain/seed');
const { SGHStateManager } = require('../src/domain/stateManager');
const {
  auditarEstadoHorario,
  calcularMetricasDocente,
  validarAsignacionDesdeVistaDocente
} = require('../src/domain/metrics');
const abm = require('../src/domain/abm');

console.log('===============================================================');
console.log('🧪 Ejecutando Pruebas de Verificación - SGH Fase 2');
console.log('===============================================================\n');

const manager = new SGHStateManager(crearEstadoSemillaSGH());

// 1. Probar Configuración Escolar Multi-Colegio y Recálculo de Segmentos
abm.actualizarConfiguracionInstitucion(manager, {
  nombreColegio: 'Instituto Politécnico Modelo',
  cicloLectivo: '2027',
  diasHabiles: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
});

assert.strictEqual(manager.obtenerEstado().configuracion.nombreColegio, 'Instituto Politécnico Modelo');
assert.strictEqual(manager.obtenerEstado().configuracion.diasHabiles.length, 6);
assert.strictEqual(
  Array.isArray(manager.obtenerEstado().docentes[0].disponibilidad['Sábado']),
  true,
  'La matriz de disponibilidad de los docentes debe normalizarse automáticamente al agregar el día Sábado'
);
assert.strictEqual(manager.obtenerEstado().docentes[0].disponibilidad['Sábado'].length, 12);

// Deshacer el cambio de institución para volver a Lunes-Viernes
manager.deshacer();
assert.strictEqual(manager.obtenerEstado().configuracion.diasHabiles.length, 5);
console.log('✅ [1/4] Parametrización Multi-Colegio (Institución, Días Hábiles y Normalización) verificada.');

// 2. Probar ABM de Cursos (Alta, Modificación y Baja con Undo)
abm.guardarCurso(manager, {
  nombre: '6° Año',
  division: 'B',
  nivel: 6,
  aula: 'Lab 301'
});
assert.strictEqual(manager.obtenerEstado().cursos.length, 6, 'Debe haberse agregado el 6° Año');
const sextoCurso = manager.obtenerEstado().cursos[5];
assert.strictEqual(sextoCurso.nombre, '6° Año');

abm.guardarCurso(manager, {
  id: sextoCurso.id,
  nombre: '6° Año Técnico',
  division: 'B',
  nivel: 6,
  aula: 'Lab 305'
});
assert.strictEqual(manager.obtenerEstado().cursos[5].nombre, '6° Año Técnico');

abm.eliminarCurso(manager, sextoCurso.id);
assert.strictEqual(manager.obtenerEstado().cursos.length, 5, 'Debe haberse eliminado el 6° Año');
console.log('✅ [2/4] ABM de Cursos (Alta, Edición y Baja) verificado.');

// 3. Probar ABM de Materias (Formato de bloques '2+2', OBLIGATORIO/IDEAL y Pareja Pedagógica)
const cantMateriasInicial = manager.obtenerEstado().materias.length;
abm.guardarMateria(manager, {
  cursoId: 'c1',
  nombre: 'Inteligencia Artificial Aplicada',
  codigo: 'IAA1',
  horasSemanales: 4,
  formatoBloques: '2+2',
  modoExigencia: 'OBLIGATORIO',
  docentesIds: ['d8', 'd13'],
  color: '#38bdf8'
});
assert.strictEqual(manager.obtenerEstado().materias.length, cantMateriasInicial + 1);
const nuevaMat = manager.obtenerEstado().materias[manager.obtenerEstado().materias.length - 1];
assert.strictEqual(nuevaMat.formatoBloques, '2+2');
assert.deepStrictEqual(nuevaMat.docentesIds, ['d8', 'd13']);

// Editar materia a formato 2+1 (3 hs) e IDEAL
abm.guardarMateria(manager, {
  ...nuevaMat,
  horasSemanales: 3,
  formatoBloques: '2+1',
  modoExigencia: 'IDEAL'
});
const matEditada = manager.obtenerEstado().materias.find((m) => m.id === nuevaMat.id);
assert.strictEqual(matEditada.horasSemanales, 3);
assert.strictEqual(matEditada.formatoBloques, '2+1');
assert.strictEqual(matEditada.modoExigencia, 'IDEAL');

abm.eliminarMateria(manager, nuevaMat.id);
assert.strictEqual(manager.obtenerEstado().materias.length, cantMateriasInicial);
console.log('✅ [3/4] ABM de Materias (Formato de Bloques, Exigencia y Pareja Pedagógica) verificado.');

// 4. Probar ABM de Docentes y Grilla "Pintar con el Mouse" (Trazo en lote + Plantillas)
const cantDocentesInicial = manager.obtenerEstado().docentes.length;
abm.guardarDocente(manager, {
  nombre: 'Prof. Elena Morales',
  especialidad: 'Biotecnología',
  legajo: 'DOC-1099',
  color: '#10b981'
});
assert.strictEqual(manager.obtenerEstado().docentes.length, cantDocentesInicial + 1);
const nuevoDoc = manager.obtenerEstado().docentes[manager.obtenerEstado().docentes.length - 1];

// Simular un trazo de "Pintar con el Mouse" desmarcando 5 bloques del Lunes en una sola operación
const undoCountAntes = manager.obtenerResumenEstado().historial.cantidadUndo;
abm.aplicarTrazoDisponibilidadDocente(manager, {
  docenteId: nuevoDoc.id,
  cambios: [
    { dia: 'Lunes', bloqueIndice: 0, disponible: false },
    { dia: 'Lunes', bloqueIndice: 1, disponible: false },
    { dia: 'Lunes', bloqueIndice: 2, disponible: false },
    { dia: 'Lunes', bloqueIndice: 3, disponible: false },
    { dia: 'Lunes', bloqueIndice: 4, disponible: false }
  ]
});
const undoCountDespues = manager.obtenerResumenEstado().historial.cantidadUndo;
assert.strictEqual(
  undoCountDespues,
  undoCountAntes + 1,
  'Todo el trazo de pintura con el mouse debe registrarse como 1 única transacción en la pila Undo'
);

const dispLunes = manager.obtenerEstado().docentes.find((d) => d.id === nuevoDoc.id).disponibilidad['Lunes'];
assert.deepStrictEqual(dispLunes.slice(0, 5), [false, false, false, false, false]);

// Deshacer con 1 solo Undo debe restaurar los 5 bloques pintados a true
manager.deshacer();
const dispLunesRestaurada = manager.obtenerEstado().docentes.find((d) => d.id === nuevoDoc.id).disponibilidad['Lunes'];
assert.deepStrictEqual(dispLunesRestaurada.slice(0, 5), [true, true, true, true, true]);

// Probar Plantilla Rápida "SOLO_MANANA" (bloques 0..6 en true, bloques 7..11 en false)
abm.aplicarPresetDisponibilidadDocente(manager, {
  docenteId: nuevoDoc.id,
  preset: 'SOLO_MANANA'
});
const dispManana = manager.obtenerEstado().docentes.find((d) => d.id === nuevoDoc.id).disponibilidad['Martes'];
assert.strictEqual(dispManana[0], true, 'Bloque 1 mañana debe estar disponible');
assert.strictEqual(dispManana[6], true, 'Bloque 7 mañana debe estar disponible');
assert.strictEqual(dispManana[7], false, 'Bloque 8 tarde debe estar NO disponible');
assert.strictEqual(dispManana[11], false, 'Bloque 12 tarde debe estar NO disponible');

console.log('✅ [4/5] ABM de Docentes y Motor "Pintar con el Mouse" (Lote Transaccional + Plantillas) verificados.');

// 5. Probar Centro de Diagnóstico de Choques Docentes, Violaciones de Disponibilidad y Detalle de Horas Puente
// Provocar un choque simultáneo en Lunes bloque 0 entre m_c1_1 (en c1) y m_c2_1 (en c2), ambos con docente 'd1' (Prof. Roberto Gómez)
manager.aplicarMutacion('Provocar choque docente de prueba', (draft) => {
  draft.asignaciones = draft.asignaciones.filter(
    (a) => !((a.cursoId === 'c1' || a.cursoId === 'c2') && a.dia === 'Lunes' && a.bloqueIndice === 0)
  );
  draft.asignaciones.push(
    { id: 'asig_choque_c1', cursoId: 'c1', dia: 'Lunes', bloqueIndice: 0, materiaId: 'm_c1_1' },
    { id: 'asig_choque_c2', cursoId: 'c2', dia: 'Lunes', bloqueIndice: 0, materiaId: 'm_c2_1' }
  );
});

const auditoriaChoque = auditarEstadoHorario(manager.obtenerEstado());
assert.strictEqual(auditoriaChoque.choquesDocentes.length >= 1, true, 'Debe detectarse el choque docente simultáneo');
assert.strictEqual(auditoriaChoque.choquesDocentes[0].docenteId, 'd1');
assert.strictEqual(auditoriaChoque.choquesDocentes[0].dia, 'Lunes');
assert.strictEqual(auditoriaChoque.choquesDocentes[0].bloqueIndice, 0);
assert.strictEqual(auditoriaChoque.choquesDocentes[0].itemsConflicto.length, 2);
assert.strictEqual(typeof auditoriaChoque.choquesDocentes[0].explicacion, 'string');

const metricasD1 = calcularMetricasDocente(manager.obtenerEstado(), 'd1');
assert.strictEqual(metricasD1.porDia['Lunes'].celdas[0].tieneChoque, true, 'El slot del docente debe marcarse con tieneChoque: true');
assert.strictEqual(
  Array.isArray(auditoriaChoque.docentesConHorasPuente) && auditoriaChoque.docentesConHorasPuente.length > 0,
  true,
  'La auditoría debe listar los docentes con horas puente y su explicación detallada por día'
);
assert.strictEqual(
  auditoriaChoque.docentesConHorasPuente[0].detalleHorasPuentePorDia.length > 0,
  true,
  'Cada docente con horas puente debe incluir el desglose de días y bloques vacíos intermedios'
);

manager.deshacer(); // Restaurar horario sin choque
console.log('✅ [5/6] Diagnóstico de Choques Docentes, Disponibilidad y Explicación de Horas Puente verificado.');

// 6. Probar Listado de Materias a Cargo del Docente y Validación de Asignación desde Vista Docente
const metricasBaseD1 = calcularMetricasDocente(manager.obtenerEstado(), 'd1');
assert.strictEqual(
  Array.isArray(metricasBaseD1.materiasACargo) && metricasBaseD1.materiasACargo.length >= 3,
  true,
  'El docente d1 debe listar todas sus materias a cargo con su progreso horario'
);

// Verificar validación cuando el curso ya está ocupado por otra materia en Lunes bloque 0 (c1 tiene HIS1 = m_c1_3 en Lunes bloque 0)
const valCursoOcupado = validarAsignacionDesdeVistaDocente(manager.obtenerEstado(), {
  docenteId: 'd1',
  materiaId: 'm_c1_1',
  dia: 'Lunes',
  bloqueIndice: 0,
  permitirExcesoHoras: true
});
assert.strictEqual(valCursoOcupado.valido, false);
assert.strictEqual(valCursoOcupado.codigoError, 'CURSO_OCUPADO');
assert.strictEqual(valCursoOcupado.cursoDisponible, false);

// Verificar validación de cupo completo (m_c1_1 ya tiene 6/6 hs en el seed) en un bloque donde c1 esté libre (Viernes bloque 10)
const valCupoCompleto = validarAsignacionDesdeVistaDocente(manager.obtenerEstado(), {
  docenteId: 'd1',
  materiaId: 'm_c1_1',
  dia: 'Viernes',
  bloqueIndice: 10,
  permitirExcesoHoras: false
});
assert.strictEqual(valCupoCompleto.valido, false);
assert.strictEqual(valCupoCompleto.codigoError, 'CUPO_HORAS_COMPLETO');
assert.strictEqual(valCupoCompleto.cursoDisponible, true);

// Si se libera 1 hora de m_c1_1, debe permitir asignarla en ese bloque libre del curso c1 (Viernes bloque 10)
manager.aplicarMutacion('Liberar 1 hora de m_c1_1 para probar asignación desde vista docente', (draft) => {
  const idx = draft.asignaciones.findIndex((a) => a.materiaId === 'm_c1_1');
  if (idx !== -1) draft.asignaciones.splice(idx, 1);
});

const valAsignable = validarAsignacionDesdeVistaDocente(manager.obtenerEstado(), {
  docenteId: 'd1',
  materiaId: 'm_c1_1',
  dia: 'Viernes',
  bloqueIndice: 10,
  permitirExcesoHoras: false
});
assert.strictEqual(valAsignable.valido, true, 'Con 5/6 hs y curso libre, debe permitir asignar desde Vista Docente');
assert.strictEqual(valAsignable.horasAsignadasDespues, 6);

manager.deshacer();
console.log('✅ [6/6] Listado de Materias a Cargo y Validación de Curso/Horas en Vista Docente verificados.');
console.log('\n🎉 TODAS LAS PRUEBAS DE LA FASE 2 PASARON EXITOSAMENTE.');
