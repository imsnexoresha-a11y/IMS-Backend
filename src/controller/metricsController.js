import * as metricsService from '../service/metricsService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const getBatchMetrics = asyncHandler(
  async (req, res) => {
    const { batchId } = req.params;

    const metrics =
      await metricsService.getBatchMetrics(batchId);

    return res.status(200).json({
      success: true,
      data: metrics,
    });
  }
);

export const getAllMetrics = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const metrics =
      await metricsService.getAllMetrics(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: metrics,
    });
  }
);

export const getTotalScore = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getTotalScore(studentId);

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getBatchRank = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getBatchRank(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getBatchPercentile = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getBatchPercentile(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getAssignmentAvgScore = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getAssignmentAvgScore(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getQuizAvgScore = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getQuizAvgScore(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getQuizParticipationRate =
  asyncHandler(async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getQuizParticipationRate(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  });

export const getAttendanceRate = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getAttendanceRate(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getOnTimeSubmissionRate =
  asyncHandler(async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getOnTimeSubmissionRate(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  });

export const getPunctualityIndex = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getPunctualityIndex(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getSubmissionLeadTime = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getSubmissionLeadTime(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getZeroMissStreaks = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getZeroMissStreaks(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getCodeQualityAvg = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getCodeQualityAvg(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getCodeImprovementRate =
  asyncHandler(async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getCodeImprovementRate(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  });

export const getPerfectAssignmentCount =
  asyncHandler(async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getPerfectAssignmentCount(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  });

export const getBelowAvgAssignmentRate =
  asyncHandler(async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getBelowAvgAssignmentRate(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  });

export const getConsistencyScore = asyncHandler(
  async (req, res) => {
    const { studentId } = req.params;

    const value =
      await metricsService.getConsistencyScore(
        studentId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getGrowthRate = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getGrowthRate(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);

export const getEngagementScore = asyncHandler(
  async (req, res) => {
    const { studentId, batchId } = req.params;

    const value =
      await metricsService.getEngagementScore(
        studentId,
        batchId
      );

    return res.status(200).json({
      success: true,
      data: value,
    });
  }
);