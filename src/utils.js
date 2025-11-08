import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

export const nowISO = () => dayjs().toISOString();
export const sleep = (ms) => new Promise(res => setTimeout(res, ms));
export const newId = () => uuidv4();

export function parseJobInput(jsonOrPath) {
  try {
    return JSON.parse(jsonOrPath);
  } catch {
    throw new Error('Invalid job JSON. Provide a JSON string like \'{"command":"echo hi"}\'');
  }
}

export function computeBackoffDelaySeconds(base, attempts) {
  const b = Math.max(1, Number(base) || 2);
  const a = Math.max(1, Number(attempts) || 1);
  return Math.min(3600, Math.pow(b, a));
}