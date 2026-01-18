
import { Equipment, Reading, ThresholdSettings, HealthStatus } from '../types';

/**
 * Robustly calculates the health status of a Lightning Arrester based on its latest reading
 * and current system threshold settings.
 */
export const calculateHealthStatus = (
  eq: Equipment, 
  latest?: Reading, 
  settings?: ThresholdSettings
): HealthStatus => {
  // 1. Priority: Manual status override (e.g., De-energized, Grounding Fix)
  if (eq.statusOverride) {
    return eq.statusOverride as HealthStatus;
  }

  // 2. If no data exists, we assume satisfactory until proven otherwise
  if (!latest) {
    return 'Satisfactory';
  }

  // 3. Force numeric conversion to prevent string-comparison logic errors
  // Default to 0 if the value is missing or invalid
  const val = Number(latest.correctedResistiveCurrent);
  if (isNaN(val)) return 'Satisfactory'; // Handle invalid data gracefully
  
  // Use settings if provided, otherwise fall back to system defaults.
  // We use explicit NaN checks to ensure thresholds actually work even if settings are corrupted.
  let poorLimit = Number(settings?.poorLimit);
  if (isNaN(poorLimit)) poorLimit = 50;
  
  let criticalLimit = Number(settings?.criticalLimit);
  if (isNaN(criticalLimit)) criticalLimit = 100;

  // 4. Handle Probe Failure (0.0 reading typically indicates sensor issue or disconnection)
  // We check for exact 0 as it's the specific indicator for probe issues in this system.
  if (val === 0) {
    return 'Probe Failure';
  }

  // 5. Threshold comparisons (Critical check first)
  // Using >= for inclusive thresholds (i.e. if value is exactly 100, it is Critical)
  if (val >= criticalLimit) {
    return 'Critical';
  }
  
  if (val >= poorLimit) {
    return 'Poor';
  }

  return 'Satisfactory';
};

/**
 * Helper to determine if a status is considered "At Risk"
 */
export const isAtRisk = (status: HealthStatus): boolean => {
  return ['Poor', 'Critical', 'Probe Failure'].includes(status);
};
