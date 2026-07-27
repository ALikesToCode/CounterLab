import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";

import {
  PRIVSEP_PROTOCOL_VERSION,
  PrivsepResponseSchema,
  PRIVSEP_SOCKET_PATH,
} from "./privsep-protocol.js";

const MAX_RESPONSE_BYTES = 16_384;

async function readResponseLine(socket: Socket): Promise<void> {
  await new Promise<void>((resolveResponse, rejectResponse) => {
    let bytes = Buffer.alloc(0);
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    };
    const onError = (error: Error) => {
      cleanup();
      rejectResponse(error);
    };
    const onEnd = () => {
      cleanup();
      rejectResponse(new Error("privsep broker closed before attach"));
    };
    const onData = (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.byteLength > MAX_RESPONSE_BYTES) {
        cleanup();
        rejectResponse(new Error("privsep response exceeded its byte limit"));
        return;
      }
      const newline = bytes.indexOf(0x0a);
      if (newline < 0) return;
      cleanup();
      const response = PrivsepResponseSchema.parse(
        JSON.parse(bytes.subarray(0, newline).toString("utf8")) as unknown,
      );
      if (response.status !== "ok" || response.operation !== "attach") {
        rejectResponse(new Error("privsep broker rejected attach"));
        return;
      }
      const remainder = bytes.subarray(newline + 1);
      if (remainder.byteLength > 0) socket.unshift(remainder);
      resolveResponse();
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
  });
}

export async function runPrivsepClient(
  launchId: string,
  socketPath = PRIVSEP_SOCKET_PATH,
): Promise<void> {
  const socket = connect({ path: socketPath, allowHalfOpen: true });
  await new Promise<void>((resolveConnect, rejectConnect) => {
    socket.once("connect", resolveConnect);
    socket.once("error", rejectConnect);
  });
  socket.write(
    `${JSON.stringify({
      protocolVersion: PRIVSEP_PROTOCOL_VERSION,
      requestId: randomUUID(),
      operation: "attach",
      launchId,
    })}\n`,
  );
  await readResponseLine(socket);
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
  await new Promise<void>((resolveClose, rejectClose) => {
    socket.once("close", resolveClose);
    socket.once("error", rejectClose);
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1])
) {
  const launchId = process.argv[2];
  if (!launchId) throw new Error("privsep client requires a launch id");
  await runPrivsepClient(launchId);
}
