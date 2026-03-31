/**
 * TMS Lantern — Feature flags for reaction/encouragement system.
 * All optional features default to false. Server may override via /api/reactions/feature-flags.
 */
(function (global) {
  var FLAGS = {
    ENABLE_EARLY_ENCOURAGER_REWARD: false,
    ENABLE_REACTION_BREAKDOWN: false,
    ENABLE_INCLUSION_BOOST: false,
  };

  function getFlags() {
    return Object.assign({}, FLAGS);
  }

  function setFlagsFromServer(serverFlags) {
    if (serverFlags && typeof serverFlags === 'object') {
      if (typeof serverFlags.ENABLE_EARLY_ENCOURAGER_REWARD === 'boolean') FLAGS.ENABLE_EARLY_ENCOURAGER_REWARD = serverFlags.ENABLE_EARLY_ENCOURAGER_REWARD;
      if (typeof serverFlags.ENABLE_REACTION_BREAKDOWN === 'boolean') FLAGS.ENABLE_REACTION_BREAKDOWN = serverFlags.ENABLE_REACTION_BREAKDOWN;
      if (typeof serverFlags.ENABLE_INCLUSION_BOOST === 'boolean') FLAGS.ENABLE_INCLUSION_BOOST = serverFlags.ENABLE_INCLUSION_BOOST;
    }
  }

  function isEnabled(flagName) {
    return !!FLAGS[flagName];
  }

  global.LANTERN_FEATURE_FLAGS = {
    getFlags: getFlags,
    setFlagsFromServer: setFlagsFromServer,
    isEnabled: isEnabled,
    FLAGS: FLAGS,
  };
})(typeof window !== 'undefined' ? window : this);
