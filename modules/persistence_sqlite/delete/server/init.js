import express from 'express';
import persistenceRoutes from './routes.js';
import { setupDB } from './model.js';

export function PERSIST__initServer(app) {
  app.use('/api/persistence-sqlite', persistenceRoutes);
  setupDB(); // includes schema setup + auto-cleaner
}
