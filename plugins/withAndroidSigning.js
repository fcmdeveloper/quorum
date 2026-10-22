/**
 * Firma de Android: los builds de release se firman con la llave de subida de Minify si este
 * computador la tiene configurada; si no, con la llave de depuración (solo para probar).
 *
 * La llave y sus claves NUNCA van en el repositorio. Se configuran en ~/.gradle/gradle.properties:
 *   QUORUM_UPLOAD_STORE_FILE=/Users/…/quorum-upload.jks
 *   QUORUM_UPLOAD_STORE_PASSWORD=…
 *   QUORUM_UPLOAD_KEY_ALIAS=quorum-upload
 *   QUORUM_UPLOAD_KEY_PASSWORD=…
 * Se aplica en cada `expo prebuild`.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// quorum: upload signing';

const CONFIG = `        ${MARK}
        release {
            if (project.hasProperty('QUORUM_UPLOAD_STORE_FILE')) {
                storeFile file(QUORUM_UPLOAD_STORE_FILE)
                storePassword QUORUM_UPLOAD_STORE_PASSWORD
                keyAlias QUORUM_UPLOAD_KEY_ALIAS
                keyPassword QUORUM_UPLOAD_KEY_PASSWORD
            }
        }`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    // 1) una configuración "release" junto a la de depuración
    const sc = /signingConfigs\s*\{\s*\n/;
    if (!sc.test(src)) throw new Error('withAndroidSigning: no signingConfigs { } in android/app/build.gradle');
    src = src.replace(sc, (m) => `${m}${CONFIG}\n`);
    // 2) el build de release la usa si existe la llave; si no, la de depuración
    const rel = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!rel.test(src)) throw new Error('withAndroidSigning: no release buildType in android/app/build.gradle');
    src = src.replace(rel, `$1signingConfig project.hasProperty('QUORUM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`);
    cfg.modResults.contents = src;
    return cfg;
  });
};
