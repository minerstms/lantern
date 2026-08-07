/** Centralized nugget milestone sequence (lifetime earned nuggets). */
export const NUGGET_MILESTONES = [50, 100, 250, 500, 1000];

/**
 * @param {number} lifetimeEarned
 * @returns {{ earned: number, next: number|null, progress: number, label: string }}
 */
export function computeNextMilestone(lifetimeEarned) {
  const earned = Math.max(0, Math.floor(Number(lifetimeEarned) || 0));
  let prev = 0;
  for (let i = 0; i < NUGGET_MILESTONES.length; i++) {
    const target = NUGGET_MILESTONES[i];
    if (earned < target) {
      const span = target - prev;
      const into = earned - prev;
      const progress = span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 0;
      return {
        earned,
        next: target,
        previous: prev,
        progress,
        label: `${earned} / ${target}`,
      };
    }
    prev = target;
  }
  const last = NUGGET_MILESTONES[NUGGET_MILESTONES.length - 1];
  return {
    earned,
    next: null,
    previous: last,
    progress: 100,
    label: `${earned} / ${last}+`,
  };
}
