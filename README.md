# SGH — Sistema de Gestión Horaria Escolar

Aplicación de escritorio **100% offline y portable para Windows** diseñada para la planificación, optimización, detección de conflictos y reestructuración inteligente de horarios escolares mediante **movimientos directos, enroques automáticos y simulación de escenarios**.

---

## ✨ Características Principales

### 1. Vistas Operativas e Interacción Visual
- **📊 Resumen General (Dashboard)**: Indicadores clave en tiempo real (cobertura horaria, choques docentes, total de horas libres en la escuela y progreso por curso) con accesos directos a exportación institucional.
- **🏫 Vista por Curso**:
  - Grilla semanal completa con recreos intercalados, bandeja lateral filtrable (`Todas`, `Pendientes`, `Completas`, `Alertas`), barra de progreso (`asignadas / requeridas`) y selector rápido entre **`1 Hora Individual`** y **`📦 Bloque Agrupado (2h/3h)`**.
  - **🚦 Semáforo en Tiempo Real**: Al seleccionar o arrastrar una materia (tanto si tiene horas pendientes como si ya tiene su carga horaria completa), se despliega en la parte superior la leyenda interactiva y se iluminan los destinos en la grilla:
    - 🟢 **Verde**: Horario libre óptimo para todos los docentes requeridos (con insignia cuando cierra horas libres).
    - 🟡 **Amarillo**: Asignable con aviso pedagógico (corte por recreo o incremento de horas libres).
    - 🔵 **Azul**: Enroque directo `1 a 1` válido con otra materia del curso.
    - 🟣 **Violeta**: Enroque triangular (`A → B → C → A`) válido entre 3 materias.
    - 🔴 **Rojo**: No disponible por choque horario en otro curso, indisponibilidad docente o reserva de almuerzo.
  - **🍽️ Bloques de Almuerzo**: Permite reservar casilleros horarios para el **Almuerzo** con un color naranja distintivo haciendo **clic derecho** sobre el bloque o activando el botón **`🍽️ Almuerzo`** de la barra superior (habilitable/deshabilitable desde Configuración).
- **👩‍🏫 Vista por Docente**:
  - Agenda semanal personal con superposición en tiempo real de disponibilidad declarada, clases dictadas, choques y **horas libres** entre clases.
  - Modo **🖌️ Pintar Disponibilidad con el Mouse** directo sobre la grilla.
  - Panel lateral **📚 Materias a Cargo** para asignar o reubicar horas directamente desde la vista del profesor validando cupo semanal, almuerzos y disponibilidad del curso destino.
- **🚨 Choques y Horas Libres**: Centro unificado de diagnóstico con explicación clara de cada superposición horaria, clases fuera del horario disponible del docente, excesos, cortes por recreo y desglose día por día de horas libres por profesor.

### 2. Motor Inteligente de Propuestas, Enroques y `🎯 Movimiento Deseado`
Al seleccionar cualquier materia en bandeja o bloque en la grilla (`1h`, `2h` o `3h`), el motor analiza todas las combinaciones válidas del curso y las ordena priorizando la **reducción neta de horas libres (`ΔHorasLibres`)**:
- 🟢 **Horario Libre Directo**: Casilleros vacíos donde todos los docentes titulares o pareja pedagógica pueden asistir sin choques.
- 🔵 **Enroque Directo 1 a 1 (`A ↔ B`)**: Intercambio atómico entre dos materias del curso (o desplazamiento desde bandeja `A → B → Libre`) validando en simultáneo la disponibilidad cruzada de todos los docentes involucrados.
- 🟣 **Enroque Triangular (`A → B → C → A`)**: Rotación coordinada entre 3 materias cuando un intercambio directo no es posible por disponibilidad docente.
- 🎯 **Asistente de "Movimiento Deseado" (Cobertura de Bloque Puntual)**: Accesible desde un botón dedicado sin recargar la interfaz principal. Permite indicar qué **Materia** o **Docente** se necesita ubicar en un **Curso, Día y Bloque específico**, muestra un indicador visual mientras calcula todas las combinaciones posibles, diagnostica los obstáculos actuales y propone paso a paso los cambios o enroques exactos para destrabar el movimiento en 1 clic.
- 🔍 **Modal de Confirmación de Impacto**: Antes de aplicar un movimiento o enroque, exhibe el resumen completo (`Sale de` → `Ingresa a`), los docentes involucrados y la variación exacta en sus horas libres semanales.

> 💡 **Caso de Prueba Incluido en los Datos de Ejemplo (`1° Año`)**:
> Al abrir **Vista por Curso → `1° Año`** (o **Vista por Docente → `Prof. Martín Gómez`**) y seleccionar **Matemática I** (`Miércoles B10-B12`) o abrir **`🎯 Movimiento Deseado`** sobre `Martes · Bloque 5`, el sistema lista de inmediato alternativas en **Horario Libre**, **Enroque 1 a 1** y **Enroque Triangular**, incluyendo la combinación óptima que **elimina 6 horas libres (`-6 hs`)** en un solo paso.

### 3. Administración Institucional (ABM Completo)
- **Colegio**: Nombre institucional, siglas personalizables o carga de **logo cuadrado**, días hábiles activos y configuración de bloques horarios + recreos con normalización automática.
- **Cursos**: Alta, edición y baja segura de cursos y divisiones.
- **Materias**: Carga horaria semanal, formato pedagógico de bloques (`3+3`, `2+2+2`, `2+1`, etc.), nivel de exigencia y soporte nativo para **Pareja Pedagógica / Co-docencia (múltiples docentes por materia)**.
- **Docentes**: Legajo, especialidad, carga máxima deseada y matriz interactiva de disponibilidad horaria con plantillas rápidas (*Turno Mañana*, *Turno Tarde*, *Jornada Completa*, *Limpiar*).

### 4. Simulación, Copias de Seguridad y Parámetros Personalizables
- **🧪 Modo Simulación**: Borrador aislado para ensayar reestructuraciones sin alterar el **Horario Oficial**, con comparador de diferencias (*Diff* celda por celda y variación de horas libres) y posibilidad de **guardar y cargar múltiples simulaciones** en disco para retomarlas más adelante.
- **↩ Deshacer / Rehacer Ilimitado**: Historial transaccional completo (`Ctrl+Z` / `Ctrl+Y`) y **Registro de Auditoría**.
- **⚙️ Configuración y Parámetros del Sistema**:
  - Interruptores individuales para activar o desactivar cada regla y advertencia (choques docentes, disponibilidad, cortes por recreo, horas libres, exceso de horas, formato de bloques, validación de tope en vista docente, ventana previa de impacto, notificaciones emergentes y bloques de **Almuerzo**).
  - **Modo Oscuro** y **Modo Claro** adaptados en todas las vistas.
  - **💾 Copias de Seguridad**: Resguardo atómico local en JSON, restauración en 1 clic, eliminación individual y **limpieza automática de copias antiguas** para cuidar el espacio en disco.

### 5. Exportación Profesional a Excel (`.xlsx`) y PDF (`.pdf` A4 Horizontal)
- 📗 **Excel Nativo (`.xlsx`)**: Planillas listas para compartir o editar con encabezado institucional, colores por materia, bloques de almuerzo, recreos limpios y tabla resumen de carga horaria y plantel docente.
- 📕 **PDF A4 Horizontal (`.pdf`)**: Diseño optimizado para impresión en hoja **A4 Paisaje** con columnas diferenciadas de **`Hora`** (`1` a `12`) y **`Horario`** de alta legibilidad, sin dependencias externas.
- 📦 **Exportación Individual y Masiva**: Por **Curso**, por **Docente**, **Todos los Cursos**, **Todos los Docentes** o **Reporte Institucional Completo** en un único documento.

---

## 🛠️ Arquitectura y Estructura del Proyecto

- **Runtime Desktop**: [Electron](https://www.electronjs.org/) (ejecución 100% local sin servidores ni conexión a Internet).
- **Motor de Planillas e Impresión**: [ExcelJS](https://github.com/exceljs/exceljs) + motor nativo Chromium `printToPDF` A4 Horizontal.
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/) compilado localmente (`src/renderer/styles/output.css`).

```text
├── scripts/
│   └── build_portable.js        # Empaquetador portable offline determinístico para Windows
├── src/
│   ├── domain/                  # Lógica de dominio pura (esquema, métricas, semáforo, enroques, movimiento deseado, estado y semilla)
│   ├── main/                    # Proceso principal Electron, preload IPC seguro, persistencia JSON (storage.js) y exportador Excel/PDF
│   └── renderer/                # Interfaz gráfica (index.html, app.js, configAbm.js y hojas de estilo Tailwind)
├── tests/                       # Suites de pruebas automatizadas (phase1.test.js a phase5.test.js)
├── SPEC_SGH.md                  # Especificación funcional y técnica del sistema
├── iniciar_sgh.bat              # Lanzador rápido en entorno de desarrollo (Windows)
├── crear_acceso_directo.bat     # Crea el acceso directo en el Escritorio de Windows
└── empaquetar_portable.bat      # Compila estilos y genera la carpeta distribuible dist_portable\SGH_Portable
```

---

## 🚀 Instalación y Uso (Desarrollo)

### Requisitos Previos
- **Node.js** 18 o superior.

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone https://github.com/EliasUpstein/SGH.git
cd SGH
npm install
```

### 2. Iniciar la aplicación
```bash
npm start
```
*(En Windows también puedes abrirla con doble clic sobre `iniciar_sgh.bat`).*

### 3. Compilar estilos CSS (al modificar estilos o vistas)
```bash
npm run build:css
```

### 4. Ejecutar la suite completa de pruebas automatizadas
```bash
npm test
```

---

## 📦 Generar Versión Portable e Instalar en otra PC (Windows)

Para generar la carpeta ejecutable lista para entregar a un colegio o usuario final:

```bash
npm run pack:portable
```
*(O haciendo doble clic sobre `empaquetar_portable.bat`).*

Esto construye y verifica automáticamente la carpeta autocontenida **`dist_portable\SGH_Portable`**.

### ¿Cómo llevar la aplicación a la computadora de un usuario final?
1. Copia **únicamente la carpeta `dist_portable\SGH_Portable`** (comprimida en `.zip` o en un pendrive) a cualquier ubicación de la PC destino (por ejemplo `C:\SGH_Portable` o `Documentos\SGH_Portable`). **No es necesario copiar el resto del repositorio ni instalar Node.js ni tener Internet.**
2. Dentro de `SGH_Portable`, ejecuta **`SGH - Gestion Horaria Escolar.exe`** para usar el sistema directamente.
3. *(Opcional)* Ejecuta una única vez **`crear_acceso_directo.bat`** dentro de esa carpeta para crear el acceso directo **`SGH - Gestion Horaria Escolar`** en el Escritorio del usuario. Todos los datos, simulaciones y copias de seguridad se guardan localmente en `SGH_Portable\data`.

---

## 👤 Autor y Contacto

- **Desarrollado por**: Elias Upstein
- **Contacto**: [eliasupstein@gmail.com](mailto:eliasupstein@gmail.com)
