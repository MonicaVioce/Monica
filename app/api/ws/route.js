import { experimental_upgradeWebSocket } from '@vercel/functions';
import { isVoiceWebhookAuthorized } from '../../../lib/config.js';
import { bridgeMedia } from '../../../lib/realtime-bridge.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export function GET(request) {
  if (!isVoiceWebhookAuthorized(request)) return new Response(null, { status: 401 });
  return experimental_upgradeWebSocket((socket) => bridgeMedia(socket));
}
