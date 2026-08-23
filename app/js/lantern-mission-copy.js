/**
 * Prompt #257C — client Mission copy + suggested reward bands.
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

  function formatMissionStudentCopy(mission) {
    var m = mission || {};
    var parts = [];
    if (m.require_image) parts.push('📷 Image required');
    var min = Math.max(0, Math.floor(Number(m.min_characters != null ? m.min_characters : m.minCharacters)) || 0);
    if (min > 0) parts.push(min + '+ characters');
    var reward = m.reward_amount != null ? m.reward_amount : m.reward;
    var r = Math.floor(Number(reward));
    if (Number.isFinite(r) && r > 0) parts.push(formatReward(r));
    return parts.join(' · ');
  }

  global.LanternMissionCopy = {
    MISSION_MIN_PRESETS: [100, 200, 500, 1000],
    MISSION_REWARD_MIN: 1,
    MISSION_REWARD_MAX: 10,
    suggestedMissionReward: suggestedMissionReward,
    formatReward: formatReward,
    formatMissionStudentCopy: formatMissionStudentCopy,
  };
})(typeof window !== 'undefined' ? window : globalThis);
