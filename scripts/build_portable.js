/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Empaquetador Portable Offline Determinístico para Windows (Cero descargas externas, cero errores de symlinks)
 *
 * Genera la carpeta autocontenida `dist_portable\SGH_Portable` lista para copiar a cualquier PC Windows
 * sin requerir Node.js, instaladores ni conexión a Internet.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT_DIR = path.resolve(__dirname, '..');
const ELECTRON_DIST_DIR = path.join(ROOT_DIR, 'node_modules', 'electron', 'dist');
const ROOT_NODE_MODULES = path.join(ROOT_DIR, 'node_modules');
const DIST_BASE_DIR = path.join(ROOT_DIR, 'dist_portable');
const PORTABLE_OUT_DIR = path.join(DIST_BASE_DIR, 'SGH_Portable');
const EXE_NAME = 'SGH - Gestion Horaria Escolar.exe';

function limpiarDirectorioSeguro(dirPath) {
  if (!fs.existsSync(dirPath)) return true;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return true;
  } catch (err) {
    console.warn(`  [Aviso] No se pudo limpiar completamente ${dirPath}: ${err.message}`);
    return false;
  }
}

/**
 * Busca el directorio físico de un paquete siguiendo el algoritmo de resolución de Node.js
 * desde `desdeDir` hacia arriba hasta `ROOT_NODE_MODULES`.
 */
function resolverDirectorioPaquete(nombrePaquete, desdeDir) {
  let actual = desdeDir;
  while (actual) {
    const candidato = path.join(actual, 'node_modules', ...nombrePaquete.split('/'));
    if (fs.existsSync(path.join(candidato, 'package.json'))) {
      return candidato;
    }
    if (path.resolve(actual) === path.resolve(ROOT_DIR)) {
      break;
    }
    const padre = path.dirname(actual);
    if (padre === actual) break;
    actual = padre;
  }

  const directoRaiz = path.join(ROOT_NODE_MODULES, ...nombrePaquete.split('/'));
  if (fs.existsSync(path.join(directoRaiz, 'package.json'))) {
    return directoRaiz;
  }
  return null;
}

/**
 * Recolecta recursivamente TODAS las dependencias de producción (incluyendo sub-dependencias
 * transitivas alojadas en la raíz como `call-bind-apply-helpers` requeridas por paquetes anidados).
 */
function recolectarDependenciasProduccion(rootPkgJson) {
  const paquetesRaizACopiar = new Map(); // nombrePaquete -> rutaOrigenEnRootNodeModules
  const directoriosEscaneados = new Set();
  const cola = [];

  const depsIniciales = {
    ...(rootPkgJson.dependencies || {}),
    ...(rootPkgJson.optionalDependencies || {})
  };

  for (const depName of Object.keys(depsIniciales)) {
    const dir = resolverDirectorioPaquete(depName, ROOT_DIR);
    if (!dir) {
      throw new Error(`No se encontró la dependencia requerida "${depName}" en node_modules.`);
    }
    cola.push(dir);
  }

  while (cola.length > 0) {
    const pkgDir = path.resolve(cola.shift());
    if (directoriosEscaneados.has(pkgDir)) continue;
    directoriosEscaneados.add(pkgDir);

    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

    // Si este paquete vive directamente en ROOT_NODE_MODULES (nivel superior), marcarlo para copiar
    const relToRootNM = path.relative(ROOT_NODE_MODULES, pkgDir);
    const partesRel = relToRootNM.split(path.sep);
    const esNivelSuperior =
      !relToRootNM.startsWith('..') &&
      !partesRel.slice(1).includes('node_modules');

    if (esNivelSuperior) {
      const nombreCanonico = pkgJson.name || partesRel.join('/');
      paquetesRaizACopiar.set(nombreCanonico, pkgDir);
    }

    // Escanear todas sus dependencies y optionalDependencies
    const subDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {})
    };

    for (const subDepName of Object.keys(subDeps)) {
      const resuelto = resolverDirectorioPaquete(subDepName, pkgDir);
      if (resuelto && !directoriosEscaneados.has(path.resolve(resuelto))) {
        cola.push(resuelto);
      }
    }

    // Además, si tiene una carpeta node_modules interna, escanear todos sus paquetes internos
    // para que las dependencias hoisted que ellos pidan también se copien a la raíz portable
    const nestedNM = path.join(pkgDir, 'node_modules');
    if (fs.existsSync(nestedNM)) {
      for (const entry of fs.readdirSync(nestedNM, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === '.bin') continue;
        if (entry.name.startsWith('@')) {
          const scopeDir = path.join(nestedNM, entry.name);
          for (const subEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
            if (subEntry.isDirectory()) {
              cola.push(path.join(scopeDir, subEntry.name));
            }
          }
        } else {
          cola.push(path.join(nestedNM, entry.name));
        }
      }
    }
  }

  return paquetesRaizACopiar;
}

async function main() {
  console.log('==================================================================');
  console.log('  SGH - Empaquetador Portable para Windows (100% Offline)');
  console.log('==================================================================');

  if (!fs.existsSync(ELECTRON_DIST_DIR)) {
    throw new Error(
      `No se encontró el binario base de Electron en: ${ELECTRON_DIST_DIR}`
    );
  }

  console.log('[1/5] Preparando carpeta de destino en dist_portable\\SGH_Portable...');
  fs.mkdirSync(DIST_BASE_DIR, { recursive: true });
  limpiarDirectorioSeguro(path.join(DIST_BASE_DIR, 'win-unpacked'));
  if (!limpiarDirectorioSeguro(PORTABLE_OUT_DIR) && fs.existsSync(PORTABLE_OUT_DIR)) {
    throw new Error(
      'Cierra la aplicación SGH si está abierta antes de volver a empaquetar.'
    );
  }

  console.log('[2/5] Copiando motor gráfico Electron local...');
  fs.cpSync(ELECTRON_DIST_DIR, PORTABLE_OUT_DIR, { recursive: true });

  const defaultAsar = path.join(PORTABLE_OUT_DIR, 'resources', 'default_app.asar');
  if (fs.existsSync(defaultAsar)) {
    fs.rmSync(defaultAsar, { force: true });
  }

  const electronExeOrig = path.join(PORTABLE_OUT_DIR, 'electron.exe');
  const sghExeDest = path.join(PORTABLE_OUT_DIR, EXE_NAME);
  if (fs.existsSync(electronExeOrig)) {
    fs.renameSync(electronExeOrig, sghExeDest);
  }

  console.log('[3/5] Copiando código fuente de la aplicación y hojas de estilo...');
  const appDir = path.join(PORTABLE_OUT_DIR, 'resources', 'app');
  fs.mkdirSync(appDir, { recursive: true });

  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const portablePkg = {
    name: rootPkg.name,
    version: rootPkg.version,
    description: rootPkg.description,
    main: rootPkg.main,
    author: rootPkg.author,
    license: rootPkg.license,
    dependencies: rootPkg.dependencies
  };
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(portablePkg, null, 2),
    'utf-8'
  );

  fs.cpSync(path.join(ROOT_DIR, 'src'), path.join(appDir, 'src'), { recursive: true });

  console.log('[4/5] Resolviendo e incluyendo todas las dependencias de ejecución (ExcelJS y transitivas)...');
  const paquetesACopiar = recolectarDependenciasProduccion(rootPkg);
  const appNodeModules = path.join(appDir, 'node_modules');
  fs.mkdirSync(appNodeModules, { recursive: true });

  for (const [nombrePkg, rutaOrigen] of paquetesACopiar.entries()) {
    const rutaDestino = path.join(appNodeModules, ...nombrePkg.split('/'));
    fs.mkdirSync(path.dirname(rutaDestino), { recursive: true });
    fs.cpSync(rutaOrigen, rutaDestino, { recursive: true });
  }
  console.log(`      -> ${paquetesACopiar.size} paquetes incluidos en resources\\app\\node_modules.`);

  // Inicializar carpeta data limpia con los datos de ejemplo iniciales + script de acceso directo
  const { SGHStorage } = require(path.join(ROOT_DIR, 'src', 'main', 'storage'));
  const storagePortable = new SGHStorage(PORTABLE_OUT_DIR);
  storagePortable.regenerarDatosSemilla();

  const batAccesoOrigen = path.join(ROOT_DIR, 'crear_acceso_directo.bat');
  if (fs.existsSync(batAccesoOrigen)) {
    fs.copyFileSync(batAccesoOrigen, path.join(PORTABLE_OUT_DIR, 'crear_acceso_directo.bat'));
  }

  const leemeContenido = [
    '========================================================================',
    '  SGH - SISTEMA DE GESTION HORARIA ESCOLAR (VERSION PORTABLE WINDOWS)',
    '========================================================================',
    '',
    'COMO USAR EN CUALQUIER COMPUTADORA:',
    '1. Copia esta carpeta completa ("SGH_Portable") en la PC del usuario',
    '   (por ejemplo en C:\\SGH_Portable o en Documentos\\SGH_Portable).',
    '   No hace falta instalar Node.js ni tener conexion a Internet.',
    '2. Para abrir el sistema, ejecuta: "SGH - Gestion Horaria Escolar.exe".',
    '3. (Opcional) Ejecuta una vez "crear_acceso_directo.bat" en esa PC para',
    '   dejar el acceso directo listo en el Escritorio.',
    '',
    'DONDE SE GUARDAN LOS HORARIOS Y COPIAS DE SEGURIDAD:',
    '- Todos los datos, simulaciones y copias de seguridad se guardan',
    '  automaticamente dentro de la subcarpeta "data" de esta misma carpeta.',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(PORTABLE_OUT_DIR, 'LEEME_INSTALACION.txt'), leemeContenido, 'utf-8');

  console.log('[5/5] Verificando integridad aislada de módulos y motor Excel...');
  const origNodeModulePaths = Module._nodeModulePaths;
  const appDirNorm = path.resolve(appDir).toLowerCase();
  let rutaPruebaXlsx = null;
  try {
    // Aislar estrictamente la resolución para impedir que Node lea el node_modules de la raíz del repositorio
    Module._nodeModulePaths = function (from) {
      return origNodeModulePaths
        .call(this, from)
        .filter((p) => path.resolve(p).toLowerCase().startsWith(appDirNorm));
    };

    const exporterPortablePath = path.join(appDir, 'src', 'main', 'exporter.js');
    delete require.cache[require.resolve(exporterPortablePath)];
    const exporterPortable = require(exporterPortablePath);
    const estadoSemilla = storagePortable.cargarOInicializar();
    rutaPruebaXlsx = path.join(os.tmpdir(), `sgh_portable_verify_${Date.now()}.xlsx`);
    await exporterPortable.generarArchivoExcelHorario(
      estadoSemilla,
      { alcance: 'CURSO', cursoId: estadoSemilla.cursos[0].id },
      rutaPruebaXlsx
    );
    if (!fs.existsSync(rutaPruebaXlsx) || fs.statSync(rutaPruebaXlsx).size < 1000) {
      throw new Error('La verificación de escritura Excel (.xlsx) no generó un archivo válido.');
    }
  } finally {
    Module._nodeModulePaths = origNodeModulePaths;
    if (rutaPruebaXlsx && fs.existsSync(rutaPruebaXlsx)) {
      fs.rmSync(rutaPruebaXlsx, { force: true });
    }
  }

  console.log('');
  console.log('✅ EMPAQUETADO PORTABLE COMPLETADO CON ÉXITO');
  console.log(`📁 Carpeta lista para distribuir: ${PORTABLE_OUT_DIR}`);
  console.log(`🚀 Ejecutable principal:          ${sghExeDest}`);
  console.log('==================================================================');
}

main().catch((err) => {
  console.error('\n❌ ERROR DURANTE EL EMPAQUETADO PORTABLE:', err.message || err);
  process.exit(1);
});
