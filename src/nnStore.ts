// Holds the networks trained in Rule Lab, so the order ticket can use them too.
// A tiny "store": anyone can read the current models and subscribe to changes.
import { useSyncExternalStore } from 'react';
import type { MatchingRule } from './engine';
import type { Net, Scaler } from './neural';

export type TrainedModel = { net: Net; scaler: Scaler; accuracy: number; baseline: number };
type Models = Partial<Record<MatchingRule, TrainedModel>>;

let models: Models = {};
const listeners = new Set<() => void>();

export function setModels(next: Models) {
  models = next;
  listeners.forEach(l => l());
}

export function useModels(): Models {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => models,
  );
}
