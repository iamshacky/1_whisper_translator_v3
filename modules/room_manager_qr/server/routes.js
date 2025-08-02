import express from 'express';
import { handleRegisterRoom, handleCheckRoomValid } from './controller.js';

const router = express.Router();

router.post('/register', handleRegisterRoom);
router.get('/is-valid', handleCheckRoomValid);

export default router;
