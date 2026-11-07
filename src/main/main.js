/**
 * SGH - Sistema de Gestión Horaria Escolar
 * Proceso Principal de Electron (Main Process)
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { SGHStorage } = require('./storage');
const {
  sugerirNombreArchivoExportacion,
  generarArchivoExcelHorario,
  construirHtmlImpresionPDF
} = require('./exporter');

let mainWindow = null;
let storage = null;

function inicializarStorage() {
  if (!storage) {
    // Usar carpeta portable si está empaquetado, o cwd en desarrollo
    const baseDir =
      process.env.PORTABLE_EXECUTABLE_DIR ||
      (app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd());
    storage = new SGHStorage(baseDir);
  }
  return storage;
}

function createWindow() {
  inicializarStorage();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1150,
    minHeight: 720,
    title: 'SGH - Sistema de Gestión Horaria Escolar (Offline Portable)',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers para Persistencia Atómica y Gestión de Backups
ipcMain.handle('sgh:cargarEstadoInicial', async () => {
  const st = inicializarStorage();
  const estado = st.cargarOInicializar();
  const infoStorage = st.obtenerInfoAlmacenamiento();
  return { estado, infoStorage };
});

ipcMain.handle('sgh:guardarEstado', async (_event, { estado, motivo, crearBackup }) => {
  const st = inicializarStorage();
  const res = st.guardarAtomico(estado, motivo || 'Actualización de horario oficial', Boolean(crearBackup));
  return {
    ...res,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:crearBackupManual', async (_event, { estado, motivo }) => {
  const st = inicializarStorage();
  const backup = st.crearBackup(estado, motivo || 'Backup manual creado por el usuario');
  return {
    backup,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:restaurarBackup', async (_event, { archivo }) => {
  const st = inicializarStorage();
  const estadoRestaurado = st.restaurarBackup(archivo);
  return {
    estado: estadoRestaurado,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:eliminarBackup', async (_event, { archivo }) => {
  const st = inicializarStorage();
  const res = st.eliminarBackup(archivo);
  return {
    ...res,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:limpiarBackupsAntiguos', async (_event, { conservarUltimos }) => {
  const st = inicializarStorage();
  const res = st.limpiarBackupsAntiguos(conservarUltimos);
  return {
    ...res,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:regenerarSemilla', async () => {
  const st = inicializarStorage();
  const nuevoEstado = st.regenerarDatosSemilla();
  return {
    estado: nuevoEstado,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:obtenerInfoStorage', async () => {
  const st = inicializarStorage();
  return st.obtenerInfoAlmacenamiento();
});

ipcMain.handle('sgh:guardarSimulacion', async (_event, payload) => {
  const st = inicializarStorage();
  const simMeta = st.guardarSimulacion(payload);
  return {
    simulacionMeta: simMeta,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:cargarSimulacion', async (_event, { archivo }) => {
  const st = inicializarStorage();
  const { simulacionMeta, estadoSimulado } = st.cargarSimulacion(archivo);
  return {
    simulacionMeta,
    estadoSimulado,
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

ipcMain.handle('sgh:eliminarSimulacion', async (_event, { archivo }) => {
  const st = inicializarStorage();
  st.eliminarSimulacion(archivo);
  return {
    infoStorage: st.obtenerInfoAlmacenamiento()
  };
});

// IPC Handlers Fase 5: Exportación a Excel (.xlsx) y PDF (.pdf) A4 Horizontal
ipcMain.handle('sgh:exportarExcel', async (_event, { estado, opciones = {} }) => {
  const st = inicializarStorage();
  const nombreSugerido = sugerirNombreArchivoExportacion(estado, opciones, 'xlsx');
  const exportDir = path.join(st.dataDir, 'exportaciones');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  let rutaDestino = opciones.rutaDestino || null;
  if (!rutaDestino && mainWindow) {
    const resDialog = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar Horario en Excel (.xlsx)',
      defaultPath: path.join(exportDir, nombreSugerido),
      filters: [{ name: 'Planilla de Excel (.xlsx)', extensions: ['xlsx'] }]
    });
    if (resDialog.canceled || !resDialog.filePath) {
      return { cancelado: true };
    }
    rutaDestino = resDialog.filePath;
  } else if (!rutaDestino) {
    rutaDestino = path.join(exportDir, nombreSugerido);
  }

  const res = await generarArchivoExcelHorario(estado, opciones, rutaDestino);
  return {
    ok: true,
    rutaArchivo: res.rutaArchivo,
    cantidadHojas: res.cantidadHojas,
    nombresHojas: res.nombresHojas
  };
});

ipcMain.handle('sgh:exportarPDF', async (_event, { estado, opciones = {} }) => {
  const st = inicializarStorage();
  const nombreSugerido = sugerirNombreArchivoExportacion(estado, opciones, 'pdf');
  const exportDir = path.join(st.dataDir, 'exportaciones');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  let rutaDestino = opciones.rutaDestino || null;
  if (!rutaDestino && mainWindow) {
    const resDialog = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar Horario en PDF (A4 Horizontal)',
      defaultPath: path.join(exportDir, nombreSugerido),
      filters: [{ name: 'Documento PDF (.pdf)', extensions: ['pdf'] }]
    });
    if (resDialog.canceled || !resDialog.filePath) {
      return { cancelado: true };
    }
    rutaDestino = resDialog.filePath;
  } else if (!rutaDestino) {
    rutaDestino = path.join(exportDir, nombreSugerido);
  }

  const html = construirHtmlImpresionPDF(estado, opciones);
  const tempHtmlPath = path.join(exportDir, `.tmp_print_${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, html, 'utf8');

  const printWin = new BrowserWindow({
    show: false,
    width: 1123,
    height: 794,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await printWin.loadFile(tempHtmlPath);
    const pdfBuffer = await printWin.webContents.printToPDF({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 }
    });
    fs.writeFileSync(rutaDestino, pdfBuffer);
    return {
      ok: true,
      rutaArchivo: rutaDestino
    };
  } finally {
    printWin.destroy();
    if (fs.existsSync(tempHtmlPath)) {
      try {
        fs.unlinkSync(tempHtmlPath);
      } catch (_e) {
        // Ignorar error de limpieza temporal
      }
    }
  }
});

ipcMain.handle('sgh:mostrarArchivoEnCarpeta', async (_event, { rutaArchivo }) => {
  if (rutaArchivo && fs.existsSync(rutaArchivo)) {
    shell.showItemInFolder(rutaArchivo);
    return { ok: true };
  }
  return { ok: false };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
