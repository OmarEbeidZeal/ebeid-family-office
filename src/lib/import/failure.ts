/**
 * A verdict about a file, as opposed to something that went wrong on the way.
 *
 * Retrying a `StatementFailure` will produce the same answer, so the queue
 * stops trying and shows the sentence to the household instead.
 */
export class StatementFailure extends Error {}
