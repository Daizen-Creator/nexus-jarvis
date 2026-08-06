'use strict';
// Instalador próprio do NEXUS — janela preta e temática, sem a cara do Windows.
// Instala POR USUÁRIO (%LOCALAPPDATA%\Programs\NEXUS), sem exigir administrador.
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'NEXUS';
const VERSION = '1.0.0';
const installDir = path.join(process.env.LOCALAPPDATA, 'Programs', APP_NAME);
// Onde estão os arquivos do NEXUS a copiar: empacotados no instalador, ou (em
// dev) a build "win-unpacked" gerada pelo electron-builder.
const payloadDir = app.isPackaged
  ? path.join(process.resourcesPath, 'app-payload')
  : path.join(__dirname, '..', 'release', 'win-unpacked');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 640,
    height: 480,
    frame: false,
    resizable: false,
    maximizable: false,
    backgroundColor: '#050508',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'ui.html'));
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

const send = (payload) => {
  if (win && !win.isDestroyed()) win.webContents.send('progress', payload);
};

/* ------------------------------------------------------------------ */
/* Cópia de arquivos com progresso                                     */
/* ------------------------------------------------------------------ */

function countFiles(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += countFiles(p);
    else total += 1;
  }
  return total;
}

function copyRecursive(src, dest, onFile) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyRecursive(s, d, onFile);
    else {
      fs.copyFileSync(s, d);
      onFile();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Atalhos e registro (via PowerShell — confiável e sem admin)         */
/* ------------------------------------------------------------------ */

function createShortcut(lnkPath, target) {
  const ps =
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath}'); ` +
    `$s.TargetPath = '${target}'; $s.WorkingDirectory = '${path.dirname(target)}'; ` +
    `$s.IconLocation = '${target},0'; $s.Save()`;
  spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true });
}

function writeUninstall(exe) {
  // Desinstalador simples: apaga a pasta e a chave do registro.
  const uninstaller = path.join(installDir, 'desinstalar.cmd');
  fs.writeFileSync(
    uninstaller,
    `@echo off\r\n` +
      `echo Desinstalando o NEXUS...\r\n` +
      `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NEXUS" /f >nul 2>&1\r\n` +
      `del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\NEXUS.lnk" >nul 2>&1\r\n` +
      `del "%USERPROFILE%\\Desktop\\NEXUS.lnk" >nul 2>&1\r\n` +
      `timeout /t 1 >nul\r\n` +
      `rmdir /s /q "${installDir}"\r\n`,
    'utf8',
  );
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NEXUS';
  const cmds = [
    `reg add "${key}" /v DisplayName /t REG_SZ /d "NEXUS" /f`,
    `reg add "${key}" /v DisplayVersion /t REG_SZ /d "${VERSION}" /f`,
    `reg add "${key}" /v Publisher /t REG_SZ /d "Daizen" /f`,
    `reg add "${key}" /v InstallLocation /t REG_SZ /d "${installDir}" /f`,
    `reg add "${key}" /v DisplayIcon /t REG_SZ /d "${exe}" /f`,
    `reg add "${key}" /v UninstallString /t REG_SZ /d "${uninstaller}" /f`,
    `reg add "${key}" /v NoModify /t REG_DWORD /d 1 /f`,
    `reg add "${key}" /v NoRepair /t REG_DWORD /d 1 /f`,
  ];
  spawnSync('powershell.exe', ['-NoProfile', '-Command', cmds.join('; ')], { windowsHide: true });
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.handle('install', async () => {
  try {
    if (!fs.existsSync(payloadDir)) {
      send({ status: 'error', pct: 0, msg: `Arquivos do NEXUS não encontrados em ${payloadDir}` });
      return { ok: false };
    }

    send({ status: 'copying', pct: 2, msg: 'Preparando...' });
    const total = countFiles(payloadDir) || 1;
    let done = 0;
    copyRecursive(payloadDir, installDir, () => {
      done += 1;
      if (done % 15 === 0) {
        send({ status: 'copying', pct: Math.round((done / total) * 88) + 2, msg: `Copiando arquivos... ${done}/${total}` });
      }
    });

    const exe = path.join(installDir, 'NEXUS.exe');

    send({ status: 'shortcuts', pct: 92, msg: 'Criando atalhos...' });
    const startMenu = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NEXUS.lnk');
    createShortcut(startMenu, exe);
    createShortcut(path.join(app.getPath('desktop'), 'NEXUS.lnk'), exe);

    send({ status: 'registry', pct: 97, msg: 'Registrando no sistema...' });
    writeUninstall(exe);

    send({ status: 'done', pct: 100, msg: 'Instalação concluída.', exe });
    return { ok: true, exe };
  } catch (error) {
    send({ status: 'error', pct: 0, msg: String(error && error.message ? error.message : error) });
    return { ok: false };
  }
});

ipcMain.on('launch', (_e, exe) => {
  try {
    spawn(exe, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* ignora */
  }
  app.quit();
});

ipcMain.on('window:minimize', () => win && win.minimize());
ipcMain.on('window:close', () => app.quit());
