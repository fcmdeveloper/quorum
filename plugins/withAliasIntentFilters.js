/**
 * Android: al elegir otro ícono de la app (expo-alternate-app-icons), Android desactiva
 * MainActivity y abre la app por un "activity-alias". Esos alias solo traían el filtro del
 * lanzador, así que los enlaces quorum:// (volver de Xaman, Pegar enlace) y quorumxrpl.com/p
 * dejaban de abrir la app: Android no encontraba quién los atendiera (y Chrome mandaba a Google Play).
 * Este plugin copia a cada alias los filtros VIEW de MainActivity. Va ANTES de
 * expo-alternate-app-icons en app.json: los mods de Android corren en orden inverso, así corre
 * después de que se crean los alias. Se aplica en cada `expo prebuild`.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const isView = (f) => (f.action ?? []).some((a) => a.$?.['android:name'] === 'android.intent.action.VIEW');
const key = (f) => JSON.stringify({ a: f.action, c: f.category, d: f.data });

module.exports = function withAliasIntentFilters(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    const main = (app.activity ?? []).find((a) => a.$?.['android:name'] === '.MainActivity');
    if (!main) return cfg;
    const views = (main['intent-filter'] ?? []).filter(isView);
    for (const alias of app['activity-alias'] ?? []) {
      if (alias.$?.['android:targetActivity'] !== '.MainActivity') continue;
      const have = new Set((alias['intent-filter'] ?? []).map(key));
      alias['intent-filter'] = [...(alias['intent-filter'] ?? []), ...views.filter((f) => !have.has(key(f))).map((f) => JSON.parse(JSON.stringify(f)))];
    }
    return cfg;
  });
};
