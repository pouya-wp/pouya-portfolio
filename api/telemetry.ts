import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './v1/telemetry';

export default async function telemetryRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handler(req, res);
}
