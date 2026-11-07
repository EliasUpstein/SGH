/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Controlador Principal de Interfaz (Renderer UI)
 */

(function () {
  const uiState = {
    tabActual: 'dashboard',
    subTabConfigSistema: 'parametros', // 'parametros' | 'backups' | 'auditoria' | 'acerca'
    cursoSeleccionadoId: 'c1',
    docenteSeleccionadoId: 'd1',
    materiaSeleccionadaBandejaId: null,
    celdaOrigenSeleccionada: null, // { dia, bloqueIndice }
    modoBloquesCurso: 'INDIVIDUAL', // 'INDIVIDUAL' (1h) | 'AUTO_BLOQUE' (2h/3h según formatoBloques)
    modoAsignarAlmuerzoCurso: false, // Permite marcar/desmarcar bloques de Almuerzo con clic izquierdo
    filtroBandejaCurso: 'TODAS', // 'TODAS' | 'PENDIENTES' | 'COMPLETAS' | 'ALERTAS'
    materiaSeleccionadaVistaDocenteId: null, // Materia seleccionada en el listado de la Vista por Docente
    celdaOrigenVistaDocente: null, // { cursoId, materiaId, dia, bloqueIndice } para mover clase desde Vista por Docente
    modoInteraccionVistaDocente: 'HORARIO', // 'HORARIO' | 'DISPONIBILIDAD'
    modoBloquesDocente: 'INDIVIDUAL', // 'INDIVIDUAL' (1h) | 'AUTO_BLOQUE' (2h/3h según formatoBloques)
    permitirExcesoVistaDocente: false, // Si es false, valida estrictamente no superar las horas semanales de la materia
    filtroPropuestas: 'TODAS', // Fase 4: 'TODAS' | 'LIBRE' | 'ENROQUE_1_A_1' | 'ENROQUE_TRIANGULAR'
    conservarBackups: 5, // Cantidad de copias recientes a conservar al limpiar copias antiguas
    deseadoConfig: {
      cursoId: 'c1',
      modoObjetivo: 'MATERIA', // 'MATERIA' | 'DOCENTE'
      materiaId: null,
      docenteId: null,
      destinoDia: 'Martes',
      destinoBloqueIndice: 4,
      cantidadBloques: 3
    },
    resumen: null,
    infoStorage: null
  };

  // Operación pendiente de confirmación en el Modal de Detalle de Impacto (Fase 4)
  let operacionPendienteModal = null; // { impacto, alternativaTriangular, mensajeExito, onAplicado }

  function agruparIndicesContiguos(indices) {
    const ordenados = Array.from(new Set(indices || [])).sort((a, b) => a - b);
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

  function mostrarToast(mensaje, tipo = 'info') {
    const params =
      uiState.resumen?.auditoria?.parametrosSistema ||
      uiState.resumen?.estado?.configuracion?.parametrosSistema;
    if (params && params.mostrarNotificacionesToast === false) {
      return;
    }

    const container = document.getElementById('toast-container');
    if (!container) return;

    const colores = {
      info: 'bg-slate-900 border-blue-500/50 text-blue-200',
      success: 'bg-slate-900 border-emerald-500/50 text-emerald-200',
      warning: 'bg-slate-900 border-amber-500/50 text-amber-200',
      error: 'bg-slate-900 border-rose-500/50 text-rose-200'
    };

    const el = document.createElement('div');
    el.className = `px-4 py-2.5 rounded-xl border shadow-xl text-xs font-medium transition-all duration-300 pointer-events-auto flex items-center gap-2 ${colores[tipo] || colores.info}`;
    el.innerHTML = `<span>${mensaje}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  async function inicializarApp() {
    try {
      const data = await window.sghAPI.inicializarSistema();
      uiState.resumen = data.resumen;
      uiState.infoStorage = data.infoStorage;

      if (uiState.resumen.estado.cursos.length > 0) {
        uiState.cursoSeleccionadoId = uiState.resumen.estado.cursos[0].id;
      }
      if (uiState.resumen.estado.docentes.length > 0) {
        uiState.docenteSeleccionadoId = uiState.resumen.estado.docentes[0].id;
      }

      configurarEventosGlobales();
      renderizarTodo();
    } catch (err) {
      console.error('Error al inicializar SGH:', err);
      mostrarToast('Error al inicializar los datos del sistema.', 'error');
    }
  }

  function configurarEventosGlobales() {
    // Cambio de pestañas
    document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.tabActual = btn.getAttribute('data-tab');
        actualizarBotonesNav();
        renderizarTodo();
      });
    });

    // Undo / Redo botones
    document.getElementById('btn-undo').addEventListener('click', ejecutarUndo);
    document.getElementById('btn-redo').addEventListener('click', ejecutarRedo);

    // Atajos de teclado Ctrl+Z / Ctrl+Y
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        ejecutarUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        ejecutarRedo();
      }
    });

    // Modo Simulación / Borrador
    document.getElementById('btn-toggle-simulacion').addEventListener('click', () => {
      if (!uiState.resumen) return;
      if (!uiState.resumen.modoSimulacion) {
        uiState.resumen = window.sghAPI.iniciarSimulacion();
        mostrarToast('🧪 Modo Simulación activado. Tus cambios no alterarán el Horario Oficial hasta confirmar.', 'warning');
      } else {
        abrirModalDiffSimulacion();
      }
      renderizarTodo();
    });

    // Guardar y Cargar Simulaciones
    document.getElementById('btn-abrir-simulaciones')?.addEventListener('click', () => {
      abrirModalSimulaciones();
    });
    document.getElementById('btn-guardar-simulacion')?.addEventListener('click', () => {
      abrirModalSimulaciones(true);
    });
    document.getElementById('btn-cargar-simulacion-banner')?.addEventListener('click', () => {
      abrirModalSimulaciones(false);
    });
    document.getElementById('btn-cerrar-modal-simulaciones')?.addEventListener('click', () => {
      cerrarModalSimulaciones();
    });

    document.getElementById('btn-ver-diff-simulacion').addEventListener('click', abrirModalDiffSimulacion);

    document.getElementById('btn-confirmar-simulacion').addEventListener('click', confirmarSimulacion);
    document.getElementById('btn-modal-confirmar').addEventListener('click', () => {
      cerrarModalDiffSimulacion();
      confirmarSimulacion();
    });

    document.getElementById('btn-descartar-simulacion').addEventListener('click', descartarSimulacion);
    document.getElementById('btn-modal-descartar').addEventListener('click', () => {
      cerrarModalDiffSimulacion();
      descartarSimulacion();
    });

    document.getElementById('btn-cerrar-modal-diff').addEventListener('click', cerrarModalDiffSimulacion);

    // Modal Obligatorio de Pre-Confirmación de Movimientos (Fase 4)
    document.getElementById('btn-cerrar-modal-movimiento')?.addEventListener('click', cancelarModalMovimiento);
    document.getElementById('btn-cancelar-modal-movimiento')?.addEventListener('click', cancelarModalMovimiento);
    document.getElementById('btn-aplicar-modal-movimiento')?.addEventListener('click', () => {
      if (!operacionPendienteModal) return;
      const { impacto, mensajeExito, onAplicado } = operacionPendienteModal;
      cerrarModalMovimiento();
      ejecutarOperacionConfirmada(impacto.operacion, mensajeExito || impacto.descripcionHistorial, onAplicado);
    });

    // Modal Asistente de Movimiento Deseado
    document.getElementById('btn-cerrar-modal-deseado')?.addEventListener('click', cerrarModalMovimientoDeseado);
    document.getElementById('btn-cancelar-modal-deseado')?.addEventListener('click', cerrarModalMovimientoDeseado);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (operacionPendienteModal) {
          cancelarModalMovimiento();
        } else if (!document.getElementById('modal-movimiento-deseado')?.classList.contains('hidden')) {
          cerrarModalMovimientoDeseado();
        }
      }
    });
  }

  function ejecutarUndo() {
    const res = window.sghAPI.deshacer();
    if (res) {
      uiState.resumen = res.resumen;
      renderizarTodo();
      mostrarToast(`↩ Deshecho: ${res.operacionDeshecha}`, 'info');
    }
  }

  function ejecutarRedo() {
    const res = window.sghAPI.rehacer();
    if (res) {
      uiState.resumen = res.resumen;
      renderizarTodo();
      mostrarToast(`↪ Rehecho: ${res.operacionRehecha}`, 'info');
    }
  }

  async function confirmarSimulacion() {
    uiState.resumen = window.sghAPI.confirmarSimulacionComoOficial();
    uiState.infoStorage = await window.sghAPI.obtenerInfoStorage();
    renderizarTodo();
    mostrarToast('✅ Simulación confirmada y guardada como nuevo Horario Oficial (con copia de seguridad automática).', 'success');
  }

  function descartarSimulacion() {
    uiState.resumen = window.sghAPI.descartarSimulacion();
    renderizarTodo();
    mostrarToast('✖ Simulación descartada. Se restauró intacto el Horario Oficial.', 'info');
  }

  function actualizarBotonesNav() {
    document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
      const activo = btn.getAttribute('data-tab') === uiState.tabActual;
      const esTabAlertas = btn.getAttribute('data-tab') === 'alertas';
      if (esTabAlertas) {
        btn.className = activo
          ? 'nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-blue-600 text-white shadow flex items-center gap-1.5'
          : 'nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-1.5';
      } else {
        btn.className = activo
          ? 'nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-blue-600 text-white shadow'
          : 'nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-300 hover:text-white hover:bg-slate-800/60';
      }
    });

    ['dashboard', 'curso', 'docente', 'alertas', 'configuracion', 'persistencia'].forEach((id) => {
      const sec = document.getElementById(`tab-${id}`);
      if (sec) {
        sec.classList.toggle('hidden', id !== uiState.tabActual);
      }
    });
  }

  /**
   * Compara la auditoría previa y posterior a un movimiento/asignación y emite advertencias claras
   * si se generó un Choque Docente, Violación de Disponibilidad, Cruce de Recreo, Exceso u Horas Libres.
   */
  function evaluarYNotificarImpactoOperacion(auditoriaAntes, auditoriaDespues, mensajeExitoBase) {
    if (!auditoriaAntes || !auditoriaDespues) {
      mostrarToast(mensajeExitoBase, 'info');
      return;
    }

    // 1. Verificar si se generaron nuevos choques docentes
    if (auditoriaDespues.choquesDocentes.length > auditoriaAntes.choquesDocentes.length) {
      const ultimoChoque =
        auditoriaDespues.choquesDocentes[auditoriaDespues.choquesDocentes.length - 1];
      mostrarToast(
        `🚨 ¡CHOQUE DOCENTE GENERADO! ${ultimoChoque.explicacion}`,
        'error'
      );
      return;
    }

    // 2. Verificar si se generaron nuevas violaciones de disponibilidad
    if (
      auditoriaDespues.violacionesDisponibilidad.length >
      auditoriaAntes.violacionesDisponibilidad.length
    ) {
      const ultimaViol =
        auditoriaDespues.violacionesDisponibilidad[
          auditoriaDespues.violacionesDisponibilidad.length - 1
        ];
      mostrarToast(
        `🚫 ¡DOCENTE NO DISPONIBLE! ${ultimaViol.explicacion}`,
        'error'
      );
      return;
    }

    // 3. Verificar si se generaron nuevos excesos de carga horaria
    const excesosAntes = (auditoriaAntes.materiasExcedidas || []).reduce(
      (acc, m) => acc + m.horasExceso,
      0
    );
    const excesosDespues = (auditoriaDespues.materiasExcedidas || []).reduce(
      (acc, m) => acc + m.horasExceso,
      0
    );
    if (excesosDespues > excesosAntes) {
      const matExc =
        auditoriaDespues.materiasExcedidas[auditoriaDespues.materiasExcedidas.length - 1];
      mostrarToast(
        `🚨 ¡EXCESO DE HORAS! ${matExc.nombre} (${matExc.cursoNombre}) quedó con ${matExc.horasAsignadas}/${matExc.horasSemanales} hs (+${matExc.horasExceso} hs en exceso).`,
        'error'
      );
      return;
    }

    // 4. Verificar si se generó un nuevo cruce de recreo innecesario
    if (auditoriaDespues.advertenciasRecreos.length > auditoriaAntes.advertenciasRecreos.length) {
      const adv =
        auditoriaDespues.advertenciasRecreos[auditoriaDespues.advertenciasRecreos.length - 1];
      mostrarToast(
        `☕ ¡ADVERTENCIA DE RECREO! ${adv.materiaNombre} (${adv.cursoNombre} · ${adv.dia}): ${adv.detalle}`,
        'warning'
      );
      return;
    }

    // 5. Evaluar variación en Horas Libres por docente
    const deltaPuenteGlobal =
      auditoriaDespues.totalHorasPuenteEscuela - auditoriaAntes.totalHorasPuenteEscuela;

    if (deltaPuenteGlobal > 0) {
      const afectados = [];
      for (const mdDesp of auditoriaDespues.metricasDocentes) {
        const mdAnt = auditoriaAntes.metricasDocentes.find(
          (x) => x.docenteId === mdDesp.docenteId
        );
        const diffDoc = mdDesp.totalHorasPuente - (mdAnt ? mdAnt.totalHorasPuente : 0);
        if (diffDoc > 0) {
          afectados.push(`${mdDesp.nombre} (+${diffDoc} hs libres)`);
        }
      }
      mostrarToast(
        `⚠️ Movimiento aplicado, pero generó Horas Libres: ${afectados.join(', ')}.`,
        'warning'
      );
      return;
    }

    if (deltaPuenteGlobal < 0) {
      mostrarToast(
        `✅ ${mensajeExitoBase} · ¡Optimización! Se redujeron ${Math.abs(deltaPuenteGlobal)} hora(s) libre(s) en la escuela.`,
        'success'
      );
      return;
    }

    mostrarToast(mensajeExitoBase, 'success');
  }

  // =========================================================================
  // FASE 4: MODAL DE PRE-CONFIRMACIÓN ("DETALLE DE IMPACTO DEL MOVIMIENTO") Y PANEL DE PROPUESTAS
  // =========================================================================
  const ESTILOS_CATEGORIA = {
    VERDE: {
      icono: '🟢',
      badge: 'bg-emerald-600 text-white',
      borde: 'border-emerald-500',
      bordeSuave: 'border-emerald-500/40',
      fondo: 'bg-emerald-950/40',
      texto: 'text-emerald-300',
      ring: 'ring-emerald-500'
    },
    AZUL: {
      icono: '🔵',
      badge: 'bg-blue-600 text-white',
      borde: 'border-blue-500',
      bordeSuave: 'border-blue-500/40',
      fondo: 'bg-blue-950/40',
      texto: 'text-blue-300',
      ring: 'ring-blue-500'
    },
    VIOLETA: {
      icono: '🟣',
      badge: 'bg-violet-600 text-white',
      borde: 'border-violet-500',
      bordeSuave: 'border-violet-500/40',
      fondo: 'bg-violet-950/40',
      texto: 'text-violet-300',
      ring: 'ring-violet-500'
    }
  };

  function obtenerParamsActuales() {
    return (
      uiState.resumen?.auditoria?.parametrosSistema ||
      uiState.resumen?.estado?.configuracion?.parametrosSistema ||
      {}
    );
  }

  function textoDeltaHorasLibres(delta) {
    if (delta < 0) return `✨ ${delta} h libres`;
    if (delta > 0) return `⚠️ +${delta} h libres`;
    return '= 0 h libres';
  }

  function claseDeltaHorasLibres(delta) {
    if (delta < 0) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (delta > 0) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    return 'bg-slate-800 text-slate-300 border-slate-700';
  }

  function ejecutarOperacionConfirmada(operacion, mensajeExito, onAplicado) {
    if (!operacion) return;
    const auditoriaPrevia = uiState.resumen.auditoria;
    const res = window.sghAPI.aplicarOperacionHorarioConfirmada(operacion);
    if (!res) {
      mostrarToast('No fue posible aplicar el movimiento.', 'error');
      return;
    }
    uiState.resumen = res;
    if (typeof onAplicado === 'function') onAplicado();
    renderizarTodo();
    evaluarYNotificarImpactoOperacion(auditoriaPrevia, uiState.resumen.auditoria, mensajeExito);
  }

  function cerrarModalMovimiento() {
    operacionPendienteModal = null;
    document.getElementById('modal-confirmar-movimiento')?.classList.add('hidden');
  }

  function cancelarModalMovimiento() {
    cerrarModalMovimiento();
    mostrarToast('Movimiento cancelado. No se realizó ningún cambio.', 'info');
  }

  function construirHtmlDetalleImpacto(impacto, alternativaTriangular) {
    const est = ESTILOS_CATEGORIA[impacto.identificadorColor] || ESTILOS_CATEGORIA.VERDE;
    const alertasDuras = [...impacto.alertasChoques, ...impacto.alertasDisponibilidad];
    const alertasBlandas = [...impacto.alertasExceso, ...impacto.alertasRecreos];

    const pasosHtml = impacto.pasosMovimiento
      .map(
        (p) => `
        <div class="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
          <span class="w-6 h-6 rounded-full ${est.badge} flex items-center justify-center font-black text-[11px] shrink-0">${p.orden}</span>
          <div class="min-w-[160px] flex-1">
            <div class="font-bold text-white flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${p.materiaColor}"></span>
              ${p.materiaNombre}
              <span class="text-[10px] font-mono text-slate-400">(${p.cantidadHoras} h · ${p.cursoNombre})</span>
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">👤 ${p.docentesNombres}</div>
          </div>
          <div class="flex items-center gap-2 text-[11px]">
            <span class="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">Sale de: <strong>${p.origenTexto}</strong></span>
            <span class="text-slate-500 font-black">→</span>
            <span class="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">Ingresa a: <strong>${p.destinoTexto}</strong></span>
          </div>
        </div>
      `
      )
      .join('');

    const docentesHtml =
      impacto.docentesAfectados.length === 0
        ? '<div class="text-slate-400">No hay docentes afectados por este cambio.</div>'
        : impacto.docentesAfectados
            .map((d) => {
              const lineas = d.cambiosPorDia
                .map((c) => {
                  const color =
                    c.estadoImpacto === 'MEJORA'
                      ? 'text-emerald-300'
                      : c.estadoImpacto === 'EMPEORA'
                        ? 'text-amber-300'
                        : 'text-slate-300';
                  return `<li class="${color}">${c.textoImpactoDia}</li>`;
                })
                .join('');
              return `
              <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span class="font-bold text-white">👤 ${d.docenteNombre}</span>
                    <span class="text-[11px] text-slate-400 ml-1">${d.especialidad || ''}</span>
                  </div>
                  <span class="px-2 py-0.5 rounded-md border font-mono font-bold text-[10px] ${claseDeltaHorasLibres(d.deltaSemana)}">
                    Semana: ${d.horasPuenteAntesSemana} → ${d.horasPuenteDespuesSemana} h libres
                  </span>
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">Materias: ${d.materiasInvolucradas.join(', ')}</div>
                <ul class="mt-1.5 space-y-0.5 text-[11px] list-disc list-inside">${lineas}</ul>
              </div>
            `;
            })
            .join('');

    const alertasHtml = `
      ${
        alertasDuras.length > 0
          ? `<div class="bg-rose-950/50 border-2 border-rose-500 rounded-xl p-3 space-y-1">
              <div class="font-black text-rose-300 uppercase text-[11px]">🚨 Este movimiento genera conflictos</div>
              ${alertasDuras.map((a) => `<div class="text-rose-200 text-[11px]">${a}</div>`).join('')}
            </div>`
          : ''
      }
      ${
        alertasBlandas.length > 0
          ? `<div class="bg-amber-950/40 border border-amber-500/60 rounded-xl p-3 space-y-1">
              <div class="font-black text-amber-300 uppercase text-[11px]">⚠️ Advertencias</div>
              ${alertasBlandas.map((a) => `<div class="text-amber-200 text-[11px]">${a}</div>`).join('')}
            </div>`
          : ''
      }
      ${
        alertasDuras.length === 0 && alertasBlandas.length === 0
          ? `<div class="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-emerald-300 text-[11px] font-semibold">
              ✅ Sin choques, sin clases en horarios no disponibles y ningún bloque queda dividido por un recreo.
            </div>`
          : ''
      }
    `;

    const alternativaHtml = alternativaTriangular
      ? `
      <div class="bg-violet-950/40 border-2 border-violet-500 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="font-black text-violet-300 text-[11px] uppercase">🟣 Alternativa sin conflictos disponible</div>
          <div class="text-[11px] text-slate-300 mt-0.5">${alternativaTriangular.descripcionHistorial}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${alternativaTriangular.resumenImpactoPuente}</div>
        </div>
        <button id="btn-usar-alternativa-triangular" class="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition">
          Usar Enroque Triangular
        </button>
      </div>
    `
      : '';

    return `
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-2.5 py-1 rounded-lg ${est.badge} font-black text-[11px] uppercase tracking-wide">${est.icono} ${impacto.tituloOperacion}</span>
        <span class="text-slate-400">Curso: <strong class="text-white">${impacto.cursoNombre}</strong></span>
      </div>

      ${alternativaHtml}

      <div class="space-y-2">
        <h4 class="text-[11px] font-black text-slate-300 uppercase tracking-wider">1. Materias y horarios que cambian</h4>
        ${pasosHtml}
      </div>

      <div class="space-y-2">
        <h4 class="text-[11px] font-black text-slate-300 uppercase tracking-wider">2. Docentes afectados (${impacto.docentesAfectados.length})</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">${docentesHtml}</div>
      </div>

      <div class="space-y-2">
        <h4 class="text-[11px] font-black text-slate-300 uppercase tracking-wider">3. Impacto en horas libres y recreos</h4>
        <div class="px-3 py-2 rounded-xl border font-bold ${claseDeltaHorasLibres(impacto.deltaHorasPuenteTotal)}">
          ${impacto.resumenImpactoPuente}
        </div>
        ${alertasHtml}
      </div>
    `;
  }

  /**
   * Abre el Modal Obligatorio de Pre-Confirmación. Si el usuario desactivó la confirmación en Parámetros,
   * solo se omite cuando el movimiento no genera ningún conflicto ni advertencia.
   */
  function abrirModalConfirmacionMovimiento(
    impacto,
    { alternativaTriangular = null, mensajeExito = null, onAplicado = null } = {}
  ) {
    if (!impacto) return;
    const params = obtenerParamsActuales();
    const sinAvisos =
      !impacto.tieneConflictosDuros &&
      impacto.alertasExceso.length === 0 &&
      impacto.alertasRecreos.length === 0 &&
      impacto.deltaHorasPuenteTotal <= 0;

    if (params.confirmarMovimientosConModal === false && sinAvisos) {
      ejecutarOperacionConfirmada(impacto.operacion, mensajeExito || impacto.descripcionHistorial, onAplicado);
      return;
    }

    operacionPendienteModal = { impacto, alternativaTriangular, mensajeExito, onAplicado };

    const modal = document.getElementById('modal-confirmar-movimiento');
    const body = document.getElementById('modal-movimiento-body');
    const btnAplicar = document.getElementById('btn-aplicar-modal-movimiento');
    if (!modal || !body || !btnAplicar) return;

    body.innerHTML = construirHtmlDetalleImpacto(impacto, alternativaTriangular);

    if (impacto.tieneConflictosDuros) {
      btnAplicar.className =
        'px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition';
      btnAplicar.textContent = '⚠️ Aplicar de todos modos';
    } else {
      btnAplicar.className =
        'px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition';
      btnAplicar.textContent = '✅ Aplicar Movimiento';
    }

    document.getElementById('btn-usar-alternativa-triangular')?.addEventListener('click', () => {
      abrirModalConfirmacionMovimiento(alternativaTriangular, { mensajeExito: null, onAplicado });
    });

    modal.classList.remove('hidden');
  }

  /**
   * Construye el panel de propuestas del Motor Inteligente agrupado en las 3 categorías del SPEC,
   * con selectores rápidos de origen (entre los bloques asignados en la grilla o desde la bandeja)
   * y selector de tamaño (1h vs bloque agrupado).
   */
  function construirPanelPropuestasHtml(motor) {
    if (!motor) return '';
    const filtro = uiState.filtroPropuestas || 'TODAS';
    const columnas = [
      {
        id: 'LIBRE',
        titulo: '🟢 Horario Libre',
        desc: 'El curso está libre y todos los docentes pueden.',
        lista: motor.propuestasLibres,
        est: ESTILOS_CATEGORIA.VERDE
      },
      {
        id: 'ENROQUE_1_A_1',
        titulo: '🔵 Enroque 1 a 1',
        desc: 'Intercambio directo con otra materia del curso.',
        lista: motor.propuestasEnroqueDirecto,
        est: ESTILOS_CATEGORIA.AZUL
      },
      {
        id: 'ENROQUE_TRIANGULAR',
        titulo: '🟣 Enroque Triangular',
        desc: 'Rotación entre 3 materias (A → B → C → A).',
        lista: motor.propuestasEnroqueTriangular,
        est: ESTILOS_CATEGORIA.VIOLETA
      }
    ].filter((c) => filtro === 'TODAS' || filtro === c.id);

    const MAX_ITEMS = 8;

    const columnasHtml = columnas
      .map((col) => {
        const items =
          col.lista.length === 0
            ? `<div class="text-[11px] text-slate-500 italic p-2">Sin opciones de este tipo para el bloque actual.</div>`
            : col.lista
                .slice(0, MAX_ITEMS)
                .map((p) => {
                  let detalle = '';
                  if (p.categoria === 'ENROQUE_1_A_1') {
                    detalle = `↔ ${p.materiaIntercambioNombre} <span class="text-slate-500">(${p.docentesIntercambioNombres})</span>`;
                  } else if (p.categoria === 'ENROQUE_TRIANGULAR') {
                    detalle = `↔ ${p.materiaIntercambioNombre} · luego ${p.materiaTercerVerticeNombre} (${p.tercerVerticeRangoTexto})`;
                  } else {
                    detalle = 'Casillero vacío en el curso';
                  }
                  return `
                  <button data-propuesta-id="${p.idPropuesta}"
                    class="w-full text-left p-2 rounded-lg border ${col.est.bordeSuave} ${col.est.fondo} hover:brightness-125 transition">
                    <div class="flex items-center justify-between gap-1.5">
                      <span class="font-bold text-white text-[11px]">${p.destinoDia} · ${p.destinoRangoTexto}</span>
                      <span class="px-1.5 py-0.5 rounded border font-mono font-bold text-[9px] shrink-0 ${claseDeltaHorasLibres(p.deltaHorasPuenteTotal)}">
                        ${textoDeltaHorasLibres(p.deltaHorasPuenteTotal)}
                      </span>
                    </div>
                    <div class="text-[10px] text-slate-300 mt-0.5 truncate" title="${detalle.replace(/<[^>]+>/g, '')}">${detalle}</div>
                    ${p.cruzaRecreoInjustificado ? '<div class="text-[10px] text-amber-300 font-bold mt-0.5">☕ Queda cortada por recreo</div>' : ''}
                  </button>
                `;
                })
                .join('') +
              (col.lista.length > MAX_ITEMS
                ? `<div class="text-[10px] text-slate-500 text-center pt-1">+ ${col.lista.length - MAX_ITEMS} opciones más (ver casilleros resaltados en la grilla)</div>`
                : '');

        return `
          <div class="bg-slate-950 border ${col.est.bordeSuave} rounded-xl p-2.5 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black ${col.est.texto}">${col.titulo}</span>
              <span class="px-1.5 py-0.5 rounded ${col.est.badge} text-[10px] font-mono font-bold">${col.lista.length}</span>
            </div>
            <p class="text-[10px] text-slate-400">${col.desc}</p>
            <div class="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">${items}</div>
          </div>
        `;
      })
      .join('');

    const filtros = [
      { id: 'TODAS', label: 'Todas' },
      { id: 'LIBRE', label: '🟢 Libres' },
      { id: 'ENROQUE_1_A_1', label: '🔵 1 a 1' },
      { id: 'ENROQUE_TRIANGULAR', label: '🟣 Triangulares' }
    ];

    const corridas = motor.corridasAsignadasMateria || [];
    const corridaOrigen = motor.corridaContenedoraOrigen || [];
    const selectorOrigenHtml =
      corridas.length > 0
        ? `
          <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80 text-[11px]">
            <span class="text-slate-400 font-semibold mr-1">Origen a mover / intercambiar:</span>
            ${corridas
              .map((c) => {
                const indicesCorr = c.bloquesIndices || c.indices || [];
                const bIniCorr = c.bloqueInicial ?? c.bloqueInicio ?? indicesCorr[0] ?? 0;
                const esActiva =
                  motor.esMovimientoDesdeGrilla &&
                  motor.origenDia === c.dia &&
                  Array.isArray(motor.origenBloquesIndices) &&
                  indicesCorr.includes(motor.origenBloquesIndices[0]);
                return `
                  <button data-cambiar-origen-propuesta="${c.dia}|${bIniCorr}"
                    class="px-2 py-0.5 rounded-lg border font-semibold transition ${
                      esActiva
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-blue-500 hover:text-white'
                    }">
                    📍 ${c.dia} · ${c.rangoTexto} (${c.cantidadHoras}h)
                  </button>
                `;
              })
              .join('')}
            ${
              (motor.horasPendientesMateria || 0) > 0 || !motor.esMovimientoDesdeGrilla
                ? `<button data-cambiar-origen-bandeja="true"
                    class="px-2 py-0.5 rounded-lg border font-semibold transition ${
                      !motor.esMovimientoDesdeGrilla
                        ? 'bg-emerald-600 text-white border-emerald-400 font-black shadow'
                        : 'bg-slate-950 text-emerald-300 border-emerald-500/40 hover:bg-emerald-950/60'
                    }">
                    ➕ Agregar desde Bandeja
                  </button>`
                : ''
            }
            ${
              motor.esMovimientoDesdeGrilla && corridaOrigen.length > 1
                ? `<div class="ml-auto flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800">
                    <span class="text-[10px] text-slate-400">Tamaño:</span>
                    <button data-toggle-tamano-propuesta="INDIVIDUAL"
                      class="px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        motor.tamanoBloque === 1
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }">1h suelta</button>
                    <button data-toggle-tamano-propuesta="AUTO_BLOQUE"
                      class="px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        motor.tamanoBloque > 1
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }">📦 Bloque (${corridaOrigen.length}h)</button>
                  </div>`
                : ''
            }
          </div>
        `
        : '';

    return `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-bold text-white">🧠 Propuestas de movimiento para «${motor.materiaNombre}»</h3>
              <button data-abrir-deseado-motor="true"
                class="px-2.5 py-0.5 rounded-lg bg-indigo-600/25 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-[11px] font-bold transition">
                🎯 ¿Cubrir un bloque puntual?
              </button>
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5">
              Desde: <strong class="text-slate-200">${motor.origenRangoTexto}</strong> · Bloque de ${motor.tamanoBloque} h ·
              Ordenadas priorizando las que <strong class="text-emerald-300">reducen horas libres</strong>. Haz clic en una opción para ver su detalle.
            </p>
          </div>
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            ${filtros
              .map(
                (f) => `
              <button data-filtro-propuestas="${f.id}"
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  filtro === f.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }">${f.label}</button>
            `
              )
              .join('')}
          </div>
        </div>
        ${selectorOrigenHtml}
        <div class="grid grid-cols-1 ${({ 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' })[columnas.length] || 'md:grid-cols-3'} gap-2.5">${columnasHtml}</div>
      </div>
    `;
  }

  /**
   * Conecta los eventos del panel de propuestas (filtros, cambio de origen/tamaño y clic para abrir el modal de impacto).
   */
  function conectarEventosPanelPropuestas(
    contenedor,
    motor,
    onAplicado,
    onRefrescar,
    opcionesOrigen = {}
  ) {
    if (!contenedor || !motor) return;
    const mapa = new Map(motor.todasLasPropuestas.map((p) => [p.idPropuesta, p]));

    contenedor.querySelectorAll('[data-propuesta-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = mapa.get(btn.getAttribute('data-propuesta-id'));
        if (p) abrirModalConfirmacionMovimiento(p.impacto, { onAplicado });
      });
    });

    contenedor.querySelectorAll('[data-filtro-propuestas]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.filtroPropuestas = btn.getAttribute('data-filtro-propuestas');
        if (typeof onRefrescar === 'function') onRefrescar();
      });
    });

    contenedor.querySelectorAll('[data-cambiar-origen-propuesta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-cambiar-origen-propuesta') || '';
        const [dia, bStr] = raw.split('|');
        const bloqueIndice = parseInt(bStr, 10);
        if (typeof opcionesOrigen.onSeleccionarOrigenGrilla === 'function') {
          opcionesOrigen.onSeleccionarOrigenGrilla(dia, bloqueIndice);
        }
      });
    });

    contenedor.querySelector('[data-cambiar-origen-bandeja]')?.addEventListener('click', () => {
      if (typeof opcionesOrigen.onSeleccionarOrigenBandeja === 'function') {
        opcionesOrigen.onSeleccionarOrigenBandeja();
      }
    });

    contenedor.querySelectorAll('[data-toggle-tamano-propuesta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nuevoModo = btn.getAttribute('data-toggle-tamano-propuesta');
        if (typeof opcionesOrigen.onCambiarModoBloque === 'function') {
          opcionesOrigen.onCambiarModoBloque(nuevoModo);
        }
      });
    });

    contenedor.querySelector('[data-abrir-deseado-motor]')?.addEventListener('click', () => {
      abrirModalMovimientoDeseado({
        cursoId: motor.cursoId,
        modoObjetivo: 'MATERIA',
        materiaId: motor.materiaId,
        cantidadBloques: motor.tamanoBloque || 1
      });
    });
  }

  // =========================================================================
  // FASE 5: EXPORTADOR EXCEL / PDF Y ASISTENTE DE MOVIMIENTO DESEADO
  // =========================================================================
  async function ejecutarExportacionHorario(formato, opciones) {
    try {
      mostrarToast(
        `⏳ Preparando exportación ${formato === 'EXCEL' ? 'Excel (.xlsx)' : 'PDF A4 Horizontal (.pdf)'}...`,
        'info'
      );
      const res =
        formato === 'EXCEL'
          ? await window.sghAPI.exportarExcel(opciones)
          : await window.sghAPI.exportarPDF(opciones);

      if (!res || res.cancelado) return;
      if (!res.ok) {
        mostrarToast(`❌ Error al exportar: ${res.error || 'Error desconocido'}`, 'error');
        return;
      }

      mostrarToast(
        `✅ Archivo exportado con éxito: ${res.rutaArchivo}`,
        'success'
      );
    } catch (err) {
      mostrarToast(`❌ Error al exportar: ${err.message || err}`, 'error');
    }
  }

  let tokenCalculoDeseado = 0;

  function cerrarModalMovimientoDeseado() {
    tokenCalculoDeseado++;
    document.body.style.cursor = '';
    document.getElementById('modal-movimiento-deseado')?.classList.add('hidden');
  }

  function abrirModalMovimientoDeseado(preseleccion = {}) {
    if (!uiState.resumen) return;
    const { estado } = uiState.resumen;
    const modal = document.getElementById('modal-movimiento-deseado');
    const body = document.getElementById('modal-deseado-body');
    if (!modal || !body) return;

    const cfg = uiState.deseadoConfig;
    if (preseleccion.cursoId) cfg.cursoId = preseleccion.cursoId;
    if (!estado.cursos.some((c) => c.id === cfg.cursoId) && estado.cursos[0]) {
      cfg.cursoId = estado.cursos[0].id;
    }

    if (preseleccion.modoObjetivo) cfg.modoObjetivo = preseleccion.modoObjetivo;
    if (preseleccion.materiaId) cfg.materiaId = preseleccion.materiaId;
    if (preseleccion.docenteId) cfg.docenteId = preseleccion.docenteId;
    if (preseleccion.destinoDia) cfg.destinoDia = preseleccion.destinoDia;
    if (Number.isInteger(preseleccion.destinoBloqueIndice)) {
      cfg.destinoBloqueIndice = preseleccion.destinoBloqueIndice;
    }
    if (Number.isInteger(preseleccion.cantidadBloques) && preseleccion.cantidadBloques >= 1) {
      cfg.cantidadBloques = preseleccion.cantidadBloques;
    }

    function normalizarSeleccionDeseado() {
      if (!estado.docentes.some((d) => d.id === cfg.docenteId)) {
        cfg.docenteId = estado.docentes[0]?.id || null;
      }
      if (cfg.modoObjetivo === 'DOCENTE' && cfg.docenteId) {
        const materiasDelDocente = estado.materias.filter(
          (m) => Array.isArray(m.docentesIds) && m.docentesIds.includes(cfg.docenteId)
        );
        if (
          materiasDelDocente.length > 0 &&
          !materiasDelDocente.some((m) => m.cursoId === cfg.cursoId)
        ) {
          cfg.cursoId = materiasDelDocente[0].cursoId;
        }
      }
      const materiasCurso = estado.materias.filter((m) => m.cursoId === cfg.cursoId);
      if (!materiasCurso.some((m) => m.id === cfg.materiaId)) {
        cfg.materiaId = materiasCurso[0]?.id || null;
      }
      return materiasCurso;
    }

    function construirControlesFormularioHtml(materiasCurso) {
      return `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">1. Curso</label>
            <select id="sel-deseado-curso" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
              ${estado.cursos
                .map((c) => {
                  const dictaAqui =
                    cfg.modoObjetivo === 'DOCENTE' &&
                    estado.materias.some(
                      (m) =>
                        m.cursoId === c.id &&
                        Array.isArray(m.docentesIds) &&
                        m.docentesIds.includes(cfg.docenteId)
                    );
                  return `<option value="${c.id}" ${c.id === cfg.cursoId ? 'selected' : ''}>${c.nombre} (${c.division})${cfg.modoObjetivo === 'DOCENTE' ? (dictaAqui ? ' ✓' : ' · sin cátedra') : ''}</option>`;
                })
                .join('')}
            </select>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">2. Cubrir por</label>
            <select id="sel-deseado-modo" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
              <option value="MATERIA" ${cfg.modoObjetivo === 'MATERIA' ? 'selected' : ''}>📚 Materia del curso</option>
              <option value="DOCENTE" ${cfg.modoObjetivo === 'DOCENTE' ? 'selected' : ''}>👩‍🏫 Docente a cubrir</option>
            </select>
          </div>

          <div class="sm:col-span-2 lg:col-span-1">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              3. ${cfg.modoObjetivo === 'DOCENTE' ? 'Docente' : 'Materia'}
            </label>
            ${
              cfg.modoObjetivo === 'DOCENTE'
                ? `<select id="sel-deseado-docente" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
                    ${estado.docentes
                      .map(
                        (d) =>
                          `<option value="${d.id}" ${d.id === cfg.docenteId ? 'selected' : ''}>${d.nombre}</option>`
                      )
                      .join('')}
                  </select>`
                : `<select id="sel-deseado-materia" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
                    ${materiasCurso
                      .map(
                        (m) =>
                          `<option value="${m.id}" ${m.id === cfg.materiaId ? 'selected' : ''}>${m.nombre}</option>`
                      )
                      .join('')}
                  </select>`
            }
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">4. Día Destino</label>
            <select id="sel-deseado-dia" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
              ${estado.configuracion.diasHabiles
                .map(
                  (d) =>
                    `<option value="${d}" ${d === cfg.destinoDia ? 'selected' : ''}>${d}</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">5. Bloque Destino</label>
            <select id="sel-deseado-bloque" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
              ${estado.configuracion.bloquesHorarios
                .map(
                  (b) =>
                    `<option value="${b.indice}" ${b.indice === cfg.destinoBloqueIndice ? 'selected' : ''}>${b.nombre} (${b.inicio}-${b.fin})</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">6. Duración</label>
            <select id="sel-deseado-cantidad" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white">
              <option value="1" ${cfg.cantidadBloques === 1 ? 'selected' : ''}>1 hora cátedra</option>
              <option value="2" ${cfg.cantidadBloques === 2 ? 'selected' : ''}>2 horas seguidas</option>
              <option value="3" ${cfg.cantidadBloques === 3 ? 'selected' : ''}>3 horas seguidas</option>
            </select>
          </div>
        </div>
      `;
    }

    function conectarEventosSelectoresDeseado() {
      document.getElementById('sel-deseado-curso')?.addEventListener('change', (e) => {
        cfg.cursoId = e.target.value;
        const mats = estado.materias.filter((m) => m.cursoId === cfg.cursoId);
        cfg.materiaId = mats[0]?.id || null;
        renderizarInteriorModalDeseado();
      });
      document.getElementById('sel-deseado-modo')?.addEventListener('change', (e) => {
        cfg.modoObjetivo = e.target.value;
        renderizarInteriorModalDeseado();
      });
      document.getElementById('sel-deseado-materia')?.addEventListener('change', (e) => {
        cfg.materiaId = e.target.value;
        renderizarInteriorModalDeseado();
      });
      document.getElementById('sel-deseado-docente')?.addEventListener('change', (e) => {
        cfg.docenteId = e.target.value;
        // Si el docente no dicta en el curso actual, cambiar automáticamente a su primer curso asignado
        const matsDoc = estado.materias.filter(
          (m) => Array.isArray(m.docentesIds) && m.docentesIds.includes(cfg.docenteId)
        );
        if (matsDoc.length > 0 && !matsDoc.some((m) => m.cursoId === cfg.cursoId)) {
          cfg.cursoId = matsDoc[0].cursoId;
        }
        renderizarInteriorModalDeseado();
      });
      document.getElementById('sel-deseado-dia')?.addEventListener('change', (e) => {
        cfg.destinoDia = e.target.value;
        renderizarInteriorModalDeseado();
      });
      document.getElementById('sel-deseado-bloque')?.addEventListener('change', (e) => {
        cfg.destinoBloqueIndice = parseInt(e.target.value, 10);
        renderizarInteriorModalDeseado();
      });
      document.getElementById('sel-deseado-cantidad')?.addEventListener('change', (e) => {
        cfg.cantidadBloques = parseInt(e.target.value, 10);
        renderizarInteriorModalDeseado();
      });
    }

    function renderizarInteriorModalDeseado() {
      const materiasCurso = normalizarSeleccionDeseado();
      const miToken = ++tokenCalculoDeseado;

      // 1. Mostrar de inmediato estado de carga con spinner e ícono de espera en el cursor
      document.body.style.cursor = 'wait';
      body.innerHTML = `
        ${construirControlesFormularioHtml(materiasCurso)}
        <div class="p-8 rounded-2xl bg-slate-950 border border-indigo-500/40 flex flex-col items-center justify-center gap-3 text-center">
          <div class="w-8 h-8 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin"></div>
          <div class="text-xs font-bold text-indigo-200">
            ⏳ Calculando disponibilidad cruzada, movimientos y posibles enroques...
          </div>
          <div class="text-[11px] text-slate-400">
            Evaluando horarios libres, enroques 1 a 1, triangulares y liberaciones en otros cursos.
          </div>
        </div>
      `;
      conectarEventosSelectoresDeseado();

      // 2. Ceder un frame al navegador para que pinte el spinner antes del cálculo intensivo
      setTimeout(() => {
        if (miToken !== tokenCalculoDeseado) return;
        try {
          const diag = window.sghAPI.diagnosticarMovimientoDeseado({
            cursoId: cfg.cursoId,
            materiaId: cfg.modoObjetivo === 'MATERIA' ? cfg.materiaId : null,
            docenteId: cfg.modoObjetivo === 'DOCENTE' ? cfg.docenteId : null,
            destinoDia: cfg.destinoDia,
            destinoBloqueIndice: cfg.destinoBloqueIndice,
            cantidadBloques: cfg.cantidadBloques
          });

          if (miToken !== tokenCalculoDeseado) return;

          const obstaculosHtml =
            !diag || diag.error
              ? `<div class="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-xs">${diag?.error || 'Selecciona una materia o docente válido.'}</div>`
              : diag.yaAsignadoEnDestino
                ? `<div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 font-semibold text-xs">
                    ✅ «${diag.materiaNombre}» (${diag.docentesNombres}) ya se encuentra asignada cubriendo ${diag.destinoRangoTexto} en ${diag.cursoNombre}. Elige otro día o bloque destino para simular cómo moverla allí.
                  </div>`
                : diag.esViableDirecto
                  ? `<div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 font-semibold text-xs">
                      ✅ ¡El horario solicitado (${diag.destinoRangoTexto}) está libre en ${diag.cursoNombre} y ${diag.docentesNombres} tiene disponibilidad! Puedes aplicar una de las sugerencias directas debajo.
                    </div>`
                  : `<div class="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 space-y-1">
                      <div class="font-black text-amber-300 uppercase text-[11px]">🔍 ¿Por qué «${diag.materiaNombre}» (${diag.docentesNombres}) no puede asignarse directo en ${diag.destinoRangoTexto}?</div>
                      <ul class="list-disc list-inside text-amber-100 space-y-0.5 text-[11px]">
                        ${(diag.obstaculos || []).map((o) => `<li>${o.detalle}</li>`).join('')}
                      </ul>
                    </div>`;

          const soluciones = diag?.soluciones || diag?.solucionesPropuestas || [];
          const solucionesHtml =
            soluciones.length === 0
              ? `<div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-center text-xs">
                  ${
                    diag?.yaAsignadoEnDestino
                      ? 'La materia ya ocupa este horario. Selecciona otro día o bloque destino arriba para ver sugerencias de cobertura.'
                      : 'No se encontraron combinaciones automáticas sin choques para este bloque puntual. Prueba cambiando a 1 hora cátedra o eligiendo otro bloque del mismo día.'
                  }
                </div>`
              : soluciones
                  .map((s, idx) => {
                    const badgeColor =
                      s.identificadorColor === 'VERDE'
                        ? 'bg-emerald-600 text-white'
                        : s.identificadorColor === 'AZUL'
                          ? 'bg-blue-600 text-white'
                          : 'bg-violet-600 text-white';
                    const pasosLista =
                      Array.isArray(s.explicacionPasos) && s.explicacionPasos.length > 0
                        ? s.explicacionPasos
                        : [s.resumenSolucion || 'Aplicar movimiento'];
                    return `
                      <div class="bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-3 flex flex-col justify-between gap-2.5 transition">
                        <div class="space-y-1.5">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="px-2 py-0.5 rounded ${badgeColor} font-black text-[10px] uppercase">#${idx + 1} · ${s.etiquetaTipo}</span>
                              <span class="font-bold text-white text-xs">${s.titulo || s.resumenSolucion}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded border font-mono font-bold text-[10px] ${claseDeltaHorasLibres(s.deltaHorasPuenteTotal)}">
                              ${textoDeltaHorasLibres(s.deltaHorasPuenteTotal)}
                            </span>
                          </div>
                          <div class="text-[11px] text-slate-300">
                            Origen utilizado: <strong class="text-slate-100">${s.origenUsadoTexto || s.origenEtiqueta || ''}</strong>
                          </div>
                          <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-2 space-y-1">
                            <div class="text-[10px] font-bold text-indigo-300 uppercase">Cambios necesarios paso a paso:</div>
                            <ol class="list-decimal list-inside text-[11px] text-slate-200 space-y-0.5">
                              ${pasosLista.map((paso) => `<li>${paso}</li>`).join('')}
                            </ol>
                          </div>
                        </div>
                        <div class="flex items-center justify-between pt-1 border-t border-slate-800/80">
                          <span class="text-[10px] text-slate-400">${s.impacto?.resumenImpactoPuente || ''}</span>
                          <button data-aplicar-solucion-deseado="${idx}"
                            class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition shadow">
                            🔍 Ver impacto y aplicar →
                          </button>
                        </div>
                      </div>
                    `;
                  })
                  .join('');

          body.innerHTML = `
            ${construirControlesFormularioHtml(materiasCurso)}
            ${obstaculosHtml}
            <div class="space-y-2">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <h4 class="text-xs font-black text-slate-200 uppercase tracking-wider">
                  💡 Sugerencias para hacer posible el movimiento (${soluciones.length})
                </h4>
                <span class="text-[11px] text-slate-400">
                  Ordenadas por menor cantidad de cambios y mayor reducción de horas libres
                </span>
              </div>
              <div class="space-y-2.5">
                ${solucionesHtml}
              </div>
            </div>
          `;

          conectarEventosSelectoresDeseado();
          body.querySelectorAll('[data-aplicar-solucion-deseado]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.getAttribute('data-aplicar-solucion-deseado'), 10);
              const sol = soluciones[idx];
              if (!sol || !sol.impacto) return;
              abrirModalConfirmacionMovimiento(sol.impacto, {
                mensajeExito: sol.titulo || sol.resumenSolucion,
                onAplicado: () => {
                  cerrarModalMovimientoDeseado();
                }
              });
            });
          });
        } finally {
          if (miToken === tokenCalculoDeseado) {
            document.body.style.cursor = '';
          }
        }
      }, 30);
    }

    renderizarInteriorModalDeseado();
    modal.classList.remove('hidden');
  }

  /**
   * Ilumina en la grilla del curso los casilleros ocupados que admiten un Enroque (Azul / Violeta)
   * y marca todo el bloque de origen cuando se mueve un bloque agrupado.
   */
  function resaltarPropuestasEnGrillaCurso(contenedor, motor) {
    if (!contenedor) return;
    contenedor.querySelectorAll('[data-badge-propuesta]').forEach((el) => el.remove());
    contenedor
      .querySelectorAll('td[data-celda-curso]')
      .forEach((td) => {
        td.removeAttribute('data-propuesta-resaltada');
        td.classList.remove(
          'ring-2',
          'ring-inset',
          'ring-blue-500',
          'ring-violet-500',
          'ring-amber-400',
          'opacity-55'
        );
      });
    if (!motor) return;

    contenedor.querySelectorAll('td[data-celda-curso]:not([data-celda-libre])').forEach((td) => {
      if (td.hasAttribute('data-celda-almuerzo')) {
        td.classList.add('opacity-55');
        return;
      }
      const dia = td.getAttribute('data-dia');
      const b = parseInt(td.getAttribute('data-bloque'), 10);

      if (
        motor.esMovimientoDesdeGrilla &&
        dia === motor.origenDia &&
        Array.isArray(motor.origenBloquesIndices) &&
        motor.origenBloquesIndices.includes(b)
      ) {
        td.setAttribute('data-propuesta-resaltada', 'true');
        td.classList.add('ring-2', 'ring-inset', 'ring-amber-400');
        const interiorOrig = td.firstElementChild;
        if (interiorOrig) {
          const badgeOrig = document.createElement('div');
          badgeOrig.setAttribute('data-badge-propuesta', 'true');
          badgeOrig.className =
            'mt-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[9px] leading-tight';
          badgeOrig.textContent = '📍 Bloque origen seleccionado';
          interiorOrig.insertBefore(badgeOrig, interiorOrig.firstElementChild?.nextSibling || null);
        }
        return;
      }

      const p = motor.mapaCeldasDestino ? motor.mapaCeldasDestino[`${dia}|${b}`] : null;
      if (!p || p.categoria === 'LIBRE') {
        td.classList.add('opacity-55');
        return;
      }
      const est = ESTILOS_CATEGORIA[p.identificadorColor] || ESTILOS_CATEGORIA.AZUL;
      td.setAttribute('data-propuesta-resaltada', 'true');
      td.classList.add('ring-2', 'ring-inset', est.ring);
      const interior = td.firstElementChild;
      if (interior) {
        const badge = document.createElement('div');
        badge.setAttribute('data-badge-propuesta', 'true');
        badge.className = `mt-1 px-1.5 py-0.5 rounded font-black text-[9px] leading-tight shadow ${est.badge}`;
        badge.title = p.impacto?.resumenImpactoPuente || '';
        badge.textContent = `${est.icono} ${p.categoria === 'ENROQUE_1_A_1' ? 'Enroque 1 a 1' : 'Triangular'} · ${textoDeltaHorasLibres(p.deltaHorasPuenteTotal)}`;
        interior.insertBefore(badge, interior.firstElementChild?.nextSibling || null);
      }
    });
  }

  function renderizarBarraSuperior() {
    const {
      estado,
      auditoria,
      historial,
      modoSimulacion,
      nombreSimulacionActiva,
      simulacionDiff
    } = uiState.resumen;

    const params =
      auditoria.parametrosSistema || estado.configuracion.parametrosSistema || {};
    document.body.classList.toggle('theme-light', params.temaVisual === 'CLARO');

    // Nombre grande del colegio en la esquina superior izquierda
    const headerColegioEl = document.getElementById('header-colegio');
    if (headerColegioEl) {
      headerColegioEl.textContent = estado.configuracion.nombreColegio || 'Colegio';
    }

    // Logo cuadrado o Siglas del colegio
    const siglasEl = document.getElementById('header-siglas');
    const logoImgEl = document.getElementById('header-logo-img');
    const logoBase64 = estado.configuracion.logoBase64 || null;
    const siglas = estado.configuracion.siglasColegio || 'SGH';

    if (logoImgEl && siglasEl) {
      if (logoBase64) {
        logoImgEl.src = logoBase64;
        logoImgEl.classList.remove('hidden');
        siglasEl.classList.add('hidden');
      } else {
        logoImgEl.src = '';
        logoImgEl.classList.add('hidden');
        siglasEl.textContent = siglas;
        siglasEl.classList.remove('hidden');
      }
    }

    // Actualizar contadores de Choques y Horas Libres en la pestaña de navegación
    const totalConflictosCriticos =
      (auditoria.choquesDocentes?.length || 0) +
      (auditoria.violacionesDisponibilidad?.length || 0) +
      (auditoria.materiasExcedidas?.length || 0);

    const badgeChoques = document.getElementById('nav-badge-choques');
    if (badgeChoques) {
      if (totalConflictosCriticos > 0) {
        badgeChoques.textContent = `${totalConflictosCriticos} alerta${totalConflictosCriticos === 1 ? '' : 's'}`;
        badgeChoques.classList.remove('hidden');
      } else {
        badgeChoques.classList.add('hidden');
      }
    }

    const badgePuente = document.getElementById('nav-badge-puente');
    if (badgePuente) {
      badgePuente.textContent = `${auditoria.totalHorasPuenteEscuela} hs libres`;
      badgePuente.classList.toggle('hidden', params.alertarHorasLibresDocentes === false);
    }

    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    btnUndo.disabled = !historial.puedeDeshacer;
    btnRedo.disabled = !historial.puedeRehacer;
    btnUndo.title = historial.ultimaOperacion
      ? `Deshacer: ${historial.ultimaOperacion} (Ctrl+Z)`
      : 'Nada para deshacer (Ctrl+Z)';
    btnRedo.title = historial.proximaOperacionRedo
      ? `Rehacer: ${historial.proximaOperacionRedo} (Ctrl+Y)`
      : 'Nada para rehacer (Ctrl+Y)';

    document.getElementById('badge-undo').textContent = historial.cantidadUndo;
    document.getElementById('badge-redo').textContent = historial.cantidadRedo;

    const bannerSim = document.getElementById('banner-simulacion');
    const btnToggleSim = document.getElementById('btn-toggle-simulacion');
    const simActiveNameEl = document.getElementById('sim-active-name');

    if (modoSimulacion) {
      bannerSim.classList.remove('hidden');
      btnToggleSim.className =
        'px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20';
      btnToggleSim.innerHTML = `<span>🧪 Simulación Activa (${simulacionDiff.cantidadCeldasModificadas})</span>`;

      if (simActiveNameEl) {
        if (nombreSimulacionActiva) {
          simActiveNameEl.textContent = `📌 ${nombreSimulacionActiva}`;
          simActiveNameEl.classList.remove('hidden');
        } else {
          simActiveNameEl.classList.add('hidden');
        }
      }

      document.getElementById('sim-diff-count').textContent =
        `${simulacionDiff.cantidadCeldasModificadas} celda(s)`;

      const deltaP = simulacionDiff.deltaHorasPuente;
      const elDelta = document.getElementById('sim-diff-puente');
      elDelta.textContent = deltaP > 0 ? `+${deltaP} (empeora)` : deltaP < 0 ? `${deltaP} (✅ mejora)` : '0 (sin cambio)';
      elDelta.className =
        deltaP < 0
          ? 'font-mono font-bold text-emerald-400'
          : deltaP > 0
            ? 'font-mono font-bold text-rose-400'
            : 'font-mono font-bold text-slate-300';
    } else {
      bannerSim.classList.add('hidden');
      btnToggleSim.className =
        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25';
      btnToggleSim.innerHTML = '<span>🧪 Activar Modo Simulación</span>';
    }
  }

  function renderizarTodo() {
    if (!uiState.resumen) return;
    renderizarBarraSuperior();

    if (uiState.tabActual === 'dashboard') {
      renderizarDashboard();
    } else if (uiState.tabActual === 'curso') {
      renderizarVistaCurso();
    } else if (uiState.tabActual === 'docente') {
      renderizarVistaDocente();
    } else if (uiState.tabActual === 'alertas') {
      renderizarVistaAlertas();
    } else if (uiState.tabActual === 'configuracion') {
      if (window.SGHConfigABM) {
        window.SGHConfigABM.renderizarVistaConfiguracion(uiState, {
          mostrarToast,
          onStateUpdated: (msg, tipo = 'info') => {
            renderizarTodo();
            if (msg) mostrarToast(msg, tipo);
          }
        });
      }
    } else if (uiState.tabActual === 'persistencia') {
      renderizarVistaPersistencia();
    }
  }

  // =========================================================================
  // VISTA 1: RESUMEN GENERAL DE LA INSTITUCIÓN
  // =========================================================================
  function renderizarDashboard() {
    const container = document.getElementById('tab-dashboard');
    const { estado, auditoria } = uiState.resumen;
    const segmentos = window.sghAPI.obtenerResumenSegmentos();
    const materiasPareja = estado.materias.filter((m) => m.docentesIds.length > 1);
    const totalConflictos =
      auditoria.choquesDocentes.length + auditoria.violacionesDisponibilidad.length;

    container.innerHTML = `
      <!-- Tarjetas de Métricas Clave -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div class="text-xs text-slate-400 font-medium">Estructura Escolar</div>
          <div class="text-2xl font-black text-white mt-1">${estado.cursos.length} Cursos</div>
          <div class="text-[11px] text-blue-400 mt-1">1° a 5° Año · ${estado.configuracion.diasHabiles.length} días hábiles</div>
        </div>

        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div class="text-xs text-slate-400 font-medium">Jornada Diaria y Recreos</div>
          <div class="text-2xl font-black text-white mt-1">${estado.configuracion.bloquesHorarios.length} Bloques</div>
          <div class="text-[11px] text-indigo-400 mt-1">07:50 a 16:40 · ${segmentos.length} Tramos Continuos</div>
        </div>

        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div class="text-xs text-slate-400 font-medium">Horario Armado</div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-emerald-400">${auditoria.porcentajeCompletitud}%</span>
            <span class="text-xs text-slate-400 font-mono">(${auditoria.totalHorasAsignadas}/${auditoria.totalHorasRequeridas} hs)</span>
          </div>
          <div class="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, auditoria.porcentajeCompletitud)}%"></div>
          </div>
        </div>

        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div class="text-xs text-slate-400 font-medium">Plantel Docente y Parejas</div>
          <div class="text-2xl font-black text-white mt-1">${estado.docentes.length} Docentes</div>
          <div class="text-[11px] text-cyan-400 mt-1">${materiasPareja.length} materias con 2 docentes simultáneos</div>
        </div>

        <div id="card-ir-alertas-dash" class="${
          totalConflictos > 0 ? 'bg-rose-950/30 border-rose-500' : 'bg-slate-900/90 border-amber-500/40'
        } border rounded-xl p-4 cursor-pointer hover:brightness-110 transition">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-300 font-bold">Choques y Horas Libres</span>
            <span class="text-[10px] text-blue-400 font-semibold underline">Ver detalle →</span>
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black ${
              totalConflictos === 0 ? 'text-emerald-400' : 'text-rose-400'
            }">
              ${auditoria.choquesDocentes.length} Choques
            </span>
            ${
              auditoria.violacionesDisponibilidad.length > 0
                ? `<span class="text-xs font-bold text-rose-300">· ${auditoria.violacionesDisponibilidad.length} Indisp.</span>`
                : ''
            }
          </div>
          <div class="text-[11px] text-amber-300 font-semibold mt-1">
            ⚠️ ${auditoria.totalHorasPuenteEscuela} Horas Libres (${auditoria.docentesConHorasPuente?.length || 0} docentes)
          </div>
        </div>
      </div>

      <!-- Dos Columnas: Grilla de 12 Bloques + Resumen de Docentes -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Columna Izquierda (5 cols): Estructura de 12 Bloques Horarios, 5 Tramos y 4 Recreos -->
        <div class="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h2 class="text-sm font-bold text-white">⏱️ Estructura Diaria Oficial (12 Horas Cátedra)</h2>
              <p class="text-xs text-slate-400">Organizada en 5 tramos continuos separados por 4 recreos</p>
            </div>
            <span class="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-800 text-slate-300">40 min / bloque</span>
          </div>

          <!-- Resumen de los 5 Segmentos Continuos -->
          <div class="grid grid-cols-5 gap-1.5 mb-3">
            ${segmentos
              .map(
                (seg) => `
              <div class="bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-center">
                <div class="text-[10px] font-bold text-blue-400 uppercase">Tramo ${seg.segmento}</div>
                <div class="text-xs font-black text-white mt-0.5">Máx: ${seg.capacidad} hs</div>
                <div class="text-[10px] text-slate-400 font-mono">${seg.inicio}-${seg.fin}</div>
              </div>
            `
              )
              .join('')}
          </div>

          <!-- Tabla detallada de los 12 bloques y sus recreos -->
          <div class="overflow-hidden rounded-xl border border-slate-800">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th class="py-2 px-3">Bloque</th>
                  <th class="py-2 px-3">Horario</th>
                  <th class="py-2 px-3">Tramo Continuo</th>
                  <th class="py-2 px-3">Recreo Posterior</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/70">
                ${estado.configuracion.bloquesHorarios
                  .map(
                    (b) => `
                  <tr class="hover:bg-slate-800/40">
                    <td class="py-1.5 px-3 font-bold text-white">${b.nombre}</td>
                    <td class="py-1.5 px-3 font-mono text-slate-300">${b.inicio} a ${b.fin}</td>
                    <td class="py-1.5 px-3">
                      <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px]">
                        Tramo ${b.segmento} (${b.capacidadSegmento} hs)
                      </span>
                    </td>
                    <td class="py-1.5 px-3">
                      ${
                        b.recreoPosterior
                          ? `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold text-[11px]">☕ ${b.recreoPosterior.etiqueta}</span>`
                          : b.finDeJornada
                            ? `<span class="text-slate-400 italic text-[11px]">🏁 Fin de jornada</span>`
                            : `<span class="text-slate-600 text-[11px]">Continuo</span>`
                      }
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Columna Derecha (7 cols): Plantel de Docentes con Métricas de Horas Libres y Choques en Vivo -->
        <div class="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 class="text-sm font-bold text-white">👩‍🏫 Plantel Docente: Horas Libres y Choques por Profesor</h2>
              <p class="text-xs text-slate-400">Muestra cuántas horas libres entre clases tiene cada docente y en qué días ocurren</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button id="btn-dash-exportar-excel" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 transition" title="Exportar todos los horarios a Excel (.xlsx)">
                📗 Excel Completo
              </button>
              <button id="btn-dash-exportar-pdf" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 transition" title="Exportar todos los horarios a PDF A4 Horizontal (.pdf)">
                📕 PDF Completo
              </button>
              <button id="btn-ir-alertas-dash" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition">
                🚨 Abrir Centro de Choques y Horas Libres
              </button>
              <button id="btn-ir-vista-curso-dash" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition">
                Ir a Grilla por Curso →
              </button>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800 flex-1">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th class="py-2 px-3">Docente</th>
                  <th class="py-2 px-3 text-center">Hs Asignadas</th>
                  <th class="py-2 px-3 text-center">⚠️ Horas Libres</th>
                  <th class="py-2 px-3">Días con Horas Libres / Conflictos</th>
                  <th class="py-2 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/70">
                ${auditoria.metricasDocentes
                  .map((md) => {
                    const diasPuenteTexto = (md.detalleHorasPuentePorDia || [])
                      .map((dp) => `${dp.dia.slice(0, 3)} (${dp.cantidadHorasPuente}h)`)
                      .join(', ');
                    return `
                  <tr class="hover:bg-slate-800/50 transition">
                    <td class="py-2 px-3">
                      <div class="font-bold text-white">${md.nombre}</div>
                      <div class="text-[10px] text-slate-400">${md.especialidad}</div>
                    </td>
                    <td class="py-2 px-3 text-center">
                      <span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono font-bold">${md.totalHorasAsignadas} hs</span>
                    </td>
                    <td class="py-2 px-3 text-center">
                      ${
                        md.totalHorasPuente > 0
                          ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">⚠️ ${md.totalHorasPuente} hs</span>`
                          : `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono">0 hs ✅</span>`
                      }
                    </td>
                    <td class="py-2 px-3">
                      <div class="flex flex-wrap items-center gap-1">
                        ${
                          md.totalChoquesDocente > 0
                            ? `<span class="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">🚨 ${md.totalChoquesDocente} choque(s)</span>`
                            : ''
                        }
                        ${
                          md.totalViolacionesDisponibilidad > 0
                            ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/50 font-bold text-[10px]">🚫 ${md.totalViolacionesDisponibilidad} indisp.</span>`
                            : ''
                        }
                        ${
                          diasPuenteTexto
                            ? `<span class="text-[11px] text-amber-200 font-mono">${diasPuenteTexto}</span>`
                            : `<span class="text-[11px] text-slate-500">Sin huecos</span>`
                        }
                      </div>
                    </td>
                    <td class="py-2 px-3 text-right">
                      <button data-ver-docente="${md.docenteId}" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-[11px] font-semibold transition">
                        Ver Grilla
                      </button>
                    </td>
                  </tr>
                `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-dash-exportar-excel')?.addEventListener('click', () => {
      ejecutarExportacionHorario('EXCEL', { alcance: 'MASIVO_COMPLETO' });
    });
    document.getElementById('btn-dash-exportar-pdf')?.addEventListener('click', () => {
      ejecutarExportacionHorario('PDF', { alcance: 'MASIVO_COMPLETO' });
    });

    document.getElementById('btn-ir-vista-curso-dash')?.addEventListener('click', () => {
      uiState.tabActual = 'curso';
      actualizarBotonesNav();
      renderizarTodo();
    });

    const irAlertas = () => {
      uiState.tabActual = 'alertas';
      actualizarBotonesNav();
      renderizarTodo();
    };
    document.getElementById('btn-ir-alertas-dash')?.addEventListener('click', irAlertas);
    document.getElementById('card-ir-alertas-dash')?.addEventListener('click', irAlertas);

    container.querySelectorAll('[data-ver-docente]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.docenteSeleccionadoId = btn.getAttribute('data-ver-docente');
        uiState.tabActual = 'docente';
        actualizarBotonesNav();
        renderizarTodo();
      });
    });
  }

  // =========================================================================
  // VISTA 2: VISTA DINÁMICA POR CURSO CON SEMÁFORO EN VIVO, AGRUPACIÓN DE BLOQUES Y DRAG & DROP
  // =========================================================================
  function renderizarVistaCurso() {
    const container = document.getElementById('tab-curso');
    const { estado, auditoria } = uiState.resumen;
    const cursoActual =
      estado.cursos.find((c) => c.id === uiState.cursoSeleccionadoId) || estado.cursos[0];

    const materiasCurso = auditoria.progresoMaterias.filter((m) => m.cursoId === cursoActual.id);
    const materiasExcedidasCurso = materiasCurso.filter((m) => m.excedida);
    const materiasMap = new Map(materiasCurso.map((m) => [m.id, m]));
    const asignacionesCurso = estado.asignaciones.filter((a) => a.cursoId === cursoActual.id);

    // Conflictos que afectan específicamente a este curso
    const choquesCurso = (auditoria.choquesDocentes || []).filter((ch) =>
      (ch.cursosIds || []).includes(cursoActual.id)
    );
    const violacionesCurso = (auditoria.violacionesDisponibilidad || []).filter(
      (v) => v.cursoId === cursoActual.id
    );
    const recreosCurso = (auditoria.advertenciasRecreos || []).filter(
      (r) => r.cursoId === cursoActual.id
    );

    const totalCursoReq = materiasCurso.reduce((acc, m) => acc + m.horasSemanales, 0);
    const totalCursoAsig = asignacionesCurso.length;
    const pctCurso = totalCursoReq > 0 ? Math.round((totalCursoAsig / totalCursoReq) * 100) : 0;

    const paramsSistemaCurso =
      auditoria.parametrosSistema || estado.configuracion.parametrosSistema || {};
    const habilitarAlmuerzo = paramsSistemaCurso.habilitarBloquesAlmuerzo !== false;
    if (!habilitarAlmuerzo && uiState.modoAsignarAlmuerzoCurso) {
      uiState.modoAsignarAlmuerzoCurso = false;
    }
    const almuerzosCurso = habilitarAlmuerzo
      ? (estado.almuerzos || []).filter((a) => a.cursoId === cursoActual.id)
      : [];

    // Determinar si hay una materia activa (por selección en bandeja o celda origen seleccionada)
    let materiaActivaCurso = null;
    if (uiState.materiaSeleccionadaBandejaId) {
      materiaActivaCurso = materiasMap.get(uiState.materiaSeleccionadaBandejaId) || null;
    } else if (uiState.celdaOrigenSeleccionada) {
      const asigOrig = asignacionesCurso.find(
        (a) =>
          a.dia === uiState.celdaOrigenSeleccionada.dia &&
          a.bloqueIndice === uiState.celdaOrigenSeleccionada.bloqueIndice
      );
      if (asigOrig) {
        materiaActivaCurso = materiasMap.get(asigOrig.materiaId) || null;
      }
    }

    // Calcula las propuestas del Motor Inteligente (Fase 4) para la materia o clase activa del curso
    function obtenerMotorCursoActivo(matId, origenMov) {
      if (origenMov) {
        return window.sghAPI.generarPropuestasMovimiento({
          cursoId: cursoActual.id,
          origenDia: origenMov.dia,
          origenBloqueIndice: origenMov.bloqueIndice,
          expandirCorridaCompleta: uiState.modoBloquesCurso === 'AUTO_BLOQUE'
        });
      }
      if (matId) {
        const matObj = materiasMap.get(matId);
        const cant =
          uiState.modoBloquesCurso === 'AUTO_BLOQUE' && matObj
            ? matObj.analisisFormato?.proximoTamanoSugerido || 1
            : 1;
        return window.sghAPI.generarPropuestasMovimiento({
          cursoId: cursoActual.id,
          materiaId: matId,
          cantidadBloques: cant
        });
      }
      return null;
    }

    const motorInicialCurso =
      materiaActivaCurso || uiState.celdaOrigenSeleccionada
        ? obtenerMotorCursoActivo(
            uiState.materiaSeleccionadaBandejaId ||
              (materiaActivaCurso ? materiaActivaCurso.id : null),
            uiState.celdaOrigenSeleccionada
          )
        : null;

    const cantBloquesAsignarCurso = motorInicialCurso
      ? motorInicialCurso.tamanoBloque || 1
      : uiState.modoBloquesCurso === 'AUTO_BLOQUE' && materiaActivaCurso
        ? materiaActivaCurso.analisisFormato?.proximoTamanoSugerido || 1
        : 1;
    const indicesOrigenActivosCurso = motorInicialCurso?.origenBloquesIndices || [];

    // Filtrar bandeja lateral según el filtro activo
    const materiasCursoFiltradas = materiasCurso.filter((m) => {
      if (uiState.filtroBandejaCurso === 'PENDIENTES') return m.horasPendientes > 0;
      if (uiState.filtroBandejaCurso === 'COMPLETAS') return m.completada;
      if (uiState.filtroBandejaCurso === 'ALERTAS') {
        return (
          m.excedida ||
          Boolean(m.analisisFormato && m.analisisFormato.advertenciaFormato) ||
          recreosCurso.some((r) => r.materiaId === m.id)
        );
      }
      return true;
    });

    // Construir panel unificado de alertas del curso (Choques, Indisponibilidad, Excesos y Recreos)
    const alertasCursoItems = [];
    for (const ch of choquesCurso) {
      alertasCursoItems.push(`
        <div class="flex items-center justify-between gap-2 bg-rose-950/90 border border-rose-500/80 rounded-xl px-3 py-2 text-xs">
          <div>
            <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] uppercase mr-1.5">🚨 CHOQUE DOCENTE</span>
            <strong class="text-white">${ch.docenteNombre}</strong>
            <span class="text-rose-200 ml-1">(${ch.dia} · ${ch.bloqueNombre} ${ch.horario}): superpuesto en <strong>${ch.conflictos.join(' ⚡ ')}</strong></span>
          </div>
          <button data-ir-docente-conflicto="${ch.docenteId}" class="px-2.5 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white text-[11px] font-semibold shrink-0">
            Ver Docente →
          </button>
        </div>
      `);
    }
    for (const v of violacionesCurso) {
      alertasCursoItems.push(`
        <div class="flex items-center justify-between gap-2 bg-rose-950/80 border border-rose-500/60 rounded-xl px-3 py-2 text-xs">
          <div>
            <span class="px-2 py-0.5 rounded bg-rose-700 text-white font-black text-[10px] uppercase mr-1.5">🚫 DOCENTE NO DISPONIBLE</span>
            <span class="text-rose-100">${v.explicacion}</span>
          </div>
          <button data-ir-docente-conflicto="${v.docenteId}" class="px-2.5 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white text-[11px] font-semibold shrink-0">
            Ver Disponibilidad →
          </button>
        </div>
      `);
    }
    for (const m of materiasExcedidasCurso) {
      alertasCursoItems.push(`
        <div class="flex items-center justify-between gap-2 bg-rose-950/75 border border-rose-500/50 rounded-xl px-3 py-2 text-xs">
          <div>
            <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] uppercase mr-1.5">🚨 EXCESO DE HORAS</span>
            <span class="text-rose-100">La materia <strong>${m.nombre}</strong> tiene <strong>${m.horasAsignadas}/${m.horasSemanales} hs</strong> asignadas (+${m.horasExceso} hs por encima de su plan).</span>
          </div>
        </div>
      `);
    }
    for (const r of recreosCurso) {
      alertasCursoItems.push(`
        <div class="flex items-center justify-between gap-2 bg-amber-950/75 border border-amber-500/50 rounded-xl px-3 py-2 text-xs">
          <div>
            <span class="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase mr-1.5">☕ BLOQUE CORTADO POR RECREO</span>
            <span class="text-amber-100"><strong>${r.materiaNombre}</strong> (${r.dia} · ${r.bloquesNombres || ''}): ${r.detalle}</span>
          </div>
        </div>
      `);
    }

    const panelAlertasCursoHtml =
      alertasCursoItems.length > 0
        ? `
      <div class="bg-slate-900 border-2 border-rose-500/80 rounded-2xl p-3.5 space-y-2 shadow-lg shadow-rose-950/40">
        <div class="flex items-center justify-between">
          <div class="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center gap-2">
            <span>🚨 Se detectaron ${alertasCursoItems.length} conflicto(s) / advertencia(s) en ${cursoActual.nombre}</span>
          </div>
          <button id="btn-ver-todas-alertas-curso" class="text-xs font-bold text-blue-400 hover:text-blue-300 underline">
            Abrir Centro de Choques y Horas Libres →
          </button>
        </div>
        <div class="space-y-1.5">
          ${alertasCursoItems.join('')}
        </div>
      </div>
    `
        : '';

    function construirBannerMateriaActivaCursoHtml(matActiva, esMovimiento, cantBloques, motorRef) {
      if (!matActiva && uiState.modoAsignarAlmuerzoCurso && habilitarAlmuerzo) {
        return `
          <div class="bg-orange-950/50 border-2 border-orange-500/80 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-orange-600 text-white font-black uppercase text-[10px]">
                🍽️ Modo Almuerzo Activo
              </span>
              <span class="text-orange-100 font-semibold">
                Haz clic (o clic derecho en cualquier momento) sobre un casillero libre de la grilla para marcar o quitar un bloque de Almuerzo.
              </span>
            </div>
            <button id="btn-salir-modo-almuerzo-curso" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]">
              ✕ Salir de Modo Almuerzo
            </button>
          </div>
        `;
      }
      if (!matActiva) return '';

      const textoEstadoCarga = matActiva.completada
        ? `✅ Carga completa (${matActiva.horasAsignadas}/${matActiva.horasSemanales} hs)`
        : matActiva.excedida
          ? `🚨 Exceso (${matActiva.horasAsignadas}/${matActiva.horasSemanales} hs)`
          : `⏳ ${matActiva.horasAsignadas}/${matActiva.horasSemanales} hs`;

      const textoOrigen =
        esMovimiento && motorRef?.origenRangoTexto
          ? `📍 Origen: ${motorRef.origenRangoTexto} (${cantBloques} hs)`
          : cantBloques > 1
            ? `📦 Bloque continuo de ${cantBloques} hs`
            : '1 hora cátedra';

      return `
        <div class="bg-slate-900 border-2 ${
          esMovimiento ? 'border-emerald-500/85' : 'border-emerald-500/85'
        } rounded-2xl px-4 py-3 space-y-2 text-xs shadow-lg">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-emerald-600 text-white font-black uppercase text-[10px]">
                🚦 Semáforo en Tiempo Real
              </span>
              ${
                esMovimiento
                  ? `<span class="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black uppercase text-[10px]">
                      🔄 Mover / Enrocar
                    </span>`
                  : ''
              }
              <strong class="text-white text-sm">${matActiva.nombre}</strong>
              <span class="text-slate-300">· 👤 ${matActiva.docentesNombres}</span>
              <span class="px-2 py-0.5 rounded bg-slate-950 border border-emerald-500/40 font-mono text-emerald-300 font-bold">
                ${textoEstadoCarga}
              </span>
              <span class="px-2 py-0.5 rounded bg-indigo-600/30 border border-indigo-400/60 text-indigo-200 font-bold">
                ${textoOrigen}
              </span>
              <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 font-mono text-blue-300">
                Fmt: ${matActiva.formatoBloques}
              </span>
            </div>
            <button id="btn-cancelar-seleccion-curso" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]">
              ✕ Quitar selección
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
            <span class="text-slate-400 font-semibold">Colores en grilla:</span>
            <span class="px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 font-bold">🟢 Libre Ideal / Cierra hueco</span>
            <span class="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold">🟡 Libre con aviso</span>
            <span class="px-2 py-0.5 rounded bg-blue-600/25 border border-blue-500/60 text-blue-300 font-bold">🔵 Enroque 1 a 1</span>
            <span class="px-2 py-0.5 rounded bg-violet-600/25 border border-violet-500/60 text-violet-300 font-bold">🟣 Enroque Triangular</span>
            <span class="px-2 py-0.5 rounded bg-rose-600/20 border border-rose-500/50 text-rose-300 font-bold">🔴 No disponible</span>
          </div>
        </div>
      `;
    }

    function construirInteriorCeldaLibreCurso(
      dia,
      bloqueIndice,
      matActiva,
      cantBloques,
      origenMov,
      origIndices = []
    ) {
      if (matActiva) {
        const evalSlot = window.sghAPI.evaluarSlotEnVistaCurso({
          cursoId: cursoActual.id,
          materiaId: matActiva.id,
          dia,
          bloqueIndice,
          cantidadBloques: cantBloques,
          origenMovimiento: origenMov,
          origenBloquesIndices: origIndices
        });

        if (evalSlot) {
          if (evalSlot.semaforo === 'OPTIMO_CIERRA_PUENTE') {
            return {
              title: evalSlot.motivo,
              html: `
                <div class="rounded-lg border-2 border-emerald-400 bg-emerald-950/75 p-1.5 h-14 flex flex-col items-center justify-center text-center shadow-md ring-1 ring-amber-400/60">
                  <span class="text-[10px] font-black text-amber-300">${evalSlot.etiquetaCorta}</span>
                  <span class="text-[9px] text-emerald-200 font-bold mt-0.5">🟢 Ubicación Óptima</span>
                </div>
              `
            };
          }

          if (evalSlot.semaforo === 'DISPONIBLE_IDEAL') {
            return {
              title: evalSlot.motivo,
              html: `
                <div class="rounded-lg border-2 border-emerald-500 bg-emerald-950/60 p-1.5 h-14 flex flex-col items-center justify-center text-center shadow-sm">
                  <span class="text-[10px] font-black text-emerald-300">${evalSlot.etiquetaCorta}</span>
                  <span class="text-[9px] text-emerald-100 font-semibold mt-0.5">🟢 Clic o soltar aquí</span>
                </div>
              `
            };
          }

          if (evalSlot.semaforo === 'ADVERTENCIA_PUENTE_O_RECREO') {
            return {
              title: evalSlot.motivo,
              html: `
                <div class="rounded-lg border-2 border-dashed border-amber-500 bg-amber-950/55 p-1.5 h-14 flex flex-col items-center justify-center text-center">
                  <span class="text-[10px] font-black text-amber-300">${evalSlot.etiquetaCorta}</span>
                  <span class="text-[9px] text-amber-200 font-semibold mt-0.5">🟡 Asignable con aviso</span>
                </div>
              `
            };
          }

          return {
            title: evalSlot.motivo,
            html: `
              <div class="rounded-lg border border-rose-500/50 bg-rose-950/35 p-1.5 h-14 flex flex-col items-center justify-center text-center opacity-80">
                <span class="text-[10px] font-bold text-rose-300">${evalSlot.etiquetaCorta}</span>
                <span class="text-[9px] text-slate-400 mt-0.5 truncate max-w-full">🔴 No disponible</span>
              </div>
            `
          };
        }
      }

      if (uiState.modoAsignarAlmuerzoCurso && habilitarAlmuerzo) {
        return {
          title: 'Haz clic para marcar este bloque como Almuerzo',
          html: `
            <div class="rounded-lg border-2 border-dashed border-orange-500/60 hover:border-orange-400 bg-orange-950/25 p-1.5 h-14 flex flex-col items-center justify-center text-center text-orange-300">
              <span class="text-[10px] font-bold">+ 🍽️ Marcar Almuerzo</span>
            </div>
          `
        };
      }

      return {
        title: habilitarAlmuerzo
          ? 'Casillero libre (clic derecho para marcar como Almuerzo)'
          : 'Casillero libre',
        html: `
          <div class="rounded-lg border border-dashed border-slate-800 hover:border-emerald-500/50 p-1.5 h-14 flex flex-col items-center justify-center text-center text-slate-500 hover:text-emerald-300">
            <span class="text-[10px] font-medium">Horario Libre</span>
          </div>
        `
      };
    }

    container.innerHTML = `
      <!-- Barra de Selección Rápida de Curso y Modo de Agrupación de Bloques -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Curso:</span>
          ${estado.cursos
            .map((c) => {
              const esActivo = c.id === cursoActual.id;
              const tieneExceso = (auditoria.materiasExcedidas || []).some((m) => m.cursoId === c.id);
              const tieneChoque = (auditoria.choquesDocentes || []).some((ch) =>
                (ch.cursosIds || []).includes(c.id)
              );
              const tieneViol = (auditoria.violacionesDisponibilidad || []).some(
                (v) => v.cursoId === c.id
              );
              const alertaCritica = tieneExceso || tieneChoque || tieneViol;
              const asigsC = estado.asignaciones.filter((a) => a.cursoId === c.id).length;
              const reqC = estado.materias
                .filter((m) => m.cursoId === c.id)
                .reduce((acc, m) => acc + (m.horasSemanales || 0), 0);

              return `
                <button data-select-curso="${c.id}"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    esActivo
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                      : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  } ${alertaCritica ? 'ring-2 ring-rose-500' : ''}">
                  <span>${c.nombre} (${c.division})</span>
                  <span class="text-[10px] font-mono ${esActivo ? 'text-blue-100' : 'text-slate-400'}">${asigsC}/${reqC}h</span>
                  ${alertaCritica ? `<span class="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10px]">🚨</span>` : ''}
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="flex items-center gap-2 text-xs flex-wrap">
          <span class="text-slate-400 mr-1">
            Progreso: <strong class="text-white font-mono">${totalCursoAsig}/${totalCursoReq} hs (${pctCurso}%)</strong>
          </span>
          <!-- Selector de asignación por 1 hora vs Paquete de Bloques según formato (2h/3h) -->
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button id="btn-modo-bloque-curso-1h"
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                uiState.modoBloquesCurso === 'INDIVIDUAL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }">
              1 Hora Individual
            </button>
            <button id="btn-modo-bloque-curso-auto"
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                uiState.modoBloquesCurso === 'AUTO_BLOQUE'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }">
              📦 Bloque Agrupado (2h/3h)
            </button>
          </div>
          ${
            habilitarAlmuerzo
              ? `<button id="btn-modo-almuerzo-curso"
                  title="Marcar o quitar bloques de Almuerzo (también puedes hacer clic derecho directo en un casillero)"
                  class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition border ${
                    uiState.modoAsignarAlmuerzoCurso
                      ? 'bg-orange-600 text-white border-orange-400 shadow ring-2 ring-orange-400/50'
                      : 'bg-orange-500/15 hover:bg-orange-600 text-orange-300 hover:text-white border-orange-500/40'
                  }">
                  🍽️ ${uiState.modoAsignarAlmuerzoCurso ? 'Almuerzo Activo' : 'Almuerzo'}
                </button>`
              : ''
          }
          <button id="btn-movimiento-deseado-curso"
            title="Abrir asistente para cubrir un bloque puntual con una materia o docente"
            class="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] font-bold transition">
            🎯 Movimiento Deseado
          </button>
          <button id="btn-exportar-curso-excel"
            title="Exportar horario de ${cursoActual.nombre} a Excel (.xlsx)"
            class="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-bold transition">
            📗 Excel
          </button>
          <button id="btn-exportar-curso-pdf"
            title="Exportar horario de ${cursoActual.nombre} a PDF A4 Horizontal (.pdf)"
            class="px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-bold transition">
            📕 PDF
          </button>
        </div>
      </div>

      ${panelAlertasCursoHtml}
      <div id="banner-semaforo-curso-container">
        ${construirBannerMateriaActivaCursoHtml(
          materiaActivaCurso,
          Boolean(uiState.celdaOrigenSeleccionada),
          cantBloquesAsignarCurso,
          motorInicialCurso
        )}
      </div>
      <div id="panel-propuestas-curso-container"></div>

      <!-- Layout Principal: Grilla Semanal (9 cols) + Bandeja de Materias y Carga Horaria (3 cols) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <!-- Grilla Semanal del Curso (table-fixed + overflow-x-auto evita recortar el día Viernes) -->
        <div class="lg:col-span-9 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
          <table class="w-full table-fixed min-w-[660px] border-collapse text-xs">
            <thead>
              <tr class="bg-slate-950 text-slate-300 border-b border-slate-800">
                <th class="py-2.5 px-2.5 text-left w-28">Bloque / Horario</th>
                ${estado.configuracion.diasHabiles
                  .map(
                    (dia) => `
                  <th class="py-2.5 px-2 text-center font-bold border-l border-slate-800">${dia}</th>
                `
                  )
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${estado.configuracion.bloquesHorarios
                .map((bloque) => {
                  const celdasDias = estado.configuracion.diasHabiles
                    .map((dia) => {
                      const asig = asignacionesCurso.find(
                        (a) => a.dia === dia && a.bloqueIndice === bloque.indice
                      );
                      const mat = asig ? materiasMap.get(asig.materiaId) : null;
                      const esOrigenSel =
                        uiState.celdaOrigenSeleccionada &&
                        uiState.celdaOrigenSeleccionada.dia === dia &&
                        uiState.celdaOrigenSeleccionada.bloqueIndice === bloque.indice;

                      if (mat) {
                        // Posición de esta celda dentro de su corrida contigua en el día
                        const indicesMatMismoDia = asignacionesCurso
                          .filter((a) => a.dia === dia && a.materiaId === mat.id)
                          .map((a) => a.bloqueIndice)
                          .sort((a, b) => a - b);
                        const corridasDia = agruparIndicesContiguos(indicesMatMismoDia);
                        const corridaActual =
                          corridasDia.find((c) => c.includes(bloque.indice)) || [bloque.indice];
                        const posEnCorrida = corridaActual.indexOf(bloque.indice);
                        const etiquetaPosBloque =
                          corridaActual.length > 1 && posEnCorrida !== -1
                            ? `📦 ${posEnCorrida + 1}/${corridaActual.length}h`
                            : '1h';

                        // Buscar si esta celda específica tiene choque docente, violación de disponibilidad o cruce de recreo
                        const choqueEnCelda = choquesCurso.find(
                          (ch) => ch.dia === dia && ch.bloqueIndice === bloque.indice
                        );
                        const violEnCelda = violacionesCurso.find(
                          (v) => v.dia === dia && v.bloqueIndice === bloque.indice
                        );
                        const recreoEnCelda = recreosCurso.find(
                          (r) =>
                            r.dia === dia &&
                            r.materiaId === mat.id &&
                            (r.indices || []).includes(bloque.indice)
                        );

                        const tieneConflictoRojo =
                          Boolean(choqueEnCelda) || Boolean(violEnCelda) || Boolean(mat.excedida);

                        const esMismaMateriaActiva =
                          materiaActivaCurso && materiaActivaCurso.id === mat.id;

                        const claseBorde = tieneConflictoRojo
                          ? 'border-rose-500 ring-2 ring-rose-500/80'
                          : recreoEnCelda
                            ? 'border-amber-500 ring-1 ring-amber-500/70'
                            : esMismaMateriaActiva
                              ? 'border-blue-400 ring-1 ring-blue-400'
                              : 'border-slate-700/80';

                        return `
                          <td data-celda-curso="true" data-dia="${dia}" data-bloque="${bloque.indice}"
                            data-materia-celda="${mat.id}"
                            draggable="true" data-drag-origen-celda="true"
                            class="p-1 border-l border-b border-slate-800 align-top cursor-pointer transition hover:brightness-110 ${
                              esOrigenSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                            }">
                            <div class="rounded-lg p-1.5 h-full min-w-0 flex flex-col justify-between border shadow-sm ${claseBorde}"
                              style="background-color: ${tieneConflictoRojo ? 'rgba(225, 29, 72, 0.25)' : `${mat.color}22`}; border-left: 4px solid ${tieneConflictoRojo ? '#f43f5e' : mat.color};">
                              <div class="min-w-0">
                                <div class="flex items-start justify-between gap-1">
                                  <span class="font-bold text-white text-[11px] leading-tight break-words line-clamp-2">${mat.nombre}</span>
                                  <div class="flex items-center gap-1 shrink-0">
                                    <span class="px-1 py-0.2 text-[9px] rounded bg-slate-900/80 text-slate-200 font-mono font-bold">${etiquetaPosBloque}</span>
                                    ${
                                      mat.docentesIds.length > 1
                                        ? `<span class="px-1 py-0.2 text-[9px] rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold" title="Pareja Pedagógica (2 docentes)">2D</span>`
                                        : ''
                                    }
                                  </div>
                                </div>
                                <button data-ir-docente-celda="${mat.docentesIds[0] || ''}"
                                  title="Ver agenda de ${mat.docentesNombres}"
                                  class="text-[10px] text-slate-300 hover:text-blue-300 mt-1 truncate block max-w-full text-left">
                                  👤 ${mat.docentesNombres}
                                </button>
                                ${
                                  choqueEnCelda
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-rose-600 text-white font-black text-[9px] leading-tight" title="${choqueEnCelda.explicacion}">
                                        🚨 CHOQUE: ${choqueEnCelda.docenteNombre}
                                      </div>`
                                    : ''
                                }
                                ${
                                  violEnCelda
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-rose-700 text-white font-bold text-[9px] leading-tight" title="${violEnCelda.explicacion}">
                                        🚫 DOCENTE NO DISPONIBLE
                                      </div>`
                                    : ''
                                }
                                ${
                                  mat.excedida
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-rose-600/90 text-white font-bold text-[9px] inline-block">
                                        🚨 Exceso (${mat.horasAsignadas}/${mat.horasSemanales} hs)
                                      </div>`
                                    : ''
                                }
                                ${
                                  recreoEnCelda
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/50 font-bold text-[9px] leading-tight" title="${recreoEnCelda.detalle}">
                                        ☕ Cortado por recreo
                                      </div>`
                                    : ''
                                }
                              </div>
                              <div class="flex items-center justify-between mt-1.5 pt-1 border-t border-slate-800/60">
                                <span class="text-[9px] font-mono text-slate-400">Fmt: ${mat.formatoBloques}</span>
                                <button data-liberar-celda="true" data-dia="${dia}" data-bloque="${bloque.indice}"
                                  title="Liberar este bloque"
                                  class="text-[10px] text-slate-400 hover:text-rose-400 px-1 rounded">
                                  ✕
                                </button>
                              </div>
                            </div>
                          </td>
                        `;
                      }

                      const esAlmuerzo = almuerzosCurso.some(
                        (al) => al.dia === dia && al.bloqueIndice === bloque.indice
                      );
                      if (esAlmuerzo) {
                        return `
                          <td data-celda-curso="true" data-celda-almuerzo="true" data-dia="${dia}" data-bloque="${bloque.indice}"
                            title="Horario de Almuerzo (clic derecho o ✕ para quitar)"
                            class="p-1 border-l border-b border-slate-800 align-middle cursor-pointer transition hover:brightness-110">
                            <div class="rounded-lg p-1.5 h-14 cell-almuerzo flex flex-col justify-between shadow-sm">
                              <div class="flex items-center justify-between gap-1">
                                <span class="font-black text-orange-200 text-[11px] leading-tight">🍽️ Almuerzo</span>
                                <button data-quitar-almuerzo="true" data-dia="${dia}" data-bloque="${bloque.indice}"
                                  title="Quitar bloque de Almuerzo"
                                  class="text-[10px] text-orange-300 hover:text-white px-1 rounded">
                                  ✕
                                </button>
                              </div>
                              <div class="text-[9px] font-mono text-orange-300/90">${bloque.inicio} - ${bloque.fin}</div>
                            </div>
                          </td>
                        `;
                      }

                      // Casillero libre (con o sin semáforo en tiempo real)
                      const infoLibre = construirInteriorCeldaLibreCurso(
                        dia,
                        bloque.indice,
                        materiaActivaCurso,
                        cantBloquesAsignarCurso,
                        uiState.celdaOrigenSeleccionada,
                        indicesOrigenActivosCurso
                      );
                      return `
                        <td data-celda-curso="true" data-celda-libre="true" data-dia="${dia}" data-bloque="${bloque.indice}"
                          title="${infoLibre.title}"
                          class="p-1 border-l border-b border-slate-800 align-middle cursor-pointer transition hover:brightness-110 ${
                            esOrigenSel ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                          }">
                          ${infoLibre.html}
                        </td>
                      `;
                    })
                    .join('');

                  const filaBloque = `
                    <tr class="hover:bg-slate-900/40">
                      <td class="py-2 px-2.5 border-b border-slate-800 bg-slate-950/60">
                        <div class="font-bold text-white text-[11px]">${bloque.nombre}</div>
                        <div class="font-mono text-[10px] text-slate-400">${bloque.inicio} - ${bloque.fin}</div>
                      </td>
                      ${celdasDias}
                    </tr>
                  `;

                  const filaRecreo = bloque.recreoPosterior
                    ? `
                      <tr class="bg-amber-950/30 border-b border-amber-500/30">
                        <td colspan="${estado.configuracion.diasHabiles.length + 1}" class="py-1.5 px-4 text-center">
                          <div class="flex items-center justify-center gap-2 text-[11px] font-bold text-amber-300 tracking-wide">
                            <span>☕ ${bloque.recreoPosterior.etiqueta}</span>
                          </div>
                        </td>
                      </tr>
                    `
                    : '';

                  return filaBloque + filaRecreo;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        <!-- Panel Lateral: Bandeja de Materias y Carga Horaria -->
        <div class="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-3">
          <div>
            <h3 class="text-sm font-bold text-white">📚 Materias de ${cursoActual.nombre}</h3>
            <p class="text-[11px] text-slate-400 mt-0.5">
              Haz clic o arrastra una materia hacia la grilla para ver el semáforo y asignarla.${
                habilitarAlmuerzo
                  ? ' Clic derecho en un bloque libre marca/quita 🍽️ Almuerzo.'
                  : ''
              }
            </p>
          </div>

          <!-- Filtros rápidos de la bandeja -->
          <div class="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
            ${[
              { id: 'TODAS', label: 'Todas' },
              { id: 'PENDIENTES', label: '⏳ Pend.' },
              { id: 'COMPLETAS', label: '✅ Compl.' },
              { id: 'ALERTAS', label: '⚠️ Alertas' }
            ]
              .map(
                (f) => `
              <button data-filtro-bandeja-curso="${f.id}"
                class="py-1 rounded-lg transition ${
                  uiState.filtroBandejaCurso === f.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }">
                ${f.label}
              </button>
            `
              )
              .join('')}
          </div>

          <div class="space-y-2 overflow-y-auto max-h-[640px] pr-1">
            ${materiasCursoFiltradas
              .map((m) => {
                const seleccionada = Boolean(materiaActivaCurso && materiaActivaCurso.id === m.id);
                const pctM =
                  m.horasSemanales > 0
                    ? Math.min(100, Math.round((m.horasAsignadas / m.horasSemanales) * 100))
                    : 0;
                const af = m.analisisFormato;

                let badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                let barColor = 'bg-amber-500';
                if (m.excedida) {
                  badgeClass = 'bg-rose-600 text-white border-rose-400 shadow-sm animate-pulse';
                  barColor = 'bg-rose-500';
                } else if (m.completada) {
                  badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                  barColor = 'bg-emerald-500';
                }

                let cardClass = 'bg-slate-950/80 border-slate-800 hover:border-slate-700';
                if (seleccionada && m.excedida) {
                  cardClass = 'bg-rose-950/60 border-rose-500 ring-2 ring-rose-500';
                } else if (seleccionada) {
                  cardClass = 'bg-blue-950/60 border-blue-500 ring-2 ring-blue-500';
                } else if (m.excedida) {
                  cardClass = 'bg-rose-950/35 border-rose-500/80 hover:border-rose-400';
                }

                return `
                  <div data-bandeja-materia="${m.id}"
                    draggable="true"
                    class="p-2.5 rounded-xl border transition cursor-pointer ${cardClass}"
                    style="border-left: 4px solid ${m.excedida ? '#f43f5e' : m.color || '#3b82f6'};">
                    <div class="flex items-start justify-between gap-2">
                      <div class="font-bold text-xs text-white leading-snug">${m.nombre}</div>
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shrink-0 ${badgeClass}">
                        ${m.excedida ? '🚨 ' : ''}${m.horasAsignadas}/${m.horasSemanales} hs
                      </span>
                    </div>

                    <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1.5 border border-slate-800">
                      <div class="h-full ${barColor} transition-all duration-300" style="width: ${pctM}%"></div>
                    </div>

                    ${
                      m.excedida
                        ? `<div class="mt-1.5 px-2 py-1 rounded-md bg-rose-600/25 border border-rose-500/50 text-[10px] font-bold text-rose-200 flex items-center gap-1">
                            <span>⚠️ EXCESO HORARIO (+${m.horasExceso} hs sobre el plan)</span>
                          </div>`
                        : ''
                    }
                    ${
                      af && af.advertenciaFormato
                        ? `<div class="mt-1.5 px-2 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-[10px] text-amber-200">
                            📦 ${af.advertenciaFormato}
                          </div>`
                        : ''
                    }
                    <div class="text-[11px] text-slate-300 mt-1 truncate" title="${m.docentesNombres}">
                      👤 ${m.docentesNombres}
                    </div>
                    <div class="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
                      <span>Bloques: <strong class="text-slate-200 font-mono">${m.formatoBloques}</strong> (${m.modoExigencia})</span>
                      <span class="font-mono text-slate-300">Hoy: ${af ? af.formatoActualTexto : '-'}</span>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;

    function limpiarSeleccionCurso() {
      uiState.materiaSeleccionadaBandejaId = null;
      uiState.celdaOrigenSeleccionada = null;
    }

    function renderizarPanelPropuestasCurso(motor) {
      const cont = document.getElementById('panel-propuestas-curso-container');
      if (!cont) return;
      try {
        cont.innerHTML = construirPanelPropuestasHtml(motor);
        conectarEventosPanelPropuestas(
          cont,
          motor,
          limpiarSeleccionCurso,
          () => renderizarPanelPropuestasCurso(motor),
          {
            onSeleccionarOrigenGrilla: (diaOrig, bloqueOrig) => {
              uiState.celdaOrigenSeleccionada = { dia: diaOrig, bloqueIndice: bloqueOrig };
              renderizarVistaCurso();
            },
            onSeleccionarOrigenBandeja: () => {
              if (motor && motor.materiaId) {
                uiState.materiaSeleccionadaBandejaId = motor.materiaId;
              }
              uiState.celdaOrigenSeleccionada = null;
              renderizarVistaCurso();
            },
            onCambiarModoBloque: (nuevoModo) => {
              uiState.modoBloquesCurso = nuevoModo;
              renderizarVistaCurso();
            }
          }
        );
      } catch (err) {
        console.error('Error al renderizar propuestas del curso:', err);
      }
    }

    // Función que ilumina el Semáforo en tiempo real al arrastrar una materia o celda sin requerir clic previo
    function iluminarSemaforoCursoEnVivo(matId, origenMov) {
      const matObj = materiasMap.get(matId) || null;
      const motor = matObj ? obtenerMotorCursoActivo(matId, origenMov) : null;
      const cant = motor
        ? motor.tamanoBloque || 1
        : uiState.modoBloquesCurso === 'AUTO_BLOQUE' && matObj && !origenMov
          ? matObj.analisisFormato?.proximoTamanoSugerido || 1
          : 1;
      const origIdx = motor?.origenBloquesIndices || [];

      const bannerCont = document.getElementById('banner-semaforo-curso-container');
      if (bannerCont) {
        bannerCont.innerHTML = construirBannerMateriaActivaCursoHtml(
          matObj,
          Boolean(origenMov),
          cant,
          motor
        );
        document
          .getElementById('btn-cancelar-seleccion-curso')
          ?.addEventListener('click', () => {
            uiState.materiaSeleccionadaBandejaId = null;
            uiState.celdaOrigenSeleccionada = null;
            renderizarVistaCurso();
          });
      }

      container.querySelectorAll('td[data-celda-libre="true"]').forEach((tdLibre) => {
        const d = tdLibre.getAttribute('data-dia');
        const b = parseInt(tdLibre.getAttribute('data-bloque'), 10);
        const info = construirInteriorCeldaLibreCurso(d, b, matObj, cant, origenMov, origIdx);
        tdLibre.setAttribute('title', info.title);
        tdLibre.innerHTML = info.html;
      });

      // Fase 4: Motor Inteligente de Propuestas (resalta enroques Azul/Violeta y lista todas las opciones)
      resaltarPropuestasEnGrillaCurso(container, motor);
      renderizarPanelPropuestasCurso(motor);
    }

    function ejecutarAlternarAlmuerzo(dia, bloqueIndice) {
      if (!habilitarAlmuerzo) return;
      const res = window.sghAPI.alternarAlmuerzoEnBloque({
        cursoId: cursoActual.id,
        dia,
        bloqueIndice
      });
      if (!res) return;
      if (res.error) {
        mostrarToast(`⚠️ ${res.error}`, 'warning');
        return;
      }
      uiState.resumen = res.resumen;
      renderizarTodo();
      mostrarToast(
        res.accion === 'ASIGNADO'
          ? `🍽️ Bloque asignado a Almuerzo en ${cursoActual.nombre} (${dia} Bloque ${bloqueIndice + 1}).`
          : `Bloque de Almuerzo quitado en ${cursoActual.nombre} (${dia} Bloque ${bloqueIndice + 1}).`,
        'info'
      );
    }

    /**
     * Solicita mover/enrocar una clase de la grilla hacia un casillero destino mostrando siempre el
     * Modal de Detalle de Impacto (Fase 4) antes de aplicar.
     */
    function solicitarMovimientoEnCurso(origen, destinoDia, destinoBloque) {
      if (!origen) return;
      let orig = origen;
      let destDia = destinoDia;
      let destBloque = destinoBloque;

      const ocupadoEn = (d, b) =>
        asignacionesCurso.some((a) => a.dia === d && a.bloqueIndice === b);

      // Si el origen está libre y el destino ocupado, invertir para mover la clase hacia el casillero libre
      if (!ocupadoEn(orig.dia, orig.bloqueIndice)) {
        if (!ocupadoEn(destDia, destBloque)) {
          limpiarSeleccionCurso();
          renderizarVistaCurso();
          return;
        }
        orig = { dia: destinoDia, bloqueIndice: destinoBloque };
        destDia = origen.dia;
        destBloque = origen.bloqueIndice;
      }

      const motor = obtenerMotorCursoActivo(null, orig);
      const origIdx = motor ? motor.origenBloquesIndices : [orig.bloqueIndice];

      const prev = window.sghAPI.previsualizarInteraccionMovimiento({
        cursoId: cursoActual.id,
        origenDia: orig.dia,
        origenBloquesIndices: origIdx,
        destinoDia: destDia,
        destinoBloqueIndice: destBloque
      });

      if (!prev || prev.error) {
        mostrarToast(prev ? `⚠️ ${prev.error}` : 'No es posible realizar este movimiento.', 'warning');
        return;
      }

      abrirModalConfirmacionMovimiento(prev.impactoPrincipal, {
        alternativaTriangular: prev.alternativaTriangular,
        onAplicado: limpiarSeleccionCurso
      });
    }

    // Eventos de navegación desde el panel de alertas del curso
    document.getElementById('btn-ver-todas-alertas-curso')?.addEventListener('click', () => {
      uiState.tabActual = 'alertas';
      actualizarBotonesNav();
      renderizarTodo();
    });

    document.getElementById('btn-cancelar-seleccion-curso')?.addEventListener('click', () => {
      uiState.materiaSeleccionadaBandejaId = null;
      uiState.celdaOrigenSeleccionada = null;
      renderizarVistaCurso();
    });

    document.getElementById('btn-salir-modo-almuerzo-curso')?.addEventListener('click', () => {
      uiState.modoAsignarAlmuerzoCurso = false;
      renderizarVistaCurso();
    });

    document.getElementById('btn-modo-almuerzo-curso')?.addEventListener('click', () => {
      uiState.modoAsignarAlmuerzoCurso = !uiState.modoAsignarAlmuerzoCurso;
      if (uiState.modoAsignarAlmuerzoCurso) {
        uiState.materiaSeleccionadaBandejaId = null;
        uiState.celdaOrigenSeleccionada = null;
        mostrarToast(
          '🍽️ Modo Almuerzo activo: haz clic sobre cualquier casillero libre para marcar o quitar Almuerzo.',
          'info'
        );
      }
      renderizarVistaCurso();
    });

    document.getElementById('btn-modo-bloque-curso-1h')?.addEventListener('click', () => {
      uiState.modoBloquesCurso = 'INDIVIDUAL';
      renderizarVistaCurso();
    });

    document.getElementById('btn-modo-bloque-curso-auto')?.addEventListener('click', () => {
      uiState.modoBloquesCurso = 'AUTO_BLOQUE';
      renderizarVistaCurso();
    });

    document.getElementById('btn-movimiento-deseado-curso')?.addEventListener('click', () => {
      abrirModalMovimientoDeseado({
        cursoId: cursoActual.id,
        modoObjetivo: 'MATERIA',
        materiaId: materiaActivaCurso?.id || materiasCurso[0]?.id || null
      });
    });

    document.getElementById('btn-exportar-curso-excel')?.addEventListener('click', () => {
      ejecutarExportacionHorario('EXCEL', { alcance: 'CURSO', cursoId: cursoActual.id });
    });

    document.getElementById('btn-exportar-curso-pdf')?.addEventListener('click', () => {
      ejecutarExportacionHorario('PDF', { alcance: 'CURSO', cursoId: cursoActual.id });
    });

    container.querySelectorAll('[data-filtro-bandeja-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.filtroBandejaCurso = btn.getAttribute('data-filtro-bandeja-curso');
        renderizarVistaCurso();
      });
    });

    container.querySelectorAll('[data-ir-docente-conflicto], [data-ir-docente-celda]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const docId =
          btn.getAttribute('data-ir-docente-conflicto') ||
          btn.getAttribute('data-ir-docente-celda');
        if (!docId) return;
        uiState.docenteSeleccionadoId = docId;
        uiState.tabActual = 'docente';
        actualizarBotonesNav();
        renderizarTodo();
      });
    });

    // Eventos de cambio de curso
    container.querySelectorAll('[data-select-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.cursoSeleccionadoId = btn.getAttribute('data-select-curso');
        uiState.materiaSeleccionadaBandejaId = null;
        uiState.celdaOrigenSeleccionada = null;
        renderizarVistaCurso();
      });
    });

    // Función auxiliar que obtiene el primer bloque asignado de una materia en el curso actual
    function obtenerPrimeraAsignacionMateriaEnCurso(matId) {
      for (const d of estado.configuracion.diasHabiles) {
        const indicesDia = asignacionesCurso
          .filter((a) => a.dia === d && a.materiaId === matId)
          .map((a) => a.bloqueIndice)
          .sort((a, b) => a - b);
        if (indicesDia.length > 0) {
          const corridas = agruparIndicesContiguos(indicesDia);
          return {
            dia: d,
            bloqueIndice: corridas[0][0],
            tamanoCorrida: corridas[0].length
          };
        }
      }
      return null;
    }

    // Eventos de selección y Drag & Drop de materia en bandeja (ilumina semáforo y enroques sin requerir clic previo)
    container.querySelectorAll('[data-bandeja-materia]').forEach((card) => {
      const matId = card.getAttribute('data-bandeja-materia');
      card.addEventListener('click', () => {
        uiState.modoAsignarAlmuerzoCurso = false;
        const yaSeleccionada =
          uiState.materiaSeleccionadaBandejaId === matId ||
          Boolean(materiaActivaCurso && materiaActivaCurso.id === matId);
        if (yaSeleccionada) {
          uiState.materiaSeleccionadaBandejaId = null;
          uiState.celdaOrigenSeleccionada = null;
          renderizarVistaCurso();
          return;
        }

        uiState.materiaSeleccionadaBandejaId = matId;
        const matObj = materiasMap.get(matId);
        // Si la materia ya tiene todas sus horas asignadas, seleccionar automáticamente su primer bloque en grilla
        // para mostrar de inmediato sus opciones de Enroque 1 a 1 y Enroque Triangular
        if (matObj && matObj.horasPendientes === 0 && matObj.horasAsignadas > 0) {
          const primera = obtenerPrimeraAsignacionMateriaEnCurso(matId);
          if (primera) {
            uiState.celdaOrigenSeleccionada = {
              dia: primera.dia,
              bloqueIndice: primera.bloqueIndice
            };
            if (primera.tamanoCorrida > 1) {
              uiState.modoBloquesCurso = 'AUTO_BLOQUE';
            }
          } else {
            uiState.celdaOrigenSeleccionada = null;
          }
        } else {
          uiState.celdaOrigenSeleccionada = null;
        }
        renderizarVistaCurso();
      });

      card.addEventListener('dragstart', (e) => {
        uiState.modoAsignarAlmuerzoCurso = false;
        uiState.materiaSeleccionadaBandejaId = matId;
        uiState.celdaOrigenSeleccionada = null;
        e.dataTransfer?.setData(
          'text/plain',
          JSON.stringify({ tipo: 'BANDEJA_CURSO', materiaId: matId })
        );
        // Iluminar el semáforo de todos los casilleros libres inmediatamente durante el arrastre
        setTimeout(() => {
          iluminarSemaforoCursoEnVivo(matId, null);
        }, 0);
      });
    });

    // Evento de quitar bloque de Almuerzo directo
    container.querySelectorAll('[data-quitar-almuerzo]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dia = btn.getAttribute('data-dia');
        const bloqueIndice = parseInt(btn.getAttribute('data-bloque'), 10);
        ejecutarAlternarAlmuerzo(dia, bloqueIndice);
      });
    });

    // Evento de liberar bloque directo
    container.querySelectorAll('[data-liberar-celda]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dia = btn.getAttribute('data-dia');
        const bloqueIndice = parseInt(btn.getAttribute('data-bloque'), 10);
        const auditoriaPrevia = uiState.resumen.auditoria;
        uiState.resumen = window.sghAPI.liberarBloqueCurso({
          cursoId: cursoActual.id,
          dia,
          bloqueIndice
        });
        renderizarTodo();
        evaluarYNotificarImpactoOperacion(
          auditoriaPrevia,
          uiState.resumen.auditoria,
          `Bloque liberado en ${cursoActual.nombre} (${dia} Bloque ${bloqueIndice + 1})`
        );
      });
    });

    // Función auxiliar para asignar materia en un bloque o paquete de bloques del curso (con Modal de Pre-Confirmación Fase 4)
    function ejecutarAsignacionDesdeBandejaCurso(matIdAsignada, dia, bloqueIndice) {
      const matObj = materiasMap.get(matIdAsignada);
      const cant =
        uiState.modoBloquesCurso === 'AUTO_BLOQUE' && matObj
          ? matObj.analisisFormato?.proximoTamanoSugerido || 1
          : 1;

      const prev = window.sghAPI.previsualizarInteraccionMovimiento({
        cursoId: cursoActual.id,
        materiaId: matIdAsignada,
        destinoDia: dia,
        destinoBloqueIndice: bloqueIndice,
        cantidadBloques: cant
      });

      if (!prev || prev.error) {
        mostrarToast(
          prev ? `⚠️ ${prev.error}` : 'No es posible asignar la materia en este bloque.',
          'warning'
        );
        return;
      }

      abrirModalConfirmacionMovimiento(prev.impactoPrincipal, {
        alternativaTriangular: prev.alternativaTriangular,
        mensajeExito:
          cant > 1
            ? `Paquete de ${cant} hs de "${matObj ? matObj.nombre : ''}" asignado en ${dia}`
            : `Materia "${matObj ? matObj.nombre : ''}" asignada en ${dia} (Bloque ${bloqueIndice + 1})`
      });
    }

    // Si hay una materia o celda origen activa al renderizar, iluminar propuestas (Azul/Violeta) y mostrar el panel Fase 4
    if (motorInicialCurso) {
      resaltarPropuestasEnGrillaCurso(container, motorInicialCurso);
      renderizarPanelPropuestasCurso(motorInicialCurso);
    }

    // Evento clic, clic derecho (Almuerzo) y Drag & Drop en celda de curso
    container.querySelectorAll('[data-celda-curso]').forEach((td) => {
      const dia = td.getAttribute('data-dia');
      const bloqueIndice = parseInt(td.getAttribute('data-bloque'), 10);

      td.addEventListener('contextmenu', (e) => {
        if (!habilitarAlmuerzo) return;
        e.preventDefault();
        ejecutarAlternarAlmuerzo(dia, bloqueIndice);
      });

      if (td.hasAttribute('data-drag-origen-celda')) {
        td.addEventListener('dragstart', (e) => {
          const matIdCelda = td.getAttribute('data-materia-celda');
          uiState.modoAsignarAlmuerzoCurso = false;
          uiState.materiaSeleccionadaBandejaId = null;
          uiState.celdaOrigenSeleccionada = { dia, bloqueIndice };
          e.dataTransfer?.setData(
            'text/plain',
            JSON.stringify({ tipo: 'CELDA_CURSO', dia, bloqueIndice })
          );
          if (matIdCelda) {
            setTimeout(() => {
              iluminarSemaforoCursoEnVivo(matIdCelda, { dia, bloqueIndice });
            }, 0);
          }
        });
      }

      td.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      td.addEventListener('drop', (e) => {
        e.preventDefault();
        try {
          const raw = e.dataTransfer?.getData('text/plain');
          if (!raw) return;
          const payload = JSON.parse(raw);
          if (payload.tipo === 'BANDEJA_CURSO' && payload.materiaId) {
            ejecutarAsignacionDesdeBandejaCurso(payload.materiaId, dia, bloqueIndice);
          } else if (payload.tipo === 'CELDA_CURSO') {
            if (payload.dia === dia && payload.bloqueIndice === bloqueIndice) return;
            solicitarMovimientoEnCurso(
              { dia: payload.dia, bloqueIndice: payload.bloqueIndice },
              dia,
              bloqueIndice
            );
          }
        } catch (_err) {
          // Ignorar arrastres externos
        }
      });

      td.addEventListener('click', () => {
        if (uiState.modoAsignarAlmuerzoCurso && habilitarAlmuerzo) {
          ejecutarAlternarAlmuerzo(dia, bloqueIndice);
          return;
        }

        const matIdCelda = td.getAttribute('data-materia-celda');

        // 1. Si hay una celda origen seleccionada en grilla, gestionar movimiento/enroque o cambio de bloque de la misma materia
        if (uiState.celdaOrigenSeleccionada) {
          const orig = uiState.celdaOrigenSeleccionada;
          if (orig.dia === dia && orig.bloqueIndice === bloqueIndice) {
            uiState.celdaOrigenSeleccionada = null;
            renderizarVistaCurso();
            return;
          }
          // Si hizo clic en otro bloque de la misma materia activa, cambiar el origen seleccionado a ese bloque
          if (
            matIdCelda &&
            materiaActivaCurso &&
            matIdCelda === materiaActivaCurso.id
          ) {
            uiState.celdaOrigenSeleccionada = { dia, bloqueIndice };
            renderizarVistaCurso();
            return;
          }
          solicitarMovimientoEnCurso(orig, dia, bloqueIndice);
          return;
        }

        // 2. Si hay una materia seleccionada desde la Bandeja (sin celda origen en grilla)
        if (uiState.materiaSeleccionadaBandejaId) {
          if (matIdCelda && matIdCelda === uiState.materiaSeleccionadaBandejaId) {
            uiState.celdaOrigenSeleccionada = { dia, bloqueIndice };
            renderizarVistaCurso();
            return;
          }
          ejecutarAsignacionDesdeBandejaCurso(
            uiState.materiaSeleccionadaBandejaId,
            dia,
            bloqueIndice
          );
          return;
        }

        if (td.hasAttribute('data-celda-almuerzo')) {
          mostrarToast(
            '🍽️ Bloque reservado para Almuerzo. Haz clic derecho o pulsa ✕ para quitarlo.',
            'info'
          );
          return;
        }

        // 3. Si no hay selección previa, seleccionar esta celda como origen
        uiState.celdaOrigenSeleccionada = { dia, bloqueIndice };
        renderizarVistaCurso();
        mostrarToast(
          `Celda seleccionada (${dia} B${bloqueIndice + 1}). Revisa las propuestas iluminadas o haz clic en un destino para ver el detalle de impacto.`,
          'info'
        );
      });
    });
  }

  // =========================================================================
  // VISTA 3: VISTA POR DOCENTE CON LISTADO DE MATERIAS A CARGO Y ASIGNACIÓN DIRECTA
  // =========================================================================
  function renderizarVistaDocente() {
    const container = document.getElementById('tab-docente');
    const { estado } = uiState.resumen;
    const metricasDoc = window.sghAPI.calcularMetricasDocente(uiState.docenteSeleccionadoId);
    if (!metricasDoc) return;

    const materiasACargo = metricasDoc.materiasACargo || [];

    // Verificar que la materia seleccionada o en movimiento siga perteneciendo a este docente
    if (
      uiState.materiaSeleccionadaVistaDocenteId &&
      !materiasACargo.some((m) => m.id === uiState.materiaSeleccionadaVistaDocenteId)
    ) {
      uiState.materiaSeleccionadaVistaDocenteId = null;
    }
    if (
      uiState.celdaOrigenVistaDocente &&
      !materiasACargo.some((m) => m.id === uiState.celdaOrigenVistaDocente.materiaId)
    ) {
      uiState.celdaOrigenVistaDocente = null;
    }

    const materiaActivaId =
      uiState.materiaSeleccionadaVistaDocenteId ||
      (uiState.celdaOrigenVistaDocente ? uiState.celdaOrigenVistaDocente.materiaId : null);
    const materiaActiva = materiaActivaId
      ? materiasACargo.find((m) => m.id === materiaActivaId) || null
      : null;

    const enModoPintar =
      uiState.modoInteraccionVistaDocente === 'DISPONIBILIDAD' && !materiaActiva;

    function obtenerMotorDocenteActivo(matObj, origenMov) {
      if (!matObj) return null;
      if (origenMov) {
        return window.sghAPI.generarPropuestasMovimiento({
          cursoId: matObj.cursoId,
          origenDia: origenMov.dia,
          origenBloqueIndice: origenMov.bloqueIndice,
          expandirCorridaCompleta: uiState.modoBloquesDocente === 'AUTO_BLOQUE'
        });
      }
      const cant =
        uiState.modoBloquesDocente === 'AUTO_BLOQUE'
          ? matObj.analisisFormato?.proximoTamanoSugerido || 1
          : 1;
      return window.sghAPI.generarPropuestasMovimiento({
        cursoId: matObj.cursoId,
        materiaId: matObj.id,
        cantidadBloques: cant
      });
    }

    const motorInicialDoc = materiaActiva
      ? obtenerMotorDocenteActivo(materiaActiva, uiState.celdaOrigenVistaDocente)
      : null;

    const cantBloquesAsignarDocente = motorInicialDoc
      ? motorInicialDoc.tamanoBloque || 1
      : uiState.modoBloquesDocente === 'AUTO_BLOQUE' &&
          materiaActiva &&
          !uiState.celdaOrigenVistaDocente
        ? materiaActiva.analisisFormato?.proximoTamanoSugerido || 1
        : 1;

    // Construir resumen explicativo de Horas Libres del Docente
    const detallePuenteHtml =
      metricasDoc.detalleHorasPuentePorDia && metricasDoc.detalleHorasPuentePorDia.length > 0
        ? `
      <div class="bg-amber-950/35 border border-amber-500/40 rounded-2xl p-3.5 space-y-2">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span class="text-xs font-black text-amber-300 uppercase tracking-wider">
            ⚠️ Detalle de Horas Libres de ${metricasDoc.nombre} (${metricasDoc.totalHorasPuente} hs libres en la semana)
          </span>
          <span class="text-[11px] text-amber-200/80">
            Huecos libres entre la primera y la última clase del día
          </span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${metricasDoc.detalleHorasPuentePorDia
            .map(
              (dp) => `
            <div class="bg-slate-950/80 border border-amber-500/30 rounded-xl p-2.5 text-xs">
              <div class="flex items-center justify-between font-bold text-amber-300">
                <span>📅 ${dp.dia}</span>
                <span class="px-2 py-0.2 rounded bg-amber-500/20 font-mono">⚠️ ${dp.cantidadHorasPuente} hs libres</span>
              </div>
              <p class="text-[11px] text-slate-300 mt-1">${dp.explicacion}</p>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
        : '';

    function construirBannerAccionDocenteHtml(matActiva, origenMov) {
      if (origenMov && matActiva) {
        return `
          <div class="bg-blue-950/80 border-2 border-blue-500 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
            <div class="flex items-center gap-2.5">
              <span class="px-2 py-0.5 rounded bg-blue-600 text-white font-black uppercase text-[10px]">🚦 Semáforo · Reubicando Clase</span>
              <span class="text-blue-100">
                Materia: <strong>${matActiva.nombre}</strong> (<strong>🎓 ${matActiva.cursoNombre}</strong>
                · desde ${origenMov.dia} Bloque ${origenMov.bloqueIndice + 1}).
                Haz clic en un casillero libre o enroque iluminado, o vuelve a pulsar la materia para deseleccionar.
              </span>
            </div>
            <button id="btn-cancelar-accion-docente" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]">
              ✕ Quitar selección
            </button>
          </div>
        `;
      }
      if (matActiva) {
        const estadoCupoTexto = matActiva.excedida
          ? `🚨 Exceso actual: ${matActiva.horasAsignadas}/${matActiva.horasSemanales} hs`
          : matActiva.completada
            ? `✅ Cupo completo (${matActiva.horasAsignadas}/${matActiva.horasSemanales} hs)`
            : `⏳ Pendientes: ${matActiva.horasPendientes} hs (${matActiva.horasAsignadas}/${matActiva.horasSemanales} hs)`;

        return `
          <div class="bg-emerald-950/75 border-2 border-emerald-500/80 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-emerald-600 text-white font-black uppercase text-[10px]">📌 Modo Asignación Activo</span>
              <span class="text-emerald-100">
                Materia seleccionada: <strong>${matActiva.nombre}</strong> — Curso: <strong>🎓 ${matActiva.cursoNombre}</strong>
                <span class="ml-1 px-2 py-0.5 rounded bg-slate-900/90 border border-emerald-500/40 font-mono text-emerald-300 font-bold">${estadoCupoTexto}</span>
              </span>
              <span class="text-slate-300 text-[11px]">
                · La grilla muestra en tiempo real qué bloques están libres u ocupados en <strong>${matActiva.cursoNombre}</strong>.
              </span>
            </div>
            <button id="btn-cancelar-accion-docente" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]">
              ✕ Quitar selección
            </button>
          </div>
        `;
      }
      return '';
    }

    function construirInteriorCeldaLibreDocente(
      dia,
      bloqueIndice,
      celda,
      matActiva,
      cantBloques,
      esReubicacion,
      motorDoc
    ) {
      if (matActiva) {
        const validacion = window.sghAPI.validarAsignacionDesdeVistaDocente({
          docenteId: metricasDoc.docenteId,
          materiaId: matActiva.id,
          dia,
          bloqueIndice,
          cantidadBloques: cantBloques,
          permitirExcesoHoras: uiState.permitirExcesoVistaDocente,
          esReubicacion
        });

        if (validacion && validacion.codigoError === 'BLOQUE_ALMUERZO') {
          return {
            title: validacion.motivo,
            esAsignable: false,
            html: `
              <div class="rounded-lg p-1.5 cell-almuerzo flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-black text-orange-200">🍽️ Almuerzo</span>
                <span class="text-[9px] text-orange-300/90 mt-0.5">🎓 ${matActiva.cursoNombre}</span>
              </div>
            `
          };
        }

        if (validacion && validacion.valido) {
          const deltaP = validacion.deltaHorasPuente || 0;
          const textoImpactoPuente =
            deltaP < 0
              ? `✨ Cierra ${Math.abs(deltaP)}h libre(s)`
              : deltaP > 0
                ? `⚠️ +${deltaP}h libre(s)`
                : '✅ Sin nuevas hs libres';

          return {
            title: validacion.motivo,
            esAsignable: true,
            html: `
              <div class="rounded-lg p-1.5 border-2 border-dashed ${
                celda.esHoraPuente || deltaP < 0
                  ? 'border-amber-400 bg-amber-500/15 hover:border-emerald-400'
                  : validacion.cruzaRecreoInjustificado || deltaP > 0
                    ? 'border-amber-500/80 bg-amber-950/30 hover:border-amber-400'
                    : 'border-emerald-500/70 bg-emerald-950/30 hover:border-emerald-400'
              } flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-black ${
                  celda.esHoraPuente || deltaP < 0 ? 'text-amber-300' : 'text-emerald-300'
                }">
                  ${
                    cantBloques > 1
                      ? `+ Bloque ${cantBloques}h (${validacion.horasAsignadasDespues}/${validacion.horasSemanales}h)`
                      : `+ Asignar (${validacion.horasAsignadasDespues}/${validacion.horasSemanales} hs)`
                  }
                </span>
                <span class="text-[10px] font-bold text-white mt-0.5">🎓 ${matActiva.cursoNombre} Libre</span>
                <span class="text-[9px] font-mono ${
                  deltaP < 0
                    ? 'text-amber-300 font-bold'
                    : deltaP > 0
                      ? 'text-amber-200'
                      : 'text-emerald-300/90'
                } mt-0.5">
                  ${textoImpactoPuente}${validacion.cruzaRecreoInjustificado ? ' · ☕ Recreo' : ''}
                </span>
                ${
                  validacion.generaExceso
                    ? `<span class="text-[9px] text-rose-300 font-bold mt-0.5">⚠️ Genera exceso horario</span>`
                    : ''
                }
              </div>
            `
          };
        }

        if (validacion && validacion.codigoError === 'CURSO_OCUPADO') {
          const propEnroque = motorDoc?.mapaCeldasDestino?.[`${dia}|${bloqueIndice}`] || null;
          if (
            propEnroque &&
            (propEnroque.categoria === 'ENROQUE_1_A_1' ||
              propEnroque.categoria === 'ENROQUE_TRIANGULAR')
          ) {
            const est = ESTILOS_CATEGORIA[propEnroque.identificadorColor] || ESTILOS_CATEGORIA.AZUL;
            return {
              title: propEnroque.impacto?.resumenImpactoPuente || validacion.motivo,
              esAsignable: true,
              html: `
                <div class="rounded-lg p-1.5 ${est.fondo} border-2 ${est.borde} flex flex-col items-center justify-center text-center shadow-sm">
                  <span class="text-[10px] font-black ${est.texto}">
                    ${est.icono} ${propEnroque.categoria === 'ENROQUE_1_A_1' ? 'Enroque 1 a 1' : 'Triangular'}
                  </span>
                  <span class="text-[9px] text-white font-semibold mt-0.5 line-clamp-1" title="↔ ${propEnroque.materiaIntercambioNombre}">
                    ↔ ${propEnroque.materiaIntercambioNombre}
                  </span>
                  <span class="text-[9px] font-mono ${est.texto} font-bold mt-0.5">
                    ${textoDeltaHorasLibres(propEnroque.deltaHorasPuenteTotal)}
                  </span>
                </div>
              `
            };
          }

          return {
            title: validacion.motivo,
            esAsignable: false,
            html: `
              <div class="rounded-lg p-1.5 bg-rose-950/35 border border-rose-500/50 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-black text-rose-300">🚫 ${matActiva.cursoNombre} Ocupado</span>
                <span class="text-[9px] text-rose-200/90 font-semibold mt-0.5 line-clamp-1" title="${validacion.materiaOcupanteNombre}">
                  ${validacion.materiaOcupanteNombre}
                </span>
                <span class="text-[9px] text-slate-400 truncate max-w-full" title="${validacion.docentesOcupantesNombres}">
                  👤 ${validacion.docentesOcupantesNombres}
                </span>
              </div>
            `
          };
        }

        if (validacion && validacion.codigoError === 'CUPO_HORAS_COMPLETO') {
          return {
            title: validacion.motivo,
            esAsignable: false,
            html: `
              <div class="rounded-lg p-2 bg-slate-950/90 border border-amber-500/40 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-bold text-amber-300">🔒 Cupo ${validacion.horasAsignadas}/${validacion.horasSemanales} hs</span>
                <span class="text-[9px] text-emerald-300/80 mt-0.5">🎓 ${matActiva.cursoNombre} Libre</span>
              </div>
            `
          };
        }

        if (
          validacion &&
          (validacion.codigoError === 'DOCENTE_NO_DISPONIBLE' ||
            validacion.codigoError === 'DOCENTE_OCUPADO_OTRO_CURSO')
        ) {
          return {
            title: validacion.motivo,
            esAsignable: false,
            html: `
              <div class="rounded-lg p-2 bg-hatched-unavailable border border-slate-800 flex flex-col items-center justify-center text-center">
                <span class="text-[10px] font-bold text-rose-300">
                  ${
                    validacion.codigoError === 'DOCENTE_OCUPADO_OTRO_CURSO'
                      ? '🚨 Pareja en otro curso'
                      : validacion.esParejaPedagogica
                        ? '🚫 Pareja No Disp.'
                        : '🚫 No Disponible'
                  }
                </span>
                <span class="text-[9px] text-slate-400 mt-0.5 truncate max-w-full">
                  ${validacion.docenteEnConflictoNombre || 'No asiste'}
                </span>
              </div>
            `
          };
        }
      }

      if (celda.esHoraPuente) {
        return {
          title: 'Hora libre entre clases',
          esAsignable: false,
          html: `
            <div data-paint-inner="true" class="rounded-lg p-2.5 cell-hora-puente flex flex-col items-center justify-center text-center">
              <span data-paint-status="true" class="text-[11px] font-black text-amber-300">⚠️ Hora Libre</span>
              <span class="text-[10px] text-emerald-300 mt-0.5">Disponible (Hueco entre clases)</span>
            </div>
          `
        };
      }

      if (celda.disponible) {
        return {
          title: 'Disponible libre',
          esAsignable: false,
          html: `
            <div data-paint-inner="true" class="rounded-lg p-2.5 bg-emerald-500/12 border border-emerald-500/30 flex flex-col items-center justify-center text-center">
              <span data-paint-status="true" class="text-[11px] font-semibold text-emerald-300">Disponible Libre</span>
              <span class="text-[10px] text-emerald-400/70">Sin curso asignado</span>
            </div>
          `
        };
      }

      return {
        title: 'No disponible',
        esAsignable: false,
        html: `
          <div data-paint-inner="true" class="rounded-lg p-2.5 bg-hatched-unavailable border border-slate-800 flex flex-col items-center justify-center text-center">
            <span data-paint-status="true" class="text-[11px] font-medium text-slate-500">No Disponible</span>
            <span class="text-[9px] text-slate-600">No asiste</span>
          </div>
        `
      };
    }

    container.innerHTML = `
      <!-- Barra Superior: Selector de Docente + Tarjetas de Métricas y Horas Libres -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-wrap">
          <label class="text-xs font-bold text-slate-400 uppercase">Docente:</label>
          <select id="select-docente-vista"
            class="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-blue-500">
            ${estado.docentes
              .map((d) => {
                const md = uiState.resumen.auditoria.metricasDocentes.find(
                  (x) => x.docenteId === d.id
                );
                const etiquetaExtra = md
                  ? ` (${md.totalHorasAsignadas}/${md.totalHorasPlanDocente || md.totalHorasAsignadas} hs · ${md.totalHorasPuente} hs libres${md.totalChoquesDocente > 0 ? ` · 🚨 ${md.totalChoquesDocente} choque` : ''})`
                  : '';
                return `
                  <option value="${d.id}" ${d.id === metricasDoc.docenteId ? 'selected' : ''}>
                    ${d.nombre} — ${d.especialidad}${etiquetaExtra}
                  </option>
                `;
              })
              .join('')}
          </select>
        </div>

        <!-- Resumen de métricas del docente seleccionado -->
        <div class="flex flex-wrap items-center gap-2.5">
          <div class="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <span class="text-xs text-slate-400">Carga Asignada:</span>
            <span class="text-sm font-black font-mono text-blue-400">${metricasDoc.totalHorasAsignadas}/${metricasDoc.totalHorasPlanDocente || 0} hs</span>
          </div>
          <div class="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <span class="text-xs text-slate-400">Disponibles sin clase:</span>
            <span class="text-sm font-black font-mono text-emerald-400">${metricasDoc.totalHorasDisponiblesLibres} hs</span>
          </div>
          <div class="bg-amber-950/40 border border-amber-500/40 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <span class="text-xs text-amber-200 font-semibold">⚠️ Horas Libres:</span>
            <span class="text-sm font-black font-mono text-amber-400">${metricasDoc.totalHorasPuente} hs</span>
          </div>
          ${
            metricasDoc.totalChoquesDocente > 0
              ? `<div class="bg-rose-950/80 border border-rose-500 px-3 py-1.5 rounded-xl flex items-center gap-2">
                  <span class="text-xs text-rose-200 font-bold">🚨 Choques:</span>
                  <span class="text-sm font-black font-mono text-white">${metricasDoc.totalChoquesDocente}</span>
                </div>`
              : ''
          }
          <button id="btn-movimiento-deseado-docente"
            title="Abrir asistente para cubrir un bloque puntual con este docente"
            class="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-bold transition">
            🎯 Movimiento Deseado
          </button>
          <button id="btn-exportar-docente-excel"
            title="Exportar agenda de ${metricasDoc.nombre} a Excel (.xlsx)"
            class="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold transition">
            📗 Excel
          </button>
          <button id="btn-exportar-docente-pdf"
            title="Exportar agenda de ${metricasDoc.nombre} a PDF A4 Horizontal (.pdf)"
            class="px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-bold transition">
            📕 PDF
          </button>
          <button id="btn-abrir-abm-docente-vista"
            class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition">
            🎨 Disponibilidad y Datos del Docente →
          </button>
        </div>
      </div>

      ${detallePuenteHtml}
      <div id="banner-accion-docente-container">
        ${construirBannerAccionDocenteHtml(materiaActiva, uiState.celdaOrigenVistaDocente)}
      </div>
      <div id="panel-propuestas-docente-container"></div>

      <!-- Barra de Modo de Interacción y Leyenda Visual -->
      <div class="bg-slate-900/70 border border-slate-800 rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex flex-wrap items-center gap-3">
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-blue-600 inline-block"></span>
            <strong class="text-slate-200">Ocupado:</strong> <span class="text-slate-400">Curso + Materia</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-rose-600 inline-block"></span>
            <strong class="text-rose-300">🚨 Choque / Curso Ocupado</strong>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40 inline-block"></span>
            <strong class="text-slate-200">Disponible Libre</strong>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded cell-hora-puente inline-block"></span>
            <strong class="text-amber-300">⚠️ Hora Libre (hueco)</strong>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-hatched-unavailable border border-slate-700 inline-block"></span>
            <strong class="text-slate-400">No Disponible</strong>
          </span>
        </div>

        <!-- Selector explícito de modo de trabajo y agrupación de bloques en la grilla del docente -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button id="btn-modo-bloque-docente-1h"
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                uiState.modoBloquesDocente === 'INDIVIDUAL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }">
              1 Hora
            </button>
            <button id="btn-modo-bloque-docente-auto"
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                uiState.modoBloquesDocente === 'AUTO_BLOQUE'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }">
              📦 Bloque (2h/3h)
            </button>
          </div>

          <div class="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button id="btn-modo-docente-horario"
              class="px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                !enModoPintar
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }">
              📅 Asignar / Mover Materias
            </button>
            <button id="btn-modo-docente-disponibilidad"
              class="px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                enModoPintar
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }">
              🖌️ Pintar Disponibilidad con Mouse
            </button>
          </div>
        </div>
      </div>

      <!-- Layout Principal: Grilla Semanal del Docente (9 cols) + Materias a Cargo del Docente (3 cols) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <!-- Columna Izquierda (9 cols): Grilla Semanal del Docente -->
        <div id="grilla-vista-docente" class="lg:col-span-9 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
          <table class="w-full table-fixed min-w-[660px] border-collapse text-xs">
            <thead>
              <tr class="bg-slate-950 text-slate-300 border-b border-slate-800">
                <th class="py-2.5 px-2.5 text-left w-28">Bloque / Horario</th>
                ${estado.configuracion.diasHabiles
                  .map((dia) => {
                    const puenteDia = metricasDoc.porDia[dia]?.cantidadHorasPuente || 0;
                    return `
                      <th class="py-2.5 px-2 text-center font-bold border-l border-slate-800">
                        <div>${dia}</div>
                        <div class="text-[10px] font-normal mt-0.5 ${
                          puenteDia > 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400'
                        }">
                          ${puenteDia > 0 ? `⚠️ ${puenteDia} hs libres` : 'Sin horas libres ✅'}
                        </div>
                      </th>
                    `;
                  })
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${estado.configuracion.bloquesHorarios
                .map((bloque) => {
                  const celdas = estado.configuracion.diasHabiles
                    .map((dia) => {
                      const celda = metricasDoc.porDia[dia].celdas[bloque.indice];
                      const esOrigenMov =
                        uiState.celdaOrigenVistaDocente &&
                        uiState.celdaOrigenVistaDocente.dia === dia &&
                        uiState.celdaOrigenVistaDocente.bloqueIndice === bloque.indice;

                      // 1. Si el docente ya tiene clase asignada en este bloque
                      if (celda.ocupado) {
                        if (celda.tieneChoque) {
                          return `
                            <td class="p-1 border-l border-b border-slate-800 align-top">
                              <div class="rounded-lg p-1.5 bg-rose-950/90 border-2 border-rose-500 text-white shadow-lg">
                                <div class="font-black text-[10px] text-rose-300 uppercase">🚨 CHOQUE SIMULTÁNEO</div>
                                ${celda.detallesSlot
                                  .map(
                                    (ds) => `
                                  <div class="mt-1 px-1.5 py-1 rounded bg-rose-600/60 text-[10px] font-bold flex items-center justify-between gap-1">
                                    <span class="truncate">⚡ ${ds.cursoNombre}: ${ds.materiaNombre}</span>
                                    <button data-liberar-docente-slot="true" data-curso="${ds.cursoId}" data-dia="${dia}" data-bloque="${bloque.indice}"
                                      title="Liberar bloque en ${ds.cursoNombre}"
                                      class="px-1 rounded bg-rose-900 hover:bg-rose-700 text-white text-[10px] shrink-0">
                                      ✕
                                    </button>
                                  </div>
                                `
                                  )
                                  .join('')}
                              </div>
                            </td>
                          `;
                        }

                        const matCelda = materiasACargo.find(
                          (m) => m.id === (celda.asignacion ? celda.asignacion.materiaId : null)
                        );
                        const esMateriaActiva =
                          materiaActiva &&
                          celda.asignacion &&
                          celda.asignacion.materiaId === materiaActiva.id;

                        const tieneConflictoRojo =
                          Boolean(celda.violacionDisponibilidad) || Boolean(matCelda && matCelda.excedida);

                        return `
                          <td data-celda-docente-ocupada="true"
                            draggable="true"
                            data-curso="${celda.cursoId}"
                            data-materia="${celda.asignacion ? celda.asignacion.materiaId : ''}"
                            data-dia="${dia}"
                            data-bloque="${bloque.indice}"
                            class="p-1 border-l border-b border-slate-800 align-top cursor-pointer transition hover:brightness-110 ${
                              esOrigenMov ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                            }">
                            <div class="rounded-lg p-2 h-full flex flex-col justify-between border shadow-sm ${
                              tieneConflictoRojo
                                ? 'bg-rose-950/75 border-2 border-rose-500'
                                : celda.cruzaRecreoInjustificado
                                  ? 'bg-amber-950/50 border-2 border-amber-500'
                                  : esMateriaActiva
                                    ? 'bg-blue-600/35 border-2 border-blue-400 ring-1 ring-blue-400'
                                    : 'bg-blue-600/20 border-slate-700/80 border-l-4 border-l-blue-500'
                            }">
                              <div>
                                <div class="flex items-start justify-between gap-1">
                                  <span class="px-1.5 py-0.2 rounded bg-blue-500/30 text-blue-200 font-black text-[10px]">
                                    🎓 ${celda.cursoNombre}
                                  </span>
                                  <div class="flex items-center gap-1">
                                    ${
                                      celda.posicionEnBloqueDia
                                        ? `<span class="px-1 py-0.2 rounded bg-slate-900/80 text-slate-200 font-mono text-[9px] font-bold">📦 ${celda.posicionEnBloqueDia}h</span>`
                                        : ''
                                    }
                                    <button data-liberar-docente-slot="true"
                                      data-curso="${celda.cursoId}"
                                      data-dia="${dia}"
                                      data-bloque="${bloque.indice}"
                                      title="Liberar este bloque de ${celda.cursoNombre}"
                                      class="text-[10px] text-slate-300 hover:text-rose-400 px-1 rounded">
                                      ✕
                                    </button>
                                  </div>
                                </div>
                                <div class="font-bold text-[11px] text-white mt-1 leading-tight break-words">
                                  ${celda.materiaNombre}
                                </div>
                                ${
                                  celda.violacionDisponibilidad
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-rose-700 text-white font-bold text-[9px]">
                                        🚫 DOCENTE NO DISPONIBLE
                                      </div>`
                                    : ''
                                }
                                ${
                                  matCelda && matCelda.excedida
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[9px]">
                                        🚨 Exceso (${matCelda.horasAsignadas}/${matCelda.horasSemanales} hs)
                                      </div>`
                                    : ''
                                }
                                ${
                                  celda.cruzaRecreoInjustificado
                                    ? `<div class="mt-1 px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/50 font-bold text-[9px]" title="${celda.advertenciaRecreoCelda || ''}">
                                        ☕ Cortado por recreo
                                      </div>`
                                    : ''
                                }
                              </div>
                              <div class="flex items-center justify-between mt-1.5 pt-1 border-t border-slate-800/60 text-[9px] text-slate-300">
                                <span class="font-mono">${celda.horario}</span>
                                <span class="text-blue-300">${esOrigenMov ? '🔄 Moviendo...' : 'Clic/Arrastrar'}</span>
                              </div>
                            </div>
                          </td>
                        `;
                      }

                      // 2. Casillero no ocupado (puede estar en modo Pintar o en modo Horario con o sin semáforo)
                      const infoCelda = construirInteriorCeldaLibreDocente(
                        dia,
                        bloque.indice,
                        celda,
                        materiaActiva,
                        cantBloquesAsignarDocente,
                        Boolean(uiState.celdaOrigenVistaDocente),
                        motorInicialDoc
                      );

                      return `
                        <td ${
                          enModoPintar
                            ? 'data-paint-cell="true"'
                            : 'data-celda-docente-slot-libre="true"'
                        }
                          data-dia="${dia}" data-bloque="${bloque.indice}"
                          data-disponible="${celda.disponible ? 'true' : 'false'}" data-ocupado="false"
                          title="${infoCelda.title}"
                          class="p-1.5 border-l border-b border-slate-800 align-middle ${
                            enModoPintar
                              ? 'cursor-crosshair hover:brightness-110'
                              : 'cursor-pointer hover:brightness-110'
                          }">
                          ${infoCelda.html}
                        </td>
                      `;
                    })
                    .join('');

                  const filaBloque = `
                    <tr>
                      <td class="py-2 px-2.5 border-b border-slate-800 bg-slate-950/60">
                        <div class="font-bold text-white text-[11px]">${bloque.nombre}</div>
                        <div class="font-mono text-[10px] text-slate-400">${bloque.inicio} - ${bloque.fin}</div>
                      </td>
                      ${celdas}
                    </tr>
                  `;

                  const filaRecreo = bloque.recreoPosterior
                    ? `
                      <tr class="bg-amber-950/25 border-b border-amber-500/25">
                        <td colspan="${estado.configuracion.diasHabiles.length + 1}" class="py-1 px-4 text-center text-[10px] font-bold text-amber-300/90">
                          ☕ ${bloque.recreoPosterior.etiqueta}
                        </td>
                      </tr>
                    `
                    : '';

                  return filaBloque + filaRecreo;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        <!-- Columna Derecha (3 cols): Listado de Materias a Cargo del Docente -->
        <div id="bandeja-materias-docente" class="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-3">
          <div>
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-white">📚 Materias a Cargo (${materiasACargo.length})</h3>
              <span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono text-[11px] font-bold">
                ${metricasDoc.totalHorasAsignadas}/${metricasDoc.totalHorasPlanDocente || 0} hs
              </span>
            </div>
            <p class="text-[11px] text-slate-400 mt-1">
              Haz clic o arrastra una materia hacia la grilla para ver el semáforo y asignarla.
            </p>
          </div>

          <!-- Opción de validación estricta vs permitir exceso -->
          <label class="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 cursor-pointer select-none">
            <input type="checkbox" id="chk-permitir-exceso-docente" class="rounded accent-rose-500"
              ${uiState.permitirExcesoVistaDocente ? 'checked' : ''} />
            <span>Permitir asignar en exceso de horas</span>
          </label>

          <div class="space-y-2.5 overflow-y-auto max-h-[640px] pr-1">
            ${
              materiasACargo.length === 0
                ? `<div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                    Este docente aún no tiene materias asignadas.
                  </div>`
                : materiasACargo
                    .map((m) => {
                      const seleccionada = materiaActivaId === m.id;
                      const pctMat =
                        m.horasSemanales > 0
                          ? Math.min(100, Math.round((m.horasAsignadas / m.horasSemanales) * 100))
                          : 0;

                      let badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                      let barColor = 'bg-amber-500';
                      if (m.excedida) {
                        badgeClass = 'bg-rose-600 text-white border-rose-400 shadow-sm animate-pulse';
                        barColor = 'bg-rose-500';
                      } else if (m.completada) {
                        badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                        barColor = 'bg-emerald-500';
                      }

                      let cardClass = 'bg-slate-950/85 border-slate-800 hover:border-slate-700';
                      if (seleccionada) {
                        cardClass = 'bg-emerald-950/50 border-emerald-500 ring-2 ring-emerald-500/80 shadow-lg';
                      } else if (m.excedida) {
                        cardClass = 'bg-rose-950/35 border-rose-500/80 hover:border-rose-400';
                      }

                      return `
                        <div data-docente-materia-card="${m.id}"
                          draggable="true"
                          class="p-3 rounded-xl border transition cursor-pointer ${cardClass}"
                          style="border-left: 4px solid ${m.excedida ? '#f43f5e' : m.color || '#3b82f6'};">
                          <div class="flex items-center justify-between gap-1.5 mb-1">
                            <span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-black text-[10px]">
                              🎓 ${m.cursoNombre}${m.cursoDivision ? ` (${m.cursoDivision})` : ''}
                            </span>
                            <button data-ir-curso-desde-docente="${m.cursoId}"
                              title="Abrir la grilla completa de ${m.cursoNombre}"
                              class="text-[10px] text-slate-400 hover:text-blue-300 underline px-1">
                              Ver curso ↗
                            </button>
                          </div>

                          <div class="flex items-start justify-between gap-2 mt-1">
                            <div class="font-bold text-xs text-white leading-snug">${m.nombre}</div>
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shrink-0 ${badgeClass}">
                              ${m.excedida ? '🚨 ' : ''}${m.horasAsignadas}/${m.horasSemanales} hs
                            </span>
                          </div>

                          <!-- Barra de progreso de horas de la materia -->
                          <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-2 border border-slate-800">
                            <div class="h-full ${barColor} transition-all duration-300" style="width: ${pctMat}%"></div>
                          </div>

                          <div class="flex items-center justify-between mt-1.5 text-[10px]">
                            ${
                              m.excedida
                                ? `<span class="text-rose-300 font-bold">⚠️ Exceso (+${m.horasExceso} hs)</span>`
                                : m.completada
                                  ? `<span class="text-emerald-400 font-semibold">✅ Carga completa</span>`
                                  : `<span class="text-amber-300 font-semibold">⏳ Faltan asignar ${m.horasPendientes} hs</span>`
                            }
                            <span class="text-slate-400 font-mono">Bloques: ${m.formatoBloques}</span>
                          </div>

                          ${
                            m.coDocentesNombres && m.coDocentesNombres.length > 0
                              ? `<div class="mt-1.5 px-2 py-1 rounded bg-cyan-950/50 border border-cyan-500/30 text-[10px] text-cyan-200 truncate" title="Pareja Pedagógica con: ${m.coDocentesNombres.join(', ')}">
                                  👥 Pareja: ${m.coDocentesNombres.join(', ')}
                                </div>`
                              : ''
                          }

                          <div class="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] font-semibold ${
                            seleccionada ? 'text-emerald-300' : 'text-slate-400'
                          }">
                            ${
                              seleccionada
                                ? '🎯 Seleccionada · Clic aquí para quitar selección'
                                : m.horasPendientes > 0
                                  ? '+ Clic o arrastrar para asignar'
                                  : '🔍 Clic o arrastrar para ver disponibilidad / enroques'
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
        </div>
      </div>
    `;

    function limpiarSeleccionDocente() {
      uiState.materiaSeleccionadaVistaDocenteId = null;
      uiState.celdaOrigenVistaDocente = null;
    }

    function renderizarPanelPropuestasDocente(motor) {
      const cont = document.getElementById('panel-propuestas-docente-container');
      if (!cont) return;
      try {
        cont.innerHTML = construirPanelPropuestasHtml(motor);
        conectarEventosPanelPropuestas(
          cont,
          motor,
          limpiarSeleccionDocente,
          () => renderizarPanelPropuestasDocente(motor),
          {
            onSeleccionarOrigenGrilla: (diaOrig, bloqueOrig) => {
              if (!motor) return;
              uiState.celdaOrigenVistaDocente = {
                cursoId: motor.cursoId,
                materiaId: motor.materiaId,
                dia: diaOrig,
                bloqueIndice: bloqueOrig
              };
              renderizarVistaDocente();
            },
            onSeleccionarOrigenBandeja: () => {
              if (motor && motor.materiaId) {
                uiState.materiaSeleccionadaVistaDocenteId = motor.materiaId;
              }
              uiState.celdaOrigenVistaDocente = null;
              renderizarVistaDocente();
            },
            onCambiarModoBloque: (nuevoModo) => {
              uiState.modoBloquesDocente = nuevoModo;
              renderizarVistaDocente();
            }
          }
        );
      } catch (err) {
        console.error('Error al renderizar propuestas del docente:', err);
      }
    }

    // Función que ilumina el Semáforo en tiempo real en la Vista por Docente al arrastrar sin clic previo
    function iluminarSemaforoDocenteEnVivo(matId, origenMov) {
      const matObj = materiasACargo.find((m) => m.id === matId) || null;
      if (!matObj) return;
      const motor = obtenerMotorDocenteActivo(matObj, origenMov);
      const cant = motor
        ? motor.tamanoBloque || 1
        : uiState.modoBloquesDocente === 'AUTO_BLOQUE' && !origenMov
          ? matObj.analisisFormato?.proximoTamanoSugerido || 1
          : 1;

      const bannerCont = document.getElementById('banner-accion-docente-container');
      if (bannerCont) {
        bannerCont.innerHTML = construirBannerAccionDocenteHtml(matObj, origenMov);
        document
          .getElementById('btn-cancelar-accion-docente')
          ?.addEventListener('click', () => {
            uiState.materiaSeleccionadaVistaDocenteId = null;
            uiState.celdaOrigenVistaDocente = null;
            renderizarVistaDocente();
          });
      }

      container.querySelectorAll('td[data-celda-docente-slot-libre="true"]').forEach((tdLibre) => {
        const d = tdLibre.getAttribute('data-dia');
        const b = parseInt(tdLibre.getAttribute('data-bloque'), 10);
        const celdaInfo = metricasDoc.porDia[d]?.celdas?.[b];
        if (!celdaInfo) return;
        const res = construirInteriorCeldaLibreDocente(
          d,
          b,
          celdaInfo,
          matObj,
          cant,
          Boolean(origenMov),
          motor
        );
        tdLibre.setAttribute('title', res.title);
        tdLibre.innerHTML = res.html;
      });

      renderizarPanelPropuestasDocente(motor);
    }

    if (materiaActiva && motorInicialDoc) {
      renderizarPanelPropuestasDocente(motorInicialDoc);
    }

    // Selector de Docente
    document.getElementById('select-docente-vista')?.addEventListener('change', (e) => {
      uiState.docenteSeleccionadoId = e.target.value;
      uiState.materiaSeleccionadaVistaDocenteId = null;
      uiState.celdaOrigenVistaDocente = null;
      renderizarVistaDocente();
    });

    // Botón cancelar selección o movimiento activo
    document.getElementById('btn-cancelar-accion-docente')?.addEventListener('click', () => {
      uiState.materiaSeleccionadaVistaDocenteId = null;
      uiState.celdaOrigenVistaDocente = null;
      renderizarVistaDocente();
    });

    // Cambio de modo explícito: Asignar/Mover vs Pintar Disponibilidad
    document.getElementById('btn-modo-docente-horario')?.addEventListener('click', () => {
      uiState.modoInteraccionVistaDocente = 'HORARIO';
      renderizarVistaDocente();
    });

    document.getElementById('btn-modo-docente-disponibilidad')?.addEventListener('click', () => {
      uiState.modoInteraccionVistaDocente = 'DISPONIBILIDAD';
      uiState.materiaSeleccionadaVistaDocenteId = null;
      uiState.celdaOrigenVistaDocente = null;
      renderizarVistaDocente();
      mostrarToast('🖌️ Modo Pintar Disponibilidad activo: arrastra con el mouse sobre los bloques libres.', 'info');
    });

    // Checkbox para permitir o bloquear exceso de horas
    document.getElementById('chk-permitir-exceso-docente')?.addEventListener('change', (e) => {
      uiState.permitirExcesoVistaDocente = Boolean(e.target.checked);
      renderizarVistaDocente();
    });

    // Botones Movimiento Deseado y Exportación desde Vista por Docente
    document.getElementById('btn-movimiento-deseado-docente')?.addEventListener('click', () => {
      abrirModalMovimientoDeseado({
        cursoId: materiaActiva?.cursoId || materiasACargo[0]?.cursoId || estado.cursos[0]?.id,
        modoObjetivo: 'DOCENTE',
        docenteId: metricasDoc.docenteId,
        materiaId: materiaActiva?.id || materiasACargo[0]?.id || null
      });
    });

    document.getElementById('btn-exportar-docente-excel')?.addEventListener('click', () => {
      ejecutarExportacionHorario('EXCEL', { alcance: 'DOCENTE', docenteId: metricasDoc.docenteId });
    });

    document.getElementById('btn-exportar-docente-pdf')?.addEventListener('click', () => {
      ejecutarExportacionHorario('PDF', { alcance: 'DOCENTE', docenteId: metricasDoc.docenteId });
    });

    // Botón ir a Disponibilidad y Datos del Docente
    document.getElementById('btn-abrir-abm-docente-vista')?.addEventListener('click', () => {
      if (window.SGHConfigABM) {
        window.SGHConfigABM.abrirSubTab('disponibilidad');
      }
      uiState.tabActual = 'configuracion';
      actualizarBotonesNav();
      renderizarTodo();
    });

    // Selector de modo de bloques en Vista Docente (1h vs Bloque 2h/3h)
    document.getElementById('btn-modo-bloque-docente-1h')?.addEventListener('click', () => {
      uiState.modoBloquesDocente = 'INDIVIDUAL';
      renderizarVistaDocente();
    });

    document.getElementById('btn-modo-bloque-docente-auto')?.addEventListener('click', () => {
      uiState.modoBloquesDocente = 'AUTO_BLOQUE';
      renderizarVistaDocente();
    });

    function obtenerPrimeraAsignacionMateriaDocente(matObj) {
      if (!matObj) return null;
      const asigsC = estado.asignaciones.filter(
        (a) => a.cursoId === matObj.cursoId && a.materiaId === matObj.id
      );
      for (const d of estado.configuracion.diasHabiles) {
        const indices = asigsC
          .filter((a) => a.dia === d)
          .map((a) => a.bloqueIndice)
          .sort((a, b) => a - b);
        if (indices.length > 0) {
          const corridas = agruparIndicesContiguos(indices);
          return {
            cursoId: matObj.cursoId,
            materiaId: matObj.id,
            dia: d,
            bloqueIndice: corridas[0][0],
            tamanoCorrida: corridas[0].length
          };
        }
      }
      return null;
    }

    // Selección y Drag & Drop de materia en el listado lateral del docente
    container.querySelectorAll('[data-docente-materia-card]').forEach((card) => {
      const matId = card.getAttribute('data-docente-materia-card');
      card.setAttribute('draggable', 'true');
      card.addEventListener('click', () => {
        uiState.modoInteraccionVistaDocente = 'HORARIO';
        const yaSeleccionada =
          uiState.materiaSeleccionadaVistaDocenteId === matId ||
          Boolean(
            uiState.celdaOrigenVistaDocente &&
              uiState.celdaOrigenVistaDocente.materiaId === matId
          );
        if (yaSeleccionada) {
          uiState.materiaSeleccionadaVistaDocenteId = null;
          uiState.celdaOrigenVistaDocente = null;
          renderizarVistaDocente();
          return;
        }

        uiState.materiaSeleccionadaVistaDocenteId = matId;
        const matObj = materiasACargo.find((m) => m.id === matId);
        if (matObj && matObj.horasPendientes === 0 && matObj.horasAsignadas > 0) {
          const primera = obtenerPrimeraAsignacionMateriaDocente(matObj);
          if (primera) {
            uiState.celdaOrigenVistaDocente = {
              cursoId: primera.cursoId,
              materiaId: primera.materiaId,
              dia: primera.dia,
              bloqueIndice: primera.bloqueIndice
            };
            if (primera.tamanoCorrida > 1) {
              uiState.modoBloquesDocente = 'AUTO_BLOQUE';
            }
          } else {
            uiState.celdaOrigenVistaDocente = null;
          }
        } else {
          uiState.celdaOrigenVistaDocente = null;
        }
        renderizarVistaDocente();
      });

      card.addEventListener('dragstart', (e) => {
        uiState.modoInteraccionVistaDocente = 'HORARIO';
        uiState.celdaOrigenVistaDocente = null;
        uiState.materiaSeleccionadaVistaDocenteId = matId;
        e.dataTransfer?.setData(
          'text/plain',
          JSON.stringify({ tipo: 'BANDEJA_DOCENTE', materiaId: matId })
        );
        setTimeout(() => {
          iluminarSemaforoDocenteEnVivo(matId, null);
        }, 0);
      });
    });

    // Ir a la grilla del curso desde una tarjeta de materia del docente
    container.querySelectorAll('[data-ir-curso-desde-docente]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        uiState.cursoSeleccionadoId = btn.getAttribute('data-ir-curso-desde-docente');
        uiState.tabActual = 'curso';
        actualizarBotonesNav();
        renderizarTodo();
      });
    });

    // Liberar bloque directamente desde la grilla del docente (botón ✕)
    container.querySelectorAll('[data-liberar-docente-slot]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cursoId = btn.getAttribute('data-curso');
        const dia = btn.getAttribute('data-dia');
        const bloqueIndice = parseInt(btn.getAttribute('data-bloque'), 10);
        const auditoriaPrevia = uiState.resumen.auditoria;
        uiState.celdaOrigenVistaDocente = null;
        uiState.resumen = window.sghAPI.liberarBloqueCurso({
          cursoId,
          dia,
          bloqueIndice
        });
        renderizarTodo();
        evaluarYNotificarImpactoOperacion(
          auditoriaPrevia,
          uiState.resumen.auditoria,
          `Bloque liberado (${dia} Bloque ${bloqueIndice + 1})`
        );
      });
    });

    // Clic y Drag en celda ocupada del docente (para iniciar movimiento/reubicación a otro bloque)
    container.querySelectorAll('[data-celda-docente-ocupada]').forEach((td) => {
      const cursoId = td.getAttribute('data-curso');
      const materiaId = td.getAttribute('data-materia');
      const dia = td.getAttribute('data-dia');
      const bloqueIndice = parseInt(td.getAttribute('data-bloque'), 10);

      td.addEventListener('dragstart', (e) => {
        if (!cursoId || !materiaId) return;
        const origenObj = { cursoId, materiaId, dia, bloqueIndice };
        uiState.modoInteraccionVistaDocente = 'HORARIO';
        uiState.materiaSeleccionadaVistaDocenteId = null;
        uiState.celdaOrigenVistaDocente = origenObj;
        e.dataTransfer?.setData(
          'text/plain',
          JSON.stringify({ tipo: 'CELDA_DOCENTE', cursoId, materiaId, dia, bloqueIndice })
        );
        setTimeout(() => {
          iluminarSemaforoDocenteEnVivo(materiaId, origenObj);
        }, 0);
      });

      td.addEventListener('click', () => {
        if (!cursoId || !materiaId) return;

        // Si ya estaba seleccionada esta misma celda, cancelar movimiento
        if (
          uiState.celdaOrigenVistaDocente &&
          uiState.celdaOrigenVistaDocente.dia === dia &&
          uiState.celdaOrigenVistaDocente.bloqueIndice === bloqueIndice
        ) {
          uiState.celdaOrigenVistaDocente = null;
          renderizarVistaDocente();
          return;
        }

        uiState.modoInteraccionVistaDocente = 'HORARIO';
        uiState.materiaSeleccionadaVistaDocenteId = null;
        uiState.celdaOrigenVistaDocente = { cursoId, materiaId, dia, bloqueIndice };
        renderizarVistaDocente();
        mostrarToast(
          `Clase seleccionada (${dia} B${bloqueIndice + 1}). Revisa las propuestas de enroque o haz clic en un bloque destino.`,
          'info'
        );
      });
    });

    // Función auxiliar para asignar o reubicar desde la Vista por Docente (con Modal de Pre-Confirmación Fase 4)
    function ejecutarAccionEnCeldaDocente(dia, bloqueIndice, matObjetivo, origenReubicacion) {
      if (!matObjetivo) return;
      const esReubicacion = Boolean(origenReubicacion);
      const motorActual = obtenerMotorDocenteActivo(matObjetivo, origenReubicacion);
      const cant = motorActual
        ? motorActual.tamanoBloque || 1
        : !esReubicacion && uiState.modoBloquesDocente === 'AUTO_BLOQUE'
          ? matObjetivo.analisisFormato?.proximoTamanoSugerido || 1
          : 1;

      const validacion = window.sghAPI.validarAsignacionDesdeVistaDocente({
        docenteId: metricasDoc.docenteId,
        materiaId: matObjetivo.id,
        dia,
        bloqueIndice,
        cantidadBloques: cant,
        permitirExcesoHoras: uiState.permitirExcesoVistaDocente,
        esReubicacion
      });

      if (!validacion || !validacion.valido) {
        // Si el curso está ocupado en ese horario pero existe un Enroque 1 a 1 o Triangular válido, ofrecerlo en el modal
        if (validacion && validacion.codigoError === 'CURSO_OCUPADO') {
          const propEnroque = motorActual?.mapaCeldasDestino?.[`${dia}|${bloqueIndice}`] || null;
          if (propEnroque && propEnroque.impacto) {
            abrirModalConfirmacionMovimiento(propEnroque.impacto, {
              onAplicado: limpiarSeleccionDocente
            });
            return;
          }
        }
        mostrarToast(
          validacion ? validacion.motivo : 'No es posible asignar la materia en este bloque.',
          'error'
        );
        return;
      }

      const prev = window.sghAPI.previsualizarInteraccionMovimiento(
        esReubicacion
          ? {
              cursoId: origenReubicacion.cursoId,
              materiaId: matObjetivo.id,
              origenDia: origenReubicacion.dia,
              origenBloquesIndices: motorActual?.origenBloquesIndices || [origenReubicacion.bloqueIndice],
              origenBloqueIndice: origenReubicacion.bloqueIndice,
              destinoDia: dia,
              destinoBloqueIndice: bloqueIndice
            }
          : {
              cursoId: matObjetivo.cursoId,
              materiaId: matObjetivo.id,
              destinoDia: dia,
              destinoBloquesIndices: validacion.indicesObjetivo,
              destinoBloqueIndice: bloqueIndice,
              cantidadBloques: cant
            }
      );

      if (!prev || prev.error) {
        mostrarToast(
          prev ? `⚠️ ${prev.error}` : 'No es posible realizar esta operación.',
          'warning'
        );
        return;
      }

      abrirModalConfirmacionMovimiento(prev.impactoPrincipal, {
        alternativaTriangular: prev.alternativaTriangular,
        mensajeExito: esReubicacion
          ? `Clase de "${matObjetivo.nombre}" (${matObjetivo.cursoNombre}) movida a ${dia} Bloque ${bloqueIndice + 1}`
          : cant > 1
            ? `Paquete de ${cant} hs de "${matObjetivo.nombre}" asignado en ${matObjetivo.cursoNombre} (${dia})`
            : `"${matObjetivo.nombre}" asignada en ${matObjetivo.cursoNombre} (${dia} Bloque ${bloqueIndice + 1})`,
        onAplicado: limpiarSeleccionDocente
      });
    }

    // Clic y Drop en celda libre del docente (asignar desde bandeja o reubicar clase)
    container.querySelectorAll('td[data-celda-docente-slot-libre="true"]').forEach((td) => {
      const dia = td.getAttribute('data-dia');
      const bloqueIndice = parseInt(td.getAttribute('data-bloque'), 10);

      td.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      td.addEventListener('drop', (e) => {
        e.preventDefault();
        try {
          const raw = e.dataTransfer?.getData('text/plain');
          if (!raw) return;
          const payload = JSON.parse(raw);
          if (payload.tipo === 'BANDEJA_DOCENTE' && payload.materiaId) {
            const matDrop = materiasACargo.find((m) => m.id === payload.materiaId);
            ejecutarAccionEnCeldaDocente(dia, bloqueIndice, matDrop, null);
          } else if (payload.tipo === 'CELDA_DOCENTE' && payload.materiaId) {
            const matDrop = materiasACargo.find((m) => m.id === payload.materiaId);
            ejecutarAccionEnCeldaDocente(dia, bloqueIndice, matDrop, payload);
          }
        } catch (_err) {
          // Ignorar arrastres externos
        }
      });

      td.addEventListener('click', () => {
        const matIdActiva =
          uiState.materiaSeleccionadaVistaDocenteId ||
          (uiState.celdaOrigenVistaDocente ? uiState.celdaOrigenVistaDocente.materiaId : null);
        const matActivaClick = matIdActiva
          ? materiasACargo.find((m) => m.id === matIdActiva) || null
          : null;

        if (matActivaClick) {
          ejecutarAccionEnCeldaDocente(
            dia,
            bloqueIndice,
            matActivaClick,
            uiState.celdaOrigenVistaDocente
          );
          return;
        }

        mostrarToast(
          '💡 Selecciona o arrastra primero una materia en el panel derecho «📚 Materias a Cargo» para asignarla en este bloque (o activa «🖌️ Pintar Disponibilidad»).',
          'info'
        );
        const bandeja = document.getElementById('bandeja-materias-docente');
        if (bandeja) {
          bandeja.classList.add('ring-2', 'ring-blue-500');
          setTimeout(() => bandeja.classList.remove('ring-2', 'ring-blue-500'), 1400);
        }
      });
    });

    // Si está activo el Modo Pintar Disponibilidad con el Mouse, conectar eventos de arrastre
    const grillaVistaDoc = document.getElementById('grilla-vista-docente');
    if (enModoPintar && grillaVistaDoc && window.SGHConfigABM) {
      window.SGHConfigABM.conectarEventosPintarConMouse(
        grillaVistaDoc,
        metricasDoc.docenteId,
        () => 'AUTO',
        (docId, cambios) => {
          const auditoriaPrevia = uiState.resumen.auditoria;
          uiState.resumen = window.sghAPI.aplicarTrazoDisponibilidadDocente({
            docenteId: docId,
            cambios
          });
          renderizarTodo();
          evaluarYNotificarImpactoOperacion(
            auditoriaPrevia,
            uiState.resumen.auditoria,
            `🖌️ Disponibilidad actualizada (${cambios.length} bloque${cambios.length === 1 ? '' : 's'}) para ${metricasDoc.nombre}`
          );
        }
      );
    }
  }

  // =========================================================================
  // VISTA DIAGNÓSTICO: CENTRO DE CHOQUES, INDISPONIBILIDADES Y HORAS LIBRES
  // =========================================================================
  function renderizarVistaAlertas() {
    const container = document.getElementById('tab-alertas');
    const { auditoria } = uiState.resumen;

    const choques = auditoria.choquesDocentes || [];
    const violaciones = auditoria.violacionesDisponibilidad || [];
    const docentesPuente = auditoria.docentesConHorasPuente || [];
    const recreos = auditoria.advertenciasRecreos || [];
    const excesos = auditoria.materiasExcedidas || [];

    container.innerHTML = `
      <!-- Cabecera de Resumen del Centro de Diagnóstico -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div class="${choques.length > 0 ? 'bg-rose-950/30 border-rose-500' : 'bg-slate-900 border-slate-800'} border rounded-2xl p-4">
          <div class="text-xs text-slate-400 font-semibold">🚨 Choques de Docentes (Simultáneos)</div>
          <div class="text-2xl font-black ${choques.length > 0 ? 'text-rose-400' : 'text-emerald-400'} mt-1">
            ${choques.length} ${choques.length === 1 ? 'Choque' : 'Choques'}
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Docentes asignados a 2 o más cursos en el mismo día y bloque.</p>
        </div>

        <div class="${violaciones.length > 0 ? 'bg-rose-950/30 border-rose-500' : 'bg-slate-900 border-slate-800'} border rounded-2xl p-4">
          <div class="text-xs text-slate-400 font-semibold">🚫 Clases en Horario No Disponible</div>
          <div class="text-2xl font-black ${violaciones.length > 0 ? 'text-rose-400' : 'text-emerald-400'} mt-1">
            ${violaciones.length} ${violaciones.length === 1 ? 'Alerta' : 'Alertas'}
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Materias ubicadas donde un docente figura como No Disponible.</p>
        </div>

        <div class="bg-slate-900 border border-amber-500/40 rounded-2xl p-4">
          <div class="text-xs text-amber-200 font-semibold">⚠️ Total Horas Libres en la Escuela</div>
          <div class="text-2xl font-black text-amber-400 mt-1">
            ${auditoria.totalHorasPuenteEscuela} hs libres
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Afectando actualmente a <strong>${docentesPuente.length} docente(s)</strong>.</p>
        </div>

        <div class="bg-slate-900 border ${excesos.length + recreos.length > 0 ? 'border-amber-500/60' : 'border-slate-800'} rounded-2xl p-4">
          <div class="text-xs text-slate-400 font-semibold">☕ Cortes por Recreo y 🚨 Excesos</div>
          <div class="text-2xl font-black text-white mt-1">
            ${excesos.length} Excesos · ${recreos.length} Cortes
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Materias sobre su carga semanal o divididas por un recreo.</p>
        </div>
      </div>

      <!-- SECCIÓN 1: CHOQUES DOCENTES Y VIOLACIONES DE DISPONIBILIDAD -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Choques Simultáneos -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-bold text-white">🚨 Detalle de Choques de Docentes (${choques.length})</h3>
              <p class="text-xs text-slate-400">Superposición horaria: un mismo profesor asignado en dos cursos al mismo tiempo.</p>
            </div>
          </div>

          ${
            choques.length === 0
              ? `<div class="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-5 text-center text-xs text-emerald-300 font-semibold">
                  ✅ ¡Excelente! No existe ningún choque de docentes en todo el horario escolar.
                </div>`
              : `<div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  ${choques
                    .map(
                      (ch) => `
                    <div class="bg-rose-950/60 border-2 border-rose-500/80 rounded-xl p-3.5 space-y-2">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-black text-xs text-white">👤 ${ch.docenteNombre}</span>
                        <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-mono font-bold text-[11px]">
                          ${ch.dia} · ${ch.bloqueNombre} (${ch.horario})
                        </span>
                      </div>
                      <p class="text-xs text-rose-100">${ch.explicacion}</p>
                      <div class="flex flex-wrap items-center gap-2 pt-1">
                        <button data-alerta-ir-docente="${ch.docenteId}"
                          class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-blue-600 text-white text-[11px] font-semibold transition">
                          👩‍🏫 Ver Grilla de ${ch.docenteNombre}
                        </button>
                        ${(ch.itemsConflicto || [])
                          .map(
                            (it) => `
                          <button data-alerta-ir-curso="${it.cursoId}"
                            class="px-2.5 py-1 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-[11px] font-semibold transition">
                            🏫 Ir a ${it.cursoNombre} (${it.materiaNombre})
                          </button>
                        `
                          )
                          .join('')}
                      </div>
                    </div>
                  `
                    )
                    .join('')}
                </div>`
          }
        </div>

        <!-- Violaciones de Disponibilidad y Excesos / Recreos -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div>
            <h3 class="text-sm font-bold text-white">
              🚫 Indisponibilidad Docente (${violaciones.length}), Excesos (${excesos.length}) y Recreos (${recreos.length})
            </h3>
            <p class="text-xs text-slate-400">Clases asignadas fuera del horario disponible del profesor o con alertas de bloque.</p>
          </div>

          ${
            violaciones.length === 0 && excesos.length === 0 && recreos.length === 0
              ? `<div class="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-5 text-center text-xs text-emerald-300 font-semibold">
                  ✅ Todas las asignaciones respetan la disponibilidad docente, topes horarios y continuidad de recreos.
                </div>`
              : `<div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  ${violaciones
                    .map(
                      (v) => `
                    <div class="bg-rose-950/50 border border-rose-500/70 rounded-xl p-3 space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded bg-rose-700 text-white font-black text-[10px]">🚫 DOCENTE NO DISPONIBLE</span>
                        <span class="font-mono text-[11px] text-rose-200">${v.dia} · ${v.bloqueNombre} (${v.horario})</span>
                      </div>
                      <p class="text-xs text-rose-100">${v.explicacion}</p>
                      <div class="flex flex-wrap items-center gap-2">
                        <button data-alerta-habilitar-disp="true" data-doc="${v.docenteId}" data-dia="${v.dia}" data-bloque="${v.bloqueIndice}"
                          class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition">
                          🟢 Habilitar Disponibilidad en ese Bloque
                        </button>
                        <button data-alerta-ir-curso="${v.cursoId}"
                          class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-white text-[11px] font-semibold transition">
                          🏫 Ir a ${v.cursoNombre}
                        </button>
                      </div>
                    </div>
                  `
                    )
                    .join('')}

                  ${excesos
                    .map(
                      (m) => `
                    <div class="bg-rose-950/40 border border-rose-500/50 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div class="text-xs">
                        <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] mr-1.5">🚨 EXCESO HORARIO</span>
                        <strong class="text-white">${m.cursoNombre} — ${m.nombre}:</strong>
                        <span class="text-rose-200 ml-1">${m.horasAsignadas}/${m.horasSemanales} hs asignadas (+${m.horasExceso} hs en exceso)</span>
                      </div>
                      <button data-alerta-ir-curso="${m.cursoId}"
                        class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-white text-[11px] font-semibold shrink-0">
                        🏫 Ir a ${m.cursoNombre}
                      </button>
                    </div>
                  `
                    )
                    .join('')}

                  ${recreos
                    .map(
                      (r) => `
                    <div class="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div class="text-xs">
                        <span class="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] mr-1.5">☕ CORTE POR RECREO</span>
                        <strong class="text-white">${r.cursoNombre} — ${r.materiaNombre} (${r.dia}):</strong>
                        <span class="text-amber-200 ml-1">${r.detalle}</span>
                      </div>
                      <button data-alerta-ir-curso="${r.cursoId}"
                        class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-white text-[11px] font-semibold shrink-0">
                        🏫 Ir a ${r.cursoNombre}
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>`
          }
        </div>
      </div>

      <!-- SECCIÓN 2: DESGLOSE COMPLETO DE DOCENTES CON HORAS LIBRES -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-bold text-white">
              ⚠️ Desglose Completo de Docentes con Horas Libres (${docentesPuente.length} de ${auditoria.metricasDocentes.length} docentes tienen huecos)
            </h3>
            <p class="text-xs text-slate-400">
              Detalle día por día de qué bloques libres quedan encerrados entre la primera y la última hora de clase de cada profesor.
            </p>
          </div>
        </div>

        ${
          docentesPuente.length === 0
            ? `<div class="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-6 text-center text-xs text-emerald-300 font-semibold">
                ✅ Ningún docente tiene horas libres entre clases en toda la escuela.
              </div>`
            : `<div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                ${docentesPuente
                  .map(
                    (md) => `
                  <div class="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <div>
                          <div class="font-black text-sm text-white">${md.nombre}</div>
                          <div class="text-[11px] text-slate-400">${md.especialidad} · ${md.totalHorasAsignadas} hs dictadas</div>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-black text-xs">
                            ⚠️ ${md.totalHorasPuente} hs libres
                          </span>
                          <button data-alerta-ir-docente="${md.docenteId}"
                            class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition">
                            Ver Grilla →
                          </button>
                        </div>
                      </div>

                      <div class="space-y-2 mt-2.5">
                        ${(md.detalleHorasPuentePorDia || [])
                          .map(
                            (dp) => `
                          <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs">
                            <div class="flex items-center justify-between font-bold text-amber-300">
                              <span>📅 ${dp.dia}</span>
                              <span class="font-mono">${dp.cantidadHorasPuente} hora(s) libre(s)</span>
                            </div>
                            <p class="text-[11px] text-slate-300 mt-1 leading-relaxed">${dp.explicacion}</p>
                          </div>
                        `
                          )
                          .join('')}
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>`
        }
      </div>
    `;

    // Eventos de navegación desde la vista de Alertas
    container.querySelectorAll('[data-alerta-ir-docente]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.docenteSeleccionadoId = btn.getAttribute('data-alerta-ir-docente');
        uiState.tabActual = 'docente';
        actualizarBotonesNav();
        renderizarTodo();
      });
    });

    container.querySelectorAll('[data-alerta-ir-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.cursoSeleccionadoId = btn.getAttribute('data-alerta-ir-curso');
        uiState.tabActual = 'curso';
        actualizarBotonesNav();
        renderizarTodo();
      });
    });

    container.querySelectorAll('[data-alerta-habilitar-disp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const docenteId = btn.getAttribute('data-doc');
        const dia = btn.getAttribute('data-dia');
        const bloqueIndice = parseInt(btn.getAttribute('data-bloque'), 10);
        uiState.resumen = window.sghAPI.aplicarTrazoDisponibilidadDocente({
          docenteId,
          cambios: [{ dia, bloqueIndice, disponible: true }]
        });
        renderizarTodo();
        mostrarToast(`✅ Disponibilidad habilitada en ${dia} (Bloque ${bloqueIndice + 1}).`, 'success');
      });
    });
  }

  // =========================================================================
  // VISTA 4: CONFIGURACIÓN DEL SISTEMA (PARÁMETROS, BACKUPS, AUDITORÍA Y ACERCA DE)
  // =========================================================================
  function renderizarVistaPersistencia() {
    const container = document.getElementById('tab-persistencia');
    const { estado, historial } = uiState.resumen;
    const params = estado?.configuracion?.parametrosSistema || {
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
    const info = uiState.infoStorage || {
      dataDir: './data',
      backupsDir: './data/backups',
      backups: [],
      simulaciones: []
    };

    const subTab = uiState.subTabConfigSistema || 'parametros';

    const navSubTabsHtml = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1.5">
          ${[
            { id: 'parametros', label: '🎛️ Parámetros del Sistema' },
            { id: 'exportar', label: '📤 Exportar Horarios (Excel / PDF)' },
            { id: 'backups', label: '💾 Copias de Seguridad' },
            { id: 'auditoria', label: '📜 Registro de Auditoría' },
            { id: 'acerca', label: 'ℹ️ Acerca de' }
          ]
            .map((t) => {
              const activo = subTab === t.id;
              return `
                <button data-subtab-config="${t.id}"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    activo
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                      : 'text-slate-300 hover:bg-slate-800'
                  }">
                  ${t.label}
                </button>
              `;
            })
            .join('')}
        </div>
        <span class="text-[11px] text-slate-400 px-2">
          Personalización de alertas, apariencia visual, copias de resguardo e información del sistema
        </span>
      </div>
    `;

    let contenidoSubTabHtml = '';

    if (subTab === 'parametros') {
      const listaFlags = [
        {
          key: 'alertarChoquesDocentes',
          titulo: '🚨 Advertir choques y superposición de docentes',
          desc: 'Muestra alertas rojas cuando un mismo profesor queda asignado en dos cursos al mismo tiempo.'
        },
        {
          key: 'alertarDisponibilidadDocente',
          titulo: '🚫 Advertir asignaciones en horario no disponible',
          desc: 'Avisa cuando se ubica una materia en un bloque donde el docente declaró que no puede asistir.'
        },
        {
          key: 'alertarCortePorRecreo',
          titulo: '☕ Advertir corte de bloque por recreo',
          desc: 'Advierte únicamente cuando un bloque continuo de una materia queda partido por un recreo pudiendo entrar sin cortes.'
        },
        {
          key: 'alertarHorasLibresDocentes',
          titulo: '⚠️ Contabilizar y advertir horas libres de docentes',
          desc: 'Calcula e informa los huecos libres que quedan entre la primera y la última hora de clase de cada profesor.'
        },
        {
          key: 'alertarExcesoHoras',
          titulo: '📈 Advertir exceso de horas semanales en una materia',
          desc: 'Resalta en rojo las materias que superan la cantidad de horas semanales de su plan de estudios (ej. 8/6 hs).'
        },
        {
          key: 'alertarFormatoBloques',
          titulo: '📦 Mostrar avisos de formato de bloques (2+2, 2+1, etc.)',
          desc: 'Muestra sugerencias y advertencias en la bandeja cuando una materia no respeta el agrupamiento de horas configurado.'
        },
        {
          key: 'validarCupoHorasEnVistaDocente',
          titulo: '🔒 Validar tope de horas al asignar desde la Vista por Docente',
          desc: 'Evita exceder por accidente la carga horaria semanal de una materia cuando se asigna desde la grilla del docente.'
        },
        {
          key: 'confirmarMovimientosConModal',
          titulo: '🔍 Mostrar resumen de impacto antes de aplicar un movimiento',
          desc: 'Abre la ventana de confirmación con las materias, docentes afectados y variación de horas libres antes de ejecutar un movimiento o enroque.'
        },
        {
          key: 'mostrarNotificacionesToast',
          titulo: '🔔 Mostrar notificaciones emergentes al realizar movimientos',
          desc: 'Muestra un aviso breve en la esquina inferior derecha confirmando el impacto de cada cambio en la grilla.'
        },
        {
          key: 'habilitarBloquesAlmuerzo',
          titulo: '🍽️ Habilitar bloques de "Almuerzo" en la grilla horaria',
          desc: 'Permite marcar casilleros como horario de Almuerzo con otro color haciendo clic derecho sobre el bloque o desde el botón Almuerzo.'
        }
      ];

      contenidoSubTabHtml = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- Columna Izquierda (4 cols): Apariencia Visual (Modo Claro / Oscuro) -->
          <div class="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <h2 class="text-sm font-bold text-white">🎨 Apariencia Visual de la Aplicación</h2>
              <p class="text-xs text-slate-400 mt-0.5">
                Elige el tema de colores más cómodo para trabajar en tu pantalla.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <button data-select-tema="OSCURO"
                class="p-4 rounded-xl border-2 text-left transition flex flex-col gap-1.5 ${
                  params.temaVisual !== 'CLARO'
                    ? 'border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/40'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                }">
                <span class="text-lg">🌙</span>
                <span class="text-xs font-bold text-white">Modo Oscuro</span>
                <span class="text-[11px] text-slate-400">Descansa la vista en jornadas largas.</span>
              </button>

              <button data-select-tema="CLARO"
                class="p-4 rounded-xl border-2 text-left transition flex flex-col gap-1.5 ${
                  params.temaVisual === 'CLARO'
                    ? 'border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/40'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                }">
                <span class="text-lg">☀️</span>
                <span class="text-xs font-bold text-white">Modo Claro</span>
                <span class="text-[11px] text-slate-400">Ideal para ambientes muy iluminados.</span>
              </button>
            </div>

            <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span class="text-[11px] text-slate-400">¿Volver a la configuración original?</span>
              <button id="btn-reset-parametros-default"
                class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">
                Restablecer recomendados
              </button>
            </div>
          </div>

          <!-- Columna Derecha (8 cols): Activación de Advertencias y Reglas -->
          <div class="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-sm font-bold text-white">🎛️ Activación de Advertencias y Controles del Horario</h2>
                <p class="text-xs text-slate-400 mt-0.5">
                  Activa o desactiva cada validación según las necesidades de tu colegio. Los cambios se aplican en el acto.
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              ${listaFlags
                .map((f) => {
                  const activo = params[f.key] !== false;
                  return `
                    <label class="p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 select-none ${
                      activo
                        ? 'bg-slate-950 border-blue-500/40 hover:border-blue-400'
                        : 'bg-slate-950/50 border-slate-800 opacity-75 hover:opacity-100'
                    }">
                      <div class="space-y-1">
                        <div class="text-xs font-bold text-white">${f.titulo}</div>
                        <p class="text-[11px] text-slate-400 leading-relaxed">${f.desc}</p>
                      </div>
                      <input type="checkbox" data-flag-param="${f.key}"
                        class="mt-1 w-4 h-4 rounded accent-blue-600 shrink-0"
                        ${activo ? 'checked' : ''} />
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>
      `;
    } else if (subTab === 'exportar') {
      contenidoSubTabHtml = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <!-- Columna Izquierda (6 cols): Exportación Individual por Curso o por Docente -->
          <div class="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <h2 class="text-sm font-bold text-white">🎯 Exportación Individual (Por Curso o Por Docente)</h2>
              <p class="text-xs text-slate-400 mt-0.5">
                Genera la planilla horaria individual lista para imprimir en hoja A4 Horizontal o editar en Excel.
              </p>
            </div>

            <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div class="text-xs font-bold text-white">🏫 Horario de un Curso Individual</div>
              <div class="flex flex-wrap items-center gap-2">
                <select id="sel-export-curso" class="flex-1 min-w-[180px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white">
                  ${estado.cursos
                    .map((c) => {
                      const etiqDivision = c.division ? ` (${c.division})` : '';
                      const etiqTurno = c.turno ? ` — Turno ${c.turno}` : '';
                      return `<option value="${c.id}" ${c.id === uiState.cursoSeleccionadoId ? 'selected' : ''}>${c.nombre}${etiqDivision}${etiqTurno}</option>`;
                    })
                    .join('')}
                </select>
                <button id="btn-cfg-export-curso-excel"
                  class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow">
                  📗 Exportar Excel (.xlsx)
                </button>
                <button id="btn-cfg-export-curso-pdf"
                  class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow">
                  📕 Exportar PDF A4 (.pdf)
                </button>
              </div>
            </div>

            <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div class="text-xs font-bold text-white">👩‍🏫 Agenda Semanal de un Docente Individual</div>
              <div class="flex flex-wrap items-center gap-2">
                <select id="sel-export-docente" class="flex-1 min-w-[180px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white">
                  ${estado.docentes
                    .map(
                      (d) =>
                        `<option value="${d.id}" ${d.id === uiState.docenteSeleccionadoId ? 'selected' : ''}>${d.nombre} — ${d.especialidad}</option>`
                    )
                    .join('')}
                </select>
                <button id="btn-cfg-export-docente-excel"
                  class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow">
                  📗 Exportar Excel (.xlsx)
                </button>
                <button id="btn-cfg-export-docente-pdf"
                  class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow">
                  📕 Exportar PDF A4 (.pdf)
                </button>
              </div>
            </div>
          </div>

          <!-- Columna Derecha (6 cols): Exportación Masiva Institucional -->
          <div class="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <h2 class="text-sm font-bold text-white">📦 Exportación Masiva Institucional</h2>
              <p class="text-xs text-slate-400 mt-0.5">
                Descarga en un solo archivo todos los cursos, todo el plantel docente o el informe completo del colegio.
              </p>
            </div>

            <div class="space-y-3">
              <div class="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="text-xs font-bold text-white">🏫 Todos los Cursos (${estado.cursos.length} cursos)</div>
                  <div class="text-[11px] text-slate-400">Una pestaña de Excel o página A4 Horizontal por cada curso.</div>
                </div>
                <div class="flex items-center gap-2">
                  <button data-export-masivo="MASIVO_CURSOS" data-formato="EXCEL"
                    class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">
                    📗 Excel (.xlsx)
                  </button>
                  <button data-export-masivo="MASIVO_CURSOS" data-formato="PDF"
                    class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition">
                    📕 PDF (.pdf)
                  </button>
                </div>
              </div>

              <div class="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="text-xs font-bold text-white">👩‍🏫 Todos los Docentes (${estado.docentes.length} profesores)</div>
                  <div class="text-[11px] text-slate-400">Incluye horas asignadas, disponibilidad y detalle de horas libres.</div>
                </div>
                <div class="flex items-center gap-2">
                  <button data-export-masivo="MASIVO_DOCENTES" data-formato="EXCEL"
                    class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">
                    📗 Excel (.xlsx)
                  </button>
                  <button data-export-masivo="MASIVO_DOCENTES" data-formato="PDF"
                    class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition">
                    📕 PDF (.pdf)
                  </button>
                </div>
              </div>

              <div class="bg-indigo-950/35 border-2 border-indigo-500/50 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="text-xs font-black text-indigo-200 uppercase">🏛️ Reporte Institucional Completo</div>
                  <div class="text-[11px] text-slate-300">Resumen General + Todos los Cursos + Todos los Docentes en un único documento.</div>
                </div>
                <div class="flex items-center gap-2">
                  <button data-export-masivo="MASIVO_COMPLETO" data-formato="EXCEL"
                    class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition shadow">
                    📗 Excel Completo
                  </button>
                  <button data-export-masivo="MASIVO_COMPLETO" data-formato="PDF"
                    class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition shadow">
                    📕 PDF Completo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (subTab === 'backups') {
      const listaBackups = info.backups || [];
      const totalBytes = listaBackups.reduce((acc, b) => acc + (b.tamanoBytes || 0), 0);
      const totalKB = Math.max(1, Math.round(totalBytes / 1024));

      contenidoSubTabHtml = `
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-white">💾 Copias de Seguridad del Horario</h2>
              <p class="text-xs text-slate-400">
                Crea puntos de resguardo manuales, restaura una versión anterior o elimina copias antiguas para liberar espacio en disco.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button id="btn-crear-backup" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition">
                + Crear Copia de Seguridad Ahora
              </button>
              <button id="btn-regenerar-seed" class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-amber-600 text-slate-200 hover:text-white border border-slate-700 transition">
                🔄 Restablecer Datos de Ejemplo
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div class="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1.5 font-mono">
              <div><span class="text-slate-500">Archivo de datos activo:</span> <span class="text-emerald-400">${info.stateFilePath || './data/sgh_state.json'}</span></div>
              <div><span class="text-slate-500">Carpeta de copias de seguridad:</span> <span class="text-blue-300">${info.backupsDir || './data/backups'}</span></div>
              <div><span class="text-slate-500">Espacio ocupado por copias:</span> <span class="text-slate-300">${listaBackups.length} archivo(s) · ~${totalKB} KB</span></div>
            </div>

            <!-- Herramienta para borrar versiones antiguas y evitar ocupar espacio innecesario -->
            <div class="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div class="text-xs font-bold text-white">🧹 Limpieza de versiones antiguas</div>
              <p class="text-[11px] text-slate-400">
                Conserva solo las copias más recientes y elimina automáticamente las versiones viejas.
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <select id="sel-conservar-backups"
                  class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
                  <option value="3" ${uiState.conservarBackups === 3 ? 'selected' : ''}>Conservar últimas 3 copias</option>
                  <option value="5" ${uiState.conservarBackups === 5 ? 'selected' : ''}>Conservar últimas 5 copias</option>
                  <option value="10" ${uiState.conservarBackups === 10 ? 'selected' : ''}>Conservar últimas 10 copias</option>
                  <option value="0" ${uiState.conservarBackups === 0 ? 'selected' : ''}>Borrar todas las copias</option>
                </select>
                <button id="btn-limpiar-backups-antiguos"
                  class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition">
                  🗑️ Borrar copias antiguas
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Copias de Seguridad Disponibles (${listaBackups.length})
            </h3>
            <div class="overflow-hidden rounded-xl border border-slate-800 max-h-96 overflow-y-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th class="py-2.5 px-3">Archivo</th>
                    <th class="py-2.5 px-3">Descripción / Motivo</th>
                    <th class="py-2.5 px-3">Fecha y Hora</th>
                    <th class="py-2.5 px-3">Tamaño</th>
                    <th class="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  ${
                    listaBackups.length === 0
                      ? `<tr><td colspan="5" class="py-6 px-3 text-center text-slate-500">No hay copias de seguridad guardadas aún.</td></tr>`
                      : listaBackups
                          .map(
                            (b) => `
                        <tr class="hover:bg-slate-800/40">
                          <td class="py-2 px-3 font-mono text-[11px] text-blue-300">${b.archivo}</td>
                          <td class="py-2 px-3 text-slate-300">${b.motivo || 'Copia de seguridad'}</td>
                          <td class="py-2 px-3 text-slate-400 font-mono text-[11px]">${new Date(b.creadoEn).toLocaleString()}</td>
                          <td class="py-2 px-3 text-slate-400 font-mono text-[11px]">${Math.max(1, Math.round((b.tamanoBytes || 0) / 1024))} KB</td>
                          <td class="py-2 px-3 text-right">
                            <div class="inline-flex items-center gap-1.5">
                              <button data-restaurar-backup="${b.archivo}"
                                class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-[11px] font-semibold transition">
                                Restaurar esta copia
                              </button>
                              <button data-eliminar-backup="${b.archivo}"
                                title="Eliminar esta copia de seguridad del disco"
                                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-semibold transition">
                                🗑️ Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      `
                          )
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else if (subTab === 'auditoria') {
      contenidoSubTabHtml = `
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-white">📜 Registro de Auditoría de Cambios</h2>
              <p class="text-xs text-slate-400 mt-0.5">
                Historial detallado de todos los movimientos realizados en el horario oficial o durante una simulación.
              </p>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
              ${historial.listaReciente.length} acciones registradas en esta sesión
            </span>
          </div>

          <div class="bg-slate-950 border border-slate-800 rounded-xl p-3.5 overflow-y-auto max-h-[500px] space-y-2">
            ${
              historial.listaReciente.length === 0
                ? `<div class="text-xs text-slate-500 text-center py-10">Aún no se han realizado cambios en esta sesión.</div>`
                : historial.listaReciente
                    .map(
                      (item, idx) => `
                  <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-2 text-xs">
                    <div>
                      <div class="font-semibold text-slate-200">${idx === 0 ? '🟢 Última acción: ' : ''}${item.descripcion}</div>
                      <div class="text-[10px] text-slate-500 font-mono mt-0.5">${new Date(item.timestamp).toLocaleTimeString()}</div>
                    </div>
                    ${
                      item.enSimulacion
                        ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">En Simulación</span>`
                        : `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">Horario Oficial</span>`
                    }
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        </div>
      `;
    } else if (subTab === 'acerca') {
      contenidoSubTabHtml = `
        <div class="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          <div class="flex items-center gap-4 border-b border-slate-800 pb-4">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xl shadow-lg badge-solid-brand">
              SGH
            </div>
            <div>
              <h2 class="text-lg font-black text-white">Sistema de Gestión Horaria Escolar (SGH)</h2>
              <p class="text-xs text-slate-400 mt-0.5">
                Aplicación de escritorio para la organización integral de horarios escolares, cursos y plantel docente.
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Desarrollado por</div>
              <div class="text-sm font-black text-white mt-1">Elias Upstein</div>
            </div>

            <div class="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contacto</div>
              <div class="text-sm font-bold text-blue-400 mt-1 break-all">eliasupstein@gmail.com</div>
            </div>

            <div class="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Versión del Sistema</div>
              <div class="text-sm font-black font-mono text-emerald-400 mt-1">31.10.2026</div>
            </div>
          </div>

          <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
            <div class="font-bold text-white">Características Principales:</div>
            <p>• Funcionamiento 100% local y autónomo sin necesidad de conexión a internet.</p>
            <p>• Grillas interactivas por Curso y por Docente con semáforo de disponibilidad y motor de enroques en tiempo real.</p>
            <p>• Modo Simulación con guardado y carga de escenarios para planificar cambios con total seguridad.</p>
            <p>• Exportación institucional a Excel (.xlsx) y PDF A4 Horizontal lista para imprimir.</p>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="space-y-4">
        ${navSubTabsHtml}
        ${contenidoSubTabHtml}
      </div>
    `;

    // Cambio de sub-pestaña en Configuración
    container.querySelectorAll('[data-subtab-config]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.subTabConfigSistema = btn.getAttribute('data-subtab-config');
        renderizarVistaPersistencia();
      });
    });

    // Eventos de Exportación de Horarios (Fase 5)
    document.getElementById('btn-cfg-export-curso-excel')?.addEventListener('click', () => {
      const cursoId = document.getElementById('sel-export-curso')?.value || uiState.cursoSeleccionadoId;
      ejecutarExportacionHorario('EXCEL', { alcance: 'CURSO', cursoId });
    });
    document.getElementById('btn-cfg-export-curso-pdf')?.addEventListener('click', () => {
      const cursoId = document.getElementById('sel-export-curso')?.value || uiState.cursoSeleccionadoId;
      ejecutarExportacionHorario('PDF', { alcance: 'CURSO', cursoId });
    });
    document.getElementById('btn-cfg-export-docente-excel')?.addEventListener('click', () => {
      const docenteId = document.getElementById('sel-export-docente')?.value || uiState.docenteSeleccionadoId;
      ejecutarExportacionHorario('EXCEL', { alcance: 'DOCENTE', docenteId });
    });
    document.getElementById('btn-cfg-export-docente-pdf')?.addEventListener('click', () => {
      const docenteId = document.getElementById('sel-export-docente')?.value || uiState.docenteSeleccionadoId;
      ejecutarExportacionHorario('PDF', { alcance: 'DOCENTE', docenteId });
    });
    container.querySelectorAll('[data-export-masivo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const alcance = btn.getAttribute('data-export-masivo');
        const formato = btn.getAttribute('data-formato') || 'EXCEL';
        ejecutarExportacionHorario(formato, { alcance });
      });
    });

    // Eventos de Parámetros del Sistema
    container.querySelectorAll('[data-select-tema]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nuevoTema = btn.getAttribute('data-select-tema');
        uiState.resumen = window.sghAPI.actualizarParametrosSistema({ temaVisual: nuevoTema });
        renderizarTodo();
        mostrarToast(
          nuevoTema === 'CLARO' ? '☀️ Modo Claro activado.' : '🌙 Modo Oscuro activado.',
          'info'
        );
      });
    });

    container.querySelectorAll('[data-flag-param]').forEach((chk) => {
      chk.addEventListener('change', () => {
        const key = chk.getAttribute('data-flag-param');
        const valor = Boolean(chk.checked);
        uiState.resumen = window.sghAPI.actualizarParametrosSistema({ [key]: valor });
        if (key === 'validarCupoHorasEnVistaDocente') {
          uiState.permitirExcesoVistaDocente = !valor;
        }
        renderizarTodo();
      });
    });

    document.getElementById('btn-reset-parametros-default')?.addEventListener('click', () => {
      uiState.resumen = window.sghAPI.actualizarParametrosSistema({
        alertarChoquesDocentes: true,
        alertarDisponibilidadDocente: true,
        alertarCortePorRecreo: true,
        alertarExcesoHoras: true,
        alertarHorasLibresDocentes: true,
        alertarFormatoBloques: true,
        validarCupoHorasEnVistaDocente: true,
        confirmarMovimientosConModal: true,
        mostrarNotificacionesToast: true,
        temaVisual: 'OSCURO'
      });
      uiState.permitirExcesoVistaDocente = false;
      renderizarTodo();
      mostrarToast('✅ Parámetros del sistema restablecidos a los valores recomendados.', 'success');
    });

    // Eventos de Copias de Seguridad
    document.getElementById('btn-crear-backup')?.addEventListener('click', async () => {
      const res = await window.sghAPI.crearBackupManual('Copia de seguridad manual creada desde Configuración');
      if (res) {
        uiState.infoStorage = res.infoStorage;
        renderizarVistaPersistencia();
        mostrarToast(`💾 Copia de seguridad creada: ${res.backup.archivo}`, 'success');
      }
    });

    document.getElementById('btn-regenerar-seed')?.addEventListener('click', async () => {
      const res = await window.sghAPI.regenerarDatosSemilla();
      if (res) {
        uiState.resumen = res.resumen;
        uiState.infoStorage = res.infoStorage;
        renderizarTodo();
        mostrarToast('🔄 Datos iniciales de ejemplo restablecidos con copia de resguardo previa.', 'success');
      }
    });

    document.getElementById('sel-conservar-backups')?.addEventListener('change', (e) => {
      uiState.conservarBackups = parseInt(e.target.value, 10);
    });

    document.getElementById('btn-limpiar-backups-antiguos')?.addEventListener('click', async () => {
      const selEl = document.getElementById('sel-conservar-backups');
      const conservar = selEl ? parseInt(selEl.value, 10) : uiState.conservarBackups;
      uiState.conservarBackups = conservar;
      const res = await window.sghAPI.limpiarBackupsAntiguos(conservar);
      if (res) {
        uiState.infoStorage = res.infoStorage;
        renderizarVistaPersistencia();
        if (res.eliminadosCount > 0) {
          mostrarToast(
            `🧹 Se eliminaron ${res.eliminadosCount} copia(s) de seguridad antigua(s).`,
            'success'
          );
        } else {
          mostrarToast('ℹ️ No había copias antiguas excedentes para eliminar.', 'info');
        }
      }
    });

    container.querySelectorAll('[data-restaurar-backup]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const archivo = btn.getAttribute('data-restaurar-backup');
        const res = await window.sghAPI.restaurarBackup(archivo);
        if (res) {
          uiState.resumen = res.resumen;
          uiState.infoStorage = res.infoStorage;
          renderizarTodo();
          mostrarToast(`✅ Horario restaurado desde ${archivo}`, 'success');
        }
      });
    });

    container.querySelectorAll('[data-eliminar-backup]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const archivo = btn.getAttribute('data-eliminar-backup');
        const res = await window.sghAPI.eliminarBackup(archivo);
        if (res) {
          uiState.infoStorage = res.infoStorage;
          renderizarVistaPersistencia();
          mostrarToast(`🗑️ Copia de seguridad eliminada: ${archivo}`, 'info');
        }
      });
    });
  }

  // =========================================================================
  // MODAL DE DIFERENCIAS EN MODO SIMULACIÓN
  // =========================================================================
  function abrirModalDiffSimulacion() {
    if (!uiState.resumen) return;
    const { simulacionDiff } = uiState.resumen;
    const modal = document.getElementById('modal-diff-simulacion');
    const body = document.getElementById('modal-diff-body');

    body.innerHTML = `
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div class="text-slate-400">Celdas Modificadas</div>
          <div class="text-xl font-black text-white mt-0.5">${simulacionDiff.cantidadCeldasModificadas}</div>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div class="text-slate-400">Horas Libres (Oficial → Simulación)</div>
          <div class="text-xl font-black text-white mt-0.5">${simulacionDiff.horasPuenteOficial} hs → ${simulacionDiff.horasPuenteSimulacion} hs</div>
        </div>
        <div class="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div class="text-slate-400">Impacto Neto (Δ Horas Libres)</div>
          <div class="text-xl font-black ${
            simulacionDiff.deltaHorasPuente <= 0 ? 'text-emerald-400' : 'text-rose-400'
          } mt-0.5">
            ${simulacionDiff.deltaHorasPuente > 0 ? `+${simulacionDiff.deltaHorasPuente}` : simulacionDiff.deltaHorasPuente} hs
          </div>
        </div>
      </div>

      ${
        simulacionDiff.cambiosDetallados.length === 0
          ? `<div class="p-6 text-center text-slate-400 bg-slate-950 rounded-xl border border-slate-800">No hay diferencias acumuladas respecto al Horario Oficial Vigente.</div>`
          : `
          <div class="overflow-hidden rounded-xl border border-slate-800">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th class="py-2 px-3">Curso</th>
                  <th class="py-2 px-3">Día y Bloque</th>
                  <th class="py-2 px-3">En Horario Oficial</th>
                  <th class="py-2 px-3">En Simulación Actual</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${simulacionDiff.cambiosDetallados
                  .map(
                    (c) => `
                  <tr>
                    <td class="py-2 px-3 font-bold text-white">${c.cursoNombre}</td>
                    <td class="py-2 px-3 font-mono text-slate-300">${c.dia} · ${c.bloqueNombre} (${c.horario})</td>
                    <td class="py-2 px-3 text-rose-300">${c.materiaAntesNombre}</td>
                    <td class="py-2 px-3 text-emerald-300 font-semibold">→ ${c.materiaDespuesNombre}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      }
    `;

    modal.classList.remove('hidden');
  }

  function cerrarModalDiffSimulacion() {
    document.getElementById('modal-diff-simulacion')?.classList.add('hidden');
  }

  // =========================================================================
  // MODAL DE GUARDAR Y CARGAR SIMULACIONES
  // =========================================================================
  function abrirModalSimulaciones() {
    if (!uiState.resumen) return;
    const modal = document.getElementById('modal-simulaciones');
    const body = document.getElementById('modal-simulaciones-body');
    if (!modal || !body) return;

    const { enSimulacion, nombreSimulacionActiva, archivoSimulacionActiva } = uiState.resumen;
    const simulaciones = uiState.infoStorage?.simulaciones || [];
    const nombreSugerido =
      nombreSimulacionActiva ||
      `Escenario ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })}`;

    body.innerHTML = `
      <!-- Sección Superior: Guardar la simulación actual -->
      <div class="bg-slate-950 border ${
        enSimulacion ? 'border-amber-500/50' : 'border-slate-800'
      } rounded-2xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h4 class="text-xs font-bold text-white uppercase tracking-wider">
              💾 Guardar ${enSimulacion ? 'Simulación en Curso' : 'Escenario Actual como Simulación'}
            </h4>
            <p class="text-[11px] text-slate-400 mt-0.5">
              Guarda tu trabajo con un nombre identificatorio para poder retomarlo en otro momento sin perder ningún cambio.
            </p>
          </div>
          ${
            archivoSimulacionActiva
              ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">Activa: ${nombreSimulacionActiva}</span>`
              : ''
          }
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          <div class="md:col-span-5">
            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Nombre de la simulación</label>
            <input id="inp-sim-nombre" type="text" value="${nombreSugerido}"
              placeholder="Ej: Propuesta sin horas libres Turno Mañana"
              class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400" />
          </div>
          <div class="md:col-span-4">
            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Notas o comentario (opcional)</label>
            <input id="inp-sim-desc" type="text" value=""
              placeholder="Ej: Falta revisar Viernes 4° Año"
              class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400" />
          </div>
          <div class="md:col-span-3 flex gap-1.5">
            <button id="btn-confirmar-guardar-sim"
              class="w-full px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow">
              💾 Guardar Simulación
            </button>
          </div>
        </div>
      </div>

      <!-- Sección Inferior: Listado de Simulaciones Guardadas -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider">
            📂 Simulaciones Guardadas (${simulaciones.length})
          </h4>
          <span class="text-[11px] text-slate-400">
            Al cargar una simulación se activará automáticamente el Modo Simulación con ese escenario.
          </span>
        </div>

        ${
          simulaciones.length === 0
            ? `<div class="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                Aún no tienes simulaciones guardadas. Usa el formulario superior para guardar tu primera simulación.
              </div>`
            : `<div class="overflow-hidden rounded-xl border border-slate-800 max-h-72 overflow-y-auto">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th class="py-2.5 px-3">Nombre</th>
                      <th class="py-2.5 px-3">Notas</th>
                      <th class="py-2.5 px-3">Último guardado</th>
                      <th class="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800">
                    ${simulaciones
                      .map(
                        (s) => `
                      <tr class="hover:bg-slate-800/40">
                        <td class="py-2.5 px-3 font-bold text-white">${s.nombre}</td>
                        <td class="py-2.5 px-3 text-slate-300">${s.descripcion || '-'}</td>
                        <td class="py-2.5 px-3 font-mono text-[11px] text-slate-400">${new Date(s.guardadoEn).toLocaleString()}</td>
                        <td class="py-2.5 px-3 text-right">
                          <div class="inline-flex items-center gap-1.5">
                            <button data-cargar-sim="${s.archivo}"
                              class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition">
                              📂 Cargar y Retomar
                            </button>
                            <button data-eliminar-sim="${s.archivo}"
                              class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-semibold transition">
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-confirmar-guardar-sim')?.addEventListener('click', async () => {
      const nombre = document.getElementById('inp-sim-nombre')?.value?.trim() || 'Simulación';
      const descripcion = document.getElementById('inp-sim-desc')?.value?.trim() || '';
      const res = await window.sghAPI.guardarSimulacionActual({
        nombre,
        descripcion,
        archivoExistente: archivoSimulacionActiva || null
      });
      if (res && res.ok) {
        uiState.resumen = res.resumen;
        uiState.infoStorage = res.infoStorage;
        renderizarTodo();
        abrirModalSimulaciones();
        mostrarToast(`💾 Simulación «${nombre}» guardada correctamente.`, 'success');
      }
    });

    body.querySelectorAll('[data-cargar-sim]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const archivo = btn.getAttribute('data-cargar-sim');
        const res = await window.sghAPI.cargarSimulacionGuardada(archivo);
        if (res && res.ok) {
          uiState.resumen = res.resumen;
          uiState.infoStorage = res.infoStorage;
          cerrarModalSimulaciones();
          renderizarTodo();
          mostrarToast(
            `🧪 Simulación «${res.simulacion.nombre}» cargada en Modo Simulación.`,
            'info'
          );
        }
      });
    });

    body.querySelectorAll('[data-eliminar-sim]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const archivo = btn.getAttribute('data-eliminar-sim');
        const res = await window.sghAPI.eliminarSimulacionGuardada(archivo);
        if (res && res.ok) {
          uiState.infoStorage = res.infoStorage;
          abrirModalSimulaciones();
          mostrarToast('🗑️ Simulación eliminada.', 'info');
        }
      });
    });
  }

  function cerrarModalSimulaciones() {
    document.getElementById('modal-simulaciones')?.classList.add('hidden');
  }

  document.addEventListener('DOMContentLoaded', inicializarApp);
})();
