const { publishLiveExperience, removeLiveExperience, assertServerHasLiveConfig } = require('./experience.cjs')

module.exports = async function globalSetup () {
  try {
    publishLiveExperience()
    await assertServerHasLiveConfig()
  } catch (error) {
    removeLiveExperience()
    throw error
  }
}