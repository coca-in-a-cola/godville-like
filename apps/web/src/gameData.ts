/** Game data and strings, bundled at build time from the root data/ and locales/ directories. */

import { loadGameData, type GameData } from '@godville/data';
import en from '../../../locales/en.json';
import bases from '../../../data/bases.csv?raw';
import modifiers from '../../../data/modifiers.csv?raw';
import monsters from '../../../data/monsters.csv?raw';
import towns from '../../../data/towns.csv?raw';
import trophies from '../../../data/trophies.csv?raw';
import { createTranslator, type Translator } from './i18n.ts';

export const gameData: GameData = loadGameData({ monsters, towns, trophies, bases, modifiers });

export const translator: Translator = createTranslator(en, 'en');
