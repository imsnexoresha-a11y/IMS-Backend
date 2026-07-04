export function generatePoNumber(prefix = 'PO') {
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${stamp}`;
}