/**
 * Runs before every test file: adds the DOM matchers (`toBeInTheDocument`, `toHaveTextContent` ...) for component
 * tests, and gives the jsdom environment the `TextEncoder` every real browser has (the password rule counts bytes
 * with it).
 *
 * @author Mahir Al Kamal
 */
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, {
  TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  TextDecoder: globalThis.TextDecoder ?? TextDecoder,
});
