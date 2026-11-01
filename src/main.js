import './style.css';
import { Game } from './core/Game.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__GAME__ = game;
});

