/**
 * ICU MessageFormat strings from locales/*.json, plus Intl number formatting.
 * The sim never formats text; everything player-facing goes through here.
 */

import { IntlMessageFormat, type PrimitiveType } from 'intl-messageformat';

export type Messages = Readonly<Record<string, string>>;
export type MessageValues = Record<string, PrimitiveType>;

export interface Translator {
  readonly locale: string;
  t(key: string, values?: MessageValues): string;
  /** Formats tenths of HP as a decimal with at most one fraction digit. */
  hp(tenths: number): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
}

export function createTranslator(messages: Messages, locale: string): Translator {
  const cache = new Map<string, IntlMessageFormat>();
  const hpFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return {
    locale,
    t(key, values) {
      let format = cache.get(key);
      if (format === undefined) {
        const source = messages[key];
        // A missing key renders as itself so it is visible, never silently blank.
        if (source === undefined) return key;
        format = new IntlMessageFormat(source, locale);
        cache.set(key, format);
      }
      return String(format.format(values));
    },
    hp(tenths) {
      return hpFormat.format(tenths / 10);
    },
    number(value, options) {
      return new Intl.NumberFormat(locale, options).format(value);
    },
  };
}
