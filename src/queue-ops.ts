export const ACTION_QUEUE_HEAD_SENTINEL = 0n;

type QueueNodeBase = {
  id: bigint;
  priorActionSequenceNodeId: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
};

export const findQueueTailNode = <TRow extends QueueNodeBase>(rows: readonly TRow[]): TRow | undefined => {
  const referenced = new Set<bigint>();
  for (const row of rows) {
    if (row.priorActionSequenceNodeId !== ACTION_QUEUE_HEAD_SENTINEL) {
      referenced.add(row.priorActionSequenceNodeId);
    }
  }

  let tail: TRow | undefined;
  for (const row of rows) {
    if (referenced.has(row.id)) {
      continue;
    }
    if (!tail || row.createdAt.microsSinceUnixEpoch > tail.createdAt.microsSinceUnixEpoch) {
      tail = row;
    }
  }
  return tail;
};

export const findQueueHeadNode = <TRow extends QueueNodeBase>(rows: readonly TRow[]): TRow | undefined => {
  let head: TRow | undefined;
  for (const row of rows) {
    if (row.priorActionSequenceNodeId !== ACTION_QUEUE_HEAD_SENTINEL) {
      continue;
    }
    if (!head || row.createdAt.microsSinceUnixEpoch < head.createdAt.microsSinceUnixEpoch) {
      head = row;
    }
  }
  return head;
};

export const findQueueNextNode = <TRow extends QueueNodeBase>(rows: readonly TRow[], nodeId: bigint): TRow | undefined => {
  let nextNode: TRow | undefined;
  for (const row of rows) {
    if (row.priorActionSequenceNodeId !== nodeId) {
      continue;
    }
    if (!nextNode || row.createdAt.microsSinceUnixEpoch < nextNode.createdAt.microsSinceUnixEpoch) {
      nextNode = row;
    }
  }
  return nextNode;
};
