/**
 * SGH - Suite de Pruebas Automatizadas de Fase 1
 * Verifica:
 * 1. Modelo de datos parametrizable (5 Cursos, 12 Bloques Horarios 07:50 a 16:40, 4 Recreos y 5 Segmentos Continuos)
 * 2. Fórmulas de Reglas de Negocio (Horas Puente y Continuidad por Recreos)
 * 3. Generador de Datos Semilla (15 docentes, materias con 1 y 2 docentes, horario base al 85% sin choques)
 * 4. Gestor de Estado (Undo / Redo transaccional y Modo Simulación / Borrador con diff y restauración)
 * 5. Motor de Persistencia Atómica Local en ./data/ y Backups en ./data/backups/
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  BLOQUES_HORARIOS_DEFAULT,
  CURSOS_DEFAULT,
  obtenerResumenSegmentos,
  validarEstadoSGH
} = require('../src/domain/schema');
const {
  calcularHorasPuenteDia,
  evaluarContinuidadRecreos,
  auditarEstadoHorario
} = require('../src/domain/metrics');
const { crearEstadoSemillaSGH } = require('../src/domain/seed');
const { SGHStateManager } = require('../src/domain/stateManager');
const { SGHStorage } = require('../src/main/storage');

console.log('===============================================================');
console.log('🧪 Ejecutando Pruebas de Verificación - SGH Fase 1');
console.log('===============================================================\n');

// 1. Verificar Plantilla Preconfigurada de 5 Cursos, 12 Bloques, 4 Recreos y 5 Segmentos
assert.strictEqual(CURSOS_DEFAULT.length, 5, 'Deben existir 5 cursos por defecto (1° a 5° Año)');
assert.strictEqual(BLOQUES_HORARIOS_DEFAULT.length, 12, 'Deben existir 12 bloques horarios');
assert.strictEqual(BLOQUES_HORARIOS_DEFAULT[0].inicio, '07:50', 'El Bloque 1 debe iniciar a las 07:50');
assert.strictEqual(BLOQUES_HORARIOS_DEFAULT[11].fin, '16:40', 'El Bloque 12 debe finalizar a las 16:40');

const recreos = BLOQUES_HORARIOS_DEFAULT.filter((b) => b.recreoPosterior !== null);
assert.strictEqual(recreos.length, 4, 'Deben existir exactamente 4 recreos/cortes');

const segmentos = obtenerResumenSegmentos(BLOQUES_HORARIOS_DEFAULT);
assert.strictEqual(segmentos.length, 5, 'Deben existir 5 segmentos continuos');
assert.deepStrictEqual(
  segmentos.map((s) => s.capacidad),
  [2, 2, 3, 2, 3],
  'Las capacidades de los 5 segmentos deben ser [2, 2, 3, 2, 3]'
);
console.log('✅ [1/5] Plantilla de 5 Cursos, 12 Bloques (07:50-16:40), 5 Segmentos y 4 Recreos verificada.');

// 2. Verificar Fórmula de Horas Puente y Regla de Recreos
// Si un docente tiene clase en Bloque 1 (idx 0), Bloque 2 (idx 1) y Bloque 5 (idx 4):
// HorasPuente = (4 - 0 + 1) - 3 = 2 horas puente (en índices 2 y 3)
const pruebaPuente = calcularHorasPuenteDia([0, 1, 4]);
assert.strictEqual(pruebaPuente.cantidadHorasPuente, 2, 'La fórmula debe calcular 2 horas puente');
assert.deepStrictEqual(pruebaPuente.indicesPuente, [2, 3], 'Los índices puente deben ser [2, 3]');

// Regla 3.3: 2 hs a caballo del recreo (Bloques 2 y 3 -> índices 1 y 2) NO está justificado
const cruceInvalido = evaluarContinuidadRecreos([1, 2], BLOQUES_HORARIOS_DEFAULT);
assert.strictEqual(cruceInvalido.cruzaRecreo, true);
assert.strictEqual(cruceInvalido.cruceRecreoJustificado, false);

// Regla 3.3 Ejemplo 2: 3 hs por la mañana (Bloques 1, 2 y 3 -> índices 0, 1, 2) SÍ tiene permitido cruzar el recreo
const cruceJustificado3h = evaluarContinuidadRecreos([0, 1, 2], BLOQUES_HORARIOS_DEFAULT);
assert.strictEqual(cruceJustificado3h.cruzaRecreo, true);
assert.strictEqual(cruceJustificado3h.cruceRecreoJustificado, true);
console.log('✅ [2/5] Fórmula de Horas Puente y Regla 3.3 de Continuidad/Recreos verificadas.');

// 3. Verificar Generador de Datos Semilla (Seed Data al 85%)
const seedState = crearEstadoSemillaSGH();
const val = validarEstadoSGH(seedState);
assert.strictEqual(val.valido, true, 'El estado semilla debe ser estructuralmente válido');
assert.strictEqual(seedState.cursos.length, 5, 'Semilla debe tener 5 cursos');
assert.strictEqual(seedState.docentes.length, 15, 'Semilla debe tener 15 docentes');

const materiasMultiDocente = seedState.materias.filter((m) => m.docentesIds.length === 2);
assert.ok(materiasMultiDocente.length >= 6, 'Semilla debe incluir materias con 2 docentes (pareja pedagógica)');

const auditoria = auditarEstadoHorario(seedState);
assert.strictEqual(auditoria.porcentajeCompletitud, 85, 'El horario base debe estar armado al 85%');
assert.strictEqual(auditoria.choquesDocentes.length, 0, 'El horario semilla no debe tener choques docentes');
assert.strictEqual(auditoria.violacionesDisponibilidad.length, 0, 'El horario semilla debe respetar el 100% de disponibilidades');
console.log(`✅ [3/5] Seed Data verificado: 15 docentes, ${materiasMultiDocente.length} materias con pareja pedagógica, ${auditoria.totalHorasAsignadas}/${auditoria.totalHorasRequeridas} hs (${auditoria.porcentajeCompletitud}%) y 0 choques.`);

// 4. Verificar Gestor de Estado: Undo / Redo y Modo Simulación / Borrador
const manager = new SGHStateManager(seedState);
const conteoInicial = manager.obtenerEstado().asignaciones.length;

// Aplicar mutación en modo oficial
manager.aplicarMutacion('Liberar primer bloque para prueba', (draft) => {
  draft.asignaciones.pop();
});
assert.strictEqual(manager.obtenerEstado().asignaciones.length, conteoInicial - 1);
assert.strictEqual(manager.puedeDeshacer(), true);

// Probar Deshacer (Undo)
manager.deshacer();
assert.strictEqual(manager.obtenerEstado().asignaciones.length, conteoInicial);
assert.strictEqual(manager.puedeRehacer(), true);

// Probar Rehacer (Redo) y volver a Deshacer
manager.rehacer();
assert.strictEqual(manager.obtenerEstado().asignaciones.length, conteoInicial - 1);
manager.deshacer();
assert.strictEqual(manager.obtenerEstado().asignaciones.length, conteoInicial);

// Probar Modo Simulación / Borrador (Sandbox)
manager.iniciarSimulacion();
assert.strictEqual(manager.obtenerResumenEstado().modoSimulacion, true);

manager.aplicarMutacion('Eliminar 2 bloques en simulación', (draft) => {
  draft.asignaciones.splice(0, 2);
});
const diff = manager.calcularDiferenciasSimulacion();
assert.strictEqual(diff.cantidadCeldasModificadas, 2, 'El diff de simulación debe detectar exactamente 2 celdas modificadas');
assert.strictEqual(manager.obtenerEstadoOficial().asignaciones.length, conteoInicial, 'El Horario Oficial debe permanecer intacto durante la simulación');

// Descartar simulación y verificar restauración intacta
manager.descartarSimulacion();
assert.strictEqual(manager.obtenerResumenEstado().modoSimulacion, false);
assert.strictEqual(manager.obtenerEstado().asignaciones.length, conteoInicial, 'Al descartar simulación debe restaurarse intacto el Horario Oficial');
console.log('✅ [4/5] Gestor de Estado (Undo/Redo + Modo Simulación/Borrador con Diff) verificado.');

// 5. Verificar Motor de Persistencia Atómica en ./data/ y ./data/backups/
const storage = new SGHStorage(process.cwd());
const estadoCargado = storage.cargarOInicializar();
assert.strictEqual(fs.existsSync( path.join(process.cwd(), 'data', 'sgh_state.json') ), true, 'Debe existir ./data/sgh_state.json');

const backupCreado = storage.crearBackup(estadoCargado, 'Backup de verificación Fase 1');
assert.strictEqual(fs.existsSync(backupCreado.ruta), true, 'Debe existir el archivo de backup en ./data/backups/');
const listaBackups = storage.listarBackups();
assert.ok(listaBackups.length >= 1, 'Debe listarse al menos 1 backup en ./data/backups/');
console.log(`✅ [5/5] Persistencia atómica local verificada en ./data/sgh_state.json (${listaBackups.length} backup(s) en ./data/backups/).`);

console.log('\n🎉 TODAS LAS PRUEBAS DE LA FASE 1 PASARON EXITOSAMENTE.');
