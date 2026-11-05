export const clampRotation = (angle) => Math.max(0, Math.min(360, angle));

export const wrappedAngleDelta = (current, previous) => ((current - previous + 540) % 360) - 180;

export const directionalProgressDelta = (headingDelta, direction) => (direction === 'right' ? headingDelta : -headingDelta);

export const deviceCameraHeading = (alpha, beta, gamma) => {
  const radians = Math.PI / 180;
  const a = alpha * radians;
  const b = beta * radians;
  const g = gamma * radians;

  // Rotate the phone's screen-normal vector through the DeviceOrientation
  // Z-X'-Y'' sequence, then measure its projection around the world vertical.
  const x = Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g);
  const y = Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g);
  const horizontalLength = Math.hypot(x, y);
  if (horizontalLength < 0.35) return null;
  return (Math.atan2(x, y) / radians + 360) % 360;
};
