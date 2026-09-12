import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

/**
 * DDL inline plutôt qu'un fichier .sql séparé : `tsc` ne copie pas les
 * fichiers non-TS vers dist/, ça évite un problème de chemin au déploiement.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS lyrics_cache (
  provider   TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  sync       TEXT NOT NULL,
  ttml       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (provider, cache_key)
);

CREATE TABLE IF NOT EXISTS lyrics_negative (
  provider   TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (provider, cache_key)
);

CREATE TABLE IF NOT EXISTS lyrics_best (
  track_id   TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  sync       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export function openDb(path: string): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
