# Quorum release validators

*[Leer en español](VALIDATORS.es.md)*

Every Quorum release is rebuilt and checked by independent validators before it reaches the App Store. They confirm that the app people install runs exactly the code published in this repository, and they record their result, pass or fail, on the XRP Ledger, where anyone can see it and nobody can erase it.

Anyone can validate. You don't need permission, an account with us, or to trust anyone: only this repository, your own computer and an XRP Ledger wallet.

## What a validator checks

1. **Same code.** The app code inside the published app has the same fingerprint (SHA-256) as the one you get by rebuilding the release's commit yourself.
2. **Same record.** That fingerprint matches the release registered on the XRP Ledger.
3. **It works.** You install the app and try the basics on testnet.

### What this proves, and what it doesn't

- ✅ It proves the **app code** (the JavaScript compiled to Hermes bytecode) is exactly this repository's code. That is where Quorum builds transactions, verifies every signature, shows warnings and stores your data.
- ⚠️ It does **not** cover the native binary, which Apple re-signs and encrypts and nobody can rebuild byte for byte. The native part is the iOS shell plus the Tangem, Ledger and camera libraries, all open source and pinned in `package-lock.json` and `app.json`.
- ⚠️ A validator attests to what they checked, not that the code is free of bugs. Reading the code and reporting problems is always welcome.

## Step by step

### 1. Prepare (once)

You need:
- **macOS or Linux** with `git` and **Node.js 22** ([nodejs.org](https://nodejs.org)). Both give the same result: we checked it.
- **An XRP Ledger wallet** to record your result (Quorum, Xaman or any wallet that can add a memo). It costs one drop plus the network fee: fractions of a cent.
- **An iPhone** to install the app from TestFlight (recommended, not required).

```bash
git clone https://github.com/fcmdeveloper/quorum.git
cd quorum
```

### 2. Find the release

Each release is announced in [Discussions › Announcements](https://github.com/fcmdeveloper/quorum/discussions/categories/announcements) with:
- its **tag** (for example `v1.0.0`) and **commit**;
- its **app code fingerprint** (`sha256:…`);
- the **TestFlight link** to install it;
- the transaction that registered it on the XRP Ledger.

The registry account is **Quorum Releases**: [`rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8`](https://livenet.xrpl.org/accounts/rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8). Its full history is on any XRP Ledger explorer and at [quorumxrpl.com/verify](https://quorumxrpl.com/verify).

### 3. Rebuild it

```bash
git fetch --tags
scripts/verify-release.sh v1.0.0
```

The script checks out that tag in a clean temporary folder, installs the exact dependencies (`npm ci`), bundles the app code with the same settings as the iOS release build, compiles it to Hermes bytecode and prints:

```
Quorum 1.0.0 (1)
commit    2c18196618c4f8f00d13a367010cbd5aeba4a5e3
app code  sha256:73880f90328d09de2e9a05160d4837cd6749090c8717282144e11d88513fb90d
js source sha256:2d962e5d2fc4e39719d82c93bf3269041c12b1672280edebea8661c988cde030
```

*(Example output. Your numbers are the ones that count.)*

It takes a few minutes the first time. The script only reads the repository; it doesn't touch your other files.

### 4. Compare

Your **app code** line must be identical to:

1. **The release record on the XRP Ledger** (the `app` field of its memo; see [RELEASES.md](RELEASES.md)).
2. **The installed app.** Install the build from TestFlight, open *Settings › About › Verify this version* and compare the fingerprint shown there.

All three must match, character by character.

<details>
<summary><b>Advanced (Mac): read the fingerprint straight from the downloaded app</b></summary>

If you'd rather not rely on the app reporting its own fingerprint:

1. Install **Apple Configurator** (free, Mac App Store) and connect an iPhone.
2. *Add › Apps*, find Quorum and add it. Configurator downloads the `.ipa` to
   `~/Library/Group Containers/K36BKF7T3D.group.com.apple.configurator/Library/Caches/Assets/TemporaryItems/MobileApps/`.
   Copy it before closing the dialog.
3. Unzip it and hash the app code:
   ```bash
   unzip -q Quorum*.ipa -d quorum-ipa
   shasum -a 256 quorum-ipa/Payload/Quorum.app/main.jsbundle
   ```
Apple encrypts only the native executable; `main.jsbundle` is stored as built.
</details>

### 5. Test the app (recommended)

On testnet, with no real funds:
- [ ] Accept the welcome notice and create a vault (*Add an account › Testnet › Create a new vault*).
- [ ] Get test XRP and send a small payment.
- [ ] If you have them, sign with Tangem, Ledger or Xaman, or between two phones by QR.
- [ ] Export a backup and restore it.
- [ ] Switch language and appearance; look for anything odd.

### 6. Record your result on the XRP Ledger

Send **1 drop (0.000001 XRP)** to the Quorum Releases account with this **memo**, as plain text:

```
quorum.attest {"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}
```

- `commit` and `app`: the first characters are enough (7 for the commit, 8 for the hash).
- If something didn't match or didn't work, record it as well. **A fail is as valuable as a pass:**
  ```
  quorum.attest {"release":"1.0.0","commit":"2c18196","app":"sha256:1a2b3c4d","result":"fail","note":"app code differs"}
  ```
  Then open a thread in [Discussions › Validators](https://github.com/fcmdeveloper/quorum/discussions/categories/validators) with your output so others can reproduce it.

Your attestation is public, permanent and linked to your XRP Ledger address. Use an address you're comfortable showing.

### 7. Join (optional)

To be listed as a validator, send 1 drop to the same account, once, with:

```
quorum.join {"github":"your-github-user"}
```

The GitHub user is optional but helps the community know who you are. You can also stay pseudonymous.

## The Validator Council

Some validators also co-sign the release itself. The Quorum Releases account is a **multisig vault**: a release is registered only when the Council's quorum signs it. Minify SpA, the developer, is one signer with one vote and **cannot register a release alone**.

- **Target:** 3 signers, quorum 2: Minify + 2 community validators.
- **Genesis (today):** until the first two community validators join, the Council is 4 devices held by Minify (quorum 2 of 4). This is temporary and public: when they join, the Council signs a `SignerListSet` that leaves Minify with one vote, and that change stays on the ledger.
- **Joining the Council:** validators with **2 consecutive correct attestations** can be proposed. The current Council adds them by signing a `SignerListSet` on the XRP Ledger. That transaction is the public record of the decision.
- **Growing:** 3 signers (quorum 2) → 5 (quorum 3) → 9 (quorum 5). Minify always keeps a single vote.
- **Leaving:** members who skip 3 releases in a row, or attest something false, can be removed the same way, by the Council's quorum.
- **Releases reach the App Store only after the Council's quorum has signed them.**

Council members sign with the Quorum app (Tangem, Ledger or Xaman), exactly like any other vault.

## Recognition

Every community validator with a **correct** attestation receives a **Quorum Validator** NFT for that release.

- **One collection, one edition per release.** All badges belong to the *Quorum Validators* collection, issued by the Quorum gallery account `rfrn8qHd6qrYXokM1du4vEFF8qUin9kirE` (taxon 2026). Each release has its own color; **1.0.0 is the Genesis edition**.
- **Minted on demand.** There's no pre-minted stock: one badge is minted for each correct attestation, so the total always equals the real number of validations.
- **Delivered as a free offer.** The gallery mints the badge and offers it for 0 XRP to your address only. You accept it from your wallet (on the XRP Ledger nobody can send you an NFT without your consent). Then you can use it as an account image in Quorum.
- **Non-transferable and without monetary value.** It can only go back to the gallery, never be sold. Quorum doesn't pay validators: it's a free, non-profit project.
- **Minify doesn't award itself.** The developer's own accounts never receive badges.

⚠️ If your account blocks incoming NFT offers (one of the protections Quorum offers for vaults), the offer can't reach you. Validate from a regular account.

The badge images and metadata are published on [quorumxrpl.com/nft/](https://quorumxrpl.com/nft/validator-1.0.0.json), not on IPFS.

## Questions

[Discussions › Validators](https://github.com/fcmdeveloper/quorum/discussions/categories/validators) · contact@quorumxrpl.com
