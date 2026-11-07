/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Módulo UI Fase 2: Configuración Multi-Colegio, ABM (Cursos, Materias, Docentes)
 * y Grilla Interactiva "Pintar con el Mouse" (Drag-to-Paint) para Disponibilidad Docente
 */

(function () {
  const abmState = {
    subTab: 'institucion', // 'institucion' (Colegio) | 'cursos' | 'materias' | 'disponibilidad' (Docentes)
    modoPincel: 'AUTO', // 'AUTO' | 'DISPONIBLE' | 'NO_DISPONIBLE'
    busquedaDocente: '',
    docenteEditandoId: null, // null = cerrado, 'NUEVO' = creando, id = editando
    materiaCursoId: 'c1',
    materiaEditandoId: null, // null = creando nueva, id = editando existente
    cursoEditandoId: null, // null = creando nuevo, id = editando existente
    bloquesBorradorEditor: null, // Copia editable de bloquesHorarios para la pestaña Colegio
    logoBase64Borrador: undefined // Borrador temporal del logo en edición
  };

  // Control global de arrastre "Pintar con el Mouse"
  let dragPaintSession = null;

  window.addEventListener('mouseup', () => {
    if (dragPaintSession && dragPaintSession.activo) {
      finalizarDragPaintSession();
    }
  });

  function finalizarDragPaintSession() {
    if (!dragPaintSession) return;
    const { docenteId, cambiosMap, onCommit } = dragPaintSession;
    dragPaintSession = null;

    const cambios = Array.from(cambiosMap.values());
    if (cambios.length > 0 && typeof onCommit === 'function') {
      onCommit(docenteId, cambios);
    }
  }

  /**
   * Conecta los eventos mousedown / mouseenter para pintar disponibilidad arrastrando el mouse
   * sobre cualquier tabla que tenga celdas con [data-paint-cell="true"]
   */
  function conectarEventosPintarConMouse(containerEl, docenteId, obtenerModoPincel, onCommitCallback) {
    const celdas = containerEl.querySelectorAll('[data-paint-cell="true"]');

    function pintarCeldaVisualmente(td, nuevoValorDisponible) {
      td.setAttribute('data-disponible', nuevoValorDisponible ? 'true' : 'false');
      const tieneClase = td.getAttribute('data-ocupado') === 'true';
      const inner = td.querySelector('[data-paint-inner="true"]');
      if (!inner) return;

      if (nuevoValorDisponible) {
        inner.className =
          'rounded-lg p-2 bg-emerald-500/20 border-2 border-emerald-400 flex flex-col items-center justify-center text-center transition-all shadow-sm';
        const statusEl = inner.querySelector('[data-paint-status="true"]');
        if (statusEl) {
          statusEl.className = 'text-[11px] font-bold text-emerald-200';
          statusEl.textContent = '✓ Disponible';
        }
      } else {
        inner.className = tieneClase
          ? 'rounded-lg p-2 bg-rose-950/70 border-2 border-rose-500 flex flex-col items-center justify-center text-center transition-all shadow-sm'
          : 'rounded-lg p-2 bg-hatched-unavailable border-2 border-slate-600 flex flex-col items-center justify-center text-center transition-all';
        const statusEl = inner.querySelector('[data-paint-status="true"]');
        if (statusEl) {
          statusEl.className = tieneClase
            ? 'text-[11px] font-bold text-rose-300'
            : 'text-[11px] font-semibold text-slate-400';
          statusEl.textContent = tieneClase ? '🚨 Conflicto Clase' : '✕ No Disponible';
        }
      }

      const indicadorPintura = document.getElementById('indicador-trazo-pintura');
      if (indicadorPintura && dragPaintSession) {
        indicadorPintura.textContent = `🖌️ Pintando ${dragPaintSession.cambiosMap.size} bloque(s)... Suelta el mouse para aplicar`;
        indicadorPintura.classList.remove('hidden');
      }
    }

    celdas.forEach((td) => {
      td.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Solo clic izquierdo
        e.preventDefault();

        const dia = td.getAttribute('data-dia');
        const bloqueIndice = parseInt(td.getAttribute('data-bloque'), 10);
        const dispActual = td.getAttribute('data-disponible') === 'true';
        const modo = obtenerModoPincel();

        let valorObjetivo = !dispActual;
        if (modo === 'DISPONIBLE') valorObjetivo = true;
        else if (modo === 'NO_DISPONIBLE') valorObjetivo = false;

        const cambiosMap = new Map();
        cambiosMap.set(`${dia}|${bloqueIndice}`, {
          dia,
          bloqueIndice,
          disponible: valorObjetivo
        });

        dragPaintSession = {
          activo: true,
          docenteId,
          valorObjetivo,
          cambiosMap,
          onCommit: onCommitCallback
        };

        pintarCeldaVisualmente(td, valorObjetivo);
      });

      td.addEventListener('mouseenter', () => {
        if (!dragPaintSession || !dragPaintSession.activo) return;
        if (dragPaintSession.docenteId !== docenteId) return;

        const dia = td.getAttribute('data-dia');
        const bloqueIndice = parseInt(td.getAttribute('data-bloque'), 10);
        const key = `${dia}|${bloqueIndice}`;

        dragPaintSession.cambiosMap.set(key, {
          dia,
          bloqueIndice,
          disponible: dragPaintSession.valorObjetivo
        });

        pintarCeldaVisualmente(td, dragPaintSession.valorObjetivo);
      });
    });
  }

  /**
   * Renderiza la vista principal de Configuración y ABM (Fase 2)
   */
  function renderizarVistaConfiguracion(uiState, callbacks) {
    const container = document.getElementById('tab-configuracion');
    if (!container || !uiState.resumen) return;

    const { estado } = uiState.resumen;
    if (! estado.cursos.some((c) => c.id === abmState.materiaCursoId) && estado.cursos.length > 0) {
      abmState.materiaCursoId = estado.cursos[0].id;
    }

    container.innerHTML = `
      <!-- Barra de Sub-Navegación de Administración (Colegio, Cursos, Materias y Docentes) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <button data-subtab="institucion"
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              abmState.subTab === 'institucion'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }">
            <span>🏫 Colegio</span>
          </button>

          <button data-subtab="cursos"
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              abmState.subTab === 'cursos'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }">
            <span>🎓 Cursos</span>
            <span class="px-1.5 py-0.2 rounded bg-slate-900/60 text-[10px] font-mono">${estado.cursos.length}</span>
          </button>

          <button data-subtab="materias"
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              abmState.subTab === 'materias'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }">
            <span>📚 Materias</span>
            <span class="px-1.5 py-0.2 rounded bg-slate-900/60 text-[10px] font-mono">${estado.materias.length}</span>
          </button>

          <button data-subtab="disponibilidad"
            class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              abmState.subTab === 'disponibilidad'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }">
            <span>👩‍🏫 Docentes</span>
            <span class="px-1.5 py-0.2 rounded bg-slate-900/60 text-[10px] font-mono">${estado.docentes.length}</span>
          </button>
        </div>

        <div class="text-xs text-slate-400">
          💡 Todos los cambios de administración soportan <strong>Deshacer (Ctrl+Z)</strong> y <strong>Modo Simulación</strong>.
        </div>
      </div>

      <!-- Contenedor Dinámico de la Sub-Pestaña Activa -->
      <div id="subtab-config-content"></div>
    `;

    container.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abmState.subTab = btn.getAttribute('data-subtab');
        if (abmState.subTab !== 'institucion') {
          abmState.bloquesBorradorEditor = null;
          abmState.logoBase64Borrador = undefined;
        }
        renderizarVistaConfiguracion(uiState, callbacks);
      });
    });

    const subContainer = document.getElementById('subtab-config-content');
    if (abmState.subTab === 'disponibilidad') {
      renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
    } else if (abmState.subTab === 'materias') {
      renderizarSubTabMaterias(subContainer, uiState, callbacks);
    } else if (abmState.subTab === 'cursos') {
      renderizarSubTabCursos(subContainer, uiState, callbacks);
    } else if (abmState.subTab === 'institucion') {
      renderizarSubTabInstitucion(subContainer, uiState, callbacks);
    }
  }

  // =========================================================================
  // SUB-TAB 1: DISPONIBILIDAD DOCENTE ("PINTAR CON EL MOUSE") + ABM DOCENTES
  // =========================================================================
  function renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks) {
    const { estado, auditoria } = uiState.resumen;
    const docenteActual =
      estado.docentes.find((d) => d.id === uiState.docenteSeleccionadoId) || estado.docentes[0];
    const metricasDoc = docenteActual
      ? window.sghAPI.calcularMetricasDocente(docenteActual.id)
      : null;

    const filtro = abmState.busquedaDocente.toLowerCase().trim();
    const docentesFiltrados = auditoria.metricasDocentes.filter(
      (md) =>
        !filtro ||
        md.nombre.toLowerCase().includes(filtro) ||
        md.especialidad.toLowerCase().includes(filtro)
    );

    const docParaFormulario =
      abmState.docenteEditandoId && abmState.docenteEditandoId !== 'NUEVO'
        ? estado.docentes.find((d) => d.id === abmState.docenteEditandoId)
        : null;

    subContainer.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Panel Izquierdo (4 cols): Listado y ABM de Docentes -->
        <div class="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-bold text-white">👩‍🏫 Plantel Docente (${estado.docentes.length})</h3>
              <p class="text-[11px] text-slate-400">Selecciona un docente para pintar su disponibilidad o editar sus datos.</p>
            </div>
            <button id="btn-nuevo-docente"
              class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shrink-0">
              + Nuevo Docente
            </button>
          </div>

          <!-- Formulario de Alta / Edición de Docente -->
          ${
            abmState.docenteEditandoId
              ? `
            <form id="form-abm-docente" class="bg-slate-950 border border-blue-500/50 rounded-xl p-3.5 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-blue-300">
                  ${docParaFormulario ? `✏️ Editando: ${docParaFormulario.nombre}` : '➕ Registrar Nuevo Docente'}
                </span>
                <button type="button" id="btn-cancelar-form-docente" class="text-xs text-slate-400 hover:text-white">✕</button>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre y Apellido</label>
                <input type="text" id="inp-doc-nombre" required
                  value="${docParaFormulario ? docParaFormulario.nombre : 'Prof. '}"
                  placeholder="Ej: Prof. Elena Morales"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Especialidad</label>
                  <input type="text" id="inp-doc-esp" required
                    value="${docParaFormulario ? docParaFormulario.especialidad : ''}"
                    placeholder="Ej: Biología y Química"
                    class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Legajo / ID</label>
                  <input type="text" id="inp-doc-legajo"
                    value="${docParaFormulario ? docParaFormulario.legajo || '' : `DOC-${1000 + estado.docentes.length + 1}`}"
                    class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div class="flex items-center justify-between pt-1">
                <div class="flex items-center gap-2">
                  <label class="text-[10px] font-bold text-slate-400 uppercase">Color:</label>
                  <input type="color" id="inp-doc-color"
                    value="${docParaFormulario?.color || '#3b82f6'}"
                    class="w-7 h-6 rounded cursor-pointer bg-transparent border-0" />
                </div>
                <div class="flex items-center gap-1.5">
                  ${
                    docParaFormulario
                      ? `<button type="button" id="btn-eliminar-docente" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600/80 hover:bg-rose-600 text-white">
                          🗑️ Eliminar
                        </button>`
                      : ''
                  }
                  <button type="submit" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white">
                    💾 Guardar Docente
                  </button>
                </div>
              </div>
            </form>
          `
              : ''
          }

          <!-- Buscador rápido -->
          <div>
            <input type="text" id="inp-buscar-docente"
              value="${abmState.busquedaDocente}"
              placeholder="🔍 Buscar docente por nombre o especialidad..."
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none" />
          </div>

          <!-- Lista de Docentes -->
          <div class="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            ${docentesFiltrados
              .map((md) => {
                const docObj = estado.docentes.find((d) => d.id === md.docenteId);
                const esSel = docenteActual && md.docenteId === docenteActual.id;
                return `
                  <div data-sel-docente-abm="${md.docenteId}"
                    class="p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                      esSel
                        ? 'bg-blue-950/60 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${docObj?.color || '#3b82f6'}"></span>
                        <span class="font-bold text-xs text-white truncate">${md.nombre}</span>
                      </div>
                      <div class="text-[11px] text-slate-400 truncate mt-0.5">${md.especialidad}</div>
                      <div class="flex items-center gap-2 mt-1 text-[10px] font-mono">
                        <span class="text-emerald-400">Disp: ${md.totalHorasDisponibles} hs</span>
                        <span class="text-blue-300">Asig: ${md.totalHorasAsignadas} hs</span>
                        ${
                          md.totalHorasPuente > 0
                            ? `<span class="text-amber-400 font-bold" title="Horas libres">⚠️ ${md.totalHorasPuente}L</span>`
                            : ''
                        }
                      </div>
                    </div>
                    <button data-edit-docente-btn="${md.docenteId}" title="Editar datos del docente"
                      class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white text-[11px] shrink-0">
                      ✏️
                    </button>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>

        <!-- Panel Derecho (8 cols): Grilla Interactiva "Pintar con el Mouse" -->
        <div class="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          ${
            !metricasDoc
              ? `<div class="p-8 text-center text-slate-400">Selecciona un docente para editar su disponibilidad horaria.</div>`
              : `
            <!-- Cabecera del Editor de Disponibilidad -->
            <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-black text-white">🖌️ Disponibilidad Horaria: ${metricasDoc.nombre}</h3>
                  <button id="btn-editar-docente-actual" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-blue-600 text-[11px] text-slate-300 hover:text-white transition">
                    ✏️ Editar Datos
                  </button>
                </div>
                <p class="text-xs text-slate-400 mt-0.5">
                  <strong>Mantén presionado el clic izquierdo y arrastra el mouse</strong> por las celdas para pintar rápidamente la disponibilidad.
                </p>
              </div>

              <div class="flex items-center gap-2">
                <span id="indicador-trazo-pintura" class="hidden px-3 py-1 rounded-lg bg-blue-600 text-white font-bold text-xs animate-pulse"></span>
                <div class="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
                  <span class="text-slate-400">Disponibles:</span>
                  <strong class="text-emerald-400 font-mono ml-1">${metricasDoc.totalHorasDisponibles} hs</strong>
                </div>
                <div class="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
                  <span class="text-slate-400">Asignadas:</span>
                  <strong class="text-blue-400 font-mono ml-1">${metricasDoc.totalHorasAsignadas} hs</strong>
                </div>
              </div>
            </div>

            <!-- Barra de Herramientas del Pincel + Plantillas Rápidas -->
            <div class="flex flex-wrap items-center justify-between gap-3">
              <!-- Selector de Pincel -->
              <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <span class="text-[11px] font-bold text-slate-400 px-2">Modo Pincel:</span>
                <button data-modo-pincel="AUTO"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    abmState.modoPincel === 'AUTO'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }">
                  🔄 Auto-Invertir
                </button>
                <button data-modo-pincel="DISPONIBLE"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    abmState.modoPincel === 'DISPONIBLE'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }">
                  🟢 Pintar Disponible
                </button>
                <button data-modo-pincel="NO_DISPONIBLE"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    abmState.modoPincel === 'NO_DISPONIBLE'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }">
                  ⬛ Pintar No Disponible
                </button>
              </div>

              <!-- Plantillas Rápidas de 1 Clic -->
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] font-bold text-slate-400 mr-1">Plantillas:</span>
                <button data-preset-disp="JORNADA_COMPLETA"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition">
                  ☀️ Todo Disponible
                </button>
                <button data-preset-disp="SOLO_MANANA"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition">
                  🌅 Solo Mañana
                </button>
                <button data-preset-disp="SOLO_TARDE"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition">
                  🌇 Solo Tarde
                </button>
                <button data-preset-disp="LIMPIAR_TODO"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition">
                  🧹 Limpiar Todo
                </button>
              </div>
            </div>

            <!-- Grilla Semanal Interactiva "Pintar con el Mouse" -->
            <div id="grilla-pintar-disponibilidad" class="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto select-none">
              <table class="w-full table-fixed min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr class="bg-slate-900 text-slate-300 border-b border-slate-800">
                    <th class="py-2.5 px-2.5 text-left w-28">
                      <div>Bloque / Hora</div>
                      <div class="text-[9px] font-normal text-slate-400">Clic fila = alternar</div>
                    </th>
                    ${estado.configuracion.diasHabiles
                      .map(
                        (dia) => `
                      <th data-paint-col-dia="${dia}" title="Haz clic para alternar todo el día ${dia}"
                        class="py-2.5 px-2 text-center font-bold border-l border-slate-800 cursor-pointer hover:bg-slate-800/80 transition">
                        <div>${dia}</div>
                        <div class="text-[9px] font-normal text-blue-400">↕ Alternar día</div>
                      </th>
                    `
                      )
                      .join('')}
                  </tr>
                </thead>
                <tbody>
                  ${estado.configuracion.bloquesHorarios
                    .map((bloque) => {
                      const celdas = estado.configuracion.diasHabiles
                        .map((dia) => {
                          const celda = metricasDoc.porDia[dia].celdas[bloque.indice];
                          const disp = celda.disponible;
                          const ocupado = celda.ocupado;

                          let boxClass =
                            'rounded-lg p-2 bg-hatched-unavailable border border-slate-800 flex flex-col items-center justify-center text-center transition-all';
                          let statusClass = 'text-[11px] font-medium text-slate-500';
                          let statusText = '✕ No Disponible';

                          if (disp && ocupado) {
                            boxClass =
                              'rounded-lg p-2 bg-emerald-500/20 border border-emerald-500/50 flex flex-col items-center justify-center text-center transition-all';
                            statusClass = 'text-[11px] font-bold text-emerald-300';
                            statusText = '✓ Disponible';
                          } else if (disp && !ocupado) {
                            boxClass =
                              'rounded-lg p-2 bg-emerald-500/15 border border-emerald-500/35 flex flex-col items-center justify-center text-center transition-all';
                            statusClass = 'text-[11px] font-semibold text-emerald-300';
                            statusText = '✓ Disponible';
                          } else if (!disp && ocupado) {
                            boxClass =
                              'rounded-lg p-2 bg-rose-950/70 border-2 border-rose-500 flex flex-col items-center justify-center text-center transition-all';
                            statusClass = 'text-[11px] font-bold text-rose-300';
                            statusText = '🚨 Conflicto Clase';
                          }

                          return `
                            <td data-paint-cell="true"
                              data-dia="${dia}"
                              data-bloque="${bloque.indice}"
                              data-disponible="${disp ? 'true' : 'false'}"
                              data-ocupado="${ocupado ? 'true' : 'false'}"
                              class="p-1 border-l border-b border-slate-800/80 cursor-crosshair">
                              <div data-paint-inner="true" class="${boxClass}">
                                <span data-paint-status="true" class="${statusClass}">${statusText}</span>
                                ${
                                  ocupado
                                    ? `<span class="mt-0.5 px-1.5 py-0.2 rounded bg-blue-600/40 text-blue-100 text-[9px] font-semibold truncate max-w-full" title="Dicta ${celda.etiquetaCompleta}">
                                        🏫 ${celda.cursoNombre} (${celda.materiaNombre})
                                      </span>`
                                    : `<span class="text-[9px] text-slate-500 mt-0.5">${bloque.inicio}-${bloque.fin}</span>`
                                }
                              </div>
                            </td>
                          `;
                        })
                        .join('');

                      const filaHtml = `
                        <tr>
                          <td data-paint-row-bloque="${bloque.indice}" title="Haz clic para alternar ${bloque.nombre} en toda la semana"
                            class="py-2 px-2.5 border-b border-slate-800 bg-slate-900/70 cursor-pointer hover:bg-slate-800 transition">
                            <div class="font-bold text-white text-[11px] flex items-center justify-between">
                              <span>${bloque.nombre}</span>
                              <span class="text-[9px] text-blue-400">↔</span>
                            </div>
                            <div class="font-mono text-[10px] text-slate-400">${bloque.inicio} - ${bloque.fin}</div>
                          </td>
                          ${celdas}
                        </tr>
                      `;

                      const recreoHtml = bloque.recreoPosterior
                        ? `
                          <tr class="bg-amber-950/25 border-b border-amber-500/25">
                            <td colspan="${estado.configuracion.diasHabiles.length + 1}" class="py-1 px-4 text-center text-[10px] font-bold text-amber-300/90">
                              ☕ ${bloque.recreoPosterior.etiqueta} (Fin Segmento ${bloque.segmento})
                            </td>
                          </tr>
                        `
                        : '';

                      return filaHtml + recreoHtml;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          }
        </div>
      </div>
    `;

    // Eventos del buscador de docentes
    const inpBuscar = document.getElementById('inp-buscar-docente');
    if (inpBuscar) {
      inpBuscar.addEventListener('input', (e) => {
        abmState.busquedaDocente = e.target.value;
        renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
        const nuevoInput = document.getElementById('inp-buscar-docente');
        if (nuevoInput) {
          nuevoInput.focus();
          nuevoInput.setSelectionRange(nuevoInput.value.length, nuevoInput.value.length);
        }
      });
    }

    // Seleccionar docente de la lista
    subContainer.querySelectorAll('[data-sel-docente-abm]').forEach((item) => {
      item.addEventListener('click', () => {
        uiState.docenteSeleccionadoId = item.getAttribute('data-sel-docente-abm');
        renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
      });
    });

    // Abrir formulario para nuevo docente o editar docente
    document.getElementById('btn-nuevo-docente')?.addEventListener('click', () => {
      abmState.docenteEditandoId = 'NUEVO';
      renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
    });

    document.getElementById('btn-editar-docente-actual')?.addEventListener('click', () => {
      if (docenteActual) {
        abmState.docenteEditandoId = docenteActual.id;
        renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
      }
    });

    subContainer.querySelectorAll('[data-edit-docente-btn]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-edit-docente-btn');
        uiState.docenteSeleccionadoId = id;
        abmState.docenteEditandoId = id;
        renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
      });
    });

    document.getElementById('btn-cancelar-form-docente')?.addEventListener('click', () => {
      abmState.docenteEditandoId = null;
      renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
    });

    // Guardar Docente (Alta / Modificación)
    document.getElementById('form-abm-docente')?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const payload = {
          id: abmState.docenteEditandoId !== 'NUEVO' ? abmState.docenteEditandoId : null,
          nombre: document.getElementById('inp-doc-nombre').value,
          especialidad: document.getElementById('inp-doc-esp').value,
          legajo: document.getElementById('inp-doc-legajo').value,
          color: document.getElementById('inp-doc-color').value
        };
        uiState.resumen = window.sghAPI.guardarDocente(payload);
        const ultimoDoc =
          uiState.resumen.estado.docentes[uiState.resumen.estado.docentes.length - 1];
        if (abmState.docenteEditandoId === 'NUEVO' && ultimoDoc) {
          uiState.docenteSeleccionadoId = ultimoDoc.id;
        }
        abmState.docenteEditandoId = null;
        callbacks.onStateUpdated(`Docente "${payload.nombre}" guardado correctamente.`, 'success');
      } catch (err) {
        callbacks.mostrarToast(err.message, 'error');
      }
    });

    // Eliminar Docente
    document.getElementById('btn-eliminar-docente')?.addEventListener('click', () => {
      if (!docParaFormulario) return;
      try {
        uiState.resumen = window.sghAPI.eliminarDocente(docParaFormulario.id);
        abmState.docenteEditandoId = null;
        if (uiState.resumen.estado.docentes.length > 0) {
          uiState.docenteSeleccionadoId = uiState.resumen.estado.docentes[0].id;
        }
        callbacks.onStateUpdated(`Docente "${docParaFormulario.nombre}" eliminado.`, 'info');
      } catch (err) {
        callbacks.mostrarToast(err.message, 'error');
      }
    });

    // Cambiar Modo de Pincel
    subContainer.querySelectorAll('[data-modo-pincel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abmState.modoPincel = btn.getAttribute('data-modo-pincel');
        renderizarSubTabDisponibilidadYDocentes(subContainer, uiState, callbacks);
      });
    });

    // Plantillas rápidas de disponibilidad
    subContainer.querySelectorAll('[data-preset-disp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!docenteActual) return;
        const preset = btn.getAttribute('data-preset-disp');
        uiState.resumen = window.sghAPI.aplicarPresetDisponibilidadDocente({
          docenteId: docenteActual.id,
          preset
        });
        callbacks.onStateUpdated(`Plantilla de disponibilidad aplicada a ${docenteActual.nombre}.`, 'success');
      });
    });

    // Alternar Día completo haciendo clic en el encabezado de la columna
    subContainer.querySelectorAll('[data-paint-col-dia]').forEach((th) => {
      th.addEventListener('click', () => {
        if (!docenteActual) return;
        const dia = th.getAttribute('data-paint-col-dia');
        const dispDia = docenteActual.disponibilidad?.[dia] || [];
        const todosDisponibles = dispDia.every(Boolean);
        const nuevoValor = !todosDisponibles;
        const cambios = estado.configuracion.bloquesHorarios.map((b) => ({
          dia,
          bloqueIndice: b.indice,
          disponible: nuevoValor
        }));
        uiState.resumen = window.sghAPI.aplicarTrazoDisponibilidadDocente({
          docenteId: docenteActual.id,
          cambios,
          etiquetaAccion: `${nuevoValor ? 'Habilitar' : 'Deshabilitar'} día ${dia} completo para ${docenteActual.nombre}`
        });
        callbacks.onStateUpdated(`Día ${dia} actualizado para ${docenteActual.nombre}.`, 'info');
      });
    });

    // Alternar Fila de Bloque completa haciendo clic en el encabezado de la fila
    subContainer.querySelectorAll('[data-paint-row-bloque]').forEach((td) => {
      td.addEventListener('click', () => {
        if (!docenteActual) return;
        const bloqueIndice = parseInt(td.getAttribute('data-paint-row-bloque'), 10);
        const dias = estado.configuracion.diasHabiles;
        const todosDispEnFila = dias.every((d) => Boolean(docenteActual.disponibilidad?.[d]?.[bloqueIndice]));
        const nuevoValor = !todosDispEnFila;
        const cambios = dias.map((dia) => ({
          dia,
          bloqueIndice,
          disponible: nuevoValor
        }));
        uiState.resumen = window.sghAPI.aplicarTrazoDisponibilidadDocente({
          docenteId: docenteActual.id,
          cambios,
          etiquetaAccion: `${nuevoValor ? 'Habilitar' : 'Deshabilitar'} Bloque ${bloqueIndice + 1} en toda la semana para ${docenteActual.nombre}`
        });
        callbacks.onStateUpdated(`Bloque ${bloqueIndice + 1} actualizado en toda la semana.`, 'info');
      });
    });

    // Conectar Drag-to-Paint ("Pintar con el Mouse") en la grilla
    const grillaEl = document.getElementById('grilla-pintar-disponibilidad');
    if (grillaEl && docenteActual) {
      conectarEventosPintarConMouse(
        grillaEl,
        docenteActual.id,
        () => abmState.modoPincel,
        (docId, cambios) => {
          uiState.resumen = window.sghAPI.aplicarTrazoDisponibilidadDocente({
            docenteId: docId,
            cambios
          });
          callbacks.onStateUpdated(
            `🖌️ Disponibilidad actualizada (${cambios.length} bloque${cambios.length === 1 ? '' : 's'}) para ${docenteActual.nombre}.`,
            'success'
          );
        }
      );
    }
  }

  // =========================================================================
  // SUB-TAB 2: ABM DE MATERIAS POR CURSO (FORMATO DE BLOQUES Y MULTI-DOCENTE)
  // =========================================================================
  function renderizarSubTabMaterias(subContainer, uiState, callbacks) {
    const { estado, auditoria } = uiState.resumen;
    const cursoActual =
      estado.cursos.find((c) => c.id === abmState.materiaCursoId) || estado.cursos[0];
    const materiasDelCurso = auditoria.progresoMaterias.filter(
      (m) => m.cursoId === cursoActual.id
    );

    const matEditando = abmState.materiaEditandoId
      ? estado.materias.find((m) => m.id === abmState.materiaEditandoId)
      : null;

    const formatosSugeridos = ['2', '3', '2+1', '2+2', '3+2', '3+3', '2+2+2', '2+2+1', '1+1'];
    const coloresSugeridos = [
      '#dbeafe',
      '#fce7f3',
      '#fef3c7',
      '#d1fae5',
      '#ccfbf1',
      '#e0e7ff',
      '#e0f2fe',
      '#dcfce7',
      '#ffe4e6',
      '#f3e8ff',
      '#ede9fe',
      '#fae8ff'
    ];

    const totalHorasCursoPlan = materiasDelCurso.reduce((acc, m) => acc + m.horasSemanales, 0);
    const capacidadSemanalCurso =
      estado.configuracion.diasHabiles.length * estado.configuracion.bloquesHorarios.length;

    subContainer.innerHTML = `
      <!-- Selector de Curso para ABM de Materias -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-bold text-slate-400 uppercase mr-1">Materias del Curso:</span>
          ${estado.cursos
            .map((c) => {
              const activo = c.id === cursoActual.id;
              const count = estado.materias.filter((m) => m.cursoId === c.id).length;
              return `
                <button data-abm-mat-curso="${c.id}"
                  class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    activo
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }">
                  ${c.nombre} (${count} mat.)
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="text-xs text-slate-300 font-mono bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          Carga del Plan en ${cursoActual.nombre}: <strong>${totalHorasCursoPlan} / ${capacidadSemanalCurso} hs semanales</strong>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Columna Izquierda (5 cols): Formulario Alta / Edición de Materia -->
        <form id="form-abm-materia" class="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div>
              <h3 class="text-sm font-bold text-white">
                ${matEditando ? `✏️ Editando Materia: ${matEditando.nombre}` : `➕ Nueva Materia en ${cursoActual.nombre}`}
              </h3>
              <p class="text-[11px] text-slate-400">Define horas semanales, formato de bloques y 1 o más docentes.</p>
            </div>
            ${
              matEditando
                ? `<button type="button" id="btn-cancelar-edit-materia" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300">
                    Cancelar Edición
                  </button>`
                : ''
            }
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <div class="col-span-2">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre de la Materia</label>
              <input type="text" id="inp-mat-nombre" required
                value="${matEditando ? matEditando.nombre : ''}"
                placeholder="Ej: Robótica Aplicada"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Código Corto</label>
              <input type="text" id="inp-mat-codigo" required
                value="${matEditando ? matEditando.codigo : ''}"
                placeholder="Ej: ROB1"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <!-- Horas Semanales, Formato de Bloques y Modo de Exigencia -->
          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Horas Semanales</label>
              <input type="number" id="inp-mat-horas" min="1" max="24" required
                value="${matEditando ? matEditando.horasSemanales : 4}"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Formato Bloques</label>
              <input type="text" id="inp-mat-formato" required
                value="${matEditando ? matEditando.formatoBloques : '2+2'}"
                placeholder="Ej: 2+2, 3+2, 2+1"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modo Exigencia</label>
              <select id="inp-mat-modo"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:border-blue-500 focus:outline-none">
                <option value="OBLIGATORIO" ${!matEditando || matEditando.modoExigencia === 'OBLIGATORIO' ? 'selected' : ''}>
                  🔒 OBLIGATORIO
                </option>
                <option value="IDEAL" ${matEditando && matEditando.modoExigencia === 'IDEAL' ? 'selected' : ''}>
                  💡 IDEAL / OPCIONAL
                </option>
              </select>
            </div>
          </div>

          <!-- Chips Rápidos de Formato de Bloques -->
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[10px] font-bold text-slate-400 uppercase">Formatos Rápidos (Clic para aplicar):</span>
              <span id="validacion-formato-horas" class="text-[10px] font-semibold text-emerald-400"></span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${formatosSugeridos
                .map(
                  (fmt) => `
                <button type="button" data-chip-formato="${fmt}"
                  class="px-2 py-1 rounded-md bg-slate-900 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-800 font-mono text-[11px] transition">
                  ${fmt}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Selector de Color -->
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Color Identificatorio en Grilla</label>
            <div class="flex items-center gap-2 flex-wrap">
              <input type="color" id="inp-mat-color"
                value="${matEditando ? matEditando.color : '#dbeafe'}"
                class="w-8 h-7 rounded cursor-pointer bg-transparent border-0" />
              ${coloresSugeridos
                .map(
                  (col) => `
                <button type="button" data-chip-color="${col}"
                  class="w-5 h-5 rounded-full border border-slate-600 hover:scale-110 transition"
                  style="background-color: ${col}"></button>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Selección Multi-Docente (1 o más docentes / Pareja Pedagógica) -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase">
                Docente(s) Asignado(s) — Soporta Pareja Pedagógica (2+ Docentes)
              </label>
              <span class="text-[10px] text-cyan-400">Marca 1 o más</span>
            </div>
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1">
              ${estado.docentes
                .map((d) => {
                  const checked = matEditando
                    ? matEditando.docentesIds.includes(d.id)
                    : d.id === estado.docentes[0]?.id;
                  return `
                    <label class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-xs">
                      <div class="flex items-center gap-2">
                        <input type="checkbox" name="chk-mat-docente" value="${d.id}" ${checked ? 'checked' : ''}
                          class="rounded border-slate-700 text-blue-600 focus:ring-blue-500" />
                        <span class="font-semibold text-white">${d.nombre}</span>
                      </div>
                      <span class="text-[10px] text-slate-400 truncate max-w-[150px]">${d.especialidad}</span>
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>

          <button type="submit"
            class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/40 transition">
            ${matEditando ? '💾 Guardar Cambios en la Materia' : `➕ Crear Materia en ${cursoActual.nombre}`}
          </button>
        </form>

        <!-- Columna Derecha (7 cols): Tabla de Materias del Curso -->
        <div class="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="text-sm font-bold text-white">📋 Plan de Estudios de ${cursoActual.nombre} (${materiasDelCurso.length} materias)</h3>
              <p class="text-xs text-slate-400">Haz clic en Editar para cambiar docentes, carga horaria o formato de bloques.</p>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th class="py-2.5 px-3">Código / Materia</th>
                  <th class="py-2.5 px-3">Docente(s)</th>
                  <th class="py-2.5 px-3 text-center">Carga (Asig/Plan)</th>
                  <th class="py-2.5 px-3 text-center">Formato Bloques</th>
                  <th class="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/70">
                ${materiasDelCurso
                  .map(
                    (m) => `
                  <tr class="hover:bg-slate-800/40">
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded shrink-0 border border-white/20" style="background-color: ${m.color}"></span>
                        <div>
                          <div class="font-bold text-white">${m.nombre}</div>
                          <div class="text-[10px] font-mono text-slate-400">${m.codigo}</div>
                        </div>
                      </div>
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="text-slate-200">${m.docentesNombres}</div>
                      ${
                        m.docentesIds.length > 1
                          ? `<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold">👥 Pareja Pedagógica (${m.docentesIds.length})</span>`
                          : ''
                      }
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono font-bold">
                      <span class="px-2 py-0.5 rounded ${
                        m.excedida
                          ? 'bg-rose-600 text-white'
                          : m.completada
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }">
                        ${m.horasAsignadas}/${m.horasSemanales} hs
                      </span>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      <div class="font-mono font-bold text-white">${m.formatoBloques}</div>
                      <div class="text-[10px] ${
                        m.modoExigencia === 'OBLIGATORIO' ? 'text-blue-400' : 'text-amber-300'
                      }">${m.modoExigencia}</div>
                    </td>
                    <td class="py-2.5 px-3 text-right whitespace-nowrap">
                      <button data-edit-materia="${m.id}"
                        class="px-2.5 py-1 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-[11px] font-semibold transition mr-1">
                        ✏️ Editar
                      </button>
                      <button data-del-materia="${m.id}"
                        class="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-semibold transition">
                        🗑️
                      </button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    function actualizarValidacionFormato() {
      const inpH = document.getElementById('inp-mat-horas');
      const inpF = document.getElementById('inp-mat-formato');
      const lbl = document.getElementById('validacion-formato-horas');
      if (!inpH || !inpF || !lbl) return;

      const horas = parseInt(inpH.value, 10) || 0;
      const partes = inpF.value
        .split('+')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n > 0);
      const suma = partes.reduce((a, b) => a + b, 0);

      if (suma === horas) {
        lbl.className = 'text-[10px] font-semibold text-emerald-400';
        lbl.textContent = `✅ Suma de bloques: ${suma} hs (coincide)`;
      } else {
        lbl.className = 'text-[10px] font-semibold text-amber-400';
        lbl.textContent = `⚠️ Formato suma ${suma} hs vs ${horas} hs semanales`;
      }
    }

    actualizarValidacionFormato();
    document.getElementById('inp-mat-horas')?.addEventListener('input', actualizarValidacionFormato);
    document.getElementById('inp-mat-formato')?.addEventListener('input', actualizarValidacionFormato);

    // Selección de curso
    subContainer.querySelectorAll('[data-abm-mat-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abmState.materiaCursoId = btn.getAttribute('data-abm-mat-curso');
        abmState.materiaEditandoId = null;
        renderizarSubTabMaterias(subContainer, uiState, callbacks);
      });
    });

    // Chips rápidos de formato
    subContainer.querySelectorAll('[data-chip-formato]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const fmt = chip.getAttribute('data-chip-formato');
        const suma = fmt
          .split('+')
          .map((n) => parseInt(n, 10))
          .reduce((a, b) => a + b, 0);
        document.getElementById('inp-mat-formato').value = fmt;
        document.getElementById('inp-mat-horas').value = suma;
        actualizarValidacionFormato();
      });
    });

    // Chips rápidos de color
    subContainer.querySelectorAll('[data-chip-color]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.getElementById('inp-mat-color').value = chip.getAttribute('data-chip-color');
      });
    });

    // Cancelar edición
    document.getElementById('btn-cancelar-edit-materia')?.addEventListener('click', () => {
      abmState.materiaEditandoId = null;
      renderizarSubTabMaterias(subContainer, uiState, callbacks);
    });

    // Editar materia existente
    subContainer.querySelectorAll('[data-edit-materia]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abmState.materiaEditandoId = btn.getAttribute('data-edit-materia');
        renderizarSubTabMaterias(subContainer, uiState, callbacks);
      });
    });

    // Eliminar materia
    subContainer.querySelectorAll('[data-del-materia]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matId = btn.getAttribute('data-del-materia');
        try {
          uiState.resumen = window.sghAPI.eliminarMateria(matId);
          if (abmState.materiaEditandoId === matId) abmState.materiaEditandoId = null;
          callbacks.onStateUpdated('Materia eliminada correctamente.', 'info');
        } catch (err) {
          callbacks.mostrarToast(err.message, 'error');
        }
      });
    });

    // Submit guardar materia
    document.getElementById('form-abm-materia')?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const docentesSeleccionados = Array.from(
          subContainer.querySelectorAll('input[name="chk-mat-docente"]:checked')
        ).map((chk) => chk.value);

        const payload = {
          id: abmState.materiaEditandoId,
          cursoId: cursoActual.id,
          nombre: document.getElementById('inp-mat-nombre').value,
          codigo: document.getElementById('inp-mat-codigo').value,
          horasSemanales: parseInt(document.getElementById('inp-mat-horas').value, 10),
          formatoBloques: document.getElementById('inp-mat-formato').value,
          modoExigencia: document.getElementById('inp-mat-modo').value,
          color: document.getElementById('inp-mat-color').value,
          docentesIds: docentesSeleccionados
        };

        uiState.resumen = window.sghAPI.guardarMateria(payload);
        abmState.materiaEditandoId = null;
        callbacks.onStateUpdated(`Materia "${payload.nombre}" guardada en ${cursoActual.nombre}.`, 'success');
      } catch (err) {
        callbacks.mostrarToast(err.message, 'error');
      }
    });
  }

  // =========================================================================
  // SUB-TAB 3: ABM DE CURSOS Y DIVISIONES
  // =========================================================================
  function renderizarSubTabCursos(subContainer, uiState, callbacks) {
    const { estado } = uiState.resumen;
    const cursoEditando = abmState.cursoEditandoId
      ? estado.cursos.find((c) => c.id === abmState.cursoEditandoId)
      : null;

    subContainer.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Formulario Crear / Editar Curso (4 cols) -->
        <form id="form-abm-curso" class="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div>
              <h3 class="text-sm font-bold text-white">
                ${cursoEditando ? `✏️ Editando Curso: ${cursoEditando.nombre}` : '➕ Agregar Nuevo Curso / División'}
              </h3>
              <p class="text-[11px] text-slate-400">Parametrización dinámica de cursos de la escuela.</p>
            </div>
            ${
              cursoEditando
                ? `<button type="button" id="btn-cancel-curso" class="text-xs text-slate-400 hover:text-white">✕</button>`
                : ''
            }
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <div class="col-span-2">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre del Curso</label>
              <input type="text" id="inp-curso-nombre" required
                value="${cursoEditando ? cursoEditando.nombre : `${estado.cursos.length + 1}° Año`}"
                placeholder="Ej: 6° Año"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">División</label>
              <input type="text" id="inp-curso-div" required
                value="${cursoEditando ? cursoEditando.division : 'A'}"
                placeholder="Ej: A, B"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nivel / Año Numérico</label>
              <input type="number" id="inp-curso-nivel" min="1" max="12" required
                value="${cursoEditando ? cursoEditando.nivel : estado.cursos.length + 1}"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Aula / Salón</label>
              <input type="text" id="inp-curso-aula" required
                value="${cursoEditando ? cursoEditando.aula : `Aula ${200 + estado.cursos.length + 1}`}"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <button type="submit"
            class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/40 transition">
            ${cursoEditando ? '💾 Guardar Cambios del Curso' : '➕ Crear Curso / División'}
          </button>
        </form>

        <!-- Listado de Cursos Activos (8 cols) -->
        <div class="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 class="text-sm font-bold text-white mb-3">🏫 Cursos y Divisiones Configurados (${estado.cursos.length})</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${estado.cursos
              .map((c) => {
                const mats = estado.materias.filter((m) => m.cursoId === c.id);
                const hsReq = mats.reduce((acc, m) => acc + m.horasSemanales, 0);
                const hsAsig = estado.asignaciones.filter((a) => a.cursoId === c.id).length;

                return `
                  <div class="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-black text-white">${c.nombre} "${c.division}"</span>
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">${c.aula}</span>
                      </div>
                      <div class="text-xs text-slate-400 mt-1">
                        <strong>${mats.length}</strong> materias · <strong class="text-emerald-400 font-mono">${hsAsig}/${hsReq} hs</strong> asignadas
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button data-ir-materias-curso="${c.id}"
                        class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold transition">
                        📚 Materias
                      </button>
                      <button data-edit-curso="${c.id}"
                        class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-semibold transition">
                        ✏️
                      </button>
                      <button data-del-curso="${c.id}"
                        class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-semibold transition">
                        🗑️
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-cancel-curso')?.addEventListener('click', () => {
      abmState.cursoEditandoId = null;
      renderizarSubTabCursos(subContainer, uiState, callbacks);
    });

    subContainer.querySelectorAll('[data-edit-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abmState.cursoEditandoId = btn.getAttribute('data-edit-curso');
        renderizarSubTabCursos(subContainer, uiState, callbacks);
      });
    });

    subContainer.querySelectorAll('[data-ir-materias-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abmState.materiaCursoId = btn.getAttribute('data-ir-materias-curso');
        abmState.subTab = 'materias';
        renderizarVistaConfiguracion(uiState, callbacks);
      });
    });

    subContainer.querySelectorAll('[data-del-curso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cId = btn.getAttribute('data-del-curso');
        try {
          uiState.resumen = window.sghAPI.eliminarCurso(cId);
          if (uiState.cursoSeleccionadoId === cId && uiState.resumen.estado.cursos.length > 0) {
            uiState.cursoSeleccionadoId = uiState.resumen.estado.cursos[0].id;
          }
          callbacks.onStateUpdated('Curso eliminado correctamente.', 'info');
        } catch (err) {
          callbacks.mostrarToast(err.message, 'error');
        }
      });
    });

    document.getElementById('form-abm-curso')?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const payload = {
          id: abmState.cursoEditandoId,
          nombre: document.getElementById('inp-curso-nombre').value,
          division: document.getElementById('inp-curso-div').value,
          nivel: parseInt(document.getElementById('inp-curso-nivel').value, 10),
          aula: document.getElementById('inp-curso-aula').value
        };
        uiState.resumen = window.sghAPI.guardarCurso(payload);
        abmState.cursoEditandoId = null;
        callbacks.onStateUpdated(`Curso "${payload.nombre}" guardado correctamente.`, 'success');
      } catch (err) {
        callbacks.mostrarToast(err.message, 'error');
      }
    });
  }

  // =========================================================================
  // SUB-TAB 4: COLEGIO (DATOS, LOGO / SIGLAS, DÍAS HÁBILES, BLOQUES Y RECREOS)
  // =========================================================================
  function renderizarSubTabInstitucion(subContainer, uiState, callbacks) {
    const { estado } = uiState.resumen;
    const diasPosibles = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    if (!abmState.bloquesBorradorEditor) {
      abmState.bloquesBorradorEditor = JSON.parse(
        JSON.stringify(estado.configuracion.bloquesHorarios)
      );
    }

    if (abmState.logoBase64Borrador === undefined) {
      abmState.logoBase64Borrador = estado.configuracion.logoBase64 || null;
    }

    const siglasActuales = estado.configuracion.siglasColegio || 'SGH';
    const logoActual = abmState.logoBase64Borrador;

    // Calcular segmentos en vivo sobre el borrador del editor para mostrar vista previa
    let segCounter = 1;
    const capMap = {};
    abmState.bloquesBorradorEditor.forEach((b, idx) => {
      b.indice = idx;
      b.numero = idx + 1;
      b.segmento = segCounter;
      capMap[segCounter] = (capMap[segCounter] || 0) + 1;
      if (b.recreoPosterior) segCounter++;
    });
    abmState.bloquesBorradorEditor.forEach((b) => {
      b.capacidadSegmento = capMap[b.segmento] || 1;
    });

    subContainer.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Columna Izquierda (4 cols): Datos del Colegio, Logo/Siglas y Días Hábiles -->
        <form id="form-config-institucion" class="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div>
            <h3 class="text-sm font-bold text-white">🏫 Datos del Colegio e Identidad Visual</h3>
            <p class="text-[11px] text-slate-400">Personaliza el nombre, el escudo/logo o las siglas y los días de cursada.</p>
          </div>

          <!-- Identidad Visual: Foto Cuadrada (Logo) o Siglas -->
          <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
            <label class="block text-[10px] font-bold text-slate-400 uppercase">Logo del Colegio o Siglas (Esquina Superior Izquierda)</label>
            <div class="flex items-center gap-3.5">
              <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg font-black text-xl tracking-wider text-white overflow-hidden shrink-0 border border-blue-400/30">
                ${
                  logoActual
                    ? `<img src="${logoActual}" alt="Vista previa del logo" class="w-full h-full object-cover" />`
                    : `<span id="preview-siglas-colegio">${siglasActuales}</span>`
                }
              </div>
              <div class="flex-1 space-y-1.5">
                <input type="file" id="inp-inst-logo-file" accept="image/*" class="hidden" />
                <div class="flex flex-wrap items-center gap-1.5">
                  <button type="button" id="btn-subir-logo-colegio"
                    class="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition">
                    📷 Subir Foto Cuadrada
                  </button>
                  ${
                    logoActual
                      ? `<button type="button" id="btn-quitar-logo-colegio"
                          class="px-2.5 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold transition">
                          🗑️ Usar Siglas
                        </button>`
                      : ''
                  }
                </div>
                <p class="text-[10px] text-slate-400">
                  Puedes subir una imagen (se adaptará en formato cuadrado) o mantener las siglas debajo.
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/80">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Siglas del Colegio</label>
                <input type="text" id="inp-inst-siglas" maxlength="5" required
                  value="${siglasActuales}"
                  placeholder="Ej: SGH"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold uppercase focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ciclo Lectivo</label>
                <input type="text" id="inp-inst-ciclo" required
                  value="${estado.configuracion.cicloLectivo}"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre del Colegio</label>
            <input type="text" id="inp-inst-nombre" required
              value="${estado.configuracion.nombreColegio}"
              class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none" />
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Días de Cursada</label>
            <div class="grid grid-cols-2 gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
              ${diasPosibles
                .map((dia) => {
                  const activo = estado.configuracion.diasHabiles.includes(dia);
                  return `
                    <label class="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input type="checkbox" name="chk-dia-habil" value="${dia}" ${activo ? 'checked' : ''}
                        class="rounded border-slate-700 text-blue-600" />
                      <span>${dia}</span>
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>

          <button type="submit"
            class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/40 transition">
            💾 Guardar Datos del Colegio
          </button>
        </form>

        <!-- Columna Derecha (8 cols): Configuración de Bloques Horarios y Recreos -->
        <div class="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-bold text-white">⏱️ Horarios de Bloques y Recreos</h3>
              <p class="text-[11px] text-slate-400">
                Marca en qué bloques hay un <strong>Recreo Posterior</strong> para organizar la jornada diaria.
              </p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button type="button" id="btn-agregar-bloque-editor"
                class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200">
                + Agregar Bloque
              </button>
              <button type="button" id="btn-quitar-bloque-editor"
                class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200">
                - Quitar Último
              </button>
              <button type="button" id="btn-restaurar-12-bloques"
                class="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-semibold text-amber-300">
                🔄 Restaurar 12 Bloques
              </button>
              <button type="button" id="btn-guardar-grilla-bloques"
                class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow">
                💾 Guardar Grilla Horaria
              </button>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th class="py-2 px-3">Bloque</th>
                  <th class="py-2 px-3">Hora Inicio</th>
                  <th class="py-2 px-3">Hora Fin</th>
                  <th class="py-2 px-3">Tramo Continuo</th>
                  <th class="py-2 px-3">¿Tiene Recreo Después?</th>
                  <th class="py-2 px-3">Descripción del Recreo</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/70">
                ${abmState.bloquesBorradorEditor
                  .map(
                    (b, idx) => `
                  <tr class="hover:bg-slate-800/30">
                    <td class="py-2 px-3 font-bold text-white">${b.nombre}</td>
                    <td class="py-2 px-3">
                      <input type="text" data-edit-b-inicio="${idx}" value="${b.inicio}"
                        class="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white" />
                    </td>
                    <td class="py-2 px-3">
                      <input type="text" data-edit-b-fin="${idx}" value="${b.fin}"
                        class="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white" />
                    </td>
                    <td class="py-2 px-3">
                      <span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[11px] font-semibold">
                        Tramo ${b.segmento} (${b.capacidadSegmento} hs)
                      </span>
                    </td>
                    <td class="py-2 px-3">
                      <label class="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" data-edit-b-recreo-chk="${idx}" ${b.recreoPosterior ? 'checked' : ''}
                          ${idx === abmState.bloquesBorradorEditor.length - 1 ? 'disabled' : ''}
                          class="rounded border-slate-700 text-amber-500" />
                        <span class="text-[11px] ${b.recreoPosterior ? 'text-amber-300 font-bold' : 'text-slate-500'}">
                          ${b.recreoPosterior ? '☕ Sí, hay recreo' : 'No (Continuo)'}
                        </span>
                      </label>
                    </td>
                    <td class="py-2 px-3">
                      ${
                        b.recreoPosterior
                          ? `<input type="text" data-edit-b-recreo-lbl="${idx}" value="${b.recreoPosterior.etiqueta}"
                              class="w-full bg-slate-950 border border-amber-500/40 rounded px-2 py-1 text-[11px] text-amber-200" />`
                          : `<span class="text-slate-600 text-[11px]">—</span>`
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
      </div>
    `;

    // Actualizar vista previa de siglas en vivo
    document.getElementById('inp-inst-siglas')?.addEventListener('input', (e) => {
      const prev = document.getElementById('preview-siglas-colegio');
      if (prev) {
        prev.textContent = (e.target.value || 'SGH').toUpperCase().slice(0, 5);
      }
    });

    // Subir foto cuadrada para el logo del colegio
    document.getElementById('btn-subir-logo-colegio')?.addEventListener('click', () => {
      document.getElementById('inp-inst-logo-file')?.click();
    });

    document.getElementById('inp-inst-logo-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          // Recortar al centro en formato cuadrado de 128x128 px
          const canvas = document.createElement('canvas');
          const size = 128;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          abmState.logoBase64Borrador = canvas.toDataURL('image/png');
          renderizarSubTabInstitucion(subContainer, uiState, callbacks);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-quitar-logo-colegio')?.addEventListener('click', () => {
      abmState.logoBase64Borrador = null;
      renderizarSubTabInstitucion(subContainer, uiState, callbacks);
    });

    // Guardar institución, logo/siglas y días hábiles
    document.getElementById('form-config-institucion')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const diasSeleccionados = Array.from(
        subContainer.querySelectorAll('input[name="chk-dia-habil"]:checked')
      ).map((chk) => chk.value);

      if (diasSeleccionados.length === 0) {
        callbacks.mostrarToast('Debes seleccionar al menos 1 día de cursada.', 'error');
        return;
      }

      uiState.resumen = window.sghAPI.actualizarConfiguracionInstitucion({
        nombreColegio: document.getElementById('inp-inst-nombre').value,
        cicloLectivo: document.getElementById('inp-inst-ciclo').value,
        siglasColegio: document.getElementById('inp-inst-siglas').value,
        logoBase64: abmState.logoBase64Borrador,
        diasHabiles: diasSeleccionados
      });
      callbacks.onStateUpdated('Datos del colegio actualizados correctamente.', 'success');
    });

    // Eventos del editor de bloques y recreos
    subContainer.querySelectorAll('[data-edit-b-inicio]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-edit-b-inicio'), 10);
        abmState.bloquesBorradorEditor[idx].inicio = inp.value;
      });
    });

    subContainer.querySelectorAll('[data-edit-b-fin]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-edit-b-fin'), 10);
        abmState.bloquesBorradorEditor[idx].fin = inp.value;
      });
    });

    subContainer.querySelectorAll('[data-edit-b-recreo-chk]').forEach((chk) => {
      chk.addEventListener('change', () => {
        const idx = parseInt(chk.getAttribute('data-edit-b-recreo-chk'), 10);
        const b = abmState.bloquesBorradorEditor[idx];
        const sig = abmState.bloquesBorradorEditor[idx + 1];
        if (chk.checked) {
          b.recreoPosterior = {
            duracionMin: 10,
            inicio: b.fin,
            fin: sig ? sig.inicio : b.fin,
            etiqueta: `Recreo (${b.fin} - ${sig ? sig.inicio : b.fin})`
          };
        } else {
          b.recreoPosterior = null;
        }
        renderizarSubTabInstitucion(subContainer, uiState, callbacks);
      });
    });

    subContainer.querySelectorAll('[data-edit-b-recreo-lbl]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.getAttribute('data-edit-b-recreo-lbl'), 10);
        if (abmState.bloquesBorradorEditor[idx].recreoPosterior) {
          abmState.bloquesBorradorEditor[idx].recreoPosterior.etiqueta = inp.value;
        }
      });
    });

    document.getElementById('btn-agregar-bloque-editor')?.addEventListener('click', () => {
      const cant = abmState.bloquesBorradorEditor.length;
      const ultimo = abmState.bloquesBorradorEditor[cant - 1];
      abmState.bloquesBorradorEditor.push({
        id: `b${cant + 1}`,
        indice: cant,
        numero: cant + 1,
        nombre: `Bloque ${cant + 1}`,
        inicio: ultimo ? ultimo.fin : '16:40',
        fin: '17:20',
        duracionMin: 40,
        recreoPosterior: null
      });
      renderizarSubTabInstitucion(subContainer, uiState, callbacks);
    });

    document.getElementById('btn-quitar-bloque-editor')?.addEventListener('click', () => {
      if (abmState.bloquesBorradorEditor.length <= 1) return;
      abmState.bloquesBorradorEditor.pop();
      const nuevoUltimo = abmState.bloquesBorradorEditor[abmState.bloquesBorradorEditor.length - 1];
      if (nuevoUltimo) nuevoUltimo.recreoPosterior = null;
      renderizarSubTabInstitucion(subContainer, uiState, callbacks);
    });

    document.getElementById('btn-restaurar-12-bloques')?.addEventListener('click', () => {
      uiState.resumen = window.sghAPI.restaurarPlantillaBloquesDefault();
      abmState.bloquesBorradorEditor = null;
      callbacks.onStateUpdated('Plantilla oficial de 12 bloques (07:50 a 16:40) restaurada.', 'success');
    });

    document.getElementById('btn-guardar-grilla-bloques')?.addEventListener('click', () => {
      try {
        uiState.resumen = window.sghAPI.actualizarGrillaBloquesHorarios(
          abmState.bloquesBorradorEditor
        );
        abmState.bloquesBorradorEditor = null;
        callbacks.onStateUpdated('Grilla de bloques horarios y segmentos continuos actualizada.', 'success');
      } catch (err) {
        callbacks.mostrarToast(err.message, 'error');
      }
    });
  }

  window.SGHConfigABM = {
    renderizarVistaConfiguracion,
    conectarEventosPintarConMouse,
    abrirSubTab(nombreSubTab) {
      abmState.subTab = nombreSubTab;
    }
  };
})();
