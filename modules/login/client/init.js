// modules/login/client/init.js
import { LOGIN__setupUI } from './ui.js';
import { LOGIN__checkAndRedirect } from './logic.js';

export function LOGIN__initClient() {
  LOGIN__setupUI();
  LOGIN__checkAndRedirect();
}
