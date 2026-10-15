/**
 * The session list, as main publishes it.
 *
 * `chat:sessions-changed` is a push of this array whenever the visible list can change, which is
 * what replaced the renderer's mount-time `chat:listSessions` fetch — wrapped in an effect whose
 * dependency was a fresh closure every render, that fetch became an unbounded IPC loop while Ask
 * mode stayed open. Declaring the row shape here keeps it from being written out a third time in
 * `preload.ts` and the renderer, which is the drift this repo's IPC contract keeps re-growing.
 *
 * Types only: no runtime value, no Electron, so importing this from the sandboxed preload erases at
 * build and adds nothing to the bundle.
 */
export interface ChatSessionSummary {
  id: string;
  title: string;
  /** ISO string, because a `Date` does not survive structured clone as a `Date`. */
  updatedAt: string;
  messageCount: number;
}
