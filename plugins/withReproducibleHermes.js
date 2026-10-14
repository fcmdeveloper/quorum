/**
 * Release builds compile the JS bundle with scripts/hermesc-reproducible.sh, so the
 * bytecode inside the app is the same for anyone who rebuilds the same commit.
 * Applied on every `expo prebuild` (adds HERMES_CLI_PATH to ios/.xcode.env).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARK = '# quorum: reproducible hermes';
const LINE = `${MARK}\nexport HERMES_CLI_PATH="$PROJECT_DIR/../scripts/hermesc-reproducible.sh"\n`;

module.exports = function withReproducibleHermes(config) {
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
