/**
 * Compute the dynamic status of a batch based on its startDate and endDate.
 * 
 * Rules:
 * 1. If now > endDate, batch status is 'completed'.
 * 2. If now < startDate, batch status is 'upcoming'.
 * 3. If startDate <= now <= endDate (or now >= startDate with no endDate), batch status is 'ongoing'.
 * 4. Fallback to manualStatus or 'upcoming'.
 */
export function computeBatchStatus(startDate, endDate, manualStatus) {
  const now = new Date();

  if (endDate) {
    const end = new Date(endDate);
    if (!isNaN(end.getTime())) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      if (now > endOfDay) {
        return 'completed';
      }
    }
  }

  if (startDate) {
    const start = new Date(startDate);
    if (!isNaN(start.getTime())) {
      const startOfDay = new Date(start);
      startOfDay.setHours(0, 0, 0, 0);
      if (now < startOfDay) {
        return 'upcoming';
      }
      return 'ongoing';
    }
  }

  return manualStatus || 'upcoming';
}

/**
 * Synchronize batch status in-memory and update in DB if changed.
 */
export async function syncBatchStatus(batch) {
  if (!batch) return batch;
  const computed = computeBatchStatus(batch.startDate, batch.endDate, batch.status);
  if (computed !== batch.status) {
    batch.status = computed;
    if (typeof batch.save === 'function') {
      await batch.save();
    } else {
      const { Batch } = await import('../models/index.js');
      await Batch.updateOne({ _id: batch._id }, { status: computed });
    }
  }
  return batch;
}

/**
 * Synchronize multiple batches.
 */
export async function syncBatchesStatus(batches) {
  if (!Array.isArray(batches)) return batches;
  for (const b of batches) {
    await syncBatchStatus(b);
  }
  return batches;
}
