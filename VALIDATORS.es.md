# Validadores de versiones de Quorum

*[Read in English](VALIDATORS.md)*

Cada versión de Quorum es reconstruida y revisada por validadores independientes antes de llegar a la App Store. Ellos comprueban que la app que la gente instala ejecuta exactamente el código publicado en este repositorio, y registran su resultado, positivo o negativo, en el XRP Ledger, donde cualquiera puede verlo y nadie puede borrarlo.

Cualquiera puede validar. No necesitas permiso, una cuenta con nosotros ni confiar en nadie: solo este repositorio, tu computador y una billetera del XRP Ledger.

## Qué revisa un validador

1. **Mismo código.** El código de la app publicada tiene la misma huella (SHA-256) que la que obtienes al reconstruir tú mismo el commit de esa versión.
2. **Mismo registro.** Esa huella coincide con la versión registrada en el XRP Ledger.
3. **Funciona.** Instalas la app y pruebas lo básico en testnet.

### Qué prueba esto y qué no

- ✅ Prueba que el **código de la app** (el JavaScript compilado a bytecode de Hermes) es exactamente el de este repositorio. Ahí es donde Quorum arma las transacciones, verifica cada firma, muestra los avisos y guarda tus datos.
- ⚠️ **No** cubre el binario nativo, que Apple vuelve a firmar y cifrar y que nadie puede reconstruir byte a byte. La parte nativa es la base de iOS más las librerías de Tangem, Ledger y la cámara, todas de código abierto y fijadas en `package-lock.json` y `app.json`.
- ⚠️ Un validador da fe de lo que revisó, no de que el código no tenga errores. Leer el código y reportar problemas siempre suma.

## Paso a paso

### 1. Preparar (una vez)

Necesitas:
- **macOS o Linux** con `git` y **Node.js 22** ([nodejs.org](https://nodejs.org)). Los dos dan el mismo resultado: lo comprobamos.
- **Una billetera del XRP Ledger** para registrar tu resultado (Quorum, Xaman o cualquiera que permita agregar un memo). Cuesta un drop más la comisión de la red: fracciones de centavo.
- **Un iPhone** para instalar la app desde TestFlight (recomendado, no obligatorio).

```bash
git clone https://github.com/fcmdeveloper/quorum.git
cd quorum
```

### 2. Encontrar la versión

Cada versión se anuncia en [Discussions › Announcements](https://github.com/fcmdeveloper/quorum/discussions/categories/announcements) con:
- su **tag** (por ejemplo `v1.0.1`) y su **commit**;
- la **huella del código de la app** (`sha256:…`);
- el **enlace de TestFlight** para instalarla;
- la transacción que la registró en el XRP Ledger.

La cuenta de registro es **Quorum Releases**: [`rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8`](https://livenet.xrpl.org/accounts/rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8). Todo su historial está en cualquier explorador del XRP Ledger y en [quorumxrpl.com/verify](https://quorumxrpl.com/verify).

### 3. Reconstruirla

```bash
git fetch --tags
scripts/verify-release.sh v1.0.1 ios
```

Usa `ios` o `android` según el build que vas a comparar (sin indicarlo, `ios`). Cada plataforma tiene su propia huella y se valida por separado. El script baja ese tag en una carpeta temporal limpia, instala las dependencias exactas (`npm ci`), empaqueta el código con la misma configuración del build de esa plataforma, lo compila a bytecode de Hermes y muestra:

```
Quorum 1.0.1 (2) iOS
platform  ios
commit    fd2e085c7fdb1f5d344f4a732d65d7948d86e1b8
app code  sha256:1b0b6bbde3e456e87da73b732b52f31db6d6f40a4114d3eed0f5743b48d0f5e7
js source sha256:c7bacc434d0a71ddd2aedc619bc6c397e405eb4da1a6427d87cd332ca48e1f15
```

*(Salida real de la 1.0.1. Córrelo tú: los números que valen son los tuyos.)*

La primera vez toma unos minutos. El script solo lee el repositorio; no toca tus otros archivos.

### 4. Comparar

Tu línea **app code** debe ser idéntica a:

1. **El registro de la versión en el XRP Ledger** (el campo `app` de su memo; ver [RELEASES.es.md](RELEASES.es.md)).
2. **La app instalada.** Instala el build desde TestFlight, abre *Ajustes › Acerca de › Verificar esta versión* y compara la huella que aparece.

Las tres deben coincidir, carácter por carácter.

<details>
<summary><b>Avanzado (Mac): leer la huella directo de la app descargada</b></summary>

Si prefieres no depender de que la app informe su propia huella:

1. Instala **Apple Configurator** (gratis, Mac App Store) y conecta un iPhone.
2. *Agregar › Apps*, busca Quorum y agrégala. Configurator descarga el `.ipa` en
   `~/Library/Group Containers/K36BKF7T3D.group.com.apple.configurator/Library/Caches/Assets/TemporaryItems/MobileApps/`.
   Cópialo antes de cerrar el diálogo.
3. Descomprímelo y saca la huella del código:
   ```bash
   unzip -q Quorum*.ipa -d quorum-ipa
   shasum -a 256 quorum-ipa/Payload/Quorum.app/main.jsbundle
   ```
Apple cifra solo el ejecutable nativo; `main.jsbundle` queda tal como se compiló.
</details>

### 5. Probar la app (recomendado)

En testnet, sin fondos reales:
- [ ] Acepta el aviso de inicio y crea una bóveda (*Agregar una cuenta › Testnet › Crear una bóveda nueva*).
- [ ] Recibe XRP de prueba y envía un pago chico.
- [ ] Si los tienes, firma con Tangem, Ledger o Xaman, o entre dos teléfonos por QR.
- [ ] Exporta un respaldo y restáuralo.
- [ ] Cambia idioma y apariencia; fíjate si algo se ve raro.

### 6. Registrar tu resultado en el XRP Ledger

Envía **1 drop (0,000001 XRP)** a la cuenta Quorum Releases con este **memo**, como texto:

```
quorum.attest {"release":"1.0.1","commit":"fd2e085","app":"sha256:1b0b6bbd","result":"pass"}
```

- `commit` y `app`: bastan los primeros caracteres (7 del commit, 8 de la huella).
- En **Android**, agrega `"platform":"android"`: `quorum.attest {"release":"1.0.3","platform":"android","commit":"…","app":"sha256:…","result":"pass"}`. Sin `platform`, cuenta como iOS. Si validas las dos plataformas, envía una validación por cada una.
- Si algo no coincidió o no funcionó, regístralo igual. **Un fail vale tanto como un pass:**
  ```
  quorum.attest {"release":"1.0.1","commit":"fd2e085","app":"sha256:1a2b3c4d","result":"fail","note":"app code differs"}
  ```
  Después abre un hilo en [Discussions › Validators](https://github.com/fcmdeveloper/quorum/discussions/categories/validators) con tu salida para que otros puedan reproducirlo.

Tu resultado es público, permanente y queda asociado a tu dirección del XRP Ledger. Usa una dirección que te parezca bien mostrar.

### 7. Inscribirte (opcional)

Para aparecer como validador, envía 1 drop a la misma cuenta, una sola vez, con:

```
quorum.join {"github":"tu-usuario-de-github"}
```

El usuario de GitHub es opcional, pero ayuda a que la comunidad sepa quién eres. También puedes seguir con seudónimo.

## El Consejo de validadores

Algunos validadores también firman la versión misma. La cuenta Quorum Releases es una **bóveda multifirma**: una versión solo queda registrada cuando firma el quórum del Consejo. Minify SpA, el desarrollador, es un firmante con un solo voto y **no puede registrar una versión por su cuenta**.

- **Objetivo:** 3 firmantes, quórum 2: Minify y 2 validadores de la comunidad.
- **Génesis (hoy):** hasta que se sumen los 2 primeros validadores de la comunidad, el Consejo son 4 dispositivos de Minify (quórum 2 de 4). Es temporal y público: cuando entren, el Consejo firma un `SignerListSet` que deja a Minify con un solo voto, y ese cambio queda en el ledger.
- **Entrar al Consejo:** los validadores con **2 validaciones correctas seguidas** pueden ser propuestos. El Consejo actual los agrega firmando un `SignerListSet` en el XRP Ledger. Esa transacción es el registro público de la decisión.
- **Crecer:** 3 firmantes (quórum 2) → 5 (quórum 3) → 9 (quórum 5). Minify mantiene siempre un solo voto.
- **Salir:** quien se salte 3 versiones seguidas, o dé fe de algo falso, puede ser removido de la misma forma, por el quórum del Consejo.
- **Las versiones llegan a la App Store solo después de que firma el quórum del Consejo.**

Los miembros del Consejo firman con la app Quorum (Tangem, Ledger o Xaman), igual que en cualquier otra bóveda.

## Reconocimiento

Cada validador de la comunidad con una validación **correcta** recibe el NFT **Quorum Validator** de esa versión.

- **Una colección, una edición por versión.** Todas las insignias son de la colección *Quorum Validators*, emitida por la cuenta de la galería de Quorum `rfrn8qHd6qrYXokM1du4vEFF8qUin9kirE` (taxon 2026). Cada versión tiene su color; **la 1.0.0 es la edición Génesis** (verde) y **la 1.0.1, la azul**.
- **Se acuñan a pedido.** No hay stock por adelantado: se acuña una insignia por cada validación correcta, así que el total siempre es el número real de validaciones.
- **Se entregan como oferta gratis.** La galería acuña la insignia y la ofrece por 0 XRP solo a tu dirección. La aceptas desde tu billetera (en el XRP Ledger nadie puede enviarte un NFT sin tu consentimiento) y después puedes usarla como imagen de una cuenta en Quorum.
- **No se pueden transferir y no tienen valor monetario.** Solo pueden volver a la galería, nunca venderse. Quorum no paga a los validadores: es un proyecto gratuito y sin fines de lucro.
- **Una insignia por plataforma.** Si validas el build de iOS y el de Android de una versión, recibes dos insignias.
- **Minify no se entrega insignias a sí mismo.** Las cuentas del desarrollador nunca reciben insignia.

⚠️ Si tu cuenta bloquea las ofertas de NFT entrantes (una de las protecciones que Quorum ofrece para las bóvedas), la oferta no te llega. Valida desde una cuenta normal o, desde Quorum 1.0.1, permite *Ofertas de NFT* en *Seguridad › Protecciones* de la bóveda hasta aceptar la insignia y vuelve a bloquearlas.

Las imágenes y los datos de las insignias se publican en [quorumxrpl.com/nft/](https://quorumxrpl.com/nft/validator-1.0.1.json), no en IPFS.

## Preguntas

[Discussions › Validators](https://github.com/fcmdeveloper/quorum/discussions/categories/validators) · contact@quorumxrpl.com
