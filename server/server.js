/**
 * DDLC Together — multiplayer server (raw WebSocket, no React, no socket.io)
 *
 * Single endpoint:   ws://HOST:8001/ws
 * Single HTTP route: GET /api/health
 *
 * All messages are JSON {"event": "...", ...args}.  Each connection gets a
 * unique `clientId` (UUID) returned on the `ws:connected` event.
 *
 * Client→Server events:
 *   room:create     {username, maxPlayers, visibility}
 *   room:join       {username, code}
 *   room:list
 *   room:leave
 *   player:character_select  {character}
 *   spectator:become_player  {character}
 *   game:start
 *   game:scene_advance       {label}        (host only)
 *   game:choice_present      {options}      (host only)
 *   game:choice_vote         {option}
 *   game:end                                (host only)
 *   host:transfer            {targetId}     (host only)
 *   player:kick              {targetId}     (host only)
 *
 * Server→Client events:
 *   ws:connected     {clientId}
 *   ws:error         {message}
 *   room:created     {code, room}
 *   room:joined      {code, room, as}
 *   room:list        {rooms: [...]}
 *   room:updated     {room}
 *   room:kicked      {code}
 *   host:claim       {room}
 *   host:transferred {hostId, reason}
 *   game:started     {code}
 *   game:scene       {label}
 *   game:choice      {options, deadline}
 *   game:choice_progress {voted, total}
 *   game:choice_result   {winner, tally}
 *   game:ended       {}
 */

'use strict';

const path = require('path');
const http = require('http');
const url  = require('url');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const HOST = process.env.DDLC_HOST || '0.0.0.0';
const PORT = parseInt(process.env.DDLC_PORT || '8001', 10);

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
/** @type {Map<string, any>} */            const rooms        = new Map();
/** @type {Map<string, any>} */            const clients      = new Map();   // clientId -> {ws, username, roomCode}
/** @type {Map<string, NodeJS.Timeout>} */ const expiryTimers = new Map();
/** @type {Map<string, NodeJS.Timeout>} */ const voteTimers   = new Map();

const CHARACTERS         = ['sayori', 'natsuki', 'yuri', 'monika'];
const ROOM_TTL_MS        = 10 * 60 * 1000;
const VOTE_DEADLINE_MS   = 30 * 1000;
const INACTIVE_LAUNCH_MS = 60 * 1000;

function genId() { return crypto.randomUUID(); }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function sanitizeUsername(name) {
  if (typeof name !== 'string') return null;
  const t = name.trim();
  return /^[A-Za-z0-9_]{1,16}$/.test(t) ? t : null;
}

function publicView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    visibility: room.visibility,
    maxPlayers: room.maxPlayers,
    players: room.players,
    spectators: room.spectators,
    state: room.state,
    scene: room.scene,
    createdAt: room.createdAt,
  };
}

function send(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(payload)); } catch (_) {}
}

function broadcast(room, payload) {
  const raw = JSON.stringify(payload);
  const ids = [...room.players.map(p => p.id), ...room.spectators.map(s => s.id)];
  for (const cid of ids) {
    const c = clients.get(cid);
    if (c && c.ws && c.ws.readyState === 1) {
      try { c.ws.send(raw); } catch (_) {}
    }
  }
}

function broadcastRoom(room)        { broadcast(room, { event: 'room:updated', room: publicView(room) }); }
function broadcastPublicList()      {
  const list = [...rooms.values()]
    .filter(r => r.visibility === 'public' && r.state !== 'ended')
    .map(r => ({ code: r.code, players: r.players.length, maxPlayers: r.maxPlayers, state: r.state }));
  for (const c of clients.values()) {
    send(c.ws, { event: 'room:list', rooms: list });
  }
}

function findRoomForClient(cid) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === cid) ||
        room.spectators.some(s => s.id === cid)) return room;
  }
  return null;
}

function scheduleExpiry(code) {
  if (expiryTimers.has(code)) return;
  const t = setTimeout(() => {
    rooms.delete(code);
    expiryTimers.delete(code);
    console.log(`[room ${code}] expired`);
    broadcastPublicList();
  }, ROOM_TTL_MS);
  expiryTimers.set(code, t);
}
function cancelExpiry(code) {
  const t = expiryTimers.get(code);
  if (t) { clearTimeout(t); expiryTimers.delete(code); }
}

// ---------------------------------------------------------------------------
// Game flow helpers
// ---------------------------------------------------------------------------
function presentChoice(room, options) {
  room.scene.choices = options;
  room.scene.votes   = {};
  const deadline = Date.now() + VOTE_DEADLINE_MS;
  broadcast(room, { event: 'game:choice', options, deadline });
  const existing = voteTimers.get(room.code);
  if (existing) clearTimeout(existing);
  voteTimers.set(room.code, setTimeout(() => resolveVote(room), VOTE_DEADLINE_MS));
}

function resolveVote(room) {
  if (!room.scene.choices) return;
  const t = voteTimers.get(room.code);
  if (t) { clearTimeout(t); voteTimers.delete(room.code); }
  const tally = Object.fromEntries(room.scene.choices.map(o => [o, 0]));
  for (const v of Object.values(room.scene.votes)) {
    if (tally[v] !== undefined) tally[v] += 1;
  }
  let winner = room.scene.choices[0], best = -1;
  for (const [opt, n] of Object.entries(tally)) {
    if (n > best) { best = n; winner = opt; }
  }
  broadcast(room, { event: 'game:choice_result', winner, tally });
  room.scene.choices = null;
  room.scene.votes   = {};
}

function handleLeave(cid) {
  const room = findRoomForClient(cid);
  if (!room) return;
  const pIdx = room.players.findIndex(p => p.id === cid);
  const sIdx = room.spectators.findIndex(s => s.id === cid);
  if (pIdx >= 0) room.players.splice(pIdx, 1);
  if (sIdx >= 0) room.spectators.splice(sIdx, 1);

  if (room.players.length === 0 && room.spectators.length === 0) {
    scheduleExpiry(room.code);
  } else if (room.hostId === cid && room.players.length > 0) {
    room.hostId = room.players[0].id;
    broadcast(room, { event: 'host:transferred', hostId: room.hostId, reason: 'host_disconnect' });
    // Tell new host to take scene authority
    const newHost = clients.get(room.hostId);
    if (newHost) send(newHost.ws, { event: 'host:claim', room: publicView(room) });
  }
  broadcastRoom(room);
  broadcastPublicList();
}

// ---------------------------------------------------------------------------
// HTTP — just /api/health (no static React)
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: clients.size, ts: Date.now() }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('DDLC Together — raw WS only.  Connect to ws://host:8001/ws');
});

// ---------------------------------------------------------------------------
// WebSocket — /ws
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, sock, head) => {
  const { pathname } = url.parse(req.url, true);
  if (pathname === '/ws') {
    wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws, req));
  } else {
    sock.destroy();
  }
});

wss.on('connection', (ws) => {
  const cid = genId();
  ws.cid = cid;
  clients.set(cid, { ws, username: null, roomCode: null });
  send(ws, { event: 'ws:connected', clientId: cid });
  console.log(`[ws ${cid.slice(0, 8)}] connected (${clients.size} total)`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    handleMessage(cid, msg);
  });

  ws.on('close', () => {
    console.log(`[ws ${cid.slice(0, 8)}] disconnected`);
    handleLeave(cid);
    clients.delete(cid);
  });

  ws.on('error', (e) => console.log(`[ws ${cid.slice(0, 8)}] error`, e.message));
});

function handleMessage(cid, msg) {
  const client = clients.get(cid);
  if (!client) return;
  const evt = msg.event;
  const ws  = client.ws;

  switch (evt) {
    case 'room:create': {
      const name = sanitizeUsername(msg.username);
      if (!name) return send(ws, { event: 'ws:error', message: 'invalid_username' });
      const max = Math.max(2, Math.min(5, parseInt(msg.maxPlayers, 10) || 4));
      const vis = msg.visibility === 'private' ? 'private' : 'public';
      const code = genCode();
      const room = {
        code,
        hostId: cid,
        visibility: vis,
        maxPlayers: max,
        players: [{ id: cid, username: name, character: null, active: true, joinedAt: Date.now() }],
        spectators: [],
        state: 'lobby',
        scene: { label: null, choices: null, votes: {} },
        createdAt: Date.now(),
      };
      rooms.set(code, room);
      client.username = name;
      client.roomCode = code;
      send(ws, { event: 'room:created', code, room: publicView(room) });
      broadcastPublicList();
      console.log(`[room ${code}] created by ${name}`);
      return;
    }
    case 'room:join': {
      const name = sanitizeUsername(msg.username);
      if (!name) return send(ws, { event: 'ws:error', message: 'invalid_username' });
      const room = rooms.get((msg.code || '').toUpperCase());
      if (!room) return send(ws, { event: 'ws:error', message: 'room_not_found' });

      const existingPlayer = room.players.find(p => p.id === cid);
      const existingSpec   = room.spectators.find(s => s.id === cid);
      if (existingPlayer) {
        return send(ws, { event: 'room:joined', code: room.code, room: publicView(room), as: 'player' });
      }
      if (existingSpec) {
        return send(ws, { event: 'room:joined', code: room.code, room: publicView(room), as: 'spectator' });
      }
      if (room.players.length >= room.maxPlayers || room.state !== 'lobby') {
        room.spectators.push({ id: cid, username: name });
        client.username = name; client.roomCode = room.code;
        send(ws, { event: 'room:joined', code: room.code, room: publicView(room), as: 'spectator' });
      } else {
        room.players.push({ id: cid, username: name, character: null, active: true, joinedAt: Date.now() });
        client.username = name; client.roomCode = room.code;
        send(ws, { event: 'room:joined', code: room.code, room: publicView(room), as: 'player' });
      }
      cancelExpiry(room.code);
      broadcastRoom(room);
      broadcastPublicList();
      return;
    }
    case 'room:list': {
      const list = [...rooms.values()]
        .filter(r => r.visibility === 'public' && r.state !== 'ended')
        .map(r => ({ code: r.code, players: r.players.length, maxPlayers: r.maxPlayers, state: r.state }));
      send(ws, { event: 'room:list', rooms: list });
      return;
    }
    case 'room:leave': {
      handleLeave(cid);
      return;
    }
    case 'player:character_select': {
      const room = findRoomForClient(cid);
      if (!room) return;
      if (!CHARACTERS.includes(msg.character)) return;
      if (room.players.some(p => p.character === msg.character && p.id !== cid)) return;
      const me = room.players.find(p => p.id === cid);
      if (!me) return;
      me.character = msg.character;
      me.active    = true;
      broadcastRoom(room);
      return;
    }
    case 'spectator:become_player': {
      const room = findRoomForClient(cid);
      if (!room) return;
      if (room.players.length >= room.maxPlayers) return;
      if (!CHARACTERS.includes(msg.character)) return;
      if (room.players.some(p => p.character === msg.character)) return;
      const idx = room.spectators.findIndex(s => s.id === cid);
      if (idx < 0) return;
      const [spec] = room.spectators.splice(idx, 1);
      room.players.push({ id: spec.id, username: spec.username, character: msg.character, active: true, joinedAt: Date.now() });
      broadcastRoom(room);
      return;
    }
    case 'game:start': {
      const room = findRoomForClient(cid);
      if (!room || room.hostId !== cid) return;
      const active = room.players.filter(p => p.character);
      const ageMs  = Date.now() - room.createdAt;
      if (active.length < 2 && ageMs < INACTIVE_LAUNCH_MS) return;
      if (active.length < 1) return;
      room.state = 'in_game';
      broadcast(room, { event: 'game:started', code: room.code });
      broadcastRoom(room);
      broadcastPublicList();
      return;
    }
    case 'game:scene_advance': {
      const room = findRoomForClient(cid);
      if (!room || room.hostId !== cid) return;
      room.scene.label = msg.label;
      broadcast(room, { event: 'game:scene', label: msg.label });
      return;
    }
    case 'game:choice_present': {
      const room = findRoomForClient(cid);
      if (!room || room.hostId !== cid) return;
      if (!Array.isArray(msg.options) || msg.options.length === 0) return;
      presentChoice(room, msg.options);
      return;
    }
    case 'game:choice_vote': {
      const room = findRoomForClient(cid);
      if (!room || !room.scene.choices) return;
      if (!room.scene.choices.includes(msg.option)) return;
      room.scene.votes[cid] = msg.option;
      broadcast(room, {
        event: 'game:choice_progress',
        voted: Object.keys(room.scene.votes).length,
        total: room.players.length,
      });
      if (Object.keys(room.scene.votes).length >= room.players.length) resolveVote(room);
      return;
    }
    case 'game:end': {
      const room = findRoomForClient(cid);
      if (!room || room.hostId !== cid) return;
      room.state = 'ended';
      broadcast(room, { event: 'game:ended' });
      broadcastRoom(room);
      broadcastPublicList();
      return;
    }
    case 'host:transfer': {
      const room = findRoomForClient(cid);
      if (!room || room.hostId !== cid) return;
      if (!room.players.some(p => p.id === msg.targetId)) return;
      room.hostId = msg.targetId;
      broadcastRoom(room);
      broadcast(room, { event: 'host:transferred', hostId: msg.targetId, reason: 'manual' });
      const target = clients.get(msg.targetId);
      if (target) send(target.ws, { event: 'host:claim', room: publicView(room) });
      return;
    }
    case 'player:kick': {
      const room = findRoomForClient(cid);
      if (!room || room.hostId !== cid) return;
      const idx = room.players.findIndex(p => p.id === msg.targetId);
      if (idx < 0) return;
      const [removed] = room.players.splice(idx, 1);
      const tgt = clients.get(removed.id);
      if (tgt) {
        send(tgt.ws, { event: 'room:kicked', code: room.code });
        tgt.roomCode = null;
      }
      broadcastRoom(room);
      broadcastPublicList();
      return;
    }
    default:
      console.log(`[ws ${cid.slice(0, 8)}] unknown event:`, evt);
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, HOST, () => {
  console.log(`DDLC Together server running on http://${HOST}:${PORT}`);
  console.log(`  WS  ws://${HOST}:${PORT}/ws`);
  console.log(`  GET http://${HOST}:${PORT}/api/health`);
});
