import { GameState } from './gameState.js';
import { UI } from './ui.js';
import { Storage } from './storage.js';
import { GTO } from './gto.js';

class App {
    constructor() {
        this.gameState = new GameState();
        this.ui = new UI(this);
        this.storage = new Storage();
        this.gto = new GTO();
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Landing screen
        document.getElementById('start-training').addEventListener('click', () => {
            this.ui.showGameInterface();
        });

        // Mode switching
        document.querySelectorAll('.mode-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.switchMode(mode);
            });
        });

        // Action buttons
        document.getElementById('fold-btn').addEventListener('click', () => this.makeDecision('fold'));
        document.getElementById('call-btn').addEventListener('click', () => this.makeDecision('call'));
        document.getElementById('raise-btn').addEventListener('click', () => this.makeDecision('raise'));

        // Mobile menu toggle
        document.querySelector('.menu-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });

        // Reset stats button
        const resetBtn = document.getElementById('reset-stats-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all stats and history?')) {
                    this.storage.clearStats();
                    this.updateStats();
                    // If hand history panel is open, refresh it
                    if (document.getElementById('history-panel') && !document.getElementById('history-panel').classList.contains('hidden')) {
                        this.showHandHistory();
                    }
                }
            });
        }
    }

    switchMode(mode) {
        document.querySelectorAll('.mode-button').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

        // Hide all panels
        document.getElementById('gto-panel').classList.add('hidden');
        document.getElementById('stats-panel').classList.add('hidden');
        this.ui.hideRangeTrainer();
        this.ui.hideDecisionDrills();

        // Show relevant panel
        switch(mode) {
            case 'play':
                this.startNewHand();
                break;
            case 'drills':
                this.startDecisionDrills();
                break;
            case 'range':
                this.startRangeTrainer();
                break;
            case 'stats':
                document.getElementById('stats-panel').classList.remove('hidden');
                this.updateStats();
                break;
            case 'history':
                this.showHandHistory();
                break;
        }
    }

    startNewHand() {
        this.gameState.startNewHand();
        this.ui.updateTable();
        this.ui.hideGTORecommendation();
    }

    makeDecision(decision) {
        const gtoRecommendation = this.gto.getRecommendation(this.gameState);
        const isCorrect = this.gto.isCorrectDecision(decision, gtoRecommendation);
        
        // Store decision
        this.storage.storeDecision({
            decision,
            isCorrect,
            position: this.gameState.position,
            timestamp: new Date().toISOString(),
            street: this.gameState.currentStreet,
            mode: 'play'
        });

        // Update UI
        this.ui.showDecisionResult(isCorrect, gtoRecommendation);
        this.ui.showGTORecommendation(gtoRecommendation);
        
        // Wait, then move to next street or end hand
        setTimeout(() => {
            if (this.gameState.isHandComplete()) {
                this.startNewHand();
            } else {
                this.gameState.nextStreet();
                this.ui.updateTable();
            }
        }, 2000);
    }

    updateStats() {
        const stats = this.storage.getStats();
        this.ui.updateStatsDisplay(stats);
    }

    // --- Decision Drills ---
    startDecisionDrills() {
        this.ui.showDecisionDrills();
        this.runDrill();
    }
    runDrill() {
        // Placeholder: show a random hand and ask for a decision
        this.gameState.startNewHand();
        this.ui.updateDrillHand(this.gameState.playerHand, this.gameState.position);
        this.ui.showDrillActions((decision) => {
            // Evaluate decision
            const gtoRecommendation = this.gto.getRecommendation(this.gameState);
            const isCorrect = this.gto.isCorrectDecision(decision, gtoRecommendation);
            this.storage.storeDecision({
                decision,
                isCorrect,
                position: this.gameState.position,
                timestamp: new Date().toISOString(),
                mode: 'drills'
            });
            this.ui.showDrillResult(isCorrect, gtoRecommendation);
            setTimeout(() => this.runDrill(), 1200);
        });
    }

    // --- Range Trainer ---
    startRangeTrainer() {
        this.ui.showRangeTrainer();
        this.ui.showRangeSelection((selectedRange) => {
            // Placeholder: compare to GTO range (future: real GTO range)
            const gtoRange = this.gto.getGtoRange(this.gameState.position);
            const overlap = selectedRange.filter(h => gtoRange.includes(h)).length;
            const score = (overlap / gtoRange.length) * 100;
            this.ui.showRangeResult(score, gtoRange);
            this.storage.storeDecision({
                decision: 'range',
                isCorrect: score > 70, // arbitrary threshold
                position: this.gameState.position,
                timestamp: new Date().toISOString(),
                mode: 'range',
                score
            });
        });
    }

    showHandHistory() {
        const history = this.storage.getHandHistory();
        this.ui.showHandHistoryPanel(history);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
}); 