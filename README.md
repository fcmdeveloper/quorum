# Quorum — bóvedas multifirma para el XRP Ledger

App móvil gratuita (iOS y Android, Expo/React Native) de **Minify SpA** para crear y operar bóvedas multifirma y cuentas del XRP Ledger, firmando con **Tangem (NFC)**, **Ledger (Bluetooth)** y **Xaman**.

Quorum es un **coordinador**: nunca ve ni guarda claves privadas. Arma cada operación, cada dispositivo la firma por su cuenta y la app **verifica cada firma** contra la transacción exacta antes de combinarlas y enviarlas.

## Funciones
- **Inicio:** patrimonio total en USD o EUR, con gráfico del patrimonio y del precio de XRP; varias bóvedas y cuentas, cada una con su estado de seguridad y anillo de quórum.
- **Bóvedas:** asistente de creación (firmantes con pesos, quórum, bloqueo de entradas no deseadas, tickets para firmas en paralelo), panel de seguridad con acciones para resolver cada punto, destinos permitidos.
- **Firmas entre teléfonos por QR:** sin servidores. La operación y sus firmas viajan en un QR; cada teléfono verifica todo.
- **Enviar** en XRP o en divisa (se convierte con el precio actual), con contactos, escáner y destination tag. **Recibir** con QR.
- **Actividad** unificada y legible, **NFTs** con imagen y detalle, **tokens**.
- **Face ID**, ocultar saldos, onboarding, toasts y hápticos.

## Compilar
```bash
npm install
npm test && npm run typecheck
npx expo prebuild --clean
npx expo run:ios --device --configuration Release   # instala una app independiente en tu iPhone
```
El arreglo de ciclo de vida para iOS 27 está en `plugins/withSceneLifecycle.js` y se aplica solo en cada prebuild.

## Estructura
```
App.tsx                 navegación (pestañas + pila) y bloqueo
src/core/               crypto, transacciones, QR, red XRPL, precios, salud de bóvedas
src/signers/            Tangem, Ledger, Xaman
src/screens/            pantallas
src/ui/                 sistema visual (negro + verde, Space Grotesk / JetBrains Mono)
modules/tangem-nfc/     módulo nativo sobre el SDK de Tangem
plugins/                plugins de configuración nativa
assets/brand/           logo (SVG)
```

## Antes de publicar en la App Store
- Inscribir Minify SpA como organización en Apple Developer (requisito para billeteras de cripto).
- Verificar disponibilidad del nombre y marca "Quorum" (App Store e INAPI).
- Política de privacidad y términos de uso; confirmar licencias de los SDK de Tangem y Xaman.
- Auditoría de seguridad externa del código de firmas.

## Seguridad
Si encuentras una vulnerabilidad, escribe a contact@quorumxrpl.com con el asunto "Seguridad" antes de publicarla.

## Licencia
[MIT](LICENSE) © 2026 Minify SpA. Sitio: https://quorumxrpl.com
