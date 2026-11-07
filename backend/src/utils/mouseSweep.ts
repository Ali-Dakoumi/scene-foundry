export interface MouseSweepPosition {
  x: number;
  y: number;
}

export function getMouseSweepPosition(
  progress: number,
  width: number,
  height: number,
): MouseSweepPosition {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const horizontal = 0.5 - 0.37 * Math.cos(normalizedProgress * Math.PI * 2);
  const vertical = 0.5 + 0.2 * Math.sin(normalizedProgress * Math.PI * 4);
  return {
    x: horizontal * width,
    y: vertical * height,
  };
}
