// Setup fake IndexedDB for Dexie in Node tests
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import '@testing-library/jest-dom/vitest';

// @ts-expect-error assign globals for Dexie
globalThis.indexedDB = new FDBFactory();
// @ts-expect-error assign globals for Dexie
globalThis.IDBKeyRange = FDBKeyRange;
