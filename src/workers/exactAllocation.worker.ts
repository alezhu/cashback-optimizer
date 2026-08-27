import { exactAllocate } from '../services/exactAllocationService';
import type { CleanCard, CleanGroup } from '../types';

export interface ExactWorkerRequest {
  cards: CleanCard[];
  groups: CleanGroup[];
}

self.onmessage = (e: MessageEvent<ExactWorkerRequest>) => {
  const { cards, groups } = e.data;
  const result = exactAllocate(cards, groups);
  self.postMessage(result);
};
