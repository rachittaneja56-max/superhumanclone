import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';

function requireKey(key: string): string {
  if (key.length !== 64) {
    throw new Error('FATAL: ENCRYPTION_KEY must be exactly 64 characters long (32 bytes hex encoded).');
  }
  return key;
}

/**
 * Encrypts a string using AES-256-GCM.
 * @param text The plaintext to encrypt.
 * @param key The 64-character hex encoded encryption key.
 * @returns The encrypted string in the format "iv:authTag:ciphertext".
 */
export function encrypt(text: string, key: string): string {
  const iv = randomBytes(12);
  const keyBuffer = Buffer.from(key, 'hex');
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * @param encryptedText The encrypted string in the format "iv:authTag:ciphertext".
 * @param key The 64-character hex encoded encryption key.
 * @returns The decrypted plaintext.
 */
export function decrypt(encryptedText: string, key: string): string {
  const [ivHex, authTagHex, ciphertext] = encryptedText.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const keyBuffer = Buffer.from(key, 'hex');
  
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  
  let text = decipher.update(ciphertext, 'hex', 'utf8');
  text += decipher.final('utf8');
  
  return text;
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 * @param a First string
 * @param b Second string
 * @returns True if they are identical, false otherwise
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
