// What this device is generating right now, as ONE fact other subsystems can observe.
//
// Chat tokens are streamed to the renderer for display and are accumulated there. Anything else that
// wants to follow a reply as it forms - live streaming to paired devices, most obviously - would
// otherwise have to re-accumulate them from its own tap on the same deltas, and would drift the first
// time a code path was added or a buffer reset.
//
// So the deltas are folded up here, once, and published as a snapshot: the conversation being
// answered and the cumulative text so far, or null when nothing is generating. Emitting the snapshot
// (not the delta) is what makes a consumer's job total - it cannot miss a "stream ended" event,
// because ending IS a snapshot.

import { callHook, HOOKS } from './bootstrap/hookRegistry'

interface ActiveStream {
  conversationId: string
  content: string
  reasoning: string
  /**
   * The id this reply will be STORED under, when the caller named it before the first token.
   *
   * Published with every snapshot, so a paired device's live preview and the durable record that
   * follows share one identity - which is what lets the preview be retired the moment the record
   * lands instead of standing beside it until it times out.
   */
  messageId?: string
}

const active = new Map<string, ActiveStream>()

/**
 * The identity minted for a conversation's current reply, until its stored record claims it.
 *
 * Deliberately OUTLIVES the stream. The turn ends in this process the moment the model stops, while
 * the record is written afterwards by the renderer over IPC - so an identity discarded on `end` is
 * always gone before the thing that needs it asks. Keyed by conversation because chat generation is
 * serialised through one queue: a conversation has at most one reply forming at a time.
 */
const pendingMessageIds = new Map<string, string>()

/**
 * Attach a conversation to a stream id, before any delta arrives, and name the reply it will become.
 *
 * Deltas are keyed by stream id because that is all the streaming transport knows; the conversation
 * is known only by the handler that started the turn. A stream that is never bound simply publishes
 * nothing - an unattributed reply has no conversation to appear in.
 *
 * The id is minted HERE, in the one place that already knows a reply has started, rather than being
 * passed in by each caller that persists one. A caller that has to remember to thread an id is a
 * caller that can forget, and every site that forgot would silently go back to being drawn twice on
 * a paired device.
 */
export function bindChatStream(streamId: string | undefined, conversationId?: string): void {
  if (!streamId || !conversationId) return
  // A new reply supersedes any identity still unclaimed for this conversation - the previous turn was
  // cancelled or failed before it ever became a record, so nothing is going to claim it.
  const messageId = crypto.randomUUID()
  pendingMessageIds.set(conversationId, messageId)
  active.set(streamId, { conversationId, content: '', reasoning: '', messageId })
  publish(streamId)
}

/**
 * Claim the identity minted for this conversation's reply, so its record keeps the id its live
 * frames already carried on every paired device.
 *
 * Take-once: the first record to conclude the turn claims it, and anything written afterwards gets a
 * fresh id of its own. Returns undefined when nothing was streamed - a message typed into a
 * conversation with no generation behind it is simply new, and mints its own id as it always did.
 */
export function takeChatStreamMessageId(conversationId: string): string | undefined {
  const messageId = pendingMessageIds.get(conversationId)
  if (messageId !== undefined) pendingMessageIds.delete(conversationId)
  return messageId
}

/** Fold one delta into the reply so far and publish the result. */
export function noteChatStreamDelta(
  streamId: string | undefined,
  text: string,
  kind: 'content' | 'reasoning'
): void {
  if (!streamId) return
  const stream = active.get(streamId)
  if (!stream) return
  if (kind === 'reasoning') stream.reasoning += text
  else stream.content += text
  publish(streamId)
}

/**
 * The turn ended, however it ended - completed, cancelled, or failed.
 *
 * Always publishes null, so a consumer never has to infer the end from silence.
 */
export function endChatStream(streamId: string | undefined): void {
  if (!streamId || !active.delete(streamId)) return
  callHook(HOOKS.syncStreamingState, null)
}

function publish(streamId: string): void {
  const stream = active.get(streamId)
  if (!stream) return
  callHook(HOOKS.syncStreamingState, {
    conversationId: stream.conversationId,
    content: stream.content,
    reasoning: stream.reasoning,
    messageId: stream.messageId
  })
}
