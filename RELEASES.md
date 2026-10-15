# Quorum releases on the XRP Ledger

*[Leer en español](RELEASES.es.md)*

Quorum keeps its release history on the XRP Ledger instead of a server or database. This file defines the format, so anyone can read it with any tool.

**Registry account (Quorum Releases):** [`rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8`](https://livenet.xrpl.org/accounts/rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8). It is a multisig vault whose signers are the Validator Council ([VALIDATORS.md](VALIDATORS.md)). During the genesis phase its signers are devices held by Minify; this changes on-ledger when the first two community validators join.

## Memos

Every record is a memo whose **MemoData** is plain UTF-8 text: a keyword, a space and a JSON object. No MemoType is needed, so any wallet that can add a memo works.

### `quorum.release`: a release, signed by the Council

Sent **by** the Releases account itself (an `AccountSet` with no flags that only carries the memo), so it exists only once the Council's quorum has signed it.

```
quorum.release {"v":"1.0.0","build":1,"platform":"ios","commit":"bdc12e1308fcd7c8e57820cd0ed999cbe5604c37","app":"sha256:42d967643abc58e130fefb109e55f6f9e9139984c4b084ca9ac05a56ba9045da","js":"sha256:b391463d9c7dc4f294389a01fc775fcca664273444ffaf923ee145072d7127c4"}
```

| Field | Meaning |
|---|---|
| `v` | Version (`expo.version` in `app.json`) |
| `build` | iOS build number (`expo.ios.buildNumber`) |
| `platform` | `ios` (Android later) |
| `commit` | Full git commit of the release (also tagged `v<version>`) |
| `app` | SHA-256 of `main.jsbundle` inside the app: the Hermes bytecode that ships |
| `js` | SHA-256 of the JavaScript bundle before compiling (for debugging) |

Both hashes are the ones printed by `scripts/verify-release.sh v<version>`.

### `quorum.attest`: a validator's result

Sent **to** the Releases account by any account, with any amount (1 drop is enough).

```
quorum.attest {"release":"1.0.0","commit":"bdc12e1","app":"sha256:42d96764","result":"pass"}
```

| Field | Meaning |
|---|---|
| `release` | Version checked |
| `commit` | Commit rebuilt (a prefix of at least 7 characters) |
| `app` | App code hash obtained (a prefix of at least 8 hex characters) |
| `result` | `pass` or `fail` |
| `note` | Optional, short reason (recommended for `fail`) |

An attestation counts as **correct** when its `commit` and `app` prefixes match the `quorum.release` record for that version.

### `quorum.join`: become a listed validator

Sent **to** the Releases account, once.

```
quorum.join {"github":"your-github-user"}
```

`github` is optional.

## Council changes

The Council is the Releases account's signer list. Adding or removing members is a `SignerListSet` signed by the current quorum, so the history of the Council is the history of that account's signer list.

## Release process

1. **Tag** the release commit as `v<version>` on GitHub.
2. **Rebuild** it with `scripts/verify-release.sh v<version>` and publish the hashes in Discussions › Announcements.
3. **Upload** that exact build to public TestFlight. The app shows its own fingerprint in *Settings › About › Verify this version*.
4. **Validators** rebuild, compare, test and record `quorum.attest` (step 6 of [VALIDATORS.md](VALIDATORS.md)).
5. **The Council signs** the `quorum.release` transaction. Until its quorum signs, the release doesn't exist on the ledger.
6. **App Store:** only after step 5.
7. **NFTs:** validators with a correct attestation receive their Quorum Validator NFT offer.

## Reading it

- [quorumxrpl.com/verify](https://quorumxrpl.com/verify): reads the ledger from your browser.
- In the app: *Settings › About › Verify this version*.
- Any XRP Ledger explorer: open the Releases account and read the memos of its transactions.
- Your own code: `account_tx` on the Releases account, decode `Memos[].Memo.MemoData` from hex, and keep the ones starting with `quorum.`.
