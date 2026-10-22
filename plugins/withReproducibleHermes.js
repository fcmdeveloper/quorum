/**
 * Release builds compile the JS bundle with scripts/hermesc-reproducible.sh, so the
 * bytecode inside the app is the same for anyone who rebuilds the same commit.
 * Applied on every `expo prebuild`:
 * - iOS: adds HERMES_CLI_PATH to ios/.xcode.env;
 * - Android: points `hermesCommand` in android/app/build.gradle to the same wrapper.
 */
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const MARK = '# quorum: reproducible hermes';
const LINE = `${MARK}\nexport HERMES_CLI_PATH="$PROJECT_DIR/../scripts/hermesc-reproducible.sh"\n`;

const GRADLE_MARK = '// quorum: reproducible hermes';
const GRADLE_LINE = `    ${GRADLE_MARK}\n    hermesCommand = "$projectRoot/scripts/hermesc-reproducible.sh"`;

function withAndroid(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(GRADLE_MARK)) return cfg;
    const re = /^\s*hermesCommand\s*=.*$/m;
    if (re.test(src)) src = src.replace(re, GRADLE_LINE);
    else if (/react\s*\{/.test(src)) src = src.replace(/react\s*\{/, (m) => `${m}\n${GRADLE_LINE}`);
    else throw new Error('withReproducibleHermes: no react { } block in android/app/build.gradle');
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withReproducibleHermes(config) {
  config = withAndroid(config);
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, '.xcode.env');
      const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!cur.includes(MARK)) fs.writeFileSync(file, cur.replace(/\n*$/, '\n\n') + LINE);
      return cfg;
    },
  ]);
};
