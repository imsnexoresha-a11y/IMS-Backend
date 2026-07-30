import { Router } from 'express';

import {
  getAllMetrics,
  getAssignmentAvgScore,
  getAttendanceRate,
  getBatchMetrics,
  getBatchPercentile,
  getBatchRank,
  getBelowAvgAssignmentRate,
  getCodeImprovementRate,
  getCodeQualityAvg,
  getConsistencyScore,
  getEngagementScore,
  getGrowthRate,
  getOnTimeSubmissionRate,
  getPerfectAssignmentCount,
  getPunctualityIndex,
  getQuizAvgScore,
  getQuizParticipationRate,
  getSubmissionLeadTime,
  getTotalScore,
  getZeroMissStreaks,
} from '../controller/metricsController.js';

const router = Router();

router.get(
  '/batch/:batchId',
  getBatchMetrics
);

router.get(
  '/total-score/:studentId',
  getTotalScore
);

router.get(
  '/batch-rank/:studentId/:batchId',
  getBatchRank
);

router.get(
  '/batch-percentile/:studentId/:batchId',
  getBatchPercentile
);

router.get(
  '/assignment-average/:studentId',
  getAssignmentAvgScore
);

router.get(
  '/quiz-average/:studentId',
  getQuizAvgScore
);

router.get(
  '/quiz-participation/:studentId/:batchId',
  getQuizParticipationRate
);

router.get(
  '/attendance/:studentId/:batchId',
  getAttendanceRate
);

router.get(
  '/on-time-submission/:studentId/:batchId',
  getOnTimeSubmissionRate
);

router.get(
  '/punctuality/:studentId/:batchId',
  getPunctualityIndex
);

router.get(
  '/submission-lead-time/:studentId',
  getSubmissionLeadTime
);

router.get(
  '/zero-miss-streak/:studentId/:batchId',
  getZeroMissStreaks
);

router.get(
  '/code-quality/:studentId',
  getCodeQualityAvg
);

router.get(
  '/code-improvement/:studentId',
  getCodeImprovementRate
);

router.get(
  '/perfect-assignments/:studentId',
  getPerfectAssignmentCount
);

router.get(
  '/below-average-rate/:studentId/:batchId',
  getBelowAvgAssignmentRate
);

router.get(
  '/consistency/:studentId',
  getConsistencyScore
);

router.get(
  '/growth/:studentId/:batchId',
  getGrowthRate
);

router.get(
  '/engagement/:studentId/:batchId',
  getEngagementScore
);

router.get(
  '/full/:studentId',
  getAllMetrics
);

router.get(
  '/full/:studentId/:batchId',
  getAllMetrics
);

router.get(
  '/:studentId/:batchId',
  getAllMetrics
);

export default router;