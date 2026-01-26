import express from 'express';
import path from 'path';
import { createClient } from 'contentful-management';
import * as dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { exportStrings } from './exporter';
import { importStrings } from './importer';

dotenv.config();

const app = express();
const port = 3000;

// Set up multer for file uploads
const tmpDir = path.join(__dirname, '../tmp/contentful-uploads');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.txt' && ext !== '.json') {
            return cb(new Error('Only .txt or .json files are allowed'));
        }
        cb(null, true);
    }
});

const removeFile = (filePath?: string) => {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const client = createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN || '',
});

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));app.use('/scripts', express.static(path.join(__dirname, '../../node_modules/choices.js/public/assets/scripts')));
// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// Secure download endpoint for exported files
app.get('/api/download', (req, res) => {
    const filePathParam = (req.query.path || '') as string;
    if (!filePathParam) {
        return res.status(400).json({ success: false, error: 'Missing file path' });
    }

    const resolved = path.resolve(filePathParam);
    const allowedBase = path.resolve(tmpDir);
    if (!resolved.startsWith(allowedBase)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }

    const filename = path.basename(resolved);
    res.download(resolved, filename, (err) => {
        if (err) {
            console.error('Download error:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: 'Failed to download file' });
            }
        }
    });
});

// API for spaces
app.get('/api/spaces', async (req, res) => {
    try {
        const spaces = await client.getSpaces({ limit: 100 });
        res.json(spaces.items.map(space => ({ id: space.sys.id, name: space.name })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch spaces' });
    }
});

// API for environments
app.get('/api/spaces/:spaceId/environments', async (req, res) => {
    const { spaceId } = req.params;
    try {
        const space = await client.getSpace(spaceId);
        const [environments, aliases] = await Promise.all([
            space.getEnvironments(),
            space.getEnvironmentAliases()
        ]);

        const aliasMap = new Map<string, string[]>();
        aliases.items.forEach(alias => {
            const envId = alias.environment.sys.id;
            if (!aliasMap.has(envId)) {
                aliasMap.set(envId, []);
            }
            aliasMap.get(envId)!.push(alias.sys.id);
        });

        const response = environments.items.map(env => {
            const envAliases = aliasMap.get(env.sys.id);
            const name = envAliases ? `${env.name} (${envAliases.join(', ')})` : env.name;
            return { id: env.sys.id, name };
        });

        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch environments' });
    }
});

// API for locales within an environment
app.get('/api/spaces/:spaceId/environments/:environmentId/locales', async (req, res) => {
    const { spaceId, environmentId } = req.params;
    try {
        const space = await client.getSpace(spaceId);
        const environment = await space.getEnvironment(environmentId);
        const locales = await environment.getLocales();
        const response = locales.items.map(locale => ({
            code: locale.code,
            name: locale.name,
            default: locale.default
        }));
        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch locales' });
    }
});

// Export API
app.post('/api/export', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { space, environment } = req.body;
        if (!space || !environment) {
            removeFile(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: space or environment'
            });
        }

        console.log(`File saved to: ${req.file.path}`);
        console.log(`Space: ${space}, Environment: ${environment}, Action: Export`);
        console.log(`File size: ${req.file.size} bytes`);

        if (path.extname(req.file.originalname).toLowerCase() !== '.txt') {
            removeFile(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Export requires a .txt file with entry IDs per line'
            });
        }

        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const entryIds = fileContent
            .split(/\r?\n/)
            .map((id: string) => id.trim())
            .filter(Boolean);

        try {
            const exportFilePath = await exportStrings(
                client,
                space,
                environment,
                tmpDir,
                entryIds
            );

            return res.json({
                success: true,
                message: 'Export completed successfully',
                filePath: exportFilePath
            });
        } catch (error) {
            console.error('Export error:', error);
            return res.status(500).json({ success: false, error: 'Export failed' });
        }
    } catch (error) {
        console.error('Export request error:', error);
        removeFile(req.file?.path);
        return res.status(500).json({ success: false, error: 'Export failed' });
    }
});

// Import API
app.post('/api/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { space, environment, locale: localeInput } = req.body;
        if (!space || !environment) {
            removeFile(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: space or environment'
            });
        }

        console.log(`File saved to: ${req.file.path}`);
        console.log(`Space: ${space}, Environment: ${environment}, Action: Import`);
        console.log(`File size: ${req.file.size} bytes`);

        const locale = typeof localeInput === 'string' && localeInput.trim().length > 0
            ? localeInput.trim()
            : 'en-US';

        if (path.extname(req.file.originalname).toLowerCase() !== '.json') {
            removeFile(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Import requires a .json file containing translations'
            });
        }

        const fileContent = fs.readFileSync(req.file.path, 'utf-8');

        let parsedData: unknown;
        try {
            parsedData = JSON.parse(fileContent);
        } catch (parseError) {
            console.error('Import parse error:', parseError);
            removeFile(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Invalid JSON file uploaded for import'
            });
        }

        if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
            removeFile(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Import JSON must be an object of translations'
            });
        }

        const dataObject = parsedData as Record<string, unknown>;
        let translationsPayload: Record<string, unknown> = dataObject;
        if (dataObject.translations && typeof dataObject.translations === 'object' && !Array.isArray(dataObject.translations)) {
            translationsPayload = dataObject.translations as Record<string, unknown>;
        }

        let entryIdsFromFile: string[] | undefined;
        if (Array.isArray(dataObject.entryIds)) {
            entryIdsFromFile = dataObject.entryIds
                .map(value => String(value).trim())
                .filter(Boolean);
        }

        try {
            const importSummary = await importStrings(
                client,
                space,
                environment,
                translationsPayload,
                entryIdsFromFile,
                locale
            );

            return res.json({
                success: true,
                message: `Import completed successfully for locale ${locale}`,
                locale,
                importSummary
            });
        } catch (error) {
            console.error('Import error:', error);
            return res.status(500).json({ success: false, error: 'Import failed' });
        }
    } catch (error) {
        console.error('Import request error:', error);
        removeFile(req.file?.path);
        return res.status(500).json({ success: false, error: 'Import failed' });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
