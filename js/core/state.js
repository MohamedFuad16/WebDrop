export function createStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(nextState) {
      state = structuredClone(nextState);
      listeners.forEach((listener) => listener(state));
    },
    patch(partial) {
      state = { ...state, ...partial };
      listeners.forEach((listener) => listener(state));
    },
    update(updater) {
      state = updater(state);
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }
  };
}
