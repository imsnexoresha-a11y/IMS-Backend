import { getHealthStatus } from '../service/healthService.js';

export function healthCheck(_req, res) {
  res.json(getHealthStatus());
}