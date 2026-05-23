import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket, getUsername } from '../socket.js';
import CharacterCard from '../components/CharacterCard.jsx';

const CHARS = ['sayori', 'natsuki', 'yuri', 'monika'];

/**
 * Always-on-top transparent overlay (loaded in pywebview).
 * Shows participants panel (top-right), vote panel (bottom), spectator banner.
 */
export default function Overlay() {
  const { code } = useParams();
  const [room, setRoom] = useState(null);
  const [choice, setChoice] = useState(null);   // { options, deadline }
  const [voted, setVoted] = useState(null);
  const [winner, setWinner] = useState(null);
  const [progress, setProgress] = useState({ voted: 0, total: 0 });
  const [now, setNow] = useState(Date.now());
  const [showCharModal, setShowCharModal] = useState(false);

  useEffect(() => {
    document.body.classList.add('overlay-body');
    socket.emit('room:join', { username: getUsername(), code });

    const onUpdated = (r) => setRoom(r);
    const onJoined = ({ room }) => setRoom(room);
    const onChoice = ({ options, deadline }) => {
      setChoice({ options, deadline });
      setVoted(null);
      setWinner(null);
      setProgress({ voted: 0, total: room?.players.length || 0 });
    };
    const onProgress = (p) => setProgress(p);
    const onResult = ({ winner }) => {
      setWinner(winner);
      setTimeout(() => { setChoice(null); setWinner(null); }, 1800);
    };

    socket.on('room:updated', onUpdated);
    socket.on('room:joined', onJoined);
    socket.on('game:choice', onChoice);
    socket.on('game:choice_progress', onProgress);
    socket.on('game:choice_result', onResult);

    const t = setInterval(() => setNow(Date.now()), 500);
    return () => {
      socket.off('room:updated', onUpdated);
      socket.off('room:joined', onJoined);
      socket.off('game:choice', onChoice);
      socket.off('game:choice_progress', onProgress);
      socket.off('game:choice_result', onResult);
      clearInterval(t);
      document.body.classList.remove('overlay-body');
    };
  }, [code]);

  if (!room) return null;

  const me = room.players.find(p => p.id === socket.id);
  const isSpec = !me;
  const claimed = new Set(room.players.map(p => p.character).filter(Boolean));

  const vote = (opt) => {
    if (voted) return;
    setVoted(opt);
    socket.emit('game:choice_vote', { option: opt });
  };

  const timeLeftRatio = choice
    ? Math.max(0, Math.min(1, (choice.deadline - now) / 30000))
    : 0;

  return (
    <div className="overlay-root" data-testid="overlay-root">
      <div className="participants-card" data-testid="participants-card">
        <div className="room-label">Salon · {room.code}</div>
        {room.players.map(p => (
          <div className="participant-row" key={p.id}>
            <span className="dot active" />
            <span>{p.character ? cap(p.character) : 'En attente'} — {p.username}</span>
          </div>
        ))}
        {room.spectators.map(s => (
          <div className="participant-row" key={s.id}>
            <span className="dot spectator" />
            <span style={{ opacity: 0.7 }}>Spectateur — {s.username}</span>
          </div>
        ))}
      </div>

      {isSpec && (
        <div
          className="spectator-banner"
          data-testid="spectator-banner"
          onClick={() => setShowCharModal(true)}
        >
          Spectateur — Rejoindre →
        </div>
      )}

      {choice && (
        <div className="vote-panel" data-testid="vote-panel">
          <div className="vote-options">
            {choice.options.map(opt => {
              const isV = voted === opt;
              const isW = winner === opt;
              return (
                <button
                  key={opt}
                  className={`vote-btn ${isV ? 'voted' : ''} ${isW ? 'winner' : ''}`}
                  data-testid={`vote-${opt}`}
                  onClick={() => vote(opt)}
                  disabled={!!voted || isSpec}
                >
                  <span>{opt}</span>
                  {isV && <span className="check">✓</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
            <span data-testid="vote-progress">
              {progress.voted} / {progress.total || room.players.length} joueurs ont voté
            </span>
            <span>{Math.ceil((choice.deadline - now) / 1000)}s</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{
              width: `${(progress.voted / Math.max(1, progress.total || room.players.length)) * 100}%`
            }} />
          </div>
          <div className="countdown-bar">
            <div className="countdown-fill" style={{ width: `${timeLeftRatio * 100}%` }} />
          </div>
        </div>
      )}

      {showCharModal && (
        <div className="modal-backdrop" onClick={() => setShowCharModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Choisir un personnage</h2>
            <div className="char-grid">
              {CHARS.map(c => (
                <CharacterCard
                  key={c}
                  character={c}
                  selected={false}
                  disabled={claimed.has(c)}
                  onClick={() => {
                    socket.emit('spectator:become_player', { character: c });
                    setShowCharModal(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
