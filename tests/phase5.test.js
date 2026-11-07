/**
 * Suite de Pruebas Automatizadas - Fase 5 + Correcciones de Usabilidad, Almuerzo y Exportaciones
 * Verifica:
 * 1. Caso de ejemplo en 1° Año con opciones inmediatas en Enroque 1 a 1 y Enroque Triangular (Δ = -6 hs libres) + corridas con `indices` y `bloquesIndices`
 * 2. Propuestas de desplazamiento 1 a 1 y Triangular al seleccionar materias desde la Bandeja Lateral
 * 3. Asistente de "Movimiento Deseado" (`soluciones` + `obstaculos`, 1h y 3h, por Materia y por Docente)
 * 4. Bloques de "Almuerzo" y parámetro `habilitarBloquesAlmuerzo` en grilla, semáforo y validaciones
 * 5. Exportación a Excel (.xlsx) y PDF A4 Horizontal (.pdf) sin "Tramo", sin "Fmt", sin "OBLIGATORIO" y con columnas Hora + Horario
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const { crearEstadoSemillaSGH } = require('../src/domain/seed');
const { esBloqueAlmuerzo } = require('../src/domain/schema');
const { SGHStateManager } = require('../src/domain/stateManager');
const {
  auditarEstadoHorario,
  evaluarSlotEnVistaCurso,
  validarAsignacionDesdeVistaDocente
} = require('../src/domain/metrics');
const {
  generarPropuestasMovimiento,
  diagnosticarMovimientoDeseado,
  aplicarOperacionHorarioConfirmada
} = require('../src/domain/proposals');
const {
  generarArchivoExcelHorario,
  construirHtmlImpresionPDF
} = require('../src/main/exporter');
const { SGHStorage } = require('../src/main/storage');

async function ejecutarTestsFase5() {
  console.log('===============================================================');
  console.log('🧪 Ejecutando Pruebas de Verificación - SGH Fase 5');
  console.log('===============================================================\n');

  // Limpiar subcarpeta residual data/data si existiera de corridas previas
  const residualDataDir = path.join(__dirname, '..', 'data', 'data');
  if (fs.existsSync(residualDataDir)) {
    fs.rmSync(residualDataDir, { recursive: true, force: true });
  }

  // 0. Actualizar ./data/sgh_state.json con la semilla mejorada para que la app inicie con el caso listo
  const storageProyecto = new SGHStorage(path.join(__dirname, '..'));
  const resSemilla = storageProyecto.regenerarDatosSemilla();
  const estadoReset = resSemilla.estado || resSemilla;
  assert(estadoReset && estadoReset.asignaciones.length === 255);
  console.log('✅ [0/6] Estado persistente ./data/sgh_state.json actualizado con el caso de prueba de enroques.');

  // 1. Verificar caso de ejemplo inmediato en 1° Año (Matemática I y Taller de Robótica I)
  const estado = crearEstadoSemillaSGH();
  const auditoriaInicial = auditarEstadoHorario(estado);
  assert.strictEqual(auditoriaInicial.choquesDocentes.length, 0, 'Semilla no debe tener choques');
  assert.strictEqual(auditoriaInicial.violacionesDisponibilidad.length, 0, 'Semilla no debe tener indisponibilidades');

  // En 1° Año (c1), Matemática I (m_c1_1) tiene bloque en Miércoles B10-B12 (indices 9,10,11)
  const propMatBloque3h = generarPropuestasMovimiento(estado, {
    cursoId: 'c1',
    origenDia: 'Miércoles',
    origenBloqueIndice: 9,
    expandirCorridaCompleta: true
  });
  assert(propMatBloque3h, 'Debe generar propuestas para Matemática I (bloque 3h)');
  assert(propMatBloque3h.propuestasLibres.length > 0, 'Debe tener opciones en Horario Libre (3h)');
  assert(propMatBloque3h.propuestasEnroqueDirecto.length > 0, 'Debe tener opciones en Enroque 1 a 1 (3h)');
  assert(propMatBloque3h.propuestasEnroqueTriangular.length > 0, 'Debe tener opciones en Enroque Triangular (3h)');

  // Verificar que corridasAsignadasMateria expone tanto `indices` como `bloquesIndices` para UI Curso y Docente
  for (const c of propMatBloque3h.corridasAsignadasMateria) {
    assert(Array.isArray(c.indices) && c.indices.length > 0, 'Cada corrida debe incluir arreglo `indices`');
    assert(Array.isArray(c.bloquesIndices) && c.bloquesIndices.length > 0, 'Cada corrida debe incluir arreglo `bloquesIndices`');
  }

  const mejorEnroque3h = propMatBloque3h.propuestasEnroqueDirecto[0];
  assert.strictEqual(mejorEnroque3h.materiaIntercambioId, 'm_c1_7', 'El mejor enroque 3h es con Taller de Robótica I');
  assert.strictEqual(mejorEnroque3h.deltaHorasPuenteTotal, -6, 'El enroque 3h elimina 6 horas libres en la escuela');

  const propMat1h = generarPropuestasMovimiento(estado, {
    cursoId: 'c1',
    origenDia: 'Miércoles',
    origenBloqueIndice: 9,
    expandirCorridaCompleta: false
  });
  assert(propMat1h.propuestasLibres.length > 0, 'Debe listar libres en modo 1h');
  assert(propMat1h.propuestasEnroqueDirecto.length > 0, 'Debe listar Enroques 1 a 1 en modo 1h');
  assert(propMat1h.propuestasEnroqueTriangular.length > 0, 'Debe listar Enroques Triangulares en modo 1h');
  assert.strictEqual(propMat1h.corridasAsignadasMateria.length, 2, 'Debe informar las 2 corridas asignadas de Matemática I');
  console.log('✅ [1/6] Caso de ejemplo en 1° Año y estructura de corridas verificados (Δ = -6 hs libres).');

  // 2. Verificar propuestas desde Bandeja Lateral (sin origenDia)
  const propDesdeBandeja = generarPropuestasMovimiento(estado, {
    cursoId: 'c1',
    materiaId: 'm_c1_3',
    cantidadBloques: 1
  });
  assert(propDesdeBandeja.propuestasLibres.length > 0, 'Bandeja debe ofrecer horarios libres');
  assert(propDesdeBandeja.propuestasEnroqueDirecto.length > 0, 'Bandeja debe ofrecer desplazamientos 1 a 1');
  assert(propDesdeBandeja.propuestasEnroqueTriangular.length > 0, 'Bandeja debe ofrecer desplazamientos triangulares');
  console.log('✅ [2/6] Propuestas desde Bandeja Lateral (Desplazamiento 1 a 1 y Triangular) verificadas.');

  // 3. Verificar Asistente de "Movimiento Deseado" (tanto `soluciones` como `solucionesPropuestas`, en 3h y en 1h)
  const diagDeseado3h = diagnosticarMovimientoDeseado(estado, {
    cursoId: 'c1',
    docenteId: 'd1',
    destinoDia: 'Martes',
    destinoBloqueIndice: 4,
    cantidadBloques: 3
  });
  assert(diagDeseado3h && !diagDeseado3h.error, 'Diagnóstico 3h debe ejecutarse sin error');
  assert(Array.isArray(diagDeseado3h.obstaculos) && diagDeseado3h.obstaculos.length > 0, 'Debe exponer `obstaculos` para la UI');
  assert(Array.isArray(diagDeseado3h.soluciones) && diagDeseado3h.soluciones.length > 0, 'Debe exponer `soluciones` para la UI');
  assert(diagDeseado3h.soluciones[0].titulo, 'Cada solución debe incluir `titulo`');
  assert(Array.isArray(diagDeseado3h.soluciones[0].explicacionPasos), 'Cada solución debe incluir `explicacionPasos`');
  assert.strictEqual(diagDeseado3h.soluciones[0].deltaHorasPuenteTotal, -6, 'La primera sugerencia 3h reduce 6 hs libres');

  // También si el usuario consulta por 1 sola hora sobre un bloque ocupado de 3h (Martes B5), debe sugerir opciones válidas
  const diagDeseado1h = diagnosticarMovimientoDeseado(estado, {
    cursoId: 'c1',
    materiaId: 'm_c1_1',
    destinoDia: 'Martes',
    destinoBloqueIndice: 4,
    cantidadBloques: 1
  });
  assert(diagDeseado1h.soluciones.length > 0, 'Consulta de 1h en Martes B5 debe devolver sugerencias concretas');

  const manager = new SGHStateManager(crearEstadoSemillaSGH());
  const resumenTras = aplicarOperacionHorarioConfirmada(manager, diagDeseado3h.soluciones[0].impacto.operacion);
  assert(resumenTras && resumenTras.auditoria, 'Debe aplicar la solución sugerida del Movimiento Deseado');
  assert.strictEqual(
    resumenTras.auditoria.totalHorasPuenteEscuela,
    auditoriaInicial.totalHorasPuenteEscuela - 6,
    'Las horas libres totales de la escuela deben disminuir en 6 hs tras aplicar la sugerencia'
  );
  console.log('✅ [3/6] Asistente de Movimiento Deseado (1h, 3h, Materia y Docente) verificado.');

  // 4. Verificar Bloques de "Almuerzo" y parámetro `habilitarBloquesAlmuerzo`
  const estadoAlmuerzo = crearEstadoSemillaSGH();
  // Buscar un slot libre en c1 (por ejemplo Viernes Bloque 8 -> indice 7)
  const slotLibreC1 = estadoAlmuerzo.configuracion.bloquesHorarios.find(
    (b) => !estadoAlmuerzo.asignaciones.some((a) => a.cursoId === 'c1' && a.dia === 'Viernes' && a.bloqueIndice === b.indice)
  );
  assert(slotLibreC1, 'Debe existir al menos un bloque libre en 1° Año Viernes');
  estadoAlmuerzo.almuerzos = [{ id: 'alm_test_1', cursoId: 'c1', dia: 'Viernes', bloqueIndice: slotLibreC1.indice }];

  assert.strictEqual(
    esBloqueAlmuerzo(estadoAlmuerzo, 'c1', 'Viernes', slotLibreC1.indice),
    true,
    'El bloque debe reconocerse como Almuerzo cuando habilitarBloquesAlmuerzo está activo'
  );

  const evalAlmCurso = evaluarSlotEnVistaCurso(estadoAlmuerzo, {
    cursoId: 'c1',
    materiaId: 'm_c1_3',
    dia: 'Viernes',
    bloqueIndice: slotLibreC1.indice,
    cantidadBloques: 1
  });
  assert.strictEqual(evalAlmCurso.semaforo, 'BLOQUE_ALMUERZO', 'Semáforo en Vista Curso debe informar BLOQUE_ALMUERZO');

  const valAlmDoc = validarAsignacionDesdeVistaDocente(estadoAlmuerzo, {
    docenteId: 'd3',
    materiaId: 'm_c1_3',
    dia: 'Viernes',
    bloqueIndice: slotLibreC1.indice,
    cantidadBloques: 1
  });
  assert.strictEqual(valAlmDoc.codigoError, 'BLOQUE_ALMUERZO', 'Vista Docente debe bloquear asignación sobre BLOQUE_ALMUERZO');

  // Si se desactiva el parámetro en Configuración, el bloque deja de bloquearse como Almuerzo
  estadoAlmuerzo.configuracion.parametrosSistema.habilitarBloquesAlmuerzo = false;
  assert.strictEqual(
    esBloqueAlmuerzo(estadoAlmuerzo, 'c1', 'Viernes', slotLibreC1.indice),
    false,
    'Al desactivar habilitarBloquesAlmuerzo debe ignorarse la reserva de almuerzo'
  );
  estadoAlmuerzo.configuracion.parametrosSistema.habilitarBloquesAlmuerzo = true;
  console.log('✅ [4/6] Bloques de Almuerzo y parámetro de habilitación en Configuración verificados.');

  // 5. Verificar Exportación a Excel (.xlsx) con las limpiezas visuales solicitadas
  const tempDir = path.join(__dirname, '..', 'data', 'temp_test_exports');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const rutaExcelCurso = path.join(tempDir, 'test_curso_c1.xlsx');
  const rutaExcelDocente = path.join(tempDir, 'test_docente_d1.xlsx');
  const rutaExcelMasivo = path.join(tempDir, 'test_masivo_completo.xlsx');

  await generarArchivoExcelHorario(estadoAlmuerzo, { alcance: 'CURSO', cursoId: 'c1' }, rutaExcelCurso);
  await generarArchivoExcelHorario(estadoAlmuerzo, { alcance: 'DOCENTE', docenteId: 'd1' }, rutaExcelDocente);
  await generarArchivoExcelHorario(estadoAlmuerzo, { alcance: 'MASIVO_COMPLETO' }, rutaExcelMasivo);

  const wbCurso = new ExcelJS.Workbook();
  await wbCurso.xlsx.readFile(rutaExcelCurso);
  const hojaC1 = wbCurso.worksheets[0];
  let encontroAlmuerzoExcel = false;
  hojaC1.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      const txt = String(cell.value || '');
      if (rowNumber >= 4 && rowNumber <= 22) {
        assert(!txt.includes('Tramo'), `Celda Excel Curso no debe mencionar "Tramo": "${txt}"`);
        assert(!txt.includes('[Fmt:'), `Celda Excel Curso no debe incluir "[Fmt:": "${txt}"`);
        assert(!txt.toUpperCase().includes('OBLIGATORIO'), `Recreo Excel Curso no debe decir "OBLIGATORIO": "${txt}"`);
      }
      if (txt.includes('Almuerzo')) encontroAlmuerzoExcel = true;
    });
  });
  assert(encontroAlmuerzoExcel, 'El Excel del curso debe renderizar el bloque de Almuerzo');

  const wbDoc = new ExcelJS.Workbook();
  await wbDoc.xlsx.readFile(rutaExcelDocente);
  wbDoc.worksheets[0].eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      const txt = String(cell.value || '');
      if (rowNumber >= 4 && rowNumber <= 22) {
        assert(!txt.includes('Tramo'), `Celda Excel Docente no debe mencionar "Tramo": "${txt}"`);
        assert(!txt.toUpperCase().includes('OBLIGATORIO'), `Recreo Excel Docente no debe decir "OBLIGATORIO": "${txt}"`);
      }
    });
  });

  const wbMasivo = new ExcelJS.Workbook();
  await wbMasivo.xlsx.readFile(rutaExcelMasivo);
  const esperadoHojas = 1 + estadoAlmuerzo.cursos.length + estadoAlmuerzo.docentes.length;
  assert.strictEqual(wbMasivo.worksheets.length, esperadoHojas, `El Excel masivo completo debe contener ${esperadoHojas} hojas`);

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✅ [5/6] Exportación Excel (.xlsx) verificada (sin Tramo, sin Fmt, sin OBLIGATORIO y con Almuerzo).');

  // 6. Verificar Generación de HTML A4 Horizontal para PDF (.pdf) con columnas Hora + Horario y sin textos técnicos
  const htmlCurso = construirHtmlImpresionPDF(estadoAlmuerzo, { alcance: 'CURSO', cursoId: 'c1' });
  const htmlDocente = construirHtmlImpresionPDF(estadoAlmuerzo, { alcance: 'DOCENTE', docenteId: 'd1' });
  const htmlMasivo = construirHtmlImpresionPDF(estadoAlmuerzo, { alcance: 'MASIVO_COMPLETO' });

  assert(htmlCurso.includes('size: A4 landscape'), 'El PDF debe configurar hoja A4 Horizontal');
  assert(htmlCurso.includes('>Hora<') && htmlCurso.includes('>Horario<'), 'El PDF debe dividir en columnas Hora y Horario');
  assert(!htmlCurso.includes('Tramo '), 'El PDF del curso no debe incluir "Tramo "');
  assert(!htmlCurso.toUpperCase().includes('OBLIGATORIO'), 'El PDF del curso no debe incluir "OBLIGATORIO"');
  assert(htmlCurso.includes('Almuerzo'), 'El PDF del curso debe mostrar los bloques de Almuerzo');

  assert(!htmlDocente.includes('Tramo '), 'El PDF del docente no debe incluir "Tramo "');
  assert(!htmlDocente.toUpperCase().includes('OBLIGATORIO'), 'El PDF del docente no debe incluir "OBLIGATORIO"');
  assert(
    htmlMasivo.includes('5° Año') && htmlMasivo.includes('Prof. Martín Gómez'),
    'El PDF masivo debe incluir todos los cursos y docentes'
  );
  console.log('✅ [6/6] Generación de PDF A4 Horizontal verificada (columnas Hora + Horario, textos limpios).\n');

  console.log('🎉 TODAS LAS PRUEBAS DE LA FASE 5 PASARON EXITOSAMENTE.');
}

ejecutarTestsFase5().catch((err) => {
  console.error('❌ Error en tests de Fase 5:', err);
  process.exit(1);
});
