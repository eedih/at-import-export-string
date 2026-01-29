import { ClientAPI, Environment, Space } from 'contentful-management';
import fs from 'fs';
import path from 'path';

const translatable: { [key: string]: boolean } = {
    name: true,
    text: true,
    subText: true,
    highlightText: true,
    alt: true,
    altText: true,
    list: true,
    caption: true,
    title: true,
    subtitle: true,
    richText: true,
    richtext: true,
    prefix: true,
    placeholder: true,
    placeHolder: true,
    suffix: true,
};

let translate: { [key: string]: string } = {};

function collectStrings(obj: any): void {
    if (obj === null || typeof obj !== 'object') {
        return;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (translatable[key] === true) {
                if (Array.isArray(value)) {
                    value.forEach(elem => {
                        if (typeof elem === 'string' && elem) {
                            translate[elem] = elem;
                        }
                    });
                } else if (typeof value === 'string' && value) {
                    translate[value] = value;
                }
            }
            if (typeof value === 'object') {
                collectStrings(value);
            }
        }
    }
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
        let nextEntries = await environment.getEntries(query);
        entries.items = entries.items.concat(nextEntries.items);
    }
    return entries;
}

async function getAllEntriesOfType(space: Space, environmentId: string, contentTypeId: string, entryIds?: string[]) {
    try {
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
    } catch (error) {
        console.error('Error fetching entries:', error);
        throw error;
    }
}

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function exportStrings(
    client: ClientAPI,
    spaceId: string,
    environmentId: string,
    outputDir: string,
    defaultLocale: string,  
    entryIds?: string[]
): Promise<string> {
    translate = {}; // Reset for each export
    const space = await client.getSpace(spaceId);

    const batchSize = 20;
    const activityIds = entryIds || [];

    if (activityIds.length > 0) {
        //console.log(`Processing ${activityIds.length} activities in batches of ${batchSize}...`);
        for (let i = 0; i < activityIds.length; i += batchSize) {
            const batch = activityIds.slice(i, i + batchSize);
            //console.log(`Processing batch starting at index ${i}:`, batch);

            const entries = await getAllEntriesOfType(space, environmentId, 'healthJourney_toolboxActivity', batch);
            entries.forEach(entry => {
                const val = entry.fields.activityJSON?.[defaultLocale];
                if (val !== undefined) {
                    collectStrings(val);
                }
            });
            //console.log(`==> Done Processing batch starting at index ${i}`);
            await wait(1000);
        }
    } else {
        // If no entry IDs are provided, fetch all entries for the content type
        console.log(`No entry IDs provided. Fetching all entries for content type 'healthJourney_toolboxActivity'.`);
        const entries = await getAllEntriesOfType(space, environmentId, 'healthJourney_toolboxActivity');
        entries.forEach(entry => {
            const val = entry.fields.activityJSON?.[defaultLocale];
            if (val !== undefined) {
                collectStrings(val);
            }
        });
    }


    const outputFileName = `export-${space.name}-${environmentId}-${defaultLocale}-${new Date().toISOString()}.json`;
    const outputFilePath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputFilePath, JSON.stringify(translate, null, 2));

    console.log(`Exported strings to ${outputFilePath}`);
    return outputFilePath;
}
