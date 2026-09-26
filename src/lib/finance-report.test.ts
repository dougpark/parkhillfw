import { describe, expect, test } from 'bun:test';
import { buildHouseholdCompositeId } from './finance-report';

describe('buildHouseholdCompositeId', () => {
    test('builds [number][street initials]-[first]-[last]', () => {
        expect(buildHouseholdCompositeId('2345 Lofton Terrace', 'Doug', 'Park')).toBe('2345LT-Doug-Park');
    });

    test('handles a single-word street name', () => {
        expect(buildHouseholdCompositeId('100 Main', 'Doug', 'Park')).toBe('100M-Doug-Park');
    });

    test('handles a multi-word street name with more than two words', () => {
        expect(buildHouseholdCompositeId('123 North Forest Lane', 'Doug', 'Park')).toBe('123NFL-Doug-Park');
    });

    test('collapses extra whitespace in the address', () => {
        expect(buildHouseholdCompositeId('  2345   Lofton   Terrace ', 'Doug', 'Park')).toBe('2345LT-Doug-Park');
    });

    test('omits blank name parts instead of leaving stray dashes', () => {
        expect(buildHouseholdCompositeId('2345 Lofton Terrace', '', '')).toBe('2345LT');
        expect(buildHouseholdCompositeId('2345 Lofton Terrace', 'Doug', '')).toBe('2345LT-Doug');
    });
});
