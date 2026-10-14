# Notas para agentes y colaboradores

App Expo / React Native (ver la versión de `expo` en `package.json`). Expo cambia entre versiones: antes de tocar una API de Expo o React Native, revisa la documentación de esa versión en https://docs.expo.dev.

## Comandos

```bash
npm install
npm test             # pruebas (tsx --test tests/*.test.ts)
npm run typecheck    # tsc --noEmit
npx expo install <paquete>   # agrega dependencias con versiones compatibles con el SDK
npx expo prebuild --clean    # regenera ios/ y android/
npx expo run:ios --device --configuration Release
```

Corre las pruebas y el typecheck antes de dar algo por terminado.

## Cómo está armada

- **Navegación propia** (no Expo Router): `src/nav.tsx` y las rutas en `App.tsx`.
- **Textos:** el español es la clave de traducción. Usa `t('Texto con {x}', { x })` para textos con variables; el inglés va en `src/i18n/en.ts` y `tests/i18n.test.ts` revisa que no falte ninguno. `node scripts/i18n-extract.js --templates` lista textos que conviene pasar a `t()`.
- **Nativo:** `ios/` y `android/` se generan; los cambios nativos van en `app.json` y en `plugins/`. Tangem va en `modules/tangem-nfc/`.
- **Sin servidores ni base de datos:** los datos viven en el teléfono (AsyncStorage / SecureStore) y la app habla directo con el XRP Ledger. No agregues analítica ni servicios que reciban datos de los usuarios.
- **Llaves:** la app nunca guarda llaves privadas. Toda firma se verifica contra la transacción exacta antes de enviarla (`src/core/tx.ts`).
