// Fan-out hub for live status pushes to every connected studio/panel client.
import type { WebSocket } from "ws";

class Hub {
  private clients = new Set<WebSocket>();
  private last: unknown = null;

  add(socket: WebSocket) {
    this.clients.add(socket);
    // Send the most recent snapshot immediately so a fresh client isn't blank.
    if (this.last) this.send(socket, this.last);
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  private send(socket: WebSocket, payload: unknown) {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      this.clients.delete(socket);
    }
  }

  broadcast(payload: unknown) {
    this.last = payload;
    for (const socket of this.clients) this.send(socket, payload);
  }

  get size() {
    return this.clients.size;
  }
}

export const hub = new Hub();
