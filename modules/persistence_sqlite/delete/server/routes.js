import express from 'express';
import {
  handleSetExpiration,
  handleDeleteAll,
  handleGetExpiration
} from './controller.js';

const router = express.Router();

router.post('/delete/set-expiration', handleSetExpiration);
router.get('/delete/get-expiration', handleGetExpiration);
router.post('/delete/delete-all', handleDeleteAll);


export default router;
