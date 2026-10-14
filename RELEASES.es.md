# Versiones de Quorum en el XRP Ledger

*[Read in English](RELEASES.md)*

Quorum guarda el historial de sus versiones en el XRP Ledger, no en un servidor ni en una base de datos. Este archivo define el formato, para que cualquiera pueda leerlo con cualquier herramienta.

**Cuenta de registro (Quorum Releases):** [`rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8`](https://livenet.xrpl.org/accounts/rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8). Es una bóveda multifirma cuyos firmantes son el Consejo de validadores ([VALIDATORS.es.md](VALIDATORS.es.md)). En la fase de génesis sus firmantes son dispositivos de Minify; esto cambia en el ledger cuando entren los 2 primeros validadores de la comunidad.

## Memos

Cada registro es un memo cuyo **MemoData** es texto UTF-8: una palabra clave, un espacio y un objeto JSON. No hace falta MemoType, así que sirve cualquier billetera que permita agregar un memo.

### `quorum.release`: una versión, firmada por el Consejo

La envía **la propia** cuenta Releases (un `AccountSet` sin flags que solo lleva el memo), así que solo existe cuando firmó el quórum del Consejo.

```
quorum.release {"v":"1.0.0","build":1,"platform":"ios","commit":"2c18196618c4f8f00d13a367010cbd5aeba4a5e3","app":"sha256:73880f90328d09de2e9a05160d4837cd6749090c8717282144e11d88513fb90d","js":"sha256:2d962e5d2fc4e39719d82c93bf3269041c12b1672280edebea8661c988cde030"}
```

| Campo | Significado |
|---|---|
| `v` | Versión (`expo.version` en `app.json`) |
| `build` | Número de build de iOS (`expo.ios.buildNumber`) |
| `platform` | `ios` (Android más adelante) |
| `commit` | Commit completo de la versión (también con el tag `v<versión>`) |
| `app` | SHA-256 de `main.jsbundle` dentro de la app: el bytecode de Hermes que se distribuye |
| `js` | SHA-256 del bundle de JavaScript antes de compilar (para depurar) |

Las dos huellas son las que muestra `scripts/verify-release.sh v<versión>`.

### `quorum.attest`: el resultado de un validador

Se envía **a** la cuenta Releases desde cualquier cuenta, con cualquier monto (basta 1 drop).

```
quorum.attest {"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}
```

| Campo | Significado |
|---|---|
| `release` | Versión revisada |
| `commit` | Commit reconstruido (al menos 7 caracteres) |
| `app` | Huella del código obtenida (al menos 8 caracteres) |
| `result` | `pass` o `fail` |
| `note` | Opcional, motivo breve (recomendado en un `fail`) |

Una validación es **correcta** cuando sus `commit` y `app` coinciden con el registro `quorum.release` de esa versión.

### `quorum.join`: inscribirse como validador

Se envía **a** la cuenta Releases, una sola vez.

```
quorum.join {"github":"tu-usuario-de-github"}
```

`github` es opcional.

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
