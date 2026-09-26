// Composite QuickBooks Household_ID: [street number][street-word initials]-[first]-[last],
// e.g. "2345 Lofton Terrace" + "Doug Park" -> "2345LT-Doug-Park".
export function buildHouseholdCompositeId(streetAddress: string, firstName: string, lastName: string): string {
    const [numberPart, ...words] = streetAddress.trim().split(/\s+/).filter(Boolean);
    const initials = words.map((word) => word[0]?.toUpperCase() ?? '').join('');
    return [`${numberPart ?? ''}${initials}`, firstName, lastName].filter(Boolean).join('-');
}
