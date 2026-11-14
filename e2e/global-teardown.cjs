const { removeLiveExperience } = require('./experience.cjs')

module.exports = async function globalTeardown () {
  removeLiveExperience()
}