/* Turns an uploaded photo into the two WebP sizes the storefront uses. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { invalid } from './errors.js';

const SIZES = { small: 480, large: 1200 };
const MAX_PIXELS = 60e6; // stops a tiny file that expands into a huge image
const UPLOAD_NAME = /^uploads\/([0-9a-f-]{36}-(?:480|1200)\.webp)$/;

export async function saveImage(buffer, uploadDir) {
  const open = () => sharp(buffer, { limitInputPixels: MAX_PIXELS });
  const bad = () => invalid('That file isn’t a photo we can read. Use a JPG, PNG or WebP image.');

  let meta;
  try {
    meta = await open().metadata();
  } catch {
    throw bad();
  }
  // trust the decoded content, not the file name or the type the browser claims
  if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw bad();

  await fs.mkdir(uploadDir, { recursive: true });
  const id = crypto.randomUUID();
  const files = Object.fromEntries(Object.entries(SIZES).map(([key, width]) => [key, `${id}-${width}.webp`]));
  try {
    for (const [key, width] of Object.entries(SIZES)) {
      // rotate() applies the camera's orientation; re-encoding drops EXIF data, including location
      await open().rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(uploadDir, files[key]));
    }
  } catch {
    await removeImageFiles(Object.values(files).map((f) => `uploads/${f}`), uploadDir);
    throw bad();
  }
  const sideways = (meta.orientation || 1) >= 5;
  return {
    width: sideways ? meta.height : meta.width,
    height: sideways ? meta.width : meta.height,
    small: `uploads/${files.small}`,
    large: `uploads/${files.large}`,
  };
}

/** only ever deletes files this server created; the photos committed with the website are left alone */
export async function removeImageFiles(urls, uploadDir) {
  for (const url of urls) {
    const m = UPLOAD_NAME.exec(url);
    if (m) await fs.rm(path.join(uploadDir, m[1]), { force: true });
  }
}
