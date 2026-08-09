import { caseStoreMode } from '../../../lib/cases.js';

export const runtime = 'nodejs';

export function GET() {
  return Response.json({ ok: true, case_store: caseStoreMode() });
}
