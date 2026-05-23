import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UsernameModal from '../components/UsernameModal.jsx';
import { getUsername } from '../socket.js';

export default function Home() {
  const navigate = useNavigate();
  const [needName, setNeedName] = useState(false);

  useEffect(() => {
    document.body.className = 'page';
    if (!getUsername()) setNeedName(true);
  }, []);

  const onMultiplayer = () => {
    if (!getUsername()) return setNeedName(true);
    navigate('/rooms');
  };

  return (
    <div className="center-screen">
      <h1 className="title" data-testid="home-title">DDLC Together</h1>
      <p className="subtitle">Doki Doki Literature Club — édition multijoueur</p>

      <button
        className="btn"
        data-testid="open-multiplayer-btn"
        onClick={onMultiplayer}
        style={{ minWidth: 240, fontSize: 22, padding: '18px 40px' }}
      >
        Multijoueur
      </button>

      <p style={{ color: 'var(--muted)', marginTop: 32, fontSize: 13 }}>
        Bienvenue dans le club&nbsp;! ♥
      </p>

      {needName && <UsernameModal onDone={() => setNeedName(false)} />}
    </div>
  );
}
