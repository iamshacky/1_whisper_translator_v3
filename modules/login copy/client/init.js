// modules/login/client/init.js
import { LOGIN__loginButton } from './login_button.js';
import { LOGIN__checkAndRedirect } from './logic.js';

export function LOGIN__initClient() {
  LOGIN__loginButton();
  LOGIN__checkAndRedirect();
}
