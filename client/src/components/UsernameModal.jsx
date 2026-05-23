import React, { useState } from 'react';
import { setUsername } from '../socket.js';

export default function UsernameModal({ onDone }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    const v = name.trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(v)) {
      setErr('1 à 16 caractères, lettres/chiffres/underscore uniquement');
      return;
    }
    setUsername(v);
    onDone();
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Choisis ton pseudo</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Il sera visible par les autres membres du club.
        </p>
        <input
          className="input"
          data-testid="username-input"
          placeholder="ex : Sayonika"
          maxLength={16}
          value={name}
          onChange={e => { setName(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
        />
        {err && <div style={{ color: 'var(--accent-strong)', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <button
          className="btn"
          data-testid="username-submit"
          style={{ width: '100%', marginTop: 16 }}
          onClick={submit}
        >Confirmer</button>
      </div>
    </div>
  );
}
