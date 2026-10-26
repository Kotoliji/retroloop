/**
 * Who is online in each retro, counted per socket so a participant with two
 * tabs open stays online until both are closed. Kept in memory for a single
 * server instance; moves to Redis when the server is scaled out.
 */
export class Presence {
  private readonly rooms = new Map<string, Map<string, number>>();

  /** Returns true when the participant just came online. */
  add(retroId: string, participantId: string) {
    const room = this.rooms.get(retroId) ?? new Map<string, number>();
    this.rooms.set(retroId, room);
    const count = (room.get(participantId) ?? 0) + 1;
    room.set(participantId, count);
    return count === 1;
  }

  /** Returns true when the participant just went offline. */
  remove(retroId: string, participantId: string) {
    const room = this.rooms.get(retroId);
    const count = room?.get(participantId);
    if (!room || !count) return false;
    if (count > 1) {
      room.set(participantId, count - 1);
      return false;
    }
    room.delete(participantId);
    if (room.size === 0) this.rooms.delete(retroId);
    return true;
  }

  online(retroId: string) {
    return new Set(this.rooms.get(retroId)?.keys());
  }
}
