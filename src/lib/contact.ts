function normalizedPhone(value: string): { digits: string; hasPlus: boolean; extension?: string } {
    const extensionMatch = value.match(/\b(?:x|ext\.?|extension)\s*(\d{1,6})$/i);
    const extension = extensionMatch?.[1];
    const mainNumber = extensionMatch ? value.slice(0, extensionMatch.index).trim() : value.trim();
    return {
        digits: mainNumber.replace(/\D/g, ''),
        hasPlus: mainNumber.startsWith('+'),
        extension,
    };
}

export function phoneHref(value: string): string {
    const { digits, hasPlus, extension } = normalizedPhone(value);
    return `tel:${hasPlus ? '+' : ''}${digits}${extension ? `;ext=${extension}` : ''}`;
}

export function smsHref(value: string): string {
    const { digits, hasPlus } = normalizedPhone(value);
    return `sms:${hasPlus ? '+' : ''}${digits}`;
}

export function emailHref(value: string): string {
    return `mailto:${value.trim()}`;
}

export function mapsHref(streetAddress: string): string {
    const query = encodeURIComponent(`${streetAddress}, Fort Worth, TX`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
