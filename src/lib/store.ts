import { useSyncExternalStore } from "react";

/**
 * Minimal external store (Zustand-style API) built on useSyncExternalStore.
 * Keeps the app off the npm dependency for state management while preserving
 * a familiar `set`/`get`/selector ergonomics for the game loop.
 */
export type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>),
) => void;
export type GetState<T> = () => T;

export interface StoreApi<T> {
  getState: GetState<T>;
  setState: SetState<T>;
  subscribe: (listener: () => void) => () => void;
}

export type UseBoundStore<T> = {
  <U>(selector: (state: T) => U): U;
  (): T;
} & StoreApi<T>;

export function createStore<T extends object>(
  initializer: (set: SetState<T>, get: GetState<T>) => T,
): UseBoundStore<T> {
  let state: T;
  const listeners = new Set<() => void>();

  const setState: SetState<T> = (partial) => {
    const next =
      typeof partial === "function"
        ? (partial as (s: T) => Partial<T>)(state)
        : partial;
    // Shallow merge; only notify if something actually changed reference-wise.
    state = Object.assign({}, state, next);
    listeners.forEach((l) => l());
  };

  const getState: GetState<T> = () => state;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  state = initializer(setState, getState);

  const useStore = (<U>(selector?: (state: T) => U) => {
    const select = selector ?? ((s: T) => s as unknown as U);
    return useSyncExternalStore(
      subscribe,
      () => select(state),
      () => select(state),
    );
  }) as UseBoundStore<T>;

  useStore.getState = getState;
  useStore.setState = setState;
  useStore.subscribe = subscribe;

  return useStore;
}
