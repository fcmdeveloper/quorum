# Versiones de Quorum en el XRP Ledger

*[Read in English](RELEASES.md)*

Quorum guarda el historial de sus versiones en el XRP Ledger, no en un servidor ni en una base de datos. Este archivo define el formato, para que cualquiera pueda leerlo con cualquier herramienta.

**Cuenta de registro (Quorum Releases):** [`rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8`](https://livenet.xrpl.org/accounts/rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8). Es una bóveda multifirma cuyos firmantes son el Consejo de validadores ([VALIDATORS.es.md](VALIDATORS.es.md)). En la fase de génesis sus firmantes son dispositivos de Minify; esto cambia en el ledger cuando entren los 2 primeros validadores de la comunidad.

## Memos

Cada registro es un memo cuyo **MemoData** es texto UTF-8: una palabra clave, un espacio y un objeto JSON. No hace falta MemoType, así que sirve cualquier billetera que permita agregar un memo.

### `quorum.release`: una versión, firmada por el Consejo

La envía **la propia** cuenta Releases (un `AccountSet` sin flags que solo lleva el memo), así que solo existe cuando firmó el quórum del Consejo.

```
quorum.release {"v":"1.0.0","build":1,"platform":"ios","commit":"bdc12e1308fcd7c8e57820cd0ed999cbe5604c37","app":"sha256:42d967643abc58e130fefb109e55f6f9e9139984c4b084ca9ac05a56ba9045da","js":"sha256:b391463d9c7dc4f294389a01fc775fcca664273444ffaf923ee145072d7127c4"}
```

| Campo | Significado |
|---|---|
| `v` | Versión (`expo.version` en `app.json`) |
| `build` | Número de build de esa plataforma (`expo.ios.buildNumber` o `expo.android.versionCode`) |
| `platform` | `ios` o `android`. Si falta, es `ios` (así se escribieron la 1.0.0 a la 1.0.2) |
| `commit` | Commit completo de la versión (también con el tag `v<versión>`) |
| `app` | SHA-256 del bytecode de Hermes que se distribuye: `main.jsbundle` en la app de iOS, `index.android.bundle` en el APK |
| `js` | SHA-256 del bundle de JavaScript antes de compilar (para depurar) |

Las dos huellas son las que muestra `scripts/verify-release.sh v<versión> <plataforma>`.

**iOS y Android se registran por separado.** Comparten el número de versión, pero son builds distintos con huellas distintas: cada plataforma tiene su propio `quorum.release`. El registro de una plataforma nunca es una alerta para la otra, y las validaciones solo cuentan para la plataforma que indican.

### `quorum.attest`: el resultado de un validador

Se envía **a** la cuenta Releases desde cualquier cuenta, con cualquier monto (basta 1 drop).

```
quorum.attest {"release":"1.0.0","commit":"bdc12e1","app":"sha256:42d96764","result":"pass"}
```

| Campo | Significado |
|---|---|
| `release` | Versión revisada |
| `platform` | `ios` o `android`: el build que reconstruiste y comparaste. Si falta, es `ios` |
| `commit` | Commit reconstruido (al menos 7 caracteres) |
| `app` | Huella del código obtenida (al menos 8 caracteres) |
| `result` | `pass` o `fail` |
| `note` | Opcional, motivo breve (recomendado en un `fail`) |

Una validación es **correcta** cuando su versión y su plataforma son las de un registro `quorum.release` y sus `commit` y `app` coinciden con él. Validar las dos plataformas son dos validaciones.

### `quorum.join`: inscribirse como validador

Se envía **a** la cuenta Releases, una sola vez.

```
quorum.join {"github":"tu-usuario-de-github"}
```

`github` es opcional.

### `quorum.revoke`: retirar una versión

Se envía **desde** la cuenta Releases y la firma el quórum del Consejo, igual que un registro. La app consulta el registro al abrirse y cada 24 horas; una versión retirada muestra un aviso rojo en Inicio y pide confirmación antes de firmar en mainnet. Nunca bloquea la app.

```
quorum.revoke {"v":"1.0.1","reason":"motivo breve"}
```

| Campo | Significado |
|---|---|
| `v` | Versión retirada |
| `platform` | Opcional: `ios` o `android`. Sin él, se retira la versión en todas las plataformas |
| `app` | Opcional: retira solo el build con esta huella (prefijo). Sin él, todos los builds de esa versión |
| `reason` | Opcional, breve y público |

## Cambios en el Consejo

El Consejo es la lista de firmantes de la cuenta Releases. Agregar o sacar miembros es un `SignerListSet` firmado por el quórum actual, así que la historia del Consejo es la historia de la lista de firmantes de esa cuenta.

## Cómo sale una versión

1. **Tag** del commit de la versión como `v<versión>` en GitHub.
2. **Reconstruirla** con `scripts/verify-release.sh v<versión>` y publicar las huellas en Discussions › Announcements.
3. **Subir** exactamente ese build a TestFlight público. La app muestra su propia huella en *Ajustes › Acerca de › Verificar esta versión*.
4. **Los validadores** reconstruyen, comparan, prueban y registran `quorum.attest` (paso 6 de [VALIDATORS.es.md](VALIDATORS.es.md)).
5. **El Consejo firma** la transacción `quorum.release`. Mientras no firme su quórum, la versión no existe en el ledger.
6. **App Store:** solo después del paso 5.
7. **NFTs:** los validadores con una validación correcta reciben la oferta de su NFT Quorum Validator.

## Cómo leerlo

- [quorumxrpl.com/verify](https://quorumxrpl.com/verify): lee el ledger desde tu navegador.
- En la app: *Ajustes › Acerca de › Verificar esta versión*.
- Cualquier explorador del XRP Ledger: abre la cuenta Releases y lee los memos de sus transacciones.
- Tu propio código: `account_tx` sobre la cuenta Releases, decodifica `Memos[].Memo.MemoData` desde hex y quédate con los que empiezan con `quorum.`.
