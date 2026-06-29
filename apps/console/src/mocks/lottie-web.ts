/**
 * Stub for lottie-web in the Vitest/jsdom environment.
 * lottie-web uses HTMLCanvasElement.getContext at module load time, which
 * jsdom does not support. Tests never need animations, so an empty stub is safe.
 */
const lottie = {
  loadAnimation: () => ({
    destroy: () => {},
    play: () => {},
    stop: () => {},
    pause: () => {},
    goToAndStop: () => {},
    goToAndPlay: () => {},
    setSpeed: () => {},
    setDirection: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
  destroy: () => {},
  stop: () => {},
  play: () => {},
  pause: () => {},
  setSpeed: () => {},
  setDirection: () => {},
  searchAnimations: () => {},
  registerAnimation: () => {},
};

export default lottie;
