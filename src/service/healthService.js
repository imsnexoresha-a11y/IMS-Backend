export function getHealthStatus() {
  return {
    status: 'ok',
    service: 'ims-server',
    timestamp: new Date().toISOString(),
  };
}