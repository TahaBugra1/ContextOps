import { normalizeText, generateUUID } from "../../src/mainWorld.js";

test('normalizeText lowercases and trims', () => {
  expect(normalizeText('  HeLLo WORLd  ')).toBe('hello world');
});

test('generateUUID returns a valid UUID v4 string', () => {
  const uuid = generateUUID();
  expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
