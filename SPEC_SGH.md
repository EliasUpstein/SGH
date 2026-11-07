# Especificación Técnica y Funcional: SGH (Sistema de Gestión Horaria Escolar)

## 1. Rol y Objetivo del Sistema
Actúa como un Arquitecto de Software Senior y Desarrollador Full-Stack especializado en aplicaciones de escritorio portables (Electron + HTML5/CSS3/JS).
Tu objetivo es construir **SGH (Sistema de Gestión Horaria)**, una aplicación de escritorio **100% offline y portable** para administrar, simular y optimizar la asignación y el movimiento de horarios (enroques) en escuelas secundarias.

---

## 2. Stack Tecnológico y Restricciones de Portabilidad
- **Runtime de Escritorio:** Electron (configurado con `electron-builder` hacia target `dir` / `portable` para generar una carpeta autocontenida que no requiera instalación ni permisos de administrador).
- **Frontend / UI:** HTML5, Tailwind CSS (local/compilado, sin depender de CDN externo para funcionar offline) y JavaScript moderno (ES6+ modular) o React/Vite empaquetado.
- **Persistencia de Datos Local (Cero Servidor):** Almacenamiento local autocontenido en una carpeta `./data/` relativa al ejecutable (usando `sql.js` para SQLite en WebAssembly o persistencia atómica JSON estructurada con backups automáticos en `./data/backups/`). **No se debe requerir ningún motor SQL instalado en el sistema operativo.**
- **Exportación de Documentos:**
  - **PDF:** Generación nativa mediante `webContents.printToPDF()` de Electron con hojas de estilo `@media print` optimizadas en A4 Horizontal (apaisado).
  - **Excel (`.xlsx`):** Librería `exceljs` o `xlsx` (SheetJS) generando planillas con formato visual, colores de estado, bordes y celdas combinadas.

---

## 3. Reglas de Negocio y Modelo de Dominio

### 3.1. Generalización y Parametrización Escolar (Multi-Colegio)
El sistema debe ser agnóstico y parametrizable para poder exportarse a distintos colegios:
- Permitir configurar **Días Hábiles** (por defecto: Lunes a Viernes).
- Permitir configurar **Cursos/Divisiones** dinámicamente.
- Permitir configurar la **Grilla de Bloques Horarios (Horas Cátedra)** indicando hora de inicio, hora de fin y si existe un **Recreo / Corte** inmediatamente después de dicho bloque.

#### Plantilla Preconfigurada por Defecto (Secundaria 1° a 5° Año - 12 Horas Cátedra de 40 min):
El sistema debe iniciar por defecto con 5 cursos (`1° Año`, `2° Año`, `3° Año`, `4° Año`, `5° Año`) y la siguiente estructura diaria dividida en **5 Segmentos Continuos** separados por 4 recreos:

| Bloque | Horario | Segmento Continuo | Recreo Posterior |
| :--- | :--- | :--- | :--- |
| **Bloque 1** | 07:50 a 08:30 | Segmento 1 (Capacidad: 2 hs) | No |
| **Bloque 2** | 08:30 a 09:10 | Segmento 1 (Capacidad: 2 hs) | **Sí (Recreo 10 min: 09:10 - 09:20)** |
| **Bloque 3** | 09:20 a 10:00 | Segmento 2 (Capacidad: 2 hs) | No |
| **Bloque 4** | 10:00 a 10:40 | Segmento 2 (Capacidad: 2 hs) | **Sí (Recreo 15 min: 10:40 - 10:55)** |
| **Bloque 5** | 10:55 a 11:35 | Segmento 3 (Capacidad: 3 hs) | No |
| **Bloque 6** | 11:35 a 12:15 | Segmento 3 (Capacidad: 3 hs) | No |
| **Bloque 7** | 12:15 a 12:55 | Segmento 3 (Capacidad: 3 hs) | **Sí (Corte/Recreo 15 min: 12:55 - 13:10)** |
| **Bloque 8** | 13:10 a 13:50 | Segmento 4 (Capacidad: 2 hs) | No |
| **Bloque 9** | 13:50 a 14:30 | Segmento 4 (Capacidad: 2 hs) | **Sí (Recreo 10 min: 14:30 - 14:40)** |
| **Bloque 10**| 14:40 a 15:20 | Segmento 5 (Capacidad: 3 hs) | No |
| **Bloque 11**| 15:20 a 16:00 | Segmento 5 (Capacidad: 3 hs) | No |
| **Bloque 12**| 16:00 a 16:40 | Segmento 5 (Capacidad: 3 hs) | Fin de jornada |

### 3.2. Materias, Docentes Múltiples y Agrupación por Bloques
- Cada **Curso** tiene múltiples **Materias**.
- Cada **Materia por Curso** define:
  - `horasSemanales`: Cantidad total de horas cátedra a dictar en la semana.
  - `docentesIds`: Array de 1 o más docentes asignados simultáneamente a la materia (ej. titular + auxiliar o pareja pedagógica). **Regla dura:** Para asignar o mover la materia a un bloque $(Día, Hora)$, **TODOS** los docentes asociados a esa materia deben estar disponibles en ese bloque y ninguno puede estar asignado a otro curso en ese mismo instante.
  - `formatoBloques`: Configuración de cómo agrupar las horas semanales (ej. `2+2`, `2+1`, `3`, `1+1`) y el modo de exigencia (`OBLIGATORIO` o `IDEAL/OPCIONAL`).

### 3.3. Regla de Continuidad y No-Interrupción por Recreos
- Los bloques de una misma materia en un día **NO deben ser interrumpidos por un recreo**, a menos que la duración del bloque diario de esa materia exceda la cantidad de horas del segmento continuo donde se ubica.
  - *Ejemplo 1:* Un bloque de 2 horas cátedra de Historia **debe** ubicarse dentro de un mismo segmento continuo (ej. Bloques 1-2, o Bloques 3-4, o dentro de 5-6-7), **nunca** a caballo de un recreo (ej. Bloques 2 y 3), salvo que la regla esté configurada como `IDEAL` y el usuario fuerce el movimiento manualmente.
  - *Ejemplo 2:* Un bloque de 3 horas de Matemática ubicado por la mañana (donde los Segmentos 1 y 2 tienen solo 2 horas cada uno) **sí tiene permitido** cruzar el recreo de las 09:10 (ocupando los Bloques 1, 2 y 3 de forma contigua).

### 3.4. Minimización Crítica de "Horas Puente" (Huecos Docentes)
- Una **Hora Puente** ocurre cuando un docente tiene horas libres intercaladas entre su primera y su última hora de clase asignada en un mismo día.
- Fórmula por docente $p$ en el día $d$:
  `HorasPuente(p, d) = (IndiceUltimoBloqueAsignado - IndicePrimerBloqueAsignado + 1) - CantidadBloquesAsignadosEnElDia`
- **Prioridad Crítica del Diseño:**
  - En la **Vista por Docente**, las horas puente deben resaltarse visualmente con una etiqueta clara (`⚠️ Hora Puente`).
  - El motor de propuestas debe calcular para cada movimiento sugerido el diferencial neto `ΔHorasPuente` de todos los docentes involucrados.
  - Las sugerencias deben ordenarse priorizando siempre aquellas que **eliminan horas puente (`Δ < 0`)** o **no generan nuevas (`Δ = 0`)**, penalizando y advirtiendo claramente sobre aquellas que incrementan las horas puente (`Δ > 0`).

---

## 4. Motor Inteligente de Propuestas de Movimiento

Cuando el usuario selecciona una materia asignada en la grilla (o una materia con horas pendientes de ubicar) y solicita moverla (ya sea de a 1 hora cátedra o como bloque agrupado de 2/3 horas), el sistema debe evaluar todas las combinaciones válidas y clasificarlas visualmente en **dos grandes categorías diferenciadas**:

### Categoría 1: Movimientos a "Cursos con Horario Libre" (Identificador Verde)
- El bloque (o conjunto de bloques) destino en ese curso está **vacío (sin materia asignada)**.
- Todos los docentes de la materia que se quiere mover tienen disponibilidad cargada como `DISPONIBLE` en ese horario y no tienen choque con ningún otro curso de la escuela.
- Respeta la regla de no interrupción innecesaria por recreos.

### Categoría 2: "Movimiento entre Docentes / Materias" - Enroques (Identificador Azul / Violeta)
- **Enroque Directo (1 a 1 - Azul):** El bloque destino en el curso está ocupado por otra Materia $B$. El motor verifica que:
  1. Los docentes de la Materia $A$ estén disponibles y sin choques en el horario actual de la Materia $B$.
  2. Los docentes de la Materia $B$ estén disponibles y sin choques en el horario origen de la Materia $A$.
  3. Ambos bloques tengan tamaños compatibles y respeten la regla de recreos.
- **Enroque en Cadena Corta (Triangular $A \rightarrow B \rightarrow C \rightarrow A$ - Violeta):** Cuando un intercambio de 3 materias dentro del mismo curso permite reubicar la materia seleccionada respetando el 100% de las disponibilidades y choques docentes.

---

## 5. Interfaz de Usuario (UX), Vistas y Simulador

### 5.1. Vistas Principales Dinámicas
1. **Vista por Curso:**
   - Selector rápido de Curso (`1° a 5° Año`).
   - Grilla semanal interactiva mostrando en cada celda: Nombre de la Materia, Color identificatorio, Docente(s) asignado(s), y separadores visuales para los 4 recreos.
   - Panel lateral de **"Bandeja de Materias y Carga Horaria"** mostrando el progreso de asignación (ej. `Matemática: 4/4 hs` en verde, `Física: 1/3 hs` en ámbar) para arrastrar horas pendientes a la grilla.
2. **Vista por Docente:**
   - Selector rápido de Docente con resumen de métricas: Total horas asignadas, Total horas disponibles libres y **Contador de Horas Puente actuales**.
   - Grilla semanal que identifica claramente mediante colores y texto:
     - **Ocupado (Color sólido + Texto):** Muestra explícitamente `Curso + Materia` (ej. *"3° Año - Historia"*).
     - **Disponible Libre (Verde suave):** El docente puede asistir pero no tiene curso asignado.
     - **Hora Puente (Verde con borde/icono de alerta ⚠️):** Hora libre encerrada entre dos horas de clase el mismo día.
     - **No Disponible (Gris tramado):** El docente no asiste a la institución en ese horario.
   - **Edición directa desde ambas vistas:** El usuario debe poder iniciar un movimiento o cambiar disponibilidad haciendo clic directamente sobre los bloques tanto desde la Vista por Curso como desde la Vista por Docente.

### 5.2. Modal Obligatorio de Pre-Confirmación ("Detalle de Impacto del Movimiento")
**NUNCA** se debe ejecutar un movimiento a ciegas. Al seleccionar una propuesta (o soltar un bloque vía Drag & Drop), se debe mostrar un panel/modal de confirmación que detalle explícitamente:
1. **Tipo de Operación:** Movimiento a Horario Libre vs. Enroque entre Materias/Docentes.
2. **Cursos y Materias Afectadas:** Qué materia sale de qué día/hora y a qué día/hora ingresa.
3. **Docentes Afectados:** Lista de todos los profesores cuyo horario se modifica con este cambio.
4. **Impacto en Horas Puente y Recreos:**
   - Ejemplo: *"Prof. Gómez: Pasa de 2 horas puente a 0 horas puente los Martes (Mejora ✅)"*.
   - Alerta si algún bloque queda dividido por un recreo.
5. Botones de acción: `[Cancelar]` y `[Aplicar Movimiento]`.

### 5.3. Modo Borrador / Simulador e Historial (`Undo / Redo`)
- **Pila Deshacer / Rehacer:** Soporte completo en barra superior (`Deshacer ↩` / `Rehacer ↪` y atajos `Ctrl+Z` / `Ctrl+Y`) registrando cada movimiento aplicado.
- **Modo Simulador (Sandbox):**
  - El usuario puede activar el **"Modo Simulación / Borrador"** para jugar libremente con el horario.
  - Mientras está activo, una barra superior indica cuántos cambios difieren del **Horario Oficial Vigente**, permitiendo ver un resumen de todos los cambios acumulados y elegir entre:
    - `[Confirmar como Horario Oficial]` (guarda los cambios como definitivos).
    - `[Descartar Simulación]` (restaura intacto el horario oficial previo).

---

## 6. Roadmap de Implementación Paso a Paso

Desarrollaremos el proyecto de manera incremental en 5 fases:

- **Fase 1: Arquitectura Base, Persistencia y Datos Semilla (Seed Data)**
  - Inicializar el proyecto portable (Electron + UI + almacenamiento local).
  - Implementar el modelo de datos parametrizable con la plantilla preconfigurada de **5 Cursos y 12 Bloques Horarios (07:50 a 16:40) con sus 4 recreos y 5 segmentos continuos**.
  - Implementar el gestor de estado con soporte para **Modo Borrador/Simulador** y pila **Undo/Redo**.
  - Crear un generador de **Datos de Prueba realistas** (5 cursos, 15 docentes con disponibilidades variadas, materias con 1 y 2 docentes, y un horario base armado al 85%) para poder probar todas las funciones desde el primer momento.
- **Fase 2: Gestión de Configuración, Cursos, Materias y Disponibilidad Docente**
  - Pantallas ABM para editar la configuración del colegio, cursos, materias (con formato de bloques `2+2`, etc., obligatorio/ideal) y docentes.
  - Grilla interactiva tipo *"pintar con el mouse"* para cargar o editar rápidamente la disponibilidad horaria de cada docente.
- **Fase 3: Vistas Dinámicas por Curso y por Docente**
  - Construcción de la **Vista por Curso** y la **Vista por Docente** con código de colores, detección automática en tiempo real de **Horas Puente** y de bloques interrumpidos por recreo.
- **Fase 4: Motor de Propuestas de Movimiento y Modal de Confirmación de Impacto**
  - Algoritmo evaluador de **Movimientos a Horas Libres** y **Enroques (1 a 1 y Triangulares)** respetando disponibilidad multi-docente, segmentos de recreo y optimización de horas puente.
  - Interfaz interactiva que ilumina la grilla con las propuestas al seleccionar una materia + **Modal de Pre-Confirmación detallada**.
- **Fase 5: Exportación a Excel/PDF y Empaquetado Portable Final**
  - Generación de archivos `.xlsx` y `.pdf` (por curso individual, por docente individual y exportación masiva).
  - Configuración del script de empaquetado portable (`SGH_Portable`) con generación de acceso directo.

---

## 7. Instrucciones de Inicio Inmediato para el Agente
1. Confirma la lectura de esta especificación.
2. Comienza ejecutando la **Fase 1**: crea la estructura de directorios del proyecto, configura el entorno base, implementa el motor de datos local con la grilla de 12 bloques (07:50 a 16:40) y sus segmentos de recreos, el sistema de estado con Undo/Redo + Modo Borrador, los datos semilla (seed data) de los 5 cursos y una interfaz inicial funcional donde ya se pueda navegar el esqueleto de la aplicación.