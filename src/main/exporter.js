/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo Fase 5: Exportación Nativa a Excel (.xlsx) con ExcelJS y Generador A4 Horizontal para PDF (.pdf)
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { esBloqueAlmuerzo } = require('../domain/schema');
const {
  auditarEstadoHorario,
  calcularMetricasDocente
} = require('../domain/metrics');

function formatearEtiquetaRecreoExportacion(recreo) {
  if (!recreo) return 'Recreo';
  const raw = String(recreo.etiqueta || 'Recreo')
    .replace(/\bobligatorio\b/gi, '')
    .replace(/\(?\s*fin del tramo\s*\d+\s*\)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return raw || 'Recreo';
}

/**
 * Limpia un texto para usarlo como nombre seguro de archivo o de hoja de Excel (máx 31 caracteres en hojas)
 */
function limpiarNombreArchivo(texto = 'SGH') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-. ]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function limpiarNombreHojaExcel(texto = 'Hoja', usados = new Set()) {
  let base = String(texto)
    .replace(/[\\/*?:[\]]/g, '')
    .trim()
    .slice(0, 28);
  if (!base) base = 'Hoja';
  let candidato = base;
  let contador = 2;
  while (usados.has(candidato.toLowerCase())) {
    candidato = `${base.slice(0, 25)}_${contador++}`;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

/**
 * Convierte un color hexadecimal (#rrggbb) a formato ARGB de ExcelJS (FFRRGGBB).
 * Si se solicita aclarar, mezcla el color con blanco para fondos legibles.
 */
function hexToArgb(hex, mezclaBlanco = 0) {
  const limpio = String(hex || '#dbeafe').replace('#', '').trim();
  if (limpio.length !== 6) return 'FFDBEAFE';
  let r = parseInt(limpio.slice(0, 2), 16);
  let g = parseInt(limpio.slice(2, 4), 16);
  let b = parseInt(limpio.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 'FFDBEAFE';

  if (mezclaBlanco > 0) {
    r = Math.round(r + (255 - r) * mezclaBlanco);
    g = Math.round(g + (255 - g) * mezclaBlanco);
    b = Math.round(b + (255 - b) * mezclaBlanco);
  }

  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase();
  return `FF${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const BORDE_FINO_GRIS = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

/**
 * Agrega una hoja de Horario de Curso a un Workbook de ExcelJS
 */
function agregarHojaCursoAWorkbook(workbook, estado, auditoria, curso, hojasUsadas = new Set()) {
  const dias = estado.configuracion.diasHabiles || [];
  const bloques = estado.configuracion.bloquesHorarios || [];
  const totalCols = 2 + dias.length;

  const nombreHoja = limpiarNombreHojaExcel(`Curso ${curso.nombre}`, hojasUsadas);
  const sheet = workbook.addWorksheet(nombreHoja, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 }
    },
    views: [{ showGridLines: true }]
  });

  // Configurar anchos de columnas
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 16;
  for (let i = 0; i < dias.length; i++) {
    sheet.getColumn(3 + i).width = 25;
  }

  const materiasCurso = (auditoria.progresoMaterias || []).filter((m) => m.cursoId === curso.id);
  const materiasMap = new Map(materiasCurso.map((m) => [m.id, m]));
  const asignacionesCurso = estado.asignaciones.filter((a) => a.cursoId === curso.id);
  const reqCurso = materiasCurso.reduce((acc, m) => acc + (m.horasSemanales || 0), 0);
  const pctCurso = reqCurso > 0 ? Math.round((asignacionesCurso.length / reqCurso) * 100) : 0;

  // Fila 1: Título Institucional
  sheet.mergeCells(1, 1, 1, totalCols);
  const cellTitulo = sheet.getCell(1, 1);
  cellTitulo.value = `${estado.configuracion.nombreColegio || 'Institución Educativa'} — Horario Oficial: ${curso.nombre} (${curso.division || 'Única'})`;
  cellTitulo.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  cellTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  cellTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 26;

  // Fila 2: Subtítulo con Ciclo Lectivo y Cobertura
  sheet.mergeCells(2, 1, 2, totalCols);
  const cellSub = sheet.getCell(2, 1);
  cellSub.value = `Ciclo Lectivo: ${estado.configuracion.cicloLectivo || '2026'}   |   Turno: ${curso.turno || 'Jornada Completa'}   |   Carga Asignada: ${asignacionesCurso.length}/${reqCurso} hs cátedra (${pctCurso}%)`;
  cellSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
  cellSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  cellSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 18;

  // Fila 3: Encabezados de la Grilla Semanal
  const headerRowIdx = 4;
  const headerRow = sheet.getRow(headerRowIdx);
  headerRow.values = ['Bloque', 'Horario', ...dias];
  headerRow.height = 22;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDE_FINO_GRIS;
  }

  let filaActual = headerRowIdx + 1;

  for (const bloque of bloques) {
    const row = sheet.getRow(filaActual);
    row.height = 38;

    const cBloque = row.getCell(1);
    cBloque.value = bloque.nombre;
    cBloque.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cBloque.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cBloque.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cBloque.border = BORDE_FINO_GRIS;

    const cHorario = row.getCell(2);
    cHorario.value = `${bloque.inicio} - ${bloque.fin}`;
    cHorario.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
    cHorario.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cHorario.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cHorario.border = BORDE_FINO_GRIS;

    dias.forEach((dia, idxDia) => {
      const col = 3 + idxDia;
      const cell = row.getCell(col);
      const asig = asignacionesCurso.find(
        (a) => a.dia === dia && a.bloqueIndice === bloque.indice
      );
      const mat = asig ? materiasMap.get(asig.materiaId) : null;
      const esAlmuerzo = !mat && esBloqueAlmuerzo(estado, curso.id, dia, bloque.indice);

      if (mat) {
        cell.value = mat.docentesNombres
          ? `${mat.nombre}\n${mat.docentesNombres}`
          : `${mat.nombre}`;
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: hexToArgb(mat.color, 0.25) }
        };
      } else if (esAlmuerzo) {
        cell.value = '🍽️ Almuerzo';
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF9A3412' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
      } else {
        cell.value = '— Horario Libre —';
        cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BORDE_FINO_GRIS;
    });

    filaActual++;

    // Si tiene recreo posterior, agregar fila combinada de recreo (sin 'obligatorio' ni 'Fin del tramo')
    if (bloque.recreoPosterior) {
      sheet.mergeCells(filaActual, 1, filaActual, totalCols);
      const rCell = sheet.getCell(filaActual, 1);
      rCell.value = `☕ ${formatearEtiquetaRecreoExportacion(bloque.recreoPosterior)}`;
      rCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF92400E' } };
      rCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      rCell.alignment = { vertical: 'middle', horizontal: 'center' };
      rCell.border = BORDE_FINO_GRIS;
      sheet.getRow(filaActual).height = 17;
      filaActual++;
    }
  }

  // Tabla Resumen de Materias del Curso al pie
  filaActual += 1;
  sheet.mergeCells(filaActual, 1, filaActual, totalCols);
  const resTitle = sheet.getCell(filaActual, 1);
  resTitle.value = `📚 Plan de Estudios y Estado de Asignación — ${curso.nombre}`;
  resTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  resTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.getRow(filaActual).height = 20;
  filaActual++;

  const matHeader = sheet.getRow(filaActual);
  matHeader.values = ['Código', 'Materia', 'Docente(s) a Cargo', 'Formato Bloques', 'Hs Asignadas / Plan', 'Estado'];
  matHeader.height = 19;
  for (let c = 1; c <= Math.min(6, totalCols); c++) {
    const cell = matHeader.getCell(c);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDE_FINO_GRIS;
  }
  filaActual++;

  for (const m of materiasCurso) {
    const r = sheet.getRow(filaActual);
    r.height = 18;
    const estadoTexto = m.excedida
      ? `EXCESO (+${m.horasExceso} hs)`
      : m.completada
        ? 'COMPLETA'
        : `PENDIENTE (faltan ${m.horasPendientes} hs)`;
    const vals = [
      m.codigo || '-',
      m.nombre,
      m.docentesNombres || '-',
      `${m.formatoBloques} (${m.modoExigencia})`,
      `${m.horasAsignadas} / ${m.horasSemanales} hs`,
      estadoTexto
    ];
    vals.forEach((v, idx) => {
      const cell = r.getCell(idx + 1);
      cell.value = v;
      cell.font = {
        name: 'Calibri',
        size: 9,
        bold: idx === 1 || idx === 5,
        color: {
          argb: m.excedida ? 'FFB91C1C' : m.completada && idx === 5 ? 'FF047857' : 'FF1E293B'
        }
      };
      cell.alignment = { vertical: 'middle', horizontal: idx === 1 || idx === 2 ? 'left' : 'center' };
      cell.border = BORDE_FINO_GRIS;
    });
    filaActual++;
  }

  return sheet;
}

/**
 * Agrega una hoja de Horario de Docente a un Workbook de ExcelJS
 */
function agregarHojaDocenteAWorkbook(workbook, estado, docenteId, hojasUsadas = new Set()) {
  const metricasDoc = calcularMetricasDocente(estado, docenteId);
  if (!metricasDoc) return null;

  const dias = estado.configuracion.diasHabiles || [];
  const bloques = estado.configuracion.bloquesHorarios || [];
  const totalCols = 2 + dias.length;

  const nombreHoja = limpiarNombreHojaExcel(`Doc ${metricasDoc.nombre.replace(/^Prof\.\s*/i, '')}`, hojasUsadas);
  const sheet = workbook.addWorksheet(nombreHoja, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 }
    },
    views: [{ showGridLines: true }]
  });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 16;
  for (let i = 0; i < dias.length; i++) {
    sheet.getColumn(3 + i).width = 25;
  }

  // Fila 1: Encabezado del Docente
  sheet.mergeCells(1, 1, 1, totalCols);
  const cellTitulo = sheet.getCell(1, 1);
  cellTitulo.value = `${estado.configuracion.nombreColegio || 'Institución Educativa'} — Agenda Docente: ${metricasDoc.nombre} (${metricasDoc.especialidad || ''})`;
  cellTitulo.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  cellTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  cellTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 26;

  // Fila 2: Métricas clave del docente
  sheet.mergeCells(2, 1, 2, totalCols);
  const cellSub = sheet.getCell(2, 1);
  cellSub.value = `Legajo: ${metricasDoc.legajo || '-'}   |   Horas Asignadas: ${metricasDoc.totalHorasAsignadas}/${metricasDoc.totalHorasPlanDocente || 0} hs   |   Disponibles sin clase: ${metricasDoc.totalHorasDisponiblesLibres} hs   |   ⚠️ Horas Libres (Huecos): ${metricasDoc.totalHorasPuente} hs   |   Choques: ${metricasDoc.totalChoquesDocente || 0}`;
  cellSub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  cellSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  cellSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 19;

  // Fila 4: Encabezados de la Grilla Semanal
  const headerRowIdx = 4;
  const headerRow = sheet.getRow(headerRowIdx);
  headerRow.values = [
    'Bloque',
    'Horario',
    ...dias.map((d) => {
      const pDia = metricasDoc.porDia[d]?.cantidadHorasPuente || 0;
      return pDia > 0 ? `${d} (⚠️ ${pDia}h libre)` : `${d} (0h libre)`;
    })
  ];
  headerRow.height = 22;
  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDE_FINO_GRIS;
  }

  let filaActual = headerRowIdx + 1;

  for (const bloque of bloques) {
    const row = sheet.getRow(filaActual);
    row.height = 36;

    const cBloque = row.getCell(1);
    cBloque.value = bloque.nombre;
    cBloque.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cBloque.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cBloque.alignment = { vertical: 'middle', horizontal: 'center' };
    cBloque.border = BORDE_FINO_GRIS;

    const cHorario = row.getCell(2);
    cHorario.value = `${bloque.inicio} - ${bloque.fin}`;
    cHorario.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
    cHorario.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cHorario.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cHorario.border = BORDE_FINO_GRIS;

    dias.forEach((dia, idxDia) => {
      const col = 3 + idxDia;
      const cell = row.getCell(col);
      const celda = metricasDoc.porDia[dia]?.celdas?.[bloque.indice];

      if (celda && celda.ocupado) {
        if (celda.tieneChoque) {
          const detalleChoque = (celda.detallesSlot || [])
            .map((ds) => `${ds.cursoNombre}: ${ds.materiaNombre}`)
            .join(' ⚡ ');
          cell.value = `🚨 CHOQUE:\n${detalleChoque}`;
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF991B1B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
        } else {
          cell.value = `🎓 ${celda.cursoNombre}\n${celda.materiaNombre}${celda.posicionEnBloqueDia ? `\n[Bloque ${celda.posicionEnBloqueDia}h]` : ''}`;
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E3A8A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        }
      } else if (celda && celda.esHoraPuente) {
        cell.value = '⚠️ HORA LIBRE\n(Hueco entre clases)';
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF92400E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      } else if (celda && celda.disponible) {
        cell.value = 'Disponible Libre';
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF065F46' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      } else {
        cell.value = 'No Disponible';
        cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }

      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BORDE_FINO_GRIS;
    });

    filaActual++;

    if (bloque.recreoPosterior) {
      sheet.mergeCells(filaActual, 1, filaActual, totalCols);
      const rCell = sheet.getCell(filaActual, 1);
      rCell.value = `☕ ${formatearEtiquetaRecreoExportacion(bloque.recreoPosterior)}`;
      rCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF92400E' } };
      rCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      rCell.alignment = { vertical: 'middle', horizontal: 'center' };
      rCell.border = BORDE_FINO_GRIS;
      sheet.getRow(filaActual).height = 17;
      filaActual++;
    }
  }

  // Tabla de Materias a Cargo del Docente
  filaActual += 1;
  sheet.mergeCells(filaActual, 1, filaActual, totalCols);
  const resTitle = sheet.getCell(filaActual, 1);
  resTitle.value = `📚 Materias a Cargo de ${metricasDoc.nombre}`;
  resTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  resTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.getRow(filaActual).height = 20;
  filaActual++;

  const matHeader = sheet.getRow(filaActual);
  matHeader.values = ['Curso', 'Materia', 'Formato Bloques', 'Hs Asignadas / Plan', 'Pareja Pedagógica', 'Estado'];
  matHeader.height = 19;
  for (let c = 1; c <= Math.min(6, totalCols); c++) {
    const cell = matHeader.getCell(c);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDE_FINO_GRIS;
  }
  filaActual++;

  for (const m of metricasDoc.materiasACargo || []) {
    const r = sheet.getRow(filaActual);
    r.height = 18;
    const vals = [
      `${m.cursoNombre} (${m.cursoDivision || ''})`,
      m.nombre,
      m.formatoBloques,
      `${m.horasAsignadas} / ${m.horasSemanales} hs`,
      m.coDocentesNombres && m.coDocentesNombres.length > 0 ? m.coDocentesNombres.join(', ') : 'Individual',
      m.completada ? 'COMPLETA' : `Faltan ${m.horasPendientes} hs`
    ];
    vals.forEach((v, idx) => {
      const cell = r.getCell(idx + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 9, bold: idx === 0 || idx === 1 };
      cell.alignment = { vertical: 'middle', horizontal: idx === 1 ? 'left' : 'center' };
      cell.border = BORDE_FINO_GRIS;
    });
    filaActual++;
  }

  return sheet;
}

/**
 * Agrega una hoja inicial de Resumen Institucional a un Workbook masivo
 */
function agregarHojaResumenInstitucional(workbook, estado, auditoria, hojasUsadas = new Set()) {
  const nombreHoja = limpiarNombreHojaExcel('Resumen Institucional', hojasUsadas);
  const sheet = workbook.addWorksheet(nombreHoja, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });

  sheet.columns = [
    { width: 28 },
    { width: 26 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 34 }
  ];

  sheet.mergeCells(1, 1, 1, 6);
  const title = sheet.getCell(1, 1);
  title.value = `${estado.configuracion.nombreColegio || 'Institución Educativa'} — Reporte General de Horarios (${estado.configuracion.cicloLectivo || '2026'})`;
  title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, 6);
  const sub = sheet.getCell(2, 1);
  sub.value = `Cobertura Global: ${auditoria.totalHorasAsignadas}/${auditoria.totalHorasRequeridas} hs (${auditoria.porcentajeCompletitud}%)   |   Choques Docentes: ${auditoria.choquesDocentes.length}   |   Total Horas Libres Escuela: ${auditoria.totalHorasPuenteEscuela} hs`;
  sub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sheet.getRow(2).height = 19;

  let fila = 4;
  const hDoc = sheet.getRow(fila++);
  hDoc.values = ['Docente', 'Especialidad', 'Legajo', 'Hs Asignadas', '⚠️ Horas Libres', 'Días con Horas Libres'];
  hDoc.height = 20;
  for (let c = 1; c <= 6; c++) {
    const cell = hDoc.getCell(c);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDE_FINO_GRIS;
  }

  for (const md of auditoria.metricasDocentes || []) {
    const r = sheet.getRow(fila++);
    r.height = 18;
    const diasPuente = (md.detalleHorasPuentePorDia || [])
      .map((dp) => `${dp.dia}: ${dp.cantidadHorasPuente}h`)
      .join(', ') || 'Sin horas libres';
    const docObj = estado.docentes.find((d) => d.id === md.docenteId);
    const vals = [
      md.nombre,
      md.especialidad,
      docObj?.legajo || '-',
      `${md.totalHorasAsignadas} hs`,
      `${md.totalHorasPuente} hs`,
      diasPuente
    ];
    vals.forEach((v, idx) => {
      const cell = r.getCell(idx + 1);
      cell.value = v;
      cell.font = {
        name: 'Calibri',
        size: 9,
        bold: idx === 0 || (idx === 4 && md.totalHorasPuente > 0),
        color: { argb: idx === 4 && md.totalHorasPuente > 0 ? 'FFB45309' : 'FF1E293B' }
      };
      cell.alignment = { vertical: 'middle', horizontal: idx <= 1 || idx === 5 ? 'left' : 'center' };
      cell.border = BORDE_FINO_GRIS;
    });
  }

  return sheet;
}

/**
 * Construye y guarda un archivo Excel (.xlsx) según el modo solicitado:
 * - tipo: 'CURSO' | 'DOCENTE' | 'MASIVO_CURSOS' | 'MASIVO_DOCENTES' | 'MASIVO_COMPLETO'
 */
async function generarArchivoExcelHorario(estado, opciones = {}, rutaDestino) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SGH - Sistema de Gestión Horaria Escolar';
  workbook.created = new Date();
  const auditoria = auditarEstadoHorario(estado);
  const hojasUsadas = new Set();

  const tipo = opciones.tipo || opciones.alcance || 'CURSO';

  if (tipo === 'CURSO') {
    const curso =
      estado.cursos.find((c) => c.id === opciones.cursoId) || estado.cursos[0];
    if (!curso) throw new Error('Curso no encontrado para exportar.');
    agregarHojaCursoAWorkbook(workbook, estado, auditoria, curso, hojasUsadas);
  } else if (tipo === 'DOCENTE') {
    const doc =
      estado.docentes.find((d) => d.id === opciones.docenteId) || estado.docentes[0];
    if (!doc) throw new Error('Docente no encontrado para exportar.');
    agregarHojaDocenteAWorkbook(workbook, estado, doc.id, hojasUsadas);
  } else if (tipo === 'MASIVO_CURSOS') {
    agregarHojaResumenInstitucional(workbook, estado, auditoria, hojasUsadas);
    for (const c of estado.cursos) {
      agregarHojaCursoAWorkbook(workbook, estado, auditoria, c, hojasUsadas);
    }
  } else if (tipo === 'MASIVO_DOCENTES') {
    agregarHojaResumenInstitucional(workbook, estado, auditoria, hojasUsadas);
    for (const d of estado.docentes) {
      agregarHojaDocenteAWorkbook(workbook, estado, d.id, hojasUsadas);
    }
  } else {
    // MASIVO_COMPLETO
    agregarHojaResumenInstitucional(workbook, estado, auditoria, hojasUsadas);
    for (const c of estado.cursos) {
      agregarHojaCursoAWorkbook(workbook, estado, auditoria, c, hojasUsadas);
    }
    for (const d of estado.docentes) {
      agregarHojaDocenteAWorkbook(workbook, estado, d.id, hojasUsadas);
    }
  }

  if (rutaDestino) {
    const dir = path.dirname(rutaDestino);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await workbook.xlsx.writeFile(rutaDestino);
  }

  return {
    workbook,
    cantidadHojas: workbook.worksheets.length,
    nombresHojas: workbook.worksheets.map((w) => w.name),
    rutaArchivo: rutaDestino || null
  };
}

/**
 * Construye una página HTML A4 Horizontal para un Curso Individual
 */
function construirPaginaHtmlCurso(estado, auditoria, curso, conSaltoPagina = false) {
  const dias = estado.configuracion.diasHabiles || [];
  const bloques = estado.configuracion.bloquesHorarios || [];
  const materiasCurso = (auditoria.progresoMaterias || []).filter((m) => m.cursoId === curso.id);
  const materiasMap = new Map(materiasCurso.map((m) => [m.id, m]));
  const asignacionesCurso = estado.asignaciones.filter((a) => a.cursoId === curso.id);
  const reqCurso = materiasCurso.reduce((acc, m) => acc + (m.horasSemanales || 0), 0);
  const pctCurso = reqCurso > 0 ? Math.round((asignacionesCurso.length / reqCurso) * 100) : 0;

  const filasHtml = bloques
    .map((b) => {
      const numeroHora = b.numero || b.indice + 1;
      const celdas = dias
        .map((dia) => {
          const asig = asignacionesCurso.find((a) => a.dia === dia && a.bloqueIndice === b.indice);
          const mat = asig ? materiasMap.get(asig.materiaId) : null;
          if (mat) {
            return `
              <td class="cell-asig" style="background:${mat.color || '#dbeafe'}; border-left: 3px solid #1e40af;">
                <div class="mat-name">${mat.nombre}</div>
                <div class="doc-name">${mat.docentesNombres || ''}</div>
              </td>
            `;
          }
          if (esBloqueAlmuerzo(estado, curso.id, dia, b.indice)) {
            return `
              <td class="cell-almuerzo">
                <div class="alm-label">🍽️ Almuerzo</div>
              </td>
            `;
          }
          return `<td class="cell-free">Libre</td>`;
        })
        .join('');

      const filaRecreo = b.recreoPosterior
        ? `<tr class="row-recreo"><td colspan="${dias.length + 2}">☕ ${formatearEtiquetaRecreoExportacion(b.recreoPosterior)}</td></tr>`
        : '';

      return `
        <tr>
          <td class="cell-hora">${numeroHora}</td>
          <td class="cell-horario">${b.inicio} - ${b.fin}</td>
          ${celdas}
        </tr>
        ${filaRecreo}
      `;
    })
    .join('');

  return `
    <section class="pdf-page ${conSaltoPagina ? 'page-break' : ''}">
      <header class="pdf-header">
        <div>
          <h1>${estado.configuracion.nombreColegio || 'Institución Educativa'}</h1>
          <h2>Horario Oficial de Clases — ${curso.nombre} (${curso.division || 'Única'}) · Ciclo Lectivo ${estado.configuracion.cicloLectivo || '2026'}</h2>
        </div>
        <div class="pdf-meta">
          <div><strong>Cobertura:</strong> ${asignacionesCurso.length}/${reqCurso} hs (${pctCurso}%)</div>
          <div><strong>Turno:</strong> ${curso.turno || 'Jornada Completa'}</div>
        </div>
      </header>
      <table class="pdf-grid">
        <thead>
          <tr>
            <th style="width:38px;">Hora</th>
            <th style="width:98px;">Horario</th>
            ${dias.map((d) => `<th>${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filasHtml}
        </tbody>
      </table>
    </section>
  `;
}

/**
 * Construye una página HTML A4 Horizontal para un Docente Individual
 */
function construirPaginaHtmlDocente(estado, docenteId, conSaltoPagina = false) {
  const metricasDoc = calcularMetricasDocente(estado, docenteId);
  if (!metricasDoc) return '';
  const dias = estado.configuracion.diasHabiles || [];
  const bloques = estado.configuracion.bloquesHorarios || [];

  const filasHtml = bloques
    .map((b) => {
      const numeroHora = b.numero || b.indice + 1;
      const celdas = dias
        .map((dia) => {
          const celda = metricasDoc.porDia[dia]?.celdas?.[b.indice];
          if (celda && celda.ocupado) {
            if (celda.tieneChoque) {
              const det = (celda.detallesSlot || [])
                .map((ds) => `${ds.cursoNombre}: ${ds.materiaNombre}`)
                .join(' ⚡ ');
              return `<td class="cell-clash"><strong>🚨 CHOQUE</strong><div>${det}</div></td>`;
            }
            return `
              <td class="cell-doc-busy">
                <div class="mat-name">🎓 ${celda.cursoNombre}</div>
                <div class="doc-name">${celda.materiaNombre}</div>
              </td>
            `;
          }
          if (celda && celda.esHoraPuente) {
            return `<td class="cell-puente"><strong>⚠️ Hora Libre</strong><div>Hueco entre clases</div></td>`;
          }
          if (celda && celda.disponible) {
            return `<td class="cell-disp">Disponible</td>`;
          }
          return `<td class="cell-nodisp">No disponible</td>`;
        })
        .join('');

      const filaRecreo = b.recreoPosterior
        ? `<tr class="row-recreo"><td colspan="${dias.length + 2}">☕ ${formatearEtiquetaRecreoExportacion(b.recreoPosterior)}</td></tr>`
        : '';

      return `
        <tr>
          <td class="cell-hora">${numeroHora}</td>
          <td class="cell-horario">${b.inicio} - ${b.fin}</td>
          ${celdas}
        </tr>
        ${filaRecreo}
      `;
    })
    .join('');

  return `
    <section class="pdf-page ${conSaltoPagina ? 'page-break' : ''}">
      <header class="pdf-header">
        <div>
          <h1>${estado.configuracion.nombreColegio || 'Institución Educativa'}</h1>
          <h2>Agenda Horaria Docente — ${metricasDoc.nombre} (${metricasDoc.especialidad || ''})</h2>
        </div>
        <div class="pdf-meta">
          <div><strong>Horas Asignadas:</strong> ${metricasDoc.totalHorasAsignadas}/${metricasDoc.totalHorasPlanDocente || 0} hs</div>
          <div><strong>⚠️ Horas Libres:</strong> ${metricasDoc.totalHorasPuente} hs · <strong>Disponibles sin curso:</strong> ${metricasDoc.totalHorasDisponiblesLibres} hs</div>
        </div>
      </header>
      <table class="pdf-grid">
        <thead>
          <tr>
            <th style="width:38px;">Hora</th>
            <th style="width:98px;">Horario</th>
            ${dias
              .map((d) => {
                const p = metricasDoc.porDia[d]?.cantidadHorasPuente || 0;
                return `<th>${d}${p > 0 ? ` <span style="color:#fcd34d;">(⚠️ ${p}h libre)</span>` : ''}</th>`;
              })
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${filasHtml}
        </tbody>
      </table>
    </section>
  `;
}

/**
 * Genera el documento HTML completo con CSS @media print optimizado para A4 Horizontal (Landscape)
 */
function construirHtmlImpresionPDF(estado, opciones = {}) {
  const auditoria = auditarEstadoHorario(estado);
  const tipo = opciones.tipo || opciones.alcance || 'CURSO';
  const paginas = [];

  if (tipo === 'CURSO') {
    const curso = estado.cursos.find((c) => c.id === opciones.cursoId) || estado.cursos[0];
    if (curso) paginas.push(construirPaginaHtmlCurso(estado, auditoria, curso, false));
  } else if (tipo === 'DOCENTE') {
    const doc = estado.docentes.find((d) => d.id === opciones.docenteId) || estado.docentes[0];
    if (doc) paginas.push(construirPaginaHtmlDocente(estado, doc.id, false));
  } else if (tipo === 'MASIVO_CURSOS') {
    estado.cursos.forEach((c, idx) => {
      paginas.push(construirPaginaHtmlCurso(estado, auditoria, c, idx < estado.cursos.length - 1));
    });
  } else if (tipo === 'MASIVO_DOCENTES') {
    estado.docentes.forEach((d, idx) => {
      paginas.push(construirPaginaHtmlDocente(estado, d.id, idx < estado.docentes.length - 1));
    });
  } else {
    // MASIVO_COMPLETO
    estado.cursos.forEach((c) => {
      paginas.push(construirPaginaHtmlCurso(estado, auditoria, c, true));
    });
    estado.docentes.forEach((d, idx) => {
      paginas.push(construirPaginaHtmlDocente(estado, d.id, idx < estado.docentes.length - 1));
    });
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte SGH - ${estado.configuracion.nombreColegio || 'Horarios'}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    .pdf-page {
      width: 100%;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    .pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .pdf-header h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
    }
    .pdf-header h2 {
      margin: 2px 0 0 0;
      font-size: 11px;
      font-weight: 500;
      color: #93c5fd;
    }
    .pdf-meta {
      text-align: right;
      font-size: 10px;
      line-height: 1.4;
      color: #e2e8f0;
    }
    .pdf-grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9.5px;
    }
    .pdf-grid th {
      background: #1e3a8a;
      color: #ffffff;
      padding: 4px 6px;
      border: 1px solid #cbd5e1;
      font-size: 10px;
      text-align: center;
    }
    .pdf-grid td {
      border: 1px solid #cbd5e1;
      padding: 3px 5px;
      vertical-align: middle;
      text-align: center;
      height: 33px;
      overflow: hidden;
    }
    .cell-hora {
      background: #f1f5f9;
      text-align: center !important;
      font-weight: 800;
      font-size: 11px;
      color: #0f172a;
    }
    .cell-horario {
      background: #f8fafc;
      text-align: center !important;
      font-weight: 700;
      font-size: 10.5px;
      color: #1e293b;
      white-space: nowrap;
    }
    .cell-almuerzo {
      background: #ffedd5;
      border-left: 3px solid #ea580c !important;
    }
    .cell-almuerzo .alm-label {
      font-weight: 800;
      font-size: 10px;
      color: #9a3412;
    }
    .cell-asig .mat-name, .cell-doc-busy .mat-name {
      font-weight: 700;
      font-size: 9.5px;
      color: #0f172a;
      line-height: 1.15;
    }
    .cell-asig .doc-name, .cell-doc-busy .doc-name {
      font-size: 8.5px;
      color: #334155;
      margin-top: 1px;
    }
    .cell-doc-busy {
      background: #dbeafe;
      border-left: 3px solid #2563eb !important;
    }
    .cell-free {
      color: #94a3b8;
      font-style: italic;
      font-size: 8.5px;
    }
    .cell-puente {
      background: #fef3c7;
      color: #92400e;
      font-size: 8.5px;
    }
    .cell-disp {
      background: #ecfdf5;
      color: #065f46;
      font-size: 8.5px;
    }
    .cell-nodisp {
      background: #f1f5f9;
      color: #94a3b8;
      font-size: 8px;
      font-style: italic;
    }
    .cell-clash {
      background: #fecaca;
      color: #991b1b;
      font-size: 8.5px;
    }
    .row-recreo td {
      height: 14px !important;
      padding: 1px 6px !important;
      background: #fef3c7;
      color: #92400e;
      font-weight: 700;
      font-size: 8.5px;
      text-align: center;
    }
  </style>
</head>
<body>
  ${paginas.join('\n')}
</body>
</html>`;
}

/**
 * Sugiere un nombre de archivo descriptivo para la exportación solicitada
 */
function sugerirNombreArchivoExportacion(estado, opciones = {}, extension = 'xlsx') {
  const tipo = opciones.tipo || opciones.alcance || 'CURSO';
  const fecha = new Date().toISOString().slice(0, 10);
  const siglas = limpiarNombreArchivo(estado.configuracion?.siglasColegio || 'SGH');

  if (tipo === 'CURSO') {
    const curso = estado.cursos.find((c) => c.id === opciones.cursoId) || estado.cursos[0];
    return `${siglas}_Horario_${limpiarNombreArchivo(curso ? curso.nombre : 'Curso')}_${fecha}.${extension}`;
  }
  if (tipo === 'DOCENTE') {
    const doc = estado.docentes.find((d) => d.id === opciones.docenteId) || estado.docentes[0];
    return `${siglas}_Agenda_${limpiarNombreArchivo(doc ? doc.nombre : 'Docente')}_${fecha}.${extension}`;
  }
  if (tipo === 'MASIVO_CURSOS') {
    return `${siglas}_Horarios_Todos_Los_Cursos_${fecha}.${extension}`;
  }
  if (tipo === 'MASIVO_DOCENTES') {
    return `${siglas}_Agendas_Todos_Los_Docentes_${fecha}.${extension}`;
  }
  return `${siglas}_Reporte_Integral_Institucion_${fecha}.${extension}`;
}

module.exports = {
  limpiarNombreArchivo,
  sugerirNombreArchivoExportacion,
  generarArchivoExcelHorario,
  construirHtmlImpresionPDF
};
