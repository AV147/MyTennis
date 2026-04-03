// ===== MINI GAME INITIALIZATION =====
// Loads AIv3 weights from JSON, sets up mobile-friendly game

(async () => {
  const overlay = document.getElementById('loading-overlay');
  
  function updateOverlay(msg) {
    if (overlay) overlay.innerHTML = `<div style="text-align:center;"><p>${msg}</p></div>`;
    console.log('INIT: ' + msg);
  }

  try {
    // ===== 1. Load AIv3 Weights =====
    updateOverlay('Loading AIv3 weights from v3-weights(4).json...');
    console.log('Loading AIv3 weights from v3-weights(4).json...');
    const weightsResponse = await fetch('v3-weights(4).json');
    if (!weightsResponse.ok) {
      throw new Error(`Failed to load weights: ${weightsResponse.status}`);
    }
    const weightsData = await weightsResponse.json();
    console.log('Weights loaded:', Object.keys(weightsData));
    updateOverlay('Converting weights to Float32Arrays...');

    // Verify weight structure
    const requiredKeys = ['W1', 'b1', 'W2', 'b2', 'W_draw', 'b_draw', 'W_card', 'b_card', 'W_disc', 'b_disc', 'W_move', 'b_move'];
    for (const key of requiredKeys) {
      if (!(key in weightsData)) {
        throw new Error(`Missing weight key: ${key}`);
      }
    }

    // ===== 2. Convert JSON arrays to Float32Arrays =====
    for (const key of requiredKeys) {
      if (Array.isArray(weightsData[key])) {
        v3W[key] = new Float32Array(weightsData[key]);
      } else if (weightsData[key] instanceof Float32Array) {
        v3W[key] = weightsData[key];
      } else {
        throw new Error(`Invalid weight format for ${key}`);
      }
    }

    console.log('✓ AIv3 weights successfully loaded and converted');
    updateOverlay('✓ Weights loaded. Initializing game...');

    // ===== 3. Configure Game Settings =====
    // Hardcode fatigue system V2
    FATIGUE_SYSTEM = 2;
    console.log('✓ Fatigue system set to V2 (per draw/OOP)');

    // Force AIv3 for both players
    aiVersion[0] = 3;  // P1 uses v3
    aiVersion[1] = 3;  // P2 uses v3
    aiAutoMode[0] = false; // P1 manual
    aiAutoMode[1] = true;  // P2 auto

    console.log('✓ AI configured: P1 manual, P2 auto (v3)');

    // ===== 4. Override render function with mini version =====
    // Store original render for reference
    window.renderOriginal = window.render;
    // Replace the main render() with miniRender()
    window.render = function(players, currentPlayer, gameLog) {
      try {
        miniRender(players, currentPlayer, gameLog);
      } catch (err) {
        console.error('miniRender error:', err);
        throw err;
      }
    };
    console.log('✓ Mini render function activated');

    // ===== 5. Initialize Game State =====
    updateOverlay('Initializing game state...');
    // Reset game state
    tennisP1Points = 0;
    tennisP2Points = 0;
    gamesWon = [0, 0];
    servingPlayer = 0;
    serveAttempt = 1;
    pointCount = 0;
    currentPlayer = 0;
    incomingPower = 0;
    incomingSpin = 0;
    incomingCard = null;
    canDiscardForPosition = -1;
    pendingPowershotBonus = 0;
    markedCardIndices = [-1, -1];
    lastTurnInfo = null;
    gameLog.length = 0;

    console.log('✓ Game state initialized');

    // ===== 6. Create/Initialize Players =====
    players[0].name = 'You';
    players[1].name = 'AI v3';

    // Draw initial hands (5 cards each)
    for (let i = 0; i < HAND_SIZE; i++) {
      drawCard(players[0], log, true);  // skipFatigue for initial draw
      drawCard(players[1], log, true);
    }

    log('Game started! You (P1) vs AI v3 (P2)');
    log('Fatigue System: V2 (per draw/OOP)');
    log('Serving: ' + players[servingPlayer].name);

    console.log('✓ Players initialized with starting hands');
    console.log('P1 hand:', players[0].hand.length, 'cards');
    console.log('P2 hand:', players[1].hand.length, 'cards');

    // ===== 7. Initial Render =====
    updateOverlay('Rendering initial game state...');
    miniRender(players, currentPlayer, gameLog);
    console.log('✓ Initial render complete');

    // ===== 8. Hide Loading Overlay =====
    setTimeout(() => {
      if (overlay) overlay.style.display = 'none';
    }, 500);

    // ===== 9. Game Loop / Auto-Play Hook =====
    // Set up AI auto-play trigger
    window.gameLoopInterval = null;

    window.aiCheckAutoTrigger = function() {
      // If P2's turn and auto mode: let AI play next action
      if (currentPlayer === 1 && aiAutoMode[1]) {
        if (window.gameLoopInterval) clearTimeout(window.gameLoopInterval);
        window.gameLoopInterval = setTimeout(() => {
          try {
            console.log('Auto-triggering AI play');
            aiPlayTurn(1);
          } catch (err) {
            console.error('AI play error:', err);
            log('⚠️ AI error: ' + err.message);
            miniRender(players, currentPlayer, gameLog);
          }
        }, 500); // Small delay for visual feedback
      }
    };

    console.log('✓ Game initialized successfully!');
    console.log('Ready to play. Please make your first move.');

  } catch (err) {
    console.error('Initialization error:', err);
    if (overlay) {
      overlay.innerHTML = `
        <div style="text-align: center; color: #fff;">
          <h3>Error loading game</h3>
          <p>${err.message}</p>
          <p style="font-size: 12px; margin-top: 20px; color: #faa;">Stack: ${err.stack}</p>
          <p style="font-size: 12px; margin-top: 20px;">Please refresh the page.</p>
        </div>
      `;
      overlay.style.background = 'rgba(192, 57, 43, 0.9)';
    }
  }
})();
