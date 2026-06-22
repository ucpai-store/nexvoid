const http = require('http');

const CRON_SECRET = process.env.JWT_SECRET || 'nexvo-super-secret-jwt-key-2024-secure';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const PORT = 3032;

// Run daily profit cron
async function runDailyProfit() {
  try {
    const response = await fetch(`${APP_URL}/api/cron/profit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-key': CRON_SECRET,
      },
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Daily profit:`, JSON.stringify(data));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Daily profit error:`, error.message);
  }
}

// Run salary cron
async function runSalaryCron() {
  try {
    const response = await fetch(`${APP_URL}/api/cron/salary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-key': CRON_SECRET,
      },
    });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Salary cron:`, JSON.stringify(data));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Salary cron error:`, error.message);
  }
}

// Schedule: Run daily profit at 00:00 WIB (17:00 UTC)
function scheduleCron() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  
  // WIB = UTC+7, so 00:00 WIB = 17:00 UTC
  // Check if it's 17:00 UTC
  if (utcHour === 17 && utcMinute === 0) {
    console.log(`[${now.toISOString()}] Running scheduled daily profit...`);
    runDailyProfit();
  }
  
  // Run salary on 1st of each month at 17:00 UTC
  if (utcHour === 17 && utcMinute === 0 && now.getUTCDate() === 1) {
    console.log(`[${now.toISOString()}] Running scheduled salary cron...`);
    runSalaryCron();
  }
}

// Check every minute
setInterval(scheduleCron, 60000);

// Health check server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'nexvo-cron', timestamp: new Date().toISOString() }));
  } else if (req.url === '/trigger-profit' && req.method === 'POST') {
    runDailyProfit().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Profit cron triggered' }));
    });
  } else if (req.url === '/trigger-salary' && req.method === 'POST') {
    runSalaryCron().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Salary cron triggered' }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] NEXVO Cron Service running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Daily profit scheduled at 00:00 WIB (17:00 UTC)`);
});

// Also run profit on startup for testing
console.log(`[${new Date().toISOString()}] Cron service started. Use /trigger-profit to manually trigger.`);
