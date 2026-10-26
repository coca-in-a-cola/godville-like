import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_FILE_NAMES, DataValidationError, findById, loadGameData, parseTable, type DataSources } from '../src/index.ts';

const dataDir = new URL('../../../data/', import.meta.url);
const realSources = Object.fromEntries(
  DATA_FILE_NAMES.map((f) => [f, readFileSync(new URL(`${f}.csv`, dataDir), 'utf8')]),
) as DataSources;

describe('root data/ CSV files', () => {
  it('validate and load typed rows', () => {
    const data = loadGameData(realSources);
    expect(data.monsters.map((m) => [m.id, m.family])).toEqual([
      ['dust_bunny', 'spider'],
      ['dreaded_gazebo', 'golem'],
      ['blasphemouse', 'wraith'],
      ['blood_sucking_lawyer', 'leech'],
      ['bipolar_bear', 'brute'],
    ]);
    // Values from the GDD towns table.
    expect(data.towns.map((t) => [t.id, t.base_mile, t.min_level])).toEqual([
      ['godville', 0, 1],
      ['tradeburg', 50, 10],
      ['beerburgh', 120, 20],
      ['godvillewood', 200, 30],
    ]);
    expect(new Set(data.bases.map((b) => b.slot)).size).toBe(6);
    expect(findById(data.modifiers, 'cursed')).toEqual({
      id: 'cursed',
      group: 'morality',
      position: 'prefix',
      effect: 'mult_all_plus_curse',
      value: 1.5,
      min_zone: 4,
      weight: 8,
      name_en: 'Cursed',
    });
    expect(findById(data.monsters, 'dust_bunny')?.name_en).toBe('Dust Bunny');
  });
});

describe('CSV validation', () => {
  it('rejects a malformed number with file, line and column', () => {
    const { issues } = parseTable('towns', 'id,base_mile,min_level,name_en\ngodville,0,1,Godville\ntradeburg,fifty,10,Tradeburg\n');
    expect(issues).toEqual([{ file: 'towns.csv', line: 3, column: 'base_mile', message: 'expected a non-negative integer' }]);
  });

  it('rejects duplicate ids', () => {
    const { issues } = parseTable('monsters', 'id,family,name_en\ndust_bunny,spider,Dust Bunny\ndust_bunny,golem,Other\n');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ line: 3, column: 'id' });
    expect(issues[0]?.message).toMatch(/duplicate id "dust_bunny"/);
  });

  it('rejects unknown enum values, empty names, bad ids and wrong headers', () => {
    expect(parseTable('monsters', 'id,family,name_en\nx,dragon,X\n').issues[0]).toMatchObject({ column: 'family' });
    expect(parseTable('bases', 'id,slot,name_en\nsword,weapon,  \n').issues[0]).toMatchObject({ column: 'name_en' });
    expect(parseTable('trophies', 'id,base_price,name_en\nBad-Id,1,Thing\n').issues[0]).toMatchObject({ column: 'id' });
    expect(parseTable('trophies', 'id,price,name_en\nsock,1,Sock\n').issues[0]?.message).toMatch(/header must be/);
    expect(parseTable('modifiers', 'id,group,position,effect,value,min_zone,weight,name_en\nfine,quality,prefix,mult_all,x1.1,1,10,Fine\n').issues[0])
      .toMatchObject({ column: 'value' });
  });

  it('rejects rows with the wrong number of fields', () => {
    const { issues } = parseTable('towns', 'id,base_mile,min_level,name_en\ngodville,0,1,Godville,extra\n');
    expect(issues.length).toBeGreaterThan(0);
  });

  it('makes loadGameData throw with every issue listed', () => {
    const broken = { ...realSources, towns: 'id,base_mile,min_level,name_en\na,1,0,A\na,1,1,B\n' };
    let error: unknown;
    try {
      loadGameData(broken);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DataValidationError);
    expect((error as DataValidationError).issues.map((i) => i.line)).toEqual([2]);
    expect((error as DataValidationError).message).toMatch(/towns\.csv:2 \[min_level\]/);
  });
});
