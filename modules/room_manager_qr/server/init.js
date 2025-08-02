import roomQrRoutes from './routes.js';
import { initRoomDB } from './model.js';

export function ROOMQR__initServer(app) {
  app.use('/api/room-manager-qr', roomQrRoutes);
  initRoomDB();
}
