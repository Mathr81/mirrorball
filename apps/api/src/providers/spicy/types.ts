/**
 * Structures décompressées de l'API Spicy Lyrics, telles que décrites dans
 * docs/spicy-lyrics-api.md §6 (reverse-engineered depuis le client officiel,
 * pas de schéma public). `StartTime`/`EndTime` sont documentés comme
 * « proches de la milliseconde » côté client (ConvertTime()) mais NON
 * vérifiés empiriquement ici faute de token Spotify réel — voir to-ir.ts.
 */

export type SpicySource = 'spt' | 'aml' | 'spl' | 'ldb';

export interface SpicyTtmlUploadMetadata {
  Maker?: { id: string; username: string; avatar?: string };
  Uploader?: { id: string; username: string; avatar?: string };
}

interface SpicyCommon {
  source?: SpicySource;
  classes?: string;
  styles?: Record<string, string>;
  TTMLUploadMetadata?: SpicyTtmlUploadMetadata;
}

export interface SpicyStaticLine {
  Text: string;
  TransliteratedText?: string;
}

export interface SpicyStaticData extends SpicyCommon {
  Type: 'Static';
  Lines: SpicyStaticLine[];
  offline?: boolean;
}

export interface SpicyLineEntry {
  Text: string;
  StartTime: number;
  EndTime: number;
  TransliteratedText?: string;
  OppositeAligned?: boolean;
}

export interface SpicyLineData extends SpicyCommon {
  Type: 'Line';
  Content: SpicyLineEntry[];
  StartTime: number;
  SongWriters?: string[];
}

export interface SpicySyllable {
  Text: string;
  TransliteratedText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
}

export interface SpicyLead {
  StartTime: number;
  EndTime: number;
  Syllables: SpicySyllable[];
}

export interface SpicyBackground {
  StartTime: number;
  EndTime: number;
  Syllables: SpicySyllable[];
}

export interface SpicySyllableLine {
  Lead: SpicyLead;
  Background?: SpicyBackground[];
  OppositeAligned?: boolean;
}

export interface SpicySyllableData extends SpicyCommon {
  Type: 'Syllable';
  Content: SpicySyllableLine[];
  StartTime: number;
  SongWriters?: string[];
}

export type SpicyLyricsData = SpicyStaticData | SpicyLineData | SpicySyllableData;
