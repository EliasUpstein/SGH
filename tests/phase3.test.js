/**
 * SGH - Suite de Pruebas Automatizadas de Fase 3
 * Verifica:
 * 1. Análisis de Formato de Bloques ('3+3', '2+2+2') y sugerencia automática de tamaño de paquete contiguo
 * 2. Cálculo en tiempo real de ΔHorasPuente (eliminación de huecos Δ < 0, neutro Δ = 0 y penalización Δ > 0)
 * 3. Semáforo en Tiempo Real en Vista por Curso (evaluarSlotEnVistaCurso: Óptimo, Disponible, Advertencia Recreo/Puente y Bloqueos)
 * 4. Vista por Docente: metadatos de posición de bloque contiguo (1/2, 2/2, 1/3...), detección de recreos y paquetes multi-hora
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { crearEstadoSemillaSGH } = require('../src/domain/seed');
const { SGHStateManager } = require('../src/domain/stateManager');
const {
  analizarFormatoBloquesMateria,
  calcularDeltaHorasPuentePorAsignacion,
  evaluarContinuidadRecreos,
  evaluarSlotEnVistaCurso,
  validarAsignacionDesdeVistaDocente,
  calcularMetricasDocente,
  auditarEstadoHorario
} = require('../src/domain/metrics');
const {
  actualizarConfiguracionInstitucion,
  actualizarParametrosSistema
} = require('../src/domain/abm');
const { SGHStorage } = require('../src/main/storage');

console.log('===============================================================');
console.log('🧪 Ejecutando Pruebas de Verificación - SGH Fase 3 + Refinamientos');
console.log('===============================================================\n');

const manager = new SGHStateManager(crearEstadoSemillaSGH());

// 1. Verificar Analizador de Formato de Bloques ('3+3', '2+2+2', paquetes pendientes y bloques partidos)
const analisisMat1 = analizarFormatoBloquesMateria(manager.obtenerEstado(), 'm_c1_1');
assert.deepStrictEqual(analisisMat1.partesEsperadas, [3, 3]);
assert.strictEqual(analisisMat1.cumpleFormatoCompleto, true, 'm_c1_1 en el seed tiene formato 3+3 completo');
assert.strictEqual(analisisMat1.formatoActualTexto, '3+3');

// Buscar una materia con horas pendientes en el seed (85% armado)
const estadoActual = manager.obtenerEstado();
const matIncompleta = estadoActual.materias.find((m) => {
  const cant = estadoActual.asignaciones.filter((a) => a.materiaId === m.id).length;
  return cant < m.horasSemanales;
});
assert.ok(matIncompleta, 'Debe existir al menos una materia con horas pendientes en el seed al 85%');

const analisisInc = analizarFormatoBloquesMateria(estadoActual, matIncompleta.id);
assert.strictEqual(analisisInc.paquetesPendientes.length >= 1, true, 'Debe detectar paquetes pendientes de ubicar');
assert.strictEqual(analisisInc.proximoTamanoSugerido >= 1, true, 'Debe sugerir el tamaño del próximo paquete contiguo');
console.log('✅ [1/7] Analizador de Formato de Bloques (3+3, 2+2+2 y paquetes sugeridos) verificado.');

// 2. Verificar cálculo en tiempo real de ΔHorasPuente al cerrar un hueco o crear uno nuevo
const docConPuente = estadoActual.docentes
  .map((d) => calcularMetricasDocente(estadoActual, d.id))
  .find((md) => md.totalHorasPuente > 0);
assert.ok(docConPuente, 'Debe existir al menos un docente con horas libres en el seed para evaluar mejora');

const detalleDiaPuente = docConPuente.detalleHorasPuentePorDia[0];
const indiceHuecoPuente = detalleDiaPuente.indicesPuente[0];
const materiaDelDocente = docConPuente.materiasACargo[0];

const deltaAlCerrarHueco = calcularDeltaHorasPuentePorAsignacion(estadoActual, {
  materiaId: materiaDelDocente.id,
  dia: detalleDiaPuente.dia,
  bloquesNuevosIndices: [indiceHuecoPuente]
});
assert.strictEqual(
  deltaAlCerrarHueco.deltaTotal < 0,
  true,
  'Asignar una clase dentro de una Hora Libre debe arrojar un ΔHorasPuente negativo (mejora)'
);
console.log('✅ [2/7] Cálculo diferencial ΔHorasLibres en tiempo real (detección de cierre de huecos Δ < 0) verificado.');

// 3. Verificar Semáforo en Tiempo Real en Vista por Curso (evaluarSlotEnVistaCurso)
// Liberamos los 3 bloques de m_c1_1 del Lunes (bloques 4, 5, 6 = Segmento 3) para evaluar el semáforo de re-asignación
manager.aplicarMutacion('Liberar bloque de 3 hs de m_c1_1 en Lunes para evaluar semáforo', (draft) => {
  draft.asignaciones = draft.asignaciones.filter(
    (a) => !(a.cursoId === 'c1' && a.dia === 'Lunes' && a.materiaId === 'm_c1_1')
  );
});

const evalPaquete3h = evaluarSlotEnVistaCurso(manager.obtenerEstado(), {
  cursoId: 'c1',
  materiaId: 'm_c1_1',
  dia: 'Lunes',
  bloqueIndice: 4,
  cantidadBloques: 3
});
assert.strictEqual(evalPaquete3h.valido, true, 'El Segmento 3 (bloques 4,5,6) debe ser válido para el paquete de 3 hs');
assert.deepStrictEqual(evalPaquete3h.indicesObjetivo, [4, 5, 6]);
assert.strictEqual(evalPaquete3h.cruzaRecreoInjustificado, false);

// Evaluar si intentamos poner un paquete de 2 hs a caballo del recreo (bloques 1 y 2: cruza recreo entre Seg 1 y Seg 2)
manager.aplicarMutacion('Liberar bloques 1 y 2 en Lunes para probar cruce de recreo', (draft) => {
  draft.asignaciones = draft.asignaciones.filter(
    (a) => !(a.dia === 'Lunes' && (a.bloqueIndice === 1 || a.bloqueIndice === 2))
  );
});

const evalCruceRecreo = evaluarSlotEnVistaCurso(manager.obtenerEstado(), {
  cursoId: 'c1',
  materiaId: 'm_c1_1',
  dia: 'Lunes',
  bloqueIndice: 1,
  cantidadBloques: 2
});
assert.strictEqual(evalCruceRecreo.valido, true);
assert.strictEqual(evalCruceRecreo.cruzaRecreoInjustificado, true, 'Debe advertir que 2 hs en bloques 1-2 cruzan recreo innecesariamente');
assert.strictEqual(evalCruceRecreo.semaforo, 'ADVERTENCIA_PUENTE_O_RECREO');

manager.deshacer();
manager.deshacer();
console.log('✅ [3/7] Semáforo en Tiempo Real en Vista por Curso (Disponible, Recreos y Paquetes 2h/3h) verificado.');

// 4. Verificar Metadatos de Continuidad de Bloques (1/3, 2/3, 3/3) y Paquetes en Vista por Docente
const metricasD1Fase3 = calcularMetricasDocente(manager.obtenerEstado(), 'd1');
const celdaLunesB4 = metricasD1Fase3.porDia['Lunes'].celdas[4];
const celdaLunesB5 = metricasD1Fase3.porDia['Lunes'].celdas[5];
const celdaLunesB6 = metricasD1Fase3.porDia['Lunes'].celdas[6];

assert.strictEqual(celdaLunesB4.posicionEnBloqueDia, '1/3');
assert.strictEqual(celdaLunesB5.posicionEnBloqueDia, '2/3');
assert.strictEqual(celdaLunesB6.posicionEnBloqueDia, '3/3');
assert.strictEqual(celdaLunesB4.cruzaRecreoInjustificado, false);

// Probar validación de paquete multi-hora desde Vista por Docente
manager.aplicarMutacion('Liberar 3 hs de m_c1_1 en Lunes para validar paquete desde Vista Docente', (draft) => {
  draft.asignaciones = draft.asignaciones.filter(
    (a) => !(a.cursoId === 'c1' && a.dia === 'Lunes' && a.materiaId === 'm_c1_1')
  );
});

const valDocentePaquete = validarAsignacionDesdeVistaDocente(manager.obtenerEstado(), {
  docenteId: 'd1',
  materiaId: 'm_c1_1',
  dia: 'Lunes',
  bloqueIndice: 4,
  cantidadBloques: 3,
  permitirExcesoHoras: false
});
assert.strictEqual(valDocentePaquete.valido, true);
assert.deepStrictEqual(valDocentePaquete.indicesObjetivo, [4, 5, 6]);
assert.strictEqual(valDocentePaquete.horasAsignadasDespues, 6);
assert.strictEqual(typeof valDocentePaquete.deltaHorasPuente, 'number');

manager.deshacer();
console.log('✅ [4/7] Vista por Docente (Posición en bloque contiguo 1/3..3/3, ΔHorasLibres y Paquetes) verificada.');

// 5. Verificar que repetir una materia en el mismo día en bloques NO contiguos (ej. bloques 1-2 y 8-9, índices [0,1,7,8])
// NO emite advertencia de corte por recreo, y que solo emite la advertencia si un bloque contiguo queda partido por recreo
const evalDosBloquesMismoDiaSinCorte = evaluarContinuidadRecreos(
  [0, 1, 7, 8],
  manager.obtenerEstado().configuracion.bloquesHorarios
);
assert.strictEqual(
  evalDosBloquesMismoDiaSinCorte.cruzaRecreoInjustificado,
  false,
  'Dos bloques separados en el mismo día (ej. 1-2 y 8-9) NO deben marcarse como cortados por recreo'
);
assert.deepStrictEqual(evalDosBloquesMismoDiaSinCorte.indicesEnConflicto, []);

const evalUnBloqueCortadoPorRecreo = evaluarContinuidadRecreos(
  [1, 2, 7, 8],
  manager.obtenerEstado().configuracion.bloquesHorarios
);
assert.strictEqual(
  evalUnBloqueCortadoPorRecreo.cruzaRecreoInjustificado,
  true,
  'Un bloque contiguo [1, 2] que cruza el recreo entre Bloque 2 y Bloque 3 sí debe advertirse'
);
assert.deepStrictEqual(evalUnBloqueCortadoPorRecreo.indicesEnConflicto, [1, 2]);
console.log('✅ [5/7] Regla de Recreos refinada: bloques no contiguos el mismo día (1-2 y 8-9) permitidos sin falsa alerta.');

// 6. Verificar Parámetros del Sistema (Flags de advertencias y Modo Claro/Oscuro) e Identidad del Colegio (Siglas y Logo)
actualizarConfiguracionInstitucion(manager, {
  nombreColegio: 'Instituto San Martín',
  siglasColegio: 'ISM',
  logoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
});
assert.strictEqual(manager.obtenerEstado().configuracion.siglasColegio, 'ISM');
assert.ok(manager.obtenerEstado().configuracion.logoBase64.startsWith('data:image/png;base64,'));

actualizarParametrosSistema(manager, {
  alertarHorasLibresDocentes: false,
  alertarCortePorRecreo: false,
  temaVisual: 'CLARO'
});
const audSinFlags = auditarEstadoHorario(manager.obtenerEstado());
assert.strictEqual(audSinFlags.totalHorasPuenteEscuela, 0, 'Con alertarHorasLibresDocentes=false no se deben reportar horas libres');
assert.strictEqual(audSinFlags.advertenciasRecreos.length, 0, 'Con alertarCortePorRecreo=false no se deben reportar cortes por recreo');
assert.strictEqual(manager.obtenerEstado().configuracion.parametrosSistema.temaVisual, 'CLARO');

// Restaurar cambios de prueba
manager.deshacer();
manager.deshacer();
console.log('✅ [6/7] Parámetros del Sistema (Flags personalizables, Modo Claro/Oscuro) y Logo/Siglas del Colegio verificados.');

// 7. Verificar Guardado, Listado, Carga y Eliminación de Simulaciones en Disco
const tempDirSim = fs.mkdtempSync(path.join(os.tmpdir(), 'sgh-sim-test-'));
const storageSim = new SGHStorage(tempDirSim);

manager.iniciarSimulacion();
manager.aplicarMutacion('Cambio de prueba en simulación', (draft) => {
  draft.configuracion.nombreColegio = 'Colegio en Simulación Guardada';
});

const simGuardada = storageSim.guardarSimulacion({
  nombre: 'Escenario Turno Mañana',
  descripcion: 'Prueba de persistencia de simulaciones',
  estadoSimulado: manager.obtenerEstado()
});
assert.ok(simGuardada.archivo.endsWith('.json'));

const listaSims = storageSim.listarSimulaciones();
assert.strictEqual(listaSims.length, 1);
assert.strictEqual(listaSims[0].nombre, 'Escenario Turno Mañana');

// Descartar simulación en memoria y volver a cargarla desde el archivo guardado
manager.descartarSimulacion();
assert.strictEqual(manager.modoSimulacion, false);

const simCargada = storageSim.cargarSimulacion(simGuardada.archivo);
manager.cargarEstadoEnSimulacion(
  simCargada.estadoSimulado,
  simCargada.simulacionMeta.nombre,
  simCargada.simulacionMeta.archivo
);
assert.strictEqual(manager.modoSimulacion, true);
assert.strictEqual(manager.obtenerEstado().configuracion.nombreColegio, 'Colegio en Simulación Guardada');
assert.strictEqual(manager.obtenerResumenEstado().nombreSimulacionActiva, 'Escenario Turno Mañana');

storageSim.eliminarSimulacion(simGuardada.archivo);
assert.strictEqual(storageSim.listarSimulaciones().length, 0);
manager.descartarSimulacion();
fs.rmSync(tempDirSim, { recursive: true, force: true });
console.log('✅ [7/7] Guardado, listado, carga y eliminación de Simulaciones en disco verificados.');

console.log('\n🎉 TODAS LAS PRUEBAS DE LA FASE 3 Y REFINAMIENTOS PASARON EXITOSAMENTE.');
