export const clampRotation = (angle) => Math.max(0, Math.min(360, angle));

export const wrappedAngleDelta = (current, previous) => ((current - previous + 540) % 360) - 180;

export const directionalProgressDelta = (alphaDelta, direction) => (direction === 'right' ? -alphaDelta : alphaDelta);
