import crypto from 'node:crypto';
export const sha1Hex = (s) => crypto.createHash('sha1').update(s || '', 'utf8').digest('hex');
