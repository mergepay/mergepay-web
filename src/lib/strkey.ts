/**
 * Minimal client-side StrKey validation for Stellar ed25519 public keys.
 *
 * Mirrors the relevant parts of stellar-base's StrKey without pulling the full
 * SDK into the browser bundle: base32-decode, check the version byte, and
 * verify the trailing CRC16-XModem checksum.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const VERSION_BYTE_ED25519_PUBLIC = 6 << 3; // 'G'

function base32Decode(input: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const idx = B32_ALPHABET.indexOf(input[i]);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < bytes.length; i++) {
    let code = (crc >>> 8) & 0xff;
    code ^= bytes[i] & 0xff;
    code ^= code >>> 4;
    crc = (crc << 8) & 0xffff;
    crc ^= code;
    code = (code << 5) & 0xffff;
    crc ^= code;
    code = (code << 7) & 0xffff;
    crc ^= code;
  }
  return crc & 0xffff;
}

export const StrKey = {
  isValidEd25519PublicKey(key: string): boolean {
    if (typeof key !== "string") return false;
    if (!/^G[A-Z2-7]{55}$/.test(key)) return false;
    const decoded = base32Decode(key);
    // 1 version byte + 32 key bytes + 2 checksum bytes = 35
    if (!decoded || decoded.length !== 35) return false;
    if (decoded[0] !== VERSION_BYTE_ED25519_PUBLIC) return false;
    const payload = decoded.slice(0, 33);
    const checksum = decoded[33] | (decoded[34] << 8);
    return crc16xmodem(payload) === checksum;
  },
};
