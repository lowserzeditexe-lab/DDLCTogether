import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket, getUsername } from '../socket.js';
import CharacterCard from '../components/CharacterCard.jsx';

const CHARS = ['sayori', 'natsuki', 'yuri', 'monika'];

export default function Lobby() {
  const { code } = useParams();
  const nav = useNavigate();
  const [room, setRoom] = useState(null);
  const [age, setAge] = useState(0);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    document.body.className = 'page';
    socket.emit('room:join', { username: getUsername(), code });

    const onUpdated = (r) => setRoom(r);
    const onJoined = ({ room }) => setRoom(room);
    const onStarted = () => nav(`/overlay/${code}`);
    const onKicked = () => { alert('Vous avez été expulsé du salon'); nav('/rooms'); };
    const onErr = ({ message }) => { alert('Erreur : ' + message); nav('/rooms'); };

    socket.on('room:updated', onUpdated);
    socket.on('room:joined', onJoined);
    socket.on('game:started', onStarted);
    socket.on('room:kicked', onKicked);
    socket.on('room:error', onErr);

    const t = setInterval(() => setAge(a => a + 1), 1000);
    return () => {
      socket.off('room:updated', onUpdated);
      socket.off('room:joined', onJoined);
      socket.off('game:started', onStarted);
      socket.off('room:kicked', onKicked);
      socket.off('room:error', onErr);
      clearInterval(t);
      socket.emit('room:leave');
    };
  }, [code, nav]);

  if (!room) {
    return <div className="center-screen"><div className="panel">Connexion au salon…</div></div>;
  }

  const me = room.players.find(p => p.id === socket.id);
  const isHost = room.hostId === socket.id;
  const claimed = new Set(room.players.map(p => p.character).filter(Boolean));
  const activeWithChar = room.players.filter(p => p.character).length;
  const lobbyAgeMs = Date.now() - room.createdAt;
  const canForceLaunch = lobbyAgeMs > 60000;
  const canLaunch = isHost && (activeWithChar >= 2 || (canForceLaunch && activeWithChar >= 1));

  const copyCode = () => {
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyInviteLink = () => {
    const link = `ddlctgthr://${room.code}/lobby`;
    navigator.clipboard?.writeText(link).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  return (
    <div className="center-screen" style={{ justifyContent: 'flex-start', paddingTop: 32 }}>
      <div className="panel panel-lg" style={{ width: 'min(720px, 95vw)' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div className="label" style={{ margin: 0 }}>Code du salon</div>
          <div
            data-testid="lobby-code"
            style={{ fontSize: 44, fontWeight: 800, letterSpacing: 8, color: 'var(--accent-strong)', cursor: 'pointer' }}
            onClick={copyCode}
            title="Cliquer pour copier"
          >
            {room.code}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', height: 16 }}>
            {copied ? 'Copié !' : 'Cliquer pour copier'}
          </div>
          <button
            className="btn-ghost"
            data-testid="copy-invite-link-btn"
            onClick={copyInviteLink}
            style={{ marginTop: 8, fontSize: 13 }}
          >
            {linkCopied ? 'Lien copié !' : 'Copier le lien d\u2019invitation'}
          </button>
        </div>

        <div className="label">Joueurs ({room.players.length}/{room.maxPlayers})</div>
        <div>
          {room.players.map(p => {
            const inactive = !p.character && (Date.now() - p.joinedAt) > 60000;
            return (
              <div className="player-row" key={p.id} data-testid={`player-row-${p.id}`}>
                <div className="player-portrait">
                  {p.character ? p.character[0].toUpperCase() : '?'}
                </div>
                <div className="player-name">
                  {p.username}
                  {p.character && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {cap(p.character)}</span>}
                </div>
                {room.hostId === p.id && <span className="badge badge-host">Host</span>}
                {inactive && <span className="badge badge-warn">Inactif</span>}
                {isHost && p.id !== socket.id && (
                  <>
                    <button
                      className="btn-ghost"
                      title="Passer le host"
                      data-testid={`transfer-host-${p.id}`}
                      onClick={() => socket.emit('host:transfer', { targetId: p.id })}
                    >★</button>
                    <button
                      className="btn-ghost"
                      title="Expulser"
                      data-testid={`kick-${p.id}`}
                      onClick={() => socket.emit('player:kick', { targetId: p.id })}
                    >×</button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="label" style={{ marginTop: 24 }}>Choisissez votre personnage</div>
        <div className="char-grid">
          {CHARS.map(c => (
            <CharacterCard
              key={c}
              character={c}
              selected={me?.character === c}
              disabled={claimed.has(c) && me?.character !== c}
              onClick={() => socket.emit('player:character_select', { character: c })}
            />
          ))}
        </div>

        {isHost && (
          <button
            className="btn"
            data-testid="launch-game-btn"
            disabled={!canLaunch}
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => socket.emit('game:start', {})}
          >
            {canLaunch ? 'Lancer la partie' : `En attente (${activeWithChar}/${room.maxPlayers})`}
          </button>
        )}

        <button
          className="btn-ghost"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => { socket.emit('room:leave'); nav('/rooms'); }}
        >Quitter le salon</button>
      </div>
      <span style={{ display: 'none' }}>{age}</span>
    </div>
  );
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
