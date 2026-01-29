import { ClientAPI, Environment, Space } from 'contentful-management';

const CONTENT_TYPE_ID = 'healthJourney_toolboxActivity';

type TranslationMap = Record<string, string>;

type ImportSummary = {
    entriesProcessed: number;
    entriesUpdated: number;
    replacements: number;
};

function sanitizeTranslations(rawMap: Record<string, unknown>): TranslationMap {
    const sanitized: TranslationMap = {};
    Object.keys(rawMap).forEach(key => {
        if (typeof rawMap[key] === 'string') {
            sanitized[key] = String(rawMap[key]);
        }
    });
    return sanitized;
}

function applyTranslations(target: any, translations: TranslationMap): { changed: boolean; replacements: number } {
    let changed = false;
    let replacements = 0;

    const visit = (node: any): any => {
        if (typeof node === 'string') {
            if (Object.prototype.hasOwnProperty.call(translations, node)) {
                const replacement = translations[node];
                replacements += 1;
                if (replacement !== node) {
                    changed = true;
                }
                return replacement;
            }
            return node;
        }

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = visit(node[i]);
            }
            return node;
        }

        if (node && typeof node === 'object') {
            Object.keys(node).forEach(key => {
                node[key] = visit(node[key]);
            });
            return node;
        }

        return node;
    };

    visit(target);

    return { changed, replacements };
}

async function paginateEntries(environment: Environment, contentTypeId: string, entries: any, entryIds?: string[]) {
    while (entries.items.length < entries.total) {
        const query: any = {
            content_type: contentTypeId,
            skip: entries.items.length,
            limit: 100
        };
        if (entryIds && entryIds.length > 0) {
            query['sys.id[in]'] = entryIds.join(',');
        }
        const nextEntries = await environment.getEntries(query);
        entries.items = entries.items.concat(nextEntries.items);
    }
    return entries;
}

async function getAllEntriesOfType(space: Space, environmentId: string, contentTypeId: string, entryIds?: string[]) {
    const environment = await space.getEnvironment(environmentId);
    const query: any = {
        content_type: contentTypeId,
        limit: 100
    };
    if (entryIds && entryIds.length > 0) {
        query['sys.id[in]'] = entryIds.join(',');
    }

    let entries = await environment.getEntries(query);
    entries = await paginateEntries(environment, contentTypeId, entries, entryIds);

    return entries.items;
}

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function importStrings(
    client: ClientAPI,
    spaceId: string,
    environmentId: string,
    rawTranslations: Record<string, unknown>,
    locale: string,
    defaultLocale: string,
    entryIds?: string[],
): Promise<ImportSummary> {
    const translations = sanitizeTranslations(rawTranslations);
    const space = await client.getSpace(spaceId);
    const summary: ImportSummary = {
        entriesProcessed: 0,
        entriesUpdated: 0,
        replacements: 0
    };

    if (Object.keys(translations).length === 0) {
        return summary;
    }

    const activityIds = entryIds || [];
    const batchSize = 20;

    const processEntries = async (entries: any[], locale: string) => {
        for (const entry of entries) {
            summary.entriesProcessed += 1;
            const activityJSON = entry.fields.activityJSON?.[defaultLocale];
            if (!activityJSON) {
                continue;
            }
            var translatedActivityJSON = JSON.parse(JSON.stringify(activityJSON));
            const { changed, replacements } = applyTranslations(translatedActivityJSON, translations);
            if (!changed && replacements === 0) {
                continue;
            }

            entry.fields.activityJSON[locale] = translatedActivityJSON;
            await entry.update();
            summary.entriesUpdated += 1;
            summary.replacements += replacements;
            await wait(500);
        }
    };

    if (activityIds.length > 0) {
        for (let i = 0; i < activityIds.length; i += batchSize) {
            const batch = activityIds.slice(i, i + batchSize);
            const entries = await getAllEntriesOfType(space, environmentId, CONTENT_TYPE_ID, batch);
            await processEntries(entries, locale);
        }
    } else {
        const entries = await getAllEntriesOfType(space, environmentId, CONTENT_TYPE_ID);
        await processEntries(entries,locale);
    }

    return summary;
}
