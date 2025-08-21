import pino from 'pino';
import { config } from '../config/index.js';

export const log = pino({ level: config.LOG_LEVEL, base: undefined });
