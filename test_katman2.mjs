import { chromium } from 'playwright';

const BASE = 'http://localhost:8000';
const FRONTEND = 'http://localhost:5173';
const SS_DIR = '/tmp/katman2_screenshots';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, name, step) {
  const path = `${SS_DIR}/${String(step).padStart(2,'0')}_${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`📸 [${step}] ${name} -> ${path}`);
  return path;
}

(async () => {
  // Setup
  const { mkdirSync } = await import('fs');
  mkdirSync(SS_DIR, { recursive: true });

  console.log('🚀 Starting Katman 2 E2E Test...\n');

  // Step 1: Health check
  const healthRes = await fetch(`${BASE}/health`);
  console.log(`✅ Backend health: ${healthRes.status}`);

  // Step 2: Create game
  const createRes = await fetch(`${BASE}/api/game/`, { method: 'POST' });
  const gameData = await createRes.json();
  const gameId = gameData.game_id;
  console.log(`✅ Game created: ${gameId}`);
  console.log(`   Köy: ${gameData.world_seed?.settlement_name}`);

  // Step 3: Start game
  const startRes = await fetch(`${BASE}/api/game/${gameId}/start`, { method: 'POST' });
  console.log(`✅ Game started: ${startRes.status}`);

  // Step 4: Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Step 5: Open frontend
  await page.goto(FRONTEND);
  await sleep(2000);
  await screenshot(page, 'lobby_initial', 1);

  // Step 6: Join game via UI - type game ID and join
  // Check what's on the page first
  const pageContent = await page.textContent('body');
  console.log(`\n📄 Page content (first 300 chars): ${pageContent.substring(0, 300)}`);

  // Try to find game ID input and join button
  const gameIdInput = await page.$('input[placeholder*="Game"]') || await page.$('input[type="text"]');
  if (gameIdInput) {
    await gameIdInput.fill(gameId);
    console.log('✅ Filled game ID');
    await screenshot(page, 'lobby_filled', 2);

    // Click join/start button
    const joinBtn = await page.$('button');
    if (joinBtn) {
      const btnText = await joinBtn.textContent();
      console.log(`🔘 Clicking button: "${btnText}"`);
      await joinBtn.click();
      await sleep(3000);
      await screenshot(page, 'after_join', 3);
    }
  } else {
    console.log('⚠️  No input found, trying direct WS connection...');
  }

  // Step 7: Navigate to game directly via URL if needed
  // Try game URL patterns
  const gameUrl = `${FRONTEND}/?gameId=${gameId}`;
  await page.goto(gameUrl);
  await sleep(3000);
  await screenshot(page, 'game_direct_url', 4);

  // Step 8: Wait for game phases and capture screenshots
  console.log('\n⏳ Waiting for game to progress...');

  let lastScreenshot = 4;
  for (let i = 0; i < 20; i++) {
    await sleep(5000);
    lastScreenshot++;

    // Get current page state
    const bodyText = await page.textContent('body').catch(() => '');
    const phase = bodyText.includes('Sabah') ? 'morning'
                : bodyText.includes('Ates') ? 'campfire'
                : bodyText.includes('Serbest') ? 'free_roam'
                : bodyText.includes('Oylama') ? 'vote'
                : bodyText.includes('Surgun') ? 'exile'
                : bodyText.includes('Lobi') ? 'lobby'
                : bodyText.includes('Mini Olay') ? 'mini_event'
                : bodyText.includes('Kurum') ? 'institution'
                : 'unknown';

    console.log(`\n📍 [${i+1}/20] Phase: ${phase}`);
    console.log(`   Content: ${bodyText.substring(0, 200).replace(/\n/g, ' ')}`);

    await screenshot(page, `phase_${phase}_${i}`, lastScreenshot);

    // Check for specific Katman 2 features
    if (bodyText.includes('Mini Olay')) {
      console.log('🎯 KATMAN 2: Mini Event detected!');
      await screenshot(page, 'katman2_mini_event', ++lastScreenshot);
    }
    if (bodyText.includes('Kurum Lokasyonlari')) {
      console.log('🎯 KATMAN 2: Institution locations visible!');
      await screenshot(page, 'katman2_institutions', ++lastScreenshot);
    }
    if (bodyText.includes('KÜL KAYMASI') || bodyText.includes('Kul Kaymasi')) {
      console.log('🎯 KATMAN 2: Kül Kayması detected!');
      await screenshot(page, 'katman2_kul_kaymasi', ++lastScreenshot);
    }

    // Break if game is over
    if (bodyText.includes('Bitti') || bodyText.includes('game_over')) {
      console.log('🏁 Game over detected');
      break;
    }
  }

  // Final state
  await screenshot(page, 'final_state', ++lastScreenshot);

  // Get game state from API
  const stateRes = await fetch(`${BASE}/api/game/${gameId}`);
  const stateData = await stateRes.json();
  console.log('\n📊 Final game state:');
  console.log(`   Round: ${stateData.state?.round_number}`);
  console.log(`   Phase: ${stateData.state?.phase}`);
  console.log(`   Players alive: ${stateData.state?.players?.filter(p => p.alive).length}`);

  await browser.close();
  console.log('\n✅ Test complete! Screenshots in: ' + SS_DIR);
})();
