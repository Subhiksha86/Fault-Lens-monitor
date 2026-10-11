export const SENSORS = ["s2", "s3", "s4", "s7", "s8", "s9", "s11", "s12", "s13", "s14", "s15", "s17", "s20", "s21"];
export const RIDGE_LAMBDA = 1.0;
export const RUL_CAP = 125;
export const HEALTHY_FRACTION = 0.4;
export const MAD_K = 4;
export const FLAG_WINDOW = 5;
export const FLAG_MIN = 3;
export const ROLL = 10;
export const COORD_MIN_CHANNELS = 3;
export const TRAIN_FRACTION = 0.8;

export type FaultType = "Frozen" | "Spike" | "Bias" | "Drift";
export const FAULT_TYPES: FaultType[] = ["Frozen", "Spike", "Bias", "Drift"];
export type Decision = "MONITOR" | "VERIFY SENSOR" | "INSPECT MACHINE" | "MANUAL REVIEW";
