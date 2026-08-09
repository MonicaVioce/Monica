import { Redis } from '@upstash/redis';

const memoryCases = new Map();
const redis = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
  : null;

const key = (callSid) => `monica:case:${callSid}`;

export function caseStoreMode() {
  return redis ? 'redis' : 'memory-preview-only';
}

export async function getCase(callSid) {
  return redis ? redis.get(key(callSid)) : memoryCases.get(callSid) || null;
}

export async function putCase(callSid, value) {
  if (redis) await redis.set(key(callSid), value, { ex: 60 * 60 * 24 * 30 });
  else memoryCases.set(callSid, value);
  return value;
}

export async function updateCase(callSid, updater) {
  const current = await getCase(callSid);
  if (!current) return null;
  const next = updater(current);
  await putCase(callSid, next);
  return next;
}
