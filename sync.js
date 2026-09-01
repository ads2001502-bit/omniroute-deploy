const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const ghToken = process.env.GH_TOKEN;
const ghRepo = process.env.GH_REPO || 'ads2001502-bit/omniroute-storage';
const dataDir = process.env.DATA_DIR || '/app/data';
const targetFiles = ['storage.sqlite', 'db.sqlite'];

if (!ghToken) {
    console.error("[Sync] GH_TOKEN environment variable is required.");
    process.exit(1);
}

let lastHashes = {};

function ghRequest(endpoint, method, payload) {
    return new Promise((resolve, reject) => {
        const bodyStr = payload ? JSON.stringify(payload) : null;
        const options = {
            hostname: 'api.github.com',
            path: endpoint,
            method: method || 'GET',
            headers: {
                'Authorization': `Bearer ${ghToken}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'OmniRoute-Sync-Service',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        };
        if (bodyStr) {
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
                } else if (res.statusCode === 404) {
                    resolve(null);
                } else {
                    reject(new Error(`GitHub API HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

function getMd5(buf) {
    return crypto.createHash('md5').update(buf).digest('hex');
}

async function uploadDB() {
    for (const filename of targetFiles) {
        const fullPath = path.join(dataDir, filename);
        if (!fs.existsSync(fullPath)) continue;

        try {
            const buf = fs.readFileSync(fullPath);
            const currentHash = getMd5(buf);
            if (lastHashes[filename] === currentHash) {
                // No changes, skip uploading
                continue;
            }

            // Get existing SHA from GitHub if file exists
            const existing = await ghRequest(`/repos/${ghRepo}/contents/${filename}`, 'GET');
            const sha = existing ? existing.sha : undefined;

            const payload = {
                message: `Auto-sync ${filename} at ${new Date().toISOString()}`,
                content: buf.toString('base64'),
                sha: sha
            };

            await ghRequest(`/repos/${ghRepo}/contents/${filename}`, 'PUT', payload);
            lastHashes[filename] = currentHash;
            console.log(`[Sync] Successfully backed up ${filename} to GitHub storage repo!`);
        } catch(e) {
            console.error(`[Sync] Upload error for ${filename}:`, e.message);
        }
    }
}

async function downloadDB() {
    console.log(`[Sync] Checking for backup in GitHub repository (${ghRepo})...`);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    for (const filename of targetFiles) {
        try {
            const existing = await ghRequest(`/repos/${ghRepo}/contents/${filename}`, 'GET');
            if (existing && existing.content) {
                const buf = Buffer.from(existing.content, 'base64');
                const targetPath = path.join(dataDir, filename);
                fs.writeFileSync(targetPath, buf);
                lastHashes[filename] = getMd5(buf);
                console.log(`[Sync] Restored ${filename} (${buf.length} bytes) from GitHub backup!`);
            } else {
                console.log(`[Sync] No backup found for ${filename} (fresh start).`);
            }
        } catch(e) {
            console.error(`[Sync] Download error for ${filename}:`, e.message);
        }
    }
}

async function main() {
    const mode = process.argv[2];
    if (mode === 'download') {
        await downloadDB();
        process.exit(0);
    } else if (mode === 'upload-loop') {
        setInterval(uploadDB, 20 * 1000);
    }
}

main();
