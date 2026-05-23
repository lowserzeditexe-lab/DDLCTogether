import React from 'react';

const NAMES = {
  sayori: 'Sayori',
  natsuki: 'Natsuki',
  yuri: 'Yuri',
  monika: 'Monika',
};

export default function CharacterCard({ character, selected, disabled, onClick }) {
  const click = () => { if (!disabled) onClick?.(); };
  return (
    <div
      className={`char-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      data-testid={`char-${character}`}
      onClick={click}
    >
      <div className={`char-portrait ${character}`}>
        {NAMES[character][0]}
      </div>
      <div className="char-name">{NAMES[character]}</div>
    </div>
  );
}
