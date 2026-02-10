import React from 'react';
import ReactDOM from 'react-dom/client';
import { SceneRouter } from './scenes/SceneRouter';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SceneRouter />
  </React.StrictMode>,
);
