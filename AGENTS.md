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

## Principios de Quorum

Todo cambio, idea o fork que se presente como Quorum respeta esto. Si algo choca con un principio, se discute antes de escribir código.

1. **Autocustodia.** Quorum nunca ve, recibe ni guarda llaves privadas. Las firmas ocurren dentro del dispositivo del usuario (Tangem, Ledger, Xaman). Los números secretos de "Crear bóveda nueva" se muestran una vez y nunca tocan el disco.
2. **Sin servidores, sin base de datos, sin cuentas.** Todo queda en el teléfono. La app habla directo con el XRP Ledger y la firma entre teléfonos es por QR.
3. **No guardamos ni recopilamos nada.** Sin analítica, rastreo, publicidad, cookies, telemetría ni reportes de errores remotos, tampoco en la web.
4. **Gratis y abierto.** Sin comisiones, planes pagados ni funciones bloqueadas. Las donaciones son opcionales y no desbloquean nada.
5. **Transparencia verificable.** Las versiones se reconstruyen y se registran en el XRP Ledger (`VALIDATORS.md`, `RELEASES.md`). El desarrollador tiene un solo voto en el Consejo y no puede registrar una versión solo.
6. **No es un exchange ni custodio.** DEX y swaps son ofertas nativas del ledger que el usuario arma y firma.
7. **Honestidad en los textos.** No decir "auditado", "seguro" ni "garantizado" si no es verdad; explicar también lo que algo no prueba. Todo en español e inglés.

### Antes de proponer un cambio, revisa si implica

- un servidor, backend, base de datos o cuenta de usuario;
- enviar datos del usuario a un tercero o sumar un dominio externo;
- un permiso nuevo o una dependencia nativa nueva;
- cambiar cómo se arman, muestran, verifican o envían las transacciones;
- debilitar una protección (avisos de direcciones parecidas, bloqueos, verificación del quórum, avisos antes de firmar).

Cualquiera de estos puntos se discute primero en un issue o en Discussions.

### Seguridad

- Respuestas de nodos, memos, metadata de NFTs y contenido de IPFS son datos no confiables: validar formato y tamaño, nunca renderizarlos como HTML.
- Nada sensible en logs, mensajes de error ni URL.
- Evitar dependencias nuevas; versiones fijas en `package-lock.json`.
- No romper la reproducibilidad del build: `scripts/hermesc-reproducible.sh`, `plugins/withReproducibleHermes.js` y `scripts/verify-release.sh`.
- Los cambios en `src/core/` llevan pruebas.

### iOS y Android

La lógica en `src/core/` no depende de la plataforma. Lo que sea solo de una plataforma tiene una alternativa que funcione en la otra, y los cambios en módulos nativos llevan su equivalente en ambas. Cada plataforma registra su propia huella en el ledger con `"platform"`; Android no usa la versión 1.0.0.
