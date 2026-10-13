/** Ya existe una propuesta pendiente que ocupa la secuencia de la cuenta. */
export class PendingProposalError extends Error {
  constructor(public proposalId: string) {
    super('Ya hay una operación pendiente de esta cuenta. Fírmala y envíala, o elimínala, antes de crear otra (o crea tickets para tener varias en paralelo).');
  }
}
