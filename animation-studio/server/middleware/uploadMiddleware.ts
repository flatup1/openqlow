import multer from 'multer';
import { config } from '../config.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** メモリ上で受け取り、MIMEとサイズを検証する。拡張子だけは信用しない。 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
}).single('image');

export { ALLOWED_MIME };
