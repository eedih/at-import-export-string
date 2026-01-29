# Contentful Import/Export String Tool

A TypeScript Node.js application for importing and exporting localized strings from Contentful.

## Features

- **Export Strings**: Extract activity strings from Contentful entries to JSON files
- **Import Strings**: Update entries in Contentful with translated strings from JSON files
- **Locale Support**: Select target locales for imports
- **Activity ID Filtering**: Optionally specify which activities to process
- **Web UI**: User-friendly form interface for managing imports/exports

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm
- Contentful Management API access token
- A Contentful account with a workspace and spaces

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd at-import-export-string
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**

Create a `.env` file in the project root:

```bash
cp .env.example .env  # if available, or create manually
```

Add your Contentful Management Token:

```env
CONTENTFUL_MANAGEMENT_TOKEN=your_management_token_here
```

To get your token:
- Log in to your Contentful account
- Navigate to Settings → API Keys
- Under Content management tokens, create a new token with appropriate permissions (create/edit entries)
- Copy the token and paste it into `.env`

### Running Locally

**Development mode** (with auto-reload on file changes):

```bash
npm run dev
```

The application will start at `http://localhost:3000`

**Production build**:

```bash
npm run build
npm start
```

### Watch Mode

For development with TypeScript compilation in watch mode:

```bash
npm run watch
```

## Project Structure

```
.
├── src/
│   ├── index.ts          # Express server, API endpoints
│   ├── exporter.ts       # String extraction logic
│   └── importer.ts       # String import/update logic
├── views/
│   └── index.ejs         # Web UI template
├── public/
│   └── css/
│       └── style.css     # Application styles
├── dist/                 # Compiled JavaScript (generated)
├── tmp/                  # Temporary file storage for uploads
├── package.json          # Project dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md             # This file
```

## Usage

### Web Interface

1. Open `http://localhost:3000` in your browser
2. Select a Contentful Space
3. Choose an Environment
4. Pick an action (Export or Import)
5. For **Export**:
   - Upload a `.txt` file with entry IDs (one per line)
   - Download the resulting JSON with extracted strings
6. For **Import**:
   - Select a target Locale
   - Upload a `.json` file with translations (format: `{ "original_string": "translated_string" }`)
   - Optionally upload a `.txt` file with Activity IDs to limit which entries are updated
   - Submit to apply translations

### API Endpoints

- `GET /api/spaces` - List available Contentful spaces
- `GET /api/spaces/:spaceId/environments` - List environments with alias metadata
- `GET /api/spaces/:spaceId/environments/:environmentId/locales` - List available locales
- `POST /api/export` - Export strings from entries (multipart form: file)
- `POST /api/import` - Import/update strings in entries (multipart form: file, optional activityIds)
- `GET /api/download` - Download exported files

## File Formats

### Export Format (`.txt`)

Entry IDs, one per line:

```
THlKQkJyqllAreAxUQSSN6
3lsBKFxH7Gxv887WjvJ7Ts
pXpQkEacaJ6GULUIRw16oc
```

### Import Format (`.json`)

Object mapping original strings to translated strings:

```json
{
  "Original String": "Translated String",
  "Another String": "Another Translation",
  "HTML <b>content</b>": "HTML <b>contenu</b>"
}
```

## Development

### Adding Features

The main application logic is in `src/index.ts`. Key functions:

- **`exportStrings()`** in `src/exporter.ts` - Fetches entries and extracts their strings
- **`importStrings()`** in `src/importer.ts` - Updates entries with translated strings

### Building

TypeScript files are automatically compiled to `dist/` when you run:

```bash
npm run build
```

### Environment Configuration

The application uses the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTENTFUL_MANAGEMENT_TOKEN` | Yes | Contentful API management token |

## Troubleshooting

**Port already in use**: Change the port in `src/index.ts` or set `PORT` environment variable

**No environments found**: Ensure your Contentful token has permissions to view environments

**Upload fails**: Check that files are in the correct format (.txt for IDs, .json for translations)

**Locale not available**: Some environments may not have the locale you're trying to import to

## License

ISC
