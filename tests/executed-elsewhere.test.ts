import { test } from 'node:test';
import assert from 'node:assert';
import { ledgerTxProposalId, proposalIdFor } from '../src/core/qr';

const VAULT = 'rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8';
const SIGNER = 'rPsFmq43ngKqzbXx9nVJRRiRdaVVfs4CZZ';

// Lo que guarda el teléfono que creó la propuesta (preparada, sin firmas).
const accountSet = { TransactionType: 'AccountSet', Account: VAULT, Fee: '48', Sequence: 0, TicketSequence: 21543888, LastLedgerSequence: 21546195, SigningPubKey: '', Flags: 0 };
const payment = { TransactionType: 'Payment', Account: VAULT, Destination: SIGNER, Amount: '1000000', Fee: '48', Sequence: 12, LastLedgerSequence: 99, SigningPubKey: '' };

// Lo que devuelve account_tx (api_version 2) cuando otro teléfono la envió con sus firmas.
const fromLedger = (tx: any) => ({
  ...tx,
  Signers: [{ Signer: { Account: SIGNER, SigningPubKey: '02' + '11'.repeat(32), TxnSignature: '30' + '22'.repeat(70) } }],
  hash: 'AB'.repeat(32),
  ctid: 'C000000000000000',
  date: 813000000,
  ledger_index: 21543900,
});

test('an AccountSet executed from another phone is recognized as the same proposal', () => {
  assert.strictEqual(ledgerTxProposalId(fromLedger(accountSet)), proposalIdFor(accountSet));
});

test('a Payment (Amount returned as DeliverMax in api v2) is recognized as the same proposal', () => {
  const { Amount, ...rest } = payment;
  assert.strictEqual(ledgerTxProposalId(fromLedger({ ...rest, DeliverMax: Amount })), proposalIdFor(payment));
});

test('a different operation that used the same ticket is not mistaken for the proposal', () => {
  const other = { ...accountSet, SetFlag: 8 };
  assert.notStrictEqual(ledgerTxProposalId(fromLedger(other)), proposalIdFor(accountSet));
});
