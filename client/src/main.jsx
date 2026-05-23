import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import './styles.css';
import Home from './pages/Home.jsx';
import RoomBrowser from './pages/RoomBrowser.jsx';
import Lobby from './pages/Lobby.jsx';
import Overlay from './pages/Overlay.jsx';

// HashRouter so the same static bundle works from disk (pywebview) AND from server
ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rooms" element={<RoomBrowser />} />
      <Route path="/lobby/:code" element={<Lobby />} />
      <Route path="/overlay/:code" element={<Overlay />} />
    </Routes>
  </HashRouter>
);
