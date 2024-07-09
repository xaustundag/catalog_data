require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');

const NETLIFY_ACCESS_TOKEN = process.env.NETLIFY_ACCESS_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

const [owner, repo] = GITHUB_REPO.split('/');

const NETLIFY_SITE_ID = '729ec198-995f-4f85-aa83-177aa509b690';
const NETLIFY_API_URL = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}`;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);

    // Fetch current catalog
    const currentCatalogResponse = await axios.get('https://wonderful-maamoul-33d63c.netlify.app/catalog.json');
    let catalogData = currentCatalogResponse.data;

    // Perform add or delete operation
    if (data.action === 'add') {
      if (!data.category || !data.brand || !data.url) {
        throw new Error('Missing required fields: category, brand, or url');
      }
      if (!data.url.startsWith('https://t.me/')) {
        throw new Error('Invalid URL. It must start with "https://t.me/"');
      }
      if (!catalogData[data.category]) {
        catalogData[data.category] = {};
      }
      catalogData[data.category][data.brand] = data.url;
    } else if (data.action === 'delete') {
      if (!data.category || !data.brand) {
        throw new Error('Missing required fields: category or brand');
      }
      if (catalogData[data.category] && catalogData[data.category][data.brand]) {
        delete catalogData[data.category][data.brand];
      } else {
        throw new Error('Brand not found.');
      }
    } else {
      throw new Error('Invalid action.');
    }

    // Update catalog.json on Netlify
    const catalogContent = JSON.stringify(catalogData);
    const fileHash = crypto.createHash('sha1').update(catalogContent).digest('hex');

    // Fetch current deploy files
    const currentDeployResponse = await axios.get(`${NETLIFY_API_URL}/deploys`, {
      headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` }
    });

    if (currentDeployResponse.data.length === 0) {
      throw new Error('No deploys found.');
    }

    const currentDeploy = currentDeployResponse.data[0];
    const currentFiles = currentDeploy.files;

    // Log current deploy ID and files
    console.log(`Current deploy ID: ${currentDeploy.id}`);
    console.log(`Current deploy files:`, currentFiles);

    // Create new deploy
    const newFiles = {
      ...currentFiles,
      '/catalog.json': fileHash
    };

    const newDeployResponse = await axios.post(`${NETLIFY_API_URL}/deploys`, {
      files: newFiles
    }, {
      headers: { 'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}` }
    });

    const newDeploy = newDeployResponse.data;

    // Log new deploy ID
    console.log(`New deploy ID: ${newDeploy.id}`);

    // Upload new catalog.json
    const uploadUrl = `${NETLIFY_API_URL}/deploys/${newDeploy.id}/files/catalog.json`;
    console.log(`Upload URL: ${uploadUrl}`);

    const uploadResponse = await axios.put(uploadUrl, catalogContent, {
      headers: {
        'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // Log upload response status
    console.log(`Upload response status: ${uploadResponse.status}`);

    // Wait for deploy to go live
    await new Promise(resolve => setTimeout(resolve, 10000));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: data.action === 'add' ? 'Brand added successfully.' : 'Brand deleted successfully.',
        catalog: catalogData
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Example usage of octokit
octokit.repos.get({
  owner,
  repo
}).then(({ data }) => {
  console.log(data);
}).catch(error => {
  console.error('Error:', error);
});
