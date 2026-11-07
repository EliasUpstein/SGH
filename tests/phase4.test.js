/**
 * SGH - Suite de Pruebas Automatizadas de Fase 4
 * Verifica:
 * 1. Motor de Propuestas: Movimientos a Horario Libre (Verde), Enroques 1 a 1 (Azul) y Triangulares (Violeta)
 * 2. Regla dura multi-docente: ninguna propuesta deja docentes no disponibles o con choques
 * 3. Orden de propuestas priorizando ΔHorasLibres < 0, luego = 0 y al final > 0
 * 4. Evaluador de impacto para el Modal de Pre-Confirmación (pasos, docentes afectados, textos por día)
 * 5. Aplicación atómica de la operación confirmada con soporte Undo/Redo
 * 6. Correcciones: eliminación individual y limpieza de copias de seguridad antiguas
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { crearEstadoSemillaSGH } = require('../src/domain/seed');
const { SGHStateManager } = require('../src/domain/stateManager');
const { auditarEstadoHorario } = require('../src/domain/metrics');
const {
  simularEstadoConOperacion,
  evaluarImpactoOperacionHorario,
  generarPropuestasMovimiento,
  previsualizarInteraccionMovimiento,
  aplicarOperacionHorarioConfirmada
} = require('../src/domain/proposals');
const { SGHStorage } = require('../src/main/storage');

console.log('===============================================================');
console.log('Ejecutando Pruebas de Verificación - SGH Fase 4');
console.log('===============================================================\n');

const manager = new SGHStateManager(crearEstadoSemillaSGH());
const estado = manager.obtenerEstado();
const materiasMap = new Map(estado.materias.map((m) => [m.id, m]));
const docentesMap = new Map(estado.docentes.map((d) => [d.id, d]));

/**
 * Verifica la regla dura: tras aplicar la operación, ningún docente de las materias movidas
 * queda en un bloque no disponible ni con choque (comparado contra el estado previo).
 */
function verificarSinConflictosNuevos(estadoBase, operacion) {
  const antes = auditarEstadoHorario(estadoBase);
  const despues = auditarEstadoHorario(simularEstadoConOperacion(estadoBase, operacion));
  assert.ok(
    despues.choquesDocentes.length <= antes.choquesDocentes.length,
    `La operación ${operacion.tipo} no debe generar nuevos choques docentes`
  );
  assert.ok(
    despues.violacionesDisponibilidad.length <= antes.violacionesDisponibilidad.length,
    `La operación ${operacion.tipo} no debe generar nuevas violaciones de disponibilidad`
  );
}

// 1. Encontrar una asignación de origen con propuestas
const t0 = Date.now();
let motor = null;
let asigOrigen = null;
for (const asig of estado.asignaciones) {
  const res = generarPropuestasMovimiento(estado, {
    cursoId: asig.cursoId,
    origenDia: asig.dia,
    origenBloqueIndice: asig.bloqueIndice
  });
  if (res && res.propuestasLibres.length > 0 && res.propuestasEnroqueDirecto.length > 0) {
    motor = res;
    asigOrigen = asig;
    break;
  }
}
const tMotor = Date.now() - t0;
assert.ok(motor, 'Debe existir al menos una clase con propuestas libres y de enroque directo en el seed');
console.log(
  `✅ Test 1 Passed: Motor de propuestas generado para "${motor.materiaNombre}" (${motor.cursoNombre}) · ` +
    `${motor.propuestasLibres.length} libres, ${motor.propuestasEnroqueDirecto.length} enroques 1 a 1, ` +
    `${motor.propuestasEnroqueTriangular.length} triangulares (${tMotor} ms).`
);

// 2. Verificar categorías, colores y regla dura multi-docente en todas las propuestas
for (const p of motor.propuestasLibres) {
  assert.strictEqual(p.categoria, 'LIBRE');
  assert.strictEqual(p.identificadorColor, 'VERDE');
  const asigDest = estado.asignaciones.filter(
    (a) => a.cursoId === asigOrigen.cursoId && a.dia === p.destinoDia && p.destinoBloquesIndices.includes(a.bloqueIndice)
  );
  assert.strictEqual(asigDest.length, 0, 'Una propuesta de Horario Libre debe apuntar a casilleros vacíos');
  verificarSinConflictosNuevos(estado, p.impacto.operacion);
}
for (const p of motor.propuestasEnroqueDirecto) {
  assert.strictEqual(p.categoria, 'ENROQUE_1_A_1');
  assert.strictEqual(p.identificadorColor, 'AZUL');
  assert.ok(p.materiaIntercambioId, 'Un enroque 1 a 1 debe identificar la Materia B');
  verificarSinConflictosNuevos(estado, p.impacto.operacion);
}
for (const p of motor.propuestasEnroqueTriangular) {
  assert.strictEqual(p.categoria, 'ENROQUE_TRIANGULAR');
  assert.strictEqual(p.identificadorColor, 'VIOLETA');
  assert.ok(p.materiaTercerVerticeId, 'Un enroque triangular debe identificar la Materia C');
  verificarSinConflictosNuevos(estado, p.impacto.operacion);
}
console.log('✅ Test 2 Passed: Todas las propuestas respetan disponibilidad multi-docente y no generan choques.');

// 3. Orden priorizando ΔHorasLibres
const deltasLibres = motor.propuestasLibres
  .filter((p) => !p.cruzaRecreoInjustificado)
  .map((p) => p.deltaHorasPuenteTotal);
for (let i = 1; i < deltasLibres.length; i++) {
  assert.ok(deltasLibres[i - 1] <= deltasLibres[i], 'Las propuestas deben ordenarse por ΔHorasLibres ascendente');
}
console.log(`✅ Test 3 Passed: Propuestas ordenadas por ΔHorasLibres (${deltasLibres.slice(0, 6).join(', ')}...).`);

// 4. Enroque triangular sintético garantizado (A → B → C → A) en un estado controlado
{
  const base = crearEstadoSemillaSGH();
  const cursoId = base.cursos[0].id;
  const dia = base.configuracion.diasHabiles[0];
  // Tomar 3 materias distintas del curso y dejar a sus docentes totalmente disponibles
  const mats = base.materias.filter((m) => m.cursoId === cursoId).slice(0, 3);
  assert.strictEqual(mats.length, 3);
  // Vaciar el curso y el resto de los cursos para aislar el escenario
  base.asignaciones = [
    { id: 'tA', cursoId, dia, bloqueIndice: 0, materiaId: mats[0].id },
    { id: 'tB', cursoId, dia, bloqueIndice: 4, materiaId: mats[1].id },
    { id: 'tC', cursoId, dia, bloqueIndice: 9, materiaId: mats[2].id }
  ];
  // Restringir disponibilidad para que el 1 a 1 A↔B sea imposible pero el triángulo sí:
  // A puede ir a B (b4); B NO puede ir a A (b0) pero sí a C (b9); C puede ir a A (b0)
  const docIdsPorMat = mats.map((m) => m.docentesIds);
  const todos = new Set(docIdsPorMat.flat());
  for (const docId of todos) {
    const doc = base.docentes.find((d) => d.id === docId);
    for (const d of base.configuracion.diasHabiles) {
      doc.disponibilidad[d] = doc.disponibilidad[d].map(() => false);
    }
  }
  const habilitar = (matIdx, bloques) => {
    for (const docId of docIdsPorMat[matIdx]) {
      const doc = base.docentes.find((d) => d.id === docId);
      for (const b of bloques) doc.disponibilidad[dia][b] = true;
    }
  };
  habilitar(0, [0, 4]);
  habilitar(1, [4, 9]);
  habilitar(2, [9, 0]);

  // Si algún docente se comparte entre materias, el escenario puede dejar de ser puro; solo validar si son disjuntos
  const disjuntos = todos.size === docIdsPorMat.flat().length;
  const res = generarPropuestasMovimiento(base, { cursoId, origenDia: dia, origenBloqueIndice: 0 });
  if (disjuntos) {
    assert.strictEqual(res.propuestasEnroqueDirecto.length, 0, 'El enroque 1 a 1 A↔B no debe ser válido');
    const tri = res.propuestasEnroqueTriangular.find(
      (p) => p.destinoDia === dia && p.destinoBloqueInicial === 4 && p.materiaTercerVerticeId === mats[2].id
    );
    assert.ok(tri, 'Debe detectarse el enroque triangular A → B → C → A');
    assert.strictEqual(tri.impacto.pasosMovimiento.length, 3, 'El triangular debe describir 3 pasos');

    // Aplicar triangular y verificar posiciones finales
    const mgrTri = new SGHStateManager(base);
    aplicarOperacionHorarioConfirmada(mgrTri, tri.impacto.operacion);
    const fin = mgrTri.obtenerEstado().asignaciones;
    const en = (b) => fin.find((a) => a.cursoId === cursoId && a.dia === dia && a.bloqueIndice === b)?.materiaId;
    assert.strictEqual(en(4), mats[0].id, 'A debe quedar en el lugar de B');
    assert.strictEqual(en(9), mats[1].id, 'B debe quedar en el lugar de C');
    assert.strictEqual(en(0), mats[2].id, 'C debe quedar en el lugar de A');
    console.log('✅ Test 4 Passed: Enroque Triangular A → B → C → A detectado y aplicado correctamente.');
  } else {
    console.log('⚠️ Test 4 Skipped: las materias del escenario comparten docentes.');
  }
}

// 5. Evaluador de impacto (Modal de Pre-Confirmación)
const propLibre = motor.propuestasLibres[0];
const impacto = evaluarImpactoOperacionHorario(estado, propLibre.impacto.operacion);
assert.strictEqual(impacto.categoria, 'LIBRE');
assert.ok(impacto.tituloOperacion.length > 0);
assert.strictEqual(impacto.pasosMovimiento.length, 1);
assert.ok(impacto.pasosMovimiento[0].origenTexto.includes(asigOrigen.dia));
assert.ok(impacto.docentesAfectados.length >= 1, 'Debe listar a los docentes afectados');
for (const da of impacto.docentesAfectados) {
  assert.ok(Array.isArray(da.cambiosPorDia));
  for (const c of da.cambiosPorDia) {
    assert.ok(/Pasa de|Mantiene/.test(c.textoImpactoDia), 'Cada día debe tener un texto explicativo legible');
  }
}
const sumaDelta = impacto.docentesAfectados.reduce((acc, d) => acc + d.deltaSemana, 0);
assert.strictEqual(sumaDelta, impacto.deltaHorasPuenteTotal, 'El Δ total debe ser la suma de los Δ por docente');
console.log(`✅ Test 5 Passed: Impacto detallado (${impacto.docentesAfectados.length} docente/s, Δ=${impacto.deltaHorasPuenteTotal}).`);

// 6. Previsualización de interacción (drop sobre celda ocupada => enroque 1 a 1)
const propDirecta = motor.propuestasEnroqueDirecto[0];
const prev = previsualizarInteraccionMovimiento(estado, {
  cursoId: asigOrigen.cursoId,
  origenDia: asigOrigen.dia,
  origenBloqueIndice: asigOrigen.bloqueIndice,
  destinoDia: propDirecta.destinoDia,
  destinoBloqueIndice: propDirecta.destinoBloqueInicial
});
assert.strictEqual(prev.impactoPrincipal.categoria, 'ENROQUE_1_A_1');
assert.strictEqual(prev.impactoPrincipal.pasosMovimiento.length, 2);
assert.strictEqual(prev.impactoPrincipal.tieneConflictosDuros, false);
console.log('✅ Test 6 Passed: Previsualización de Drag & Drop sobre celda ocupada identifica Enroque 1 a 1.');

// 7. Aplicación confirmada + Undo / Redo
const totalAntes = manager.obtenerEstado().asignaciones.length;
const resumenTrasAplicar = aplicarOperacionHorarioConfirmada(manager, propDirecta.impacto.operacion);
assert.ok(resumenTrasAplicar.historial.puedeDeshacer);
const estadoTras = manager.obtenerEstado();
assert.strictEqual(estadoTras.asignaciones.length, totalAntes, 'Un enroque no debe alterar la cantidad total de horas');
const enDestino = estadoTras.asignaciones.find(
  (a) => a.cursoId === asigOrigen.cursoId && a.dia === propDirecta.destinoDia && a.bloqueIndice === propDirecta.destinoBloqueInicial
);
assert.strictEqual(enDestino.materiaId, asigOrigen.materiaId, 'La Materia A debe quedar en el destino');
manager.deshacer();
const restaurada = manager.obtenerEstado().asignaciones.find(
  (a) => a.cursoId === asigOrigen.cursoId && a.dia === asigOrigen.dia && a.bloqueIndice === asigOrigen.bloqueIndice
);
assert.strictEqual(restaurada.materiaId, asigOrigen.materiaId, 'Deshacer debe restaurar la posición original');
manager.rehacer();
console.log('✅ Test 7 Passed: Operación confirmada aplicada atómicamente con Undo/Redo.');

// 8. Asignación desde bandeja (horas pendientes) a horario libre
const matPendiente = auditarEstadoHorario(estado).progresoMaterias.find((m) => m.horasPendientes > 0);
if (matPendiente) {
  const motorBandeja = generarPropuestasMovimiento(estado, {
    cursoId: matPendiente.cursoId,
    materiaId: matPendiente.id,
    cantidadBloques: 1
  });
  assert.ok(motorBandeja);
  assert.strictEqual(motorBandeja.esMovimientoDesdeGrilla, false);
  assert.ok(motorBandeja.propuestasEnroqueDirecto.length > 0, 'Debe listar desplazamientos 1 a 1 desde bandeja');
  assert.ok(motorBandeja.propuestasEnroqueTriangular.length > 0, 'Debe listar desplazamientos triangulares desde bandeja');
  for (const p of motorBandeja.propuestasLibres) {
    assert.strictEqual(p.impacto.operacion.tipo, 'ASIGNAR_LIBRE');
  }
  console.log(`✅ Test 8 Passed: Propuestas desde bandeja para "${matPendiente.nombre}" (${motorBandeja.propuestasLibres.length} libres, ${motorBandeja.propuestasEnroqueDirecto.length} enroques 1 a 1, ${motorBandeja.propuestasEnroqueTriangular.length} triangulares).`);
}

// 9. Copias de seguridad: eliminar individual y limpiar antiguas
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgh-phase4-'));
try {
  const storage = new SGHStorage(tmpDir);
  const st = crearEstadoSemillaSGH();
  for (let i = 0; i < 8; i++) {
    storage.crearBackup(st, `Backup de prueba ${i}`);
  }
  assert.strictEqual(storage.listarBackups().length, 8);

  const masAntiguo = storage.listarBackups()[7].archivo;
  const resDel = storage.eliminarBackup(masAntiguo);
  assert.strictEqual(resDel.backups.length, 7);
  assert.ok(!resDel.backups.some((b) => b.archivo === masAntiguo));

  assert.throws(() => storage.eliminarBackup('../sgh_state.json'), /inválido/);

  const recientes = storage.listarBackups().slice(0, 3).map((b) => b.archivo);
  const resClean = storage.limpiarBackupsAntiguos(3);
  assert.strictEqual(resClean.eliminadosCount, 4);
  assert.deepStrictEqual(resClean.backups.map((b) => b.archivo), recientes, 'Debe conservar las 3 copias más recientes');
  console.log('✅ Test 9 Passed: Eliminación individual y limpieza de copias antiguas (conserva las más recientes).');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\n🎉 Todas las pruebas de Fase 4 pasaron correctamente.');
