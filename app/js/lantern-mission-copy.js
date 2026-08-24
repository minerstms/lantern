/**
 * Prompt #257C / #257C2 — client Mission copy + suggested reward bands.
 */
(function (global) {
  'use strict';

  function suggestedMissionReward(minCharacters) {
    var n = Math.max(0, Math.floor(Number(minCharacters)) || 0);
    if (n >= 1000) return 10;
    if (n >= 500) return 5;
    if (n >= 200) return 2;
    if (n >= 1) return 1;
    return 1;
  }

  function formatReward(n) {
    var v = Math.max(0, Math.floor(Number(n)) || 0);
    if (v <= 0) return '';
    return '+' + v + (v === 1 ? ' Nugget' : ' Nuggets');
  }

  function missionRewardMode(m) {
    var mode = m && (m.reward_mode != null ? m.reward_mode : m.rewardMode);
    var s = String(mode || 'once').trim().toLowerCase();
    return s === 'every_completion' || s === 'every' ? 'every_completion' : 'once';
  }

  function isEveryCompletionMode(m) {
    return missionRewardMode(m) === 'every_completion';
  }

  function formatRewardModeStudentCopy(rewardAmount, mode) {
    var r = Math.floor(Number(rewardAmount));
    if (!Number.isFinite(r) || r <= 0) return '';
    if (mode === 'every_completion') {
      return '+' + r + (r === 1 ? ' Nugget' : ' Nuggets') + ' every completion';
    }
    return formatReward(r) + ' · Earn once';
  }

  function formatMissionStudentCopy(mission) {
    var m = mission || {};
    var parts = [];
    if (m.require_image) parts.push('📷 Image required');
    var min = Math.max(0, Math.floor(Number(m.min_characters != null ? m.min_characters : m.minCharacters)) || 0);
    if (min > 0) parts.push(min + '+ characters');
    var reward = m.reward_amount != null ? m.reward_amount : m.reward;
    var modeCopy = formatRewardModeStudentCopy(reward, missionRewardMode(m));
    if (modeCopy) parts.push(modeCopy);
    return parts.join(' · ');
  }

  function formatAdminEconomyPreview(rewardAmount, mode) {
    var r = Math.max(1, Math.floor(Number(rewardAmount)) || 1);
    var noun = r === 1 ? 'Nugget' : 'Nuggets';
    if (mode === 'every_completion') return '+' + r + ' ' + noun + ' every completion';
    return '+' + r + ' ' + noun + ' when completed';
  }

  global.LanternMissionCopy = {
    MISSION_MIN_PRESETS: [100, 200, 500, 1000],
    MISSION_REWARD_MIN: 1,
    MISSION_REWARD_MAX: 10,
    REWARD_MODE_ONCE: 'once',
    REWARD_MODE_EVERY: 'every_completion',
    suggestedMissionReward: suggestedMissionReward,
    formatReward: formatReward,
    missionRewardMode: missionRewardMode,
    isEveryCompletionMode: isEveryCompletionMode,
    formatRewardModeStudentCopy: formatRewardModeStudentCopy,
    formatAdminEconomyPreview: formatAdminEconomyPreview,
    formatMissionStudentCopy: formatMissionStudentCopy,
  };
})(typeof window !== 'undefined' ? window : globalThis);
