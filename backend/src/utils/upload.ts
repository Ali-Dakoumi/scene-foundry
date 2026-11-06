import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';

export const uploadsDirectory = path.resolve(process.cwd(), 'public/uploads');
mkdirSync(uploadsDirectory, { recursive: true });

const allowedExtensions = new Set([
  '.fbx', '.gif', '.glb', '.gltf', '.jpeg', '.jpg', '.obj', '.png', '.svg', '.webp',
]);

const storage = multer.diskStorage({
  destination: uploadsDirectory,
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      callback(new Error(`Unsupported asset type: ${extension || 'unknown'}`));
      return;
    }
    callback(null, true);
  },
});
