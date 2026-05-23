/**
 * DDLC Together — end-to-end integration test
 *
 * Spins up the real server.js (in-process), connects 3 socket.io clients
 * + 1 raw WS Ren'Py client and exercises the full event catalogue:
 *
 *   room:create / room:join / room:list
 *   player:character_select / spectator:become_player
 *   game:start / game:scene_advance / game:choice_present
 *   game:choice_vote / game:choice_result
 *   host:transfer / player:kick / disconnect
 *   raw WS  /renpy   host:claim on host disconnect
 *
 * Run:  node server/test_e2e.js   (server must NOT be already running)
 */
'use strict';

const child_process = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const WebSocket = require('ws');

const PORT = 18091;          // dedicated test port (avoid clobbering dev server)

const assertions = [];
function check(name, ok, extra) {
  assertions.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? '  (' + extra + ')' : ''}`);
}
function waitOn(sock, evt, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + evt)), timeout);
    sock.once(evt, (...a) => { clearTimeout(t); resolve(a.length <= 1 ? a[0] : a); });
  });
}
function wsWaitFor(ws, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting on raw ws')), timeout);
    const onMsg = (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch (_) { return; }
      if (predicate(msg)) {
        clearTimeout(t);
        ws.off('message', onMsg);
        resolve(msg);
      }
    };
    ws.on('message', onMsg);
  });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function newClient() {
  return io(`http://127.0.0.1:${PORT}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

(async () => {
  // ---- Start server as a child process bound to PORT ----
  const env = Object.assign({}, process.env, { DDLC_PORT: String(PORT), DDLC_HOST: '127.0.0.1' });
  const srv = child_process.spawn(process.execPath,
    [path.join(__dirname, 'server.js')],
    { env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  srv.stderr.on('data', d => process.stderr.write('[srv-err] ' + d));

  // wait for /api/health
  const http = require('http');
  for (let i = 0; i < 40; i++) {
    const ok = await new Promise(r => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, res => r(res.statusCode === 200));
      req.on('error', () => r(false));
      req.setTimeout(500, () => { req.destroy(); r(false); });
    });
    if (ok) break;
    await wait(150);
  }

  try {
    // ---- 1. host creates a public room ----
    const host = newClient();
    await waitOn(host, 'connect');
    host.emit('room:create', { username: 'Alice', maxPlayers: 4, visibility: 'public' });
    const { code, room: r1 } = await waitOn(host, 'room:created');
    check('room:create', !!code && r1.players.length === 1);

    // ---- 2. second client joins via code ----
    const bob = newClient();
    await waitOn(bob, 'connect');
    bob.emit('room:join', { username: 'Bob', code });
    const j = await waitOn(bob, 'room:joined');
    check('room:join as player', j.as === 'player' && j.room.players.length === 2);

    // ---- 3. room:list shows the public room ----
    const lister = newClient();
    await waitOn(lister, 'connect');
    lister.emit('room:list');
    const list = await waitOn(lister, 'room:list');
    check('room:list lists public room', list.some(r => r.code === code));
    lister.disconnect();

    // ---- 4. character selection ----
    host.emit('player:character_select', { character: 'monika' });
    await waitOn(bob, 'room:updated');
    bob.emit('player:character_select', { character: 'sayori' });
    const updAfterChars = await waitOn(host, 'room:updated');
    check('character_select sticks',
      updAfterChars.players.find(p => p.username === 'Alice')?.character === 'monika' &&
      updAfterChars.players.find(p => p.username === 'Bob')?.character === 'sayori');

    // ---- 5. spectator joins (room.maxPlayers=4 still has slots so we
    //         force-overflow by setting maxPlayers to 2 dynamically — instead,
    //         just join a 3rd player and then a 4th and a 5th will become
    //         spectator).  Simpler: open a 2-player room.
    const carolHost = newClient();
    await waitOn(carolHost, 'connect');
    carolHost.emit('room:create', { username: 'Carol', maxPlayers: 2, visibility: 'public' });
    const carolRoom = await waitOn(carolHost, 'room:created');
    const dave = newClient();
    await waitOn(dave, 'connect');
    dave.emit('room:join', { username: 'Dave', code: carolRoom.code });
    await waitOn(dave, 'room:joined');
    const eve = newClient();
    await waitOn(eve, 'connect');
    eve.emit('room:join', { username: 'Eve', code: carolRoom.code });
    const eveJoin = await waitOn(eve, 'room:joined');
    check('overflow joiner becomes spectator', eveJoin.as === 'spectator');
    eve.emit('spectator:become_player', { character: 'yuri' });
    // She can't, the room is full
    const carolRoomAfter = await waitOn(carolHost, 'room:updated', 1000).catch(() => null);
    // Eve stays a spectator since room is full.  Kick Dave to free a slot:
    carolHost.emit('player:kick', { targetId: eveJoin.room.players.find(p => p.username === 'Dave').id });
    await waitOn(carolHost, 'room:updated');
    eve.emit('spectator:become_player', { character: 'yuri' });
    const upd2 = await waitOn(carolHost, 'room:updated');
    check('spectator:become_player after slot free',
      upd2.players.some(p => p.username === 'Eve' && p.character === 'yuri'));
    carolHost.disconnect(); dave.disconnect(); eve.disconnect();

    // ---- 6. game:start (with 2 chars selected) ----
    host.emit('game:start');
    const started = await waitOn(host, 'game:started');
    check('game:start broadcasts', started.code === code);

    // ---- 7. raw WS /renpy as host ----
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/renpy?room=${code}&role=host`);
    await new Promise(r => ws.once('open', r));
    await wsWaitFor(ws, m => m.event === 'ws:connected');
    check('ren\'py raw ws connects', true);

    // Host sends scene advance via raw WS
    ws.send(JSON.stringify({ event: 'game:scene_advance', label: 'ch1_intro' }));
    const scene = await waitOn(host, 'game:scene');
    check('renpy -> io scene relay', scene.label === 'ch1_intro');

    // Host presents a choice via raw WS
    ws.send(JSON.stringify({ event: 'game:choice_present', options: ['A', 'B'] }));
    const choice = await waitOn(bob, 'game:choice');
    check('choice broadcast to clients', choice.options.length === 2 && !!choice.deadline);

    // Both vote
    host.emit('game:choice_vote', { option: 'A' });
    bob.emit('game:choice_vote', { option: 'A' });
    const result = await wsWaitFor(ws, m => m.event === 'game:choice_result');
    check('choice resolves with winner', result.winner === 'A' && result.tally.A === 2);

    // ---- 8. host:transfer via io ----
    host.emit('host:transfer', { targetId: bob.id });
    const transferred = await waitOn(bob, 'room:updated');
    check('host:transfer reflects new hostId', transferred.hostId === bob.id);

    // ---- 9. raw WS host disconnect triggers host:claim on second WS ----
    const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/renpy?room=${code}&role=player`);
    await new Promise(r => ws2.once('open', r));
    await wsWaitFor(ws2, m => m.event === 'ws:connected');
    ws.close();
    const claim = await wsWaitFor(ws2, m => m.event === 'host:claim', 3000);
    check('raw WS host:claim on host disconnect', !!claim && !!claim.room);
    ws2.close();

    // ---- 10. cleanup ----
    host.disconnect();
    bob.disconnect();
  } catch (e) {
    console.error('TEST CRASHED:', e);
    check('exception thrown', false, e.message);
  } finally {
    try { srv.kill('SIGTERM'); } catch (_) {}
    await wait(200);
    const failed = assertions.filter(a => !a.ok);
    console.log('\n=== summary: ' + (assertions.length - failed.length) + '/' + assertions.length + ' passed ===');
    process.exit(failed.length === 0 ? 0 : 1);
  }
})();
