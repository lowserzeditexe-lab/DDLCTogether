import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket, getUsername } from '../socket.js';
import UsernameModal from '../components/UsernameModal.jsx';

export default function RoomBrowser() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [needName, setNeedName] = useState(!getUsername());
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    document.body.className = 'page';
    socket.emit('room:list');
    const onList = (list) => setRooms(list);
    const onCreated = ({ code }) => nav(`/lobby/${code}`);
    const onJoined = ({ code }) => nav(`/lobby/${code}`);
    const onErr = ({ message }) => alert('Erreur : ' + message);
    socket.on('room:list', onList);
    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:error', onErr);
    const t = setInterval(() => socket.emit('room:list'), 4000);
    return () => {
      socket.off('room:list', onList);
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:error', onErr);
      clearInterval(t);
    };
  }, [nav]);

  return (
    <div className="center-screen" style={{ justifyContent: 'flex-start', paddingTop: 48 }}>
      <h1 className="title" style={{ fontSize: 44 }}>Salons</h1>
      <p className="subtitle">Rejoignez un salon public ou créez le vôtre</p>

      <div className="room-list" data-testid="room-list">
        {rooms.length === 0 && (
          <div className="panel" style={{ textAlign: 'center', color: 'var(--muted)' }}>
            Aucun salon public pour le moment. Soyez le premier&nbsp;!
          </div>
        )}
        {rooms.map(r => (
          <div className="room-row" key={r.code} data-testid={`room-${r.code}`}>
            <div className="room-code">{r.code}</div>
            <div className="room-meta">{r.players}/{r.maxPlayers} joueurs</div>
            <div className={`badge ${r.state === 'lobby' ? 'badge-waiting' : 'badge-in-game'}`}>
              {r.state === 'lobby' ? 'En attente' : 'En cours'}
            </div>
            <button
              className="btn-secondary btn"
              data-testid={`join-room-${r.code}`}
              style={{ padding: '8px 18px', fontSize: 14 }}
              onClick={() => socket.emit('room:join', { username: getUsername(), code: r.code })}
            >
              Rejoindre
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
        <button className="btn" data-testid="open-create-btn" onClick={() => setShowCreate(true)}>
          Créer un salon
        </button>
        <button className="btn-secondary btn" data-testid="open-join-btn" onClick={() => setShowJoin(true)}>
          Rejoindre un salon
        </button>
      </div>

      {needName && <UsernameModal onDone={() => setNeedName(false)} />}
      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinRoomModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}

function CreateRoomModal({ onClose }) {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [visibility, setVisibility] = useState('public');
  const create = () => {
    socket.emit('room:create', { username: getUsername(), maxPlayers, visibility });
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Créer un salon</h2>
        <label className="label">Nombre de joueurs max : {maxPlayers}</label>
        <input
          type="range" min="2" max="5" value={maxPlayers}
          data-testid="max-players-slider"
          onChange={e => setMaxPlayers(parseInt(e.target.value, 10))}
          style={{ width: '100%' }}
        />
        <label className="label">Visibilité</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="vis-public-btn"
            className={visibility === 'public' ? 'btn' : 'btn-secondary btn'}
            style={{ flex: 1, padding: '10px' }}
            onClick={() => setVisibility('public')}
          >Public</button>
          <button
            data-testid="vis-private-btn"
            className={visibility === 'private' ? 'btn' : 'btn-secondary btn'}
            style={{ flex: 1, padding: '10px' }}
            onClick={() => setVisibility('private')}
          >Privé</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn" data-testid="confirm-create-btn" onClick={create}>Créer</button>
        </div>
      </div>
    </div>
  );
}

function JoinRoomModal({ onClose }) {
  const [code, setCode] = useState('');
  const join = () => {
    if (!code.trim()) return;
    socket.emit('room:join', { username: getUsername(), code: code.trim().toUpperCase() });
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Rejoindre un salon</h2>
        <label className="label">Code du salon</label>
        <input
          className="input"
          data-testid="join-code-input"
          placeholder="ex : XK4T2A"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && join()}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn" data-testid="confirm-join-btn" onClick={join}>Rejoindre</button>
        </div>
      </div>
    </div>
  );
}
