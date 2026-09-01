const fs = require('fs');
const https = require('https');
const path = require('path');

const datasetId = process.env.DATASET_ID || 'ghoststudio1/omniroute-db';
const token = process.env.HF_TOKEN || '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';
const dataDir = process.env.DATA_DIR || '/app/data';
const logPath = '/app/server.log';

if (!datasetId || !token) {
    console.error("[Sync] DATASET_ID or HF_TOKEN not provided.");
    process.exit(1);
}

function apiRequest(options, payload) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data ? JSON.parse(data) : null);
                } else {
                    reject(`HTTP ${res.statusCode}: ${data}`);
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const targetFiles = ['storage.sqlite', 'db.sqlite', 'storage.sqlite-wal', 'storage.sqlite-shm'];

async function uploadDB() {
    let operations = [];
    
    // Check files in dataDir and /app/data
    const dirsToCheck = [dataDir, '/app/data', '/data'];
    const seen = new Set();

    for (const d of dirsToCheck) {
        if (!fs.existsSync(d)) continue;
        for (const f of targetFiles) {
            const fullPath = path.join(d, f);
            if (fs.existsSync(fullPath) && !seen.has(f)) {
                seen.add(f);
                const content = fs.readFileSync(fullPath).toString('base64');
                operations.push({
                    key: f,
                    path: f,
                    content: content,
                    b64content: true
                });
            }
        }
    }

    if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath).toString('utf-8');
        operations.push({ key: "server.log", path: "server.log", content: logContent });
    }
    
    if (operations.length === 0) return;
    
    try {
        const payload = JSON.stringify({
            operations: operations,
            commit_message: `Auto-sync database at ${new Date().toISOString()}`
        });
        const options = {
            hostname: 'huggingface.co',
            path: `/api/datasets/${datasetId}/commit/main`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        await apiRequest(options, payload);
        console.log(`[Sync] Successfully backed up ${operations.length} files to dataset ${datasetId}`);
    } catch (e) {
        console.error("[Sync] Upload failed:", e);
    }
}

function downloadSingleFile(filename) {
    return new Promise((resolve) => {
        const fileUrl = `https://huggingface.co/datasets/${datasetId}/resolve/main/${filename}`;
        const options = {
            headers: { 'Authorization': `Bearer ${token}` }
        };

        function fetchWithRedirect(url) {
            https.get(url, options, (res) => {
                if (res.statusCode === 200) {
                    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                    const targetPath = path.join(dataDir, filename);
                    const file = fs.createWriteStream(targetPath);
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        console.log(`[Sync] Downloaded ${filename} to ${targetPath}`);
                        // also copy to /app/data if different
                        if (dataDir !== '/app/data') {
                            if (!fs.existsSync('/app/data')) fs.mkdirSync('/app/data', { recursive: true });
                            try { fs.copyFileSync(targetPath, path.join('/app/data', filename)); } catch(e){}
                        }
                        resolve(true);
                    });
                } else if (res.statusCode === 302 || res.statusCode === 301) {
                    fetchWithRedirect(res.headers.location);
                } else {
                    resolve(false);
                }
            }).on('error', () => resolve(false));
        }

        fetchWithRedirect(fileUrl);
    });
}

async function downloadDB() {
    console.log(`[Sync] Checking for existing databases in ${datasetId}...`);
    for (const f of targetFiles) {
        await downloadSingleFile(f);
    }
    console.log("[Sync] Initialization complete.");
}

const mode = process.argv[2];
if (mode === 'download') {
    downloadDB().catch(console.error);
} else if (mode === 'upload-loop') {
    setInterval(uploadDB, 20 * 1000); // sync every 20 seconds
}
