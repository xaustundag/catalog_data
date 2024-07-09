const { Octokit } = await import("@octokit/rest");
const axios = await import("axios");
await import('dotenv').config();

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
const NETLIFY_ACCESS_TOKEN = process.env.NETLIFY_ACCESS_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

const [owner, repo] = GITHUB_REPO.split('/');
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Helper function to validate Telegram URL
function isValidTelegramUrl(url) {
    return url.startsWith('https://t.me/') || url.startsWith('http://t.me/');
}


exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, category, brand, url } = JSON.parse(event.body);

        // Input validation
        if (!action || !category || !brand) {
            throw new Error('Missing required fields: action, category, or brand');
        }

        if (action === 'add' && !isValidTelegramUrl(url)) {
            throw new Error('Invalid Telegram URL. It must start with "https://t.me/" or "http://t.me/"');
        }

        // Get the current file content
        let fileData;
        try {
            const response = await octokit.repos.getContent({
                owner,
                repo,
                path: 'catalog.json',
            });
            fileData = response.data;
        } catch (error) {
            console.error('Error fetching catalog.json:', error);
            throw new Error('Failed to fetch catalog data from GitHub');
        }

        let catalog = JSON.parse(Buffer.from(fileData.content, 'base64').toString());

        // Update catalog based on action
        if (action === 'add') {
            if (!catalog[category]) catalog[category] = {};
            catalog[category][brand] = url;
        } else if (action === 'delete') {
            if (catalog[category] && catalog[category][brand]) {
                delete catalog[category][brand];
            } else {
                throw new Error(`Brand "${brand}" not found in category "${category}"`);
            }
        } else {
            throw new Error('Invalid action. Use "add" or "delete".');
        }

        // Commit changes to GitHub
        try {
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: 'catalog.json',
                message: `Update catalog: ${action} ${brand} in ${category}`,
                content: Buffer.from(JSON.stringify(catalog, null, 2)).toString('base64'),
                sha: fileData.sha,
            });
        } catch (error) {
            console.error('Error updating catalog.json:', error);
            throw new Error('Failed to update catalog on GitHub');
        }

        // Trigger Netlify deploy
        try {
            await axios.post(
                `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/builds`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
                    },
                }
            );
        } catch (error) {
            console.error('Error triggering Netlify deploy:', error);
            throw new Error('Failed to trigger Netlify deploy');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Catalog updated and deploy triggered' }),
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'Failed to update catalog' }),
        };
    }
};