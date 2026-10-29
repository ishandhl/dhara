// Encrypt / decrypt a backup file with a passphrase (AES-256-GCM, key from scrypt).
//   node scripts/backup/crypt.mjs encrypt <in> <out>
//   node scripts/backup/crypt.mjs decrypt <in> <out>
// Passphrase: BACKUP_PASSPHRASE environment variable. Without it the backups cannot be read — keep it safe.
// File layout: "DSBK1" | salt(16) | iv(12) | ciphertext | tag(16)
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('DSBK1');
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function key(passphrase, salt) {
  if (!passphrase || passphrase.length < 12) throw new Error('BACKUP_PASSPHRASE must be set (at least 12 characters)');
  return scryptSync(passphrase, salt, 32, SCRYPT);
}

export async function encryptFile(input, output, passphrase = process.env.BACKUP_PASSPHRASE) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  await pipeline(
    createReadStream(input),
    cipher,
    async function* (encrypted) {
      yield Buffer.concat([MAGIC, salt, iv]);
      for await (const chunk of encrypted) yield chunk;
      yield cipher.getAuthTag(); // available once the cipher has finished
    },
    createWriteStream(output),
  );
}

export async function decryptFile(input, output, passphrase = process.env.BACKUP_PASSPHRASE) {
  const size = statSync(input).size;
  const head = Buffer.alloc(MAGIC.length + 28);
  const tag = Buffer.alloc(16);
  const fd = openSync(input, 'r');
  readSync(fd, head, 0, head.length, 0);
  readSync(fd, tag, 0, 16, size - 16);
  closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a StoreSync backup file');
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = head.subarray(MAGIC.length + 16);
  const decipher = createDecipheriv('aes-256-gcm', key(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(input, { start: head.length, end: size - 17 }), decipher, createWriteStream(output));
  } catch (e) {
    throw new Error(e.message.includes('authenticate') ? 'Wrong passphrase, or the file is damaged' : e.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , mode, input, output] = process.argv;
  if (!['encrypt', 'decrypt'].includes(mode) || !input || !output) {
    console.error('Usage: node scripts/backup/crypt.mjs encrypt|decrypt <in> <out>');
    process.exit(2);
  }
  (mode === 'encrypt' ? encryptFile : decryptFile)(input, output)
    .then(() => console.log(`${mode}ed ${input} → ${output}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
