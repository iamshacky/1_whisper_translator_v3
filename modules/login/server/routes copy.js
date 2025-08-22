// modules/login/server/routes.js

import express from 'express';
import { loginUser, createUser, getMyCreatedRooms } from './controller.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', createUser);
router.get('/my-created-rooms', getMyCreatedRooms);

export default router;
