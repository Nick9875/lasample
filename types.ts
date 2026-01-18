
export type HealthStatus = 'Satisfactory' | 'Poor' | 'Critical' | 'Probe Failure' | 'Correction of Grounding' | 'De-energized';
export type Role = 'Admin' | 'Guest' | 'Technician';

export interface UserAccount {
  id: string;
  username: string;
  password: string;
  role: Role;
}

export interface Equipment {
  id: string;
  name: string;
  substation: string;
  district: string; 
  voltageLevel: string; // e.g. "230kV"
  ratedVoltage: number; // numerical L-L kV
  brand: string;
  model: string;
  mcovRating: number;
  statusOverride?: HealthStatus | null;
}

export interface Reading {
  id: string;
  equipmentId: string;
  date: string;
  totalCurrent: number; // uA
  resistiveCurrent: number; // uA
  correctedResistiveCurrent: number; // uA
  mcovRating: number;
  ratedVoltage: number; // numerical L-L kV
  notes?: string;
}

export interface ThresholdSettings {
  poorLimit: number; // uA
  criticalLimit: number; // uA
}

export interface GlobalHealthStats {
  totalAssets: number;
  satisfactory: number;
  poor: number;
  critical: number;
  probeFailure: number;
  atRisk: number;
}

export type View = 'dashboard' | 'equipment' | 'readings' | 'history' | 'ai-diagnostic' | 'settings' | 'reports' | 'user-management';
