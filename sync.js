const fs = require('fs');
const https = require('https');

const datasetId = process.env.DATASET_ID;
const token = process.env.HF_TOKEN;
const dbPath = process.env.DATA_DIR ? `${process.env.DATA_DIR}/db.sqlite` : '/app/data/db.sqlite';

if (!datasetId || !token) {
    console.error("DATASET_ID or HF_TOKEN not provided.");
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

async function uploadDB() {
    if (!fs.existsSync(dbPath)) return;
    try {
        const content = fs.readFileSync(dbPath).toString('base64');
        const payload = JSON.stringify({
            operations: [{ key: "db.sqlite", path: "db.sqlite", content: content, b64content: true }],
            commit_message: "Auto-sync from OmniRoute Space"
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
        console.log(`[Sync] Successfully backed up db.sqlite to dataset ${datasetId} at ${new Date().toISOString()}`);
    } catch (e) {
        console.error("[Sync] Upload failed:", e);
    }
}

async function downloadDB() {
    return new Promise((resolve, reject) => {
        const fileUrl = `https://huggingface.co/datasets/${datasetId}/resolve/main/db.sqlite`;
        console.log(`[Sync] Attempting to download ${fileUrl}`);
        const options = {
            headers: { 'Authorization': `Bearer ${token}` }
        };
        https.get(fileUrl, options, (res) => {
            if (res.statusCode === 200) {
                const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const file = fs.createWriteStream(dbPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log("[Sync] Download complete.");
                    resolve();
                });
            } else if (res.statusCode === 404) {
                console.log("[Sync] No existing db.sqlite found in dataset. Starting fresh.");
                resolve();
            } else if (res.statusCode === 302 || res.statusCode === 301) {
                https.get(res.headers.location, options, (res2) => {
                   if (res2.statusCode === 200) {
                       const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
                       if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                       const file = fs.createWriteStream(dbPath);
                       res2.pipe(file);
                       file.on('finish', () => { file.close(); console.log("[Sync] Download complete."); resolve(); });
                   } else {
                       reject(`Redirect failed with status ${res2.statusCode}`);
                   }
                }).on('error', reject);
            } else {
                reject(`HTTP ${res.statusCode}`);
            }
        }).on('error', reject);
    });
}

const mode = process.argv[2];
if (mode === 'download') {
    downloadDB().catch(console.error);
} else if (mode === 'upload-loop') {
    setInterval(uploadDB, 5 * 60 * 1000);
}
