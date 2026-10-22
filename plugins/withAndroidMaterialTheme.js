/**
 * Android: el tema de la app hereda de Material Components en vez de AppCompat. Las ventanas
 * de Tangem SDK (acercar la tarjeta, escribir el código) usan botones de Material, que fallan
 * con un tema solo AppCompat. Material Components incluye todo AppCompat: el resto no cambia.
 * Se aplica en cada `expo prebuild` (solo Android).
 */
const { withAndroidStyles } = require('expo/config-plugins');

const FROM = 'Theme.AppCompat.DayNight.NoActionBar';
const TO = 'Theme.MaterialComponents.DayNight.NoActionBar';

module.exports = function withAndroidMaterialTheme(config) {
  return withAndroidStyles(config, (cfg) => {
    for (const style of cfg.modResults.resources.style ?? []) {
      if (style.$.name === 'AppTheme' && style.$.parent === FROM) style.$.parent = TO;
    }
    return cfg;
  });
};
