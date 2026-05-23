#!/usr/bin/env node
/**
 * DDLC Together — launcher.exe  (compiled with `pkg`)
 *
 * Started by the desktop / start-menu shortcut.
 *   1. Detect install dir
 *   2. Spawn server.exe (hidden) on 127.0.0.1:8001 if not already running
 *   3. Wait until /api/health responds OK
 *   4. Spawn DDLC.exe (Ren'Py)
 *   5. Quit when DDLC.exe exits; kill the server
 *
 * There is no separate "overlay_window.exe": the Ren'Py mod itself spawns
 * a frameless app-mode browser window using MSEdge (--app=...), which is
 * present on every modern Windows install.  See game/multiplayer/hooks.rpy
 * for the equivalent code.
 *
 * The PE header is patched post-build to subsystem=Windows GUI (2) so no
 * console window flashes when the shortcut is double-clicked.  Logs are
 * written to %LOCALAPPDATA%\DDLCTogether\launcher.log.
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const net  = require('net');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ----- logging --------------------------------------------------------------
function logDir() {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir();
  const d = path.join(base, 'DDLCTogether');
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
}
const LOG_PATH = path.join(logDir(), 'launcher.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ` +
    args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
  try { fs.appendFileSync(LOG_PATH, line); } catch (_) {}
}
process.on('uncaughtException', e => { log('FATAL', e.stack || String(e)); });

// ----- config --------------------------------------------------------------
// Hardcoded central server.  All clients connect here for matchmaking,
// socket.io rooms and the React UI.  Only the actual host machine needs to
// run server.exe (which listens on 0.0.0.0:8001).
const SERVER_HOST = '82.64.128.239';
const SERVER_PORT = 8001;
const SERVER_BASE = `http://${SERVER_HOST}:${SERVER_PORT}`;

// ----- helpers --------------------------------------------------------------
function installDir() { return path.dirname(process.execPath); }

function find(rel) {
  const full = path.join(installDir(), rel);
  return fs.existsSync(full) ? full : null;
}

function portOpen(host, port) {
  return new Promise(resolve => {
    const s = new net.Socket();
    const done = ok => { try { s.destroy(); } catch (_) {} resolve(ok); };
    s.setTimeout(400);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error',   () => done(false));
    s.connect(port, host);
  });
}

async function waitHealth(maxSec, host, port) {
  host = host || '127.0.0.1';
  port = port || 8001;
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxSec) {
    if (await portOpen(host, port)) {
      const ok = await new Promise(r => {
        const req = http.get(`http://${host}:${port}/api/health`,
          res => r(res.statusCode === 200));
        req.on('error', () => r(false));
        req.setTimeout(1500, () => { req.destroy(); r(false); });
      });
      if (ok) return true;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

function findGameExe(base) {
  const candidates = ['DDLCTogether.exe', 'DDLC.exe', 'game.exe'];
  for (const c of candidates) {
    const p = path.join(base, c);
    // Avoid recursing into ourselves (launcher renamed)
    if (path.basename(process.execPath).toLowerCase() === c.toLowerCase()) continue;
    if (fs.existsSync(p)) return p;
  }
  try {
    for (const name of fs.readdirSync(base)) {
      const sub = path.join(base, name);
      if (!fs.statSync(sub).isDirectory()) continue;
      for (const c of candidates) {
        const p = path.join(sub, c);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (_) {}
  return null;
}

function findMsEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// Parse `ddlctgthr://XK4T2A[/lobby]` from argv (Windows passes the full URL
// as the 1st CLI arg when the protocol handler fires).  Returns the route
// fragment to open in the Edge --app= window, or null when no URL was given.
function parseProtocolArg(argv) {
  for (const a of argv) {
    if (typeof a !== 'string') continue;
    const m = a.match(/^ddlctgthr:\/+([A-Za-z0-9]{4,8})(?:\/([a-z]+))?\/?$/i);
    if (m) {
      const code = m[1].toUpperCase();
      const route = (m[2] || 'lobby').toLowerCase();
      return { code, route };
    }
  }
  return null;
}

// ----- main -----------------------------------------------------------------
(async () => {
  const base = installDir();
  process.chdir(base);
  log('--- launcher start ---');
  log('installDir =', base);
  log('execPath   =', process.execPath);
  log('argv       =', process.argv);

  const protocol = parseProtocolArg(process.argv.slice(1));
  if (protocol) log('protocol invocation =', protocol);

  const serverExe = find('server.exe');
  log('server.exe =', serverExe || '(not found)');

  const gameExe = findGameExe(base);
  log('game.exe   =', gameExe || '(not found)');

  const procs = [];

  // Probe the central server.  If reachable we DO NOT spawn a local one
  // (only the actual host machine runs server.exe).
  const remoteUp = await portOpen(SERVER_HOST, SERVER_PORT);
  log(`probe ${SERVER_HOST}:${SERVER_PORT} =>`, remoteUp);

  if (!remoteUp && serverExe) {
    // We are likely the host (or the central server is offline).  Boot a
    // local server.exe so the game still works on LAN / loopback.
    const localUp = await portOpen('127.0.0.1', SERVER_PORT);
    log('local port 8001 already open?', localUp);
    if (!localUp) {
      try {
        const child = spawn(serverExe, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          cwd: path.dirname(serverExe),
        });
        child.unref();
        procs.push(child);
        log('spawned server.exe pid=', child.pid);
      } catch (e) {
        log('spawn server.exe FAILED', e.message);
      }
      const ok = await waitHealth(20, '127.0.0.1', SERVER_PORT);
      log('local server health OK?', ok);
    }
  } else if (!remoteUp) {
    log('WARN remote server unreachable and no local server.exe found');
  }

  // If launched via ddlctgthr:// URL, skip the game and open the lobby
  // page directly in the app-mode browser so the user can pick a character
  // and play with the host that shared the link.
  if (protocol) {
    const url = `${SERVER_BASE}/#/${protocol.route}/${protocol.code}`;
    const edge = findMsEdge();
    log('edge =', edge, 'url =', url);
    if (edge) {
      const c = spawn(edge, [`--app=${url}`, '--window-size=960,720'],
        { detached: true, stdio: 'ignore' });
      c.unref();
    }
    return;
  }

  if (!gameExe) {
    log('No game .exe found — falling back to app-mode browser only');
    const url = `${SERVER_BASE}/#/rooms`;
    const edge = findMsEdge();
    log('edge =', edge);
    if (edge) {
      const c = spawn(edge, [`--app=${url}`, '--window-size=960,720'],
        { detached: true, stdio: 'ignore' });
      c.unref();
    }
    return;
  }

  try {
    const game = spawn(gameExe, [], {
      detached: false,
      stdio: 'ignore',
      cwd: path.dirname(gameExe),
    });
    log('spawned game pid=', game.pid);
    game.once('exit', (code, sig) => {
      log('game exited code=', code, 'sig=', sig);
      for (const p of procs) { try { p.kill(); } catch (_) {} }
      process.exit(0);
    });
    game.once('error', err => {
      log('game spawn error:', err.message);
      process.exit(2);
    });
  } catch (e) {
    log('spawn game FAILED', e.message);
    process.exit(2);
  }
})().catch(e => { log('top-level FAIL', e.stack || String(e)); process.exit(3); });
