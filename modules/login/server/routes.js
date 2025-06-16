// modules/login/server/routes.js

import express from 'express';
import { loginUser, createUser } from './controller.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', createUser);

export default router;
