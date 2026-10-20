# Quorum — bóvedas multifirma para el XRP Ledger

*[English below](#english)*

Quorum es una app móvil gratuita y de código abierto (Expo / React Native) para crear y usar **bóvedas multifirma** y cuentas del XRP Ledger, firmando con **Tangem** (NFC), **Ledger** (Bluetooth) y **Xaman**.

Quorum es un **coordinador**: nunca ve ni guarda llaves privadas. Arma cada operación, cada dispositivo la firma por su cuenta y la app **verifica cada firma** contra la transacción exacta antes de combinarlas y enviarlas. No hay servidores ni base de datos: todo queda en el teléfono y la app habla directo con el XRP Ledger.

Sitio: https://quorumxrpl.com

## Qué hace

- **Bóvedas multifirma:** asistente para crearlas (firmantes con pesos, quórum, tickets para firmar en paralelo), panel de seguridad y destinos permitidos.
- **Firmas entre teléfonos por QR o enlace:** la operación y sus firmas viajan en un código QR o en un enlace (WhatsApp, Telegram, correo); quien firma la devuelve con su firma y cada teléfono verifica todo.
- **Enviar y recibir** XRP y tokens, con contactos, escáner y aviso de direcciones parecidas (address poisoning).
- **Pedir un pago** con enlace o QR, en XRP (escrito en XRP, USD o EUR) o en RLUSD/USDC: quien paga solo elige desde qué cuenta y firma.
- **Patrimonio** en USD o EUR con el detalle de cada moneda, orden y visibilidad de cuentas en Inicio, actividad, NFTs, tokens, DEX y swaps.
- **Protecciones** de la bóveda una por una (líneas de confianza, cheques, ofertas de NFT, canales de pago).
- **NFT como imagen** de cada cuenta, que se puede fijar en el XRP Ledger para que se vea en otros teléfonos.
- **Respaldo** exportable (cifrado con contraseña si quieres), bloqueo con Face ID o código propio de 4 dígitos, español e inglés, modo claro y oscuro.

## Compilar tu propia versión

### Lo que necesitas

- Un Mac con **Xcode** y **Node.js** (versión LTS reciente).
- Un **iPhone físico**: el simulador no tiene NFC ni Bluetooth, así que no puede firmar con Tangem ni con Ledger.
- Una cuenta de **Apple Developer** pagada si vas a usar Tangem: la lectura NFC requiere un permiso (entitlement) que las cuentas gratuitas no tienen.

### 1. Descargar e instalar

```bash
git clone https://github.com/fcmdeveloper/quorum.git
cd quorum
npm install
npm test && npm run typecheck
```

### 2. Ponerle tu identidad

Antes de compilar, cambia lo que identifica a la app para que no choque con Quorum:

**`app.json`**
- `name`: el nombre de tu app.
- `scheme`: el esquema de enlaces (por ejemplo `miboveda`). Si dejas `quorum`, tu app y Quorum se pisarían al volver de Xaman.
- `ios.bundleIdentifier` y `android.package`: tu propio identificador (por ejemplo `com.tuempresa.miboveda`).
- Los íconos de `assets/` y los textos de permisos, si quieres.

**`src/config.ts`**
- `website`, `sourceUrl`, `publisher`: tus datos.
- `donationAddress`: tu dirección para donaciones, o `''` para ocultar la opción de donar.
- `nftGalleryAddress`: cuenta cuyos NFTs se ofrecen como imágenes para las cuentas. Puedes dejar la galería pública de Quorum o poner `''` para ocultarla.
- `xamanApiKey`, `xamanRedirect`, `xamanAppCallback`: los de tu app en Xaman (paso 3).

Si publicas tu versión en una tienda, usa tu propio nombre e ícono, para que nadie la confunda con Quorum.

### 3. Conectar Xaman (opcional)

Para firmar con cuentas de Xaman, la app usa el inicio de sesión de Xaman (OAuth2 + PKCE). Si no lo configuras, lo demás funciona igual.

1. Crea una app en [apps.xumm.dev](https://apps.xumm.dev) y copia su **API key** en `xamanApiKey`. Esa key es pública (es el `client_id`). El **API secret no va nunca en la app**.
2. Xaman solo acepta redirecciones `https`. Publica en tu sitio una página estática que reenvíe a la app lo que recibe; hay un ejemplo listo en [`docs/xaman-auth.html`](docs/xaman-auth.html), donde solo cambias el esquema.
3. Registra esa URL como *redirect URI* en apps.xumm.dev y ponla en `xamanRedirect`.
4. Pon en `xamanAppCallback` tu esquema con la ruta `xaman-auth` (por ejemplo `miboveda://xaman-auth`).
5. En apps.xumm.dev, habilita los tipos de transacción que tu app va a pedir firmar.

### 4. Compilar e instalar en tu iPhone

```bash
npx expo prebuild --clean
npx expo run:ios --device --configuration Release
```

La primera vez, abre `ios/` en Xcode, elige tu equipo de desarrollo en *Signing & Capabilities* y confirma que esté la capacidad **Near Field Communication Tag Reading**. Las carpetas `ios/` y `android/` se generan en cada `prebuild`: los cambios nativos van en `app.json` y en `plugins/`, no a mano.

### Android

El código incluye el módulo nativo de Tangem para Android, pero la versión para Android todavía no está probada. Se compila con `npx expo run:android --device`.

## Estructura

```
App.tsx                 navegación (pestañas + pila), bloqueo y avisos
src/config.ts           datos del proyecto (sitio, donaciones, Xaman)
src/core/               transacciones, firmas, QR, red XRPL, precios, salud de bóvedas
src/signers/            Tangem, Ledger y Xaman
src/screens/            pantallas
src/ui/                 componentes y tema visual
src/i18n/               traducciones (el español es la clave; inglés en en.ts)
modules/tangem-nfc/     módulo nativo sobre el SDK de Tangem (iOS y Android)
plugins/                plugins de configuración nativa (ciclo de vida con escenas en iOS)
scripts/                utilidades (extraer textos para traducir)
docs/                   ejemplo de la página de retorno de Xaman
tests/                  pruebas (npm test)
```

## Verificar una versión

Cada versión de Quorum se puede reconstruir desde este repositorio y comparar con la app publicada: el código de la app da la misma huella (SHA-256) en cualquier Mac o Linux.

```bash
scripts/verify-release.sh v1.0.1
```

Validadores independientes hacen esta comprobación antes de cada publicación y registran su resultado en el XRP Ledger. Cualquiera puede sumarse: [VALIDATORS.es.md](VALIDATORS.es.md) · formato de los registros: [RELEASES.es.md](RELEASES.es.md).

## Seguridad

Quorum está en beta y aún no tiene auditoría externa. Pruébalo primero en testnet o con montos chicos.

Si encuentras una vulnerabilidad, escribe a contact@quorumxrpl.com con el asunto "Seguridad" antes de publicarla.

## Licencia

[MIT](LICENSE) © 2026 Minify SpA. Quorum no está afiliado a Ripple, la XRPL Foundation, Tangem, Ledger ni Xaman; sus nombres y marcas pertenecen a sus dueños.

---

## English

Quorum is a free, open-source mobile app (Expo / React Native) to create and use **multisig vaults** and accounts on the XRP Ledger, signing with **Tangem** (NFC), **Ledger** (Bluetooth) and **Xaman**.

Quorum is a **coordinator**: it never sees or stores private keys. It builds each operation, each device signs it on its own, and the app **verifies every signature** against the exact transaction before combining and submitting them. There are no servers and no database: everything stays on the phone and the app talks directly to the XRP Ledger.

### What it does

- **Multisig vaults:** a wizard to create them (weighted signers, quorum, tickets to sign in parallel), a security panel and allowed destinations.
- **Signing across phones by QR or link:** the operation and its signatures travel in a QR code or a link (WhatsApp, Telegram, email); whoever signs sends it back with their signature and every phone verifies everything.
- **Send and receive** XRP and tokens, with contacts, a scanner and a lookalike-address warning (address poisoning).
- **Request a payment** with a link or QR, in XRP (typed in XRP, USD or EUR) or in RLUSD/USDC: the payer just picks the account and signs.
- **Net worth** in USD or EUR with each currency broken down, account order and visibility on Home, activity, NFTs, tokens, DEX and swaps.
- **Protections** of the vault one by one (trust lines, checks, NFT offers, payment channels).
- **NFT as the picture** of each account, which can be pinned on the XRP Ledger so other phones see it.
- **Exportable backup** (password-encrypted if you like), Face ID or a 4-digit Quorum code lock, Spanish and English, light and dark mode.

### Build your own version

**You need:** a Mac with **Xcode** and **Node.js** (recent LTS); a **physical iPhone** (the simulator has no NFC or Bluetooth); and a paid **Apple Developer** account if you'll use Tangem (NFC reading needs an entitlement free accounts don't have).

**1. Download and install**

```bash
git clone https://github.com/fcmdeveloper/quorum.git
cd quorum
npm install
npm test && npm run typecheck
```

**2. Give it your identity.** In `app.json`, change `name`, `scheme` (e.g. `myvault`; keeping `quorum` would clash with Quorum when returning from Xaman), `ios.bundleIdentifier` and `android.package`, and optionally the icons and permission texts. In `src/config.ts`, set `website`, `sourceUrl`, `publisher`, `donationAddress` (`''` hides donations), `nftGalleryAddress` (keep Quorum's public gallery or `''` to hide it) and the Xaman values from step 3. If you publish your version in a store, use your own name and icon so nobody mistakes it for Quorum.

**3. Connect Xaman (optional).** Create an app at [apps.xumm.dev](https://apps.xumm.dev) and put its **API key** in `xamanApiKey` (it's public, the OAuth `client_id`; the **API secret never goes in the app**). Xaman only accepts `https` redirects, so publish a static page that forwards to the app; [`docs/xaman-auth.html`](docs/xaman-auth.html) is a ready-made example where you only change the scheme. Register that URL as the redirect URI and set it in `xamanRedirect`, set `xamanAppCallback` to `yourscheme://xaman-auth`, and enable in apps.xumm.dev the transaction types your app will ask to sign.

**4. Build and install on your iPhone**

```bash
npx expo prebuild --clean
npx expo run:ios --device --configuration Release
```

The first time, open `ios/` in Xcode, pick your development team under *Signing & Capabilities* and check that **Near Field Communication Tag Reading** is there. `ios/` and `android/` are regenerated on every `prebuild`: native changes go in `app.json` and `plugins/`, not by hand.

**Android:** the Tangem native module for Android is included, but the Android version hasn't been tested yet. Build it with `npx expo run:android --device`.

### Verify a release

Every Quorum release can be rebuilt from this repository and compared with the published app: the app code gives the same fingerprint (SHA-256) on any Mac or Linux machine.

```bash
scripts/verify-release.sh v1.0.1
```

Independent validators run this check before every release and record their result on the XRP Ledger. Anyone can join: [VALIDATORS.md](VALIDATORS.md) · record format: [RELEASES.md](RELEASES.md).

### Security

Quorum is in beta and hasn't been externally audited yet. Try it first on testnet or with small amounts. If you find a vulnerability, email contact@quorumxrpl.com with the subject "Security" before disclosing it.

### License

[MIT](LICENSE) © 2026 Minify SpA. Quorum is not affiliated with Ripple, the XRPL Foundation, Tangem, Ledger or Xaman; their names and marks belong to their owners.
