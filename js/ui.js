export class UI {
    constructor(app) {
        this.app = app;
    }

    showGameInterface() {
        document.getElementById('landing-screen').classList.add('hidden');
        document.getElementById('game-interface').classList.remove('hidden');
    }

    updateTable() {
        const state = this.app.gameState.getCurrentState();
        
        // Update player hand
        const playerHandElement = document.querySelector('.player-hand');
        playerHandElement.innerHTML = this.createCardElements(state.playerHand);

        // Update community cards
        const communityCardsElement = document.querySelector('.community-cards');
        communityCardsElement.innerHTML = this.createCardElements(state.communityCards);

        // Update position display
        this.updatePositionDisplay(state.position);
    }

    createCardElements(cards) {
        return cards.map(card => {
            const color = ['♥', '♦'].includes(card.suit) ? 'red' : 'black';
            return `<div class="card" style="color: ${color}">
                <div class="card-value">${card.value}</div>
                <div class="card-suit">${card.suit}</div>
            </div>`;
        }).join('');
    }

    updatePositionDisplay(position) {
        // Add position indicator to the table
        const positionElement = document.createElement('div');
        positionElement.className = 'position-indicator';
        positionElement.textContent = position;
        
        const existingIndicator = document.querySelector('.position-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        document.getElementById('poker-table').appendChild(positionElement);
    }

    showGTORecommendation(recommendation) {
        document.getElementById('gto-panel').classList.remove('hidden');
        if (!recommendation) {
            recommendation = this.app.gto.getRecommendation(this.app.gameState);
        }
        const gtoElement = document.getElementById('gto-recommendation');
        const explanationElement = document.getElementById('gto-explanation');
        gtoElement.textContent = `Recommended Action: ${recommendation.action}`;
        let extra = '';
        if (recommendation.winProb !== undefined) {
            extra += `Win Probability: ${(recommendation.winProb * 100).toFixed(1)}%\n`;
        }
        if (recommendation.potOdds !== undefined) {
            extra += `Pot Odds: ${(recommendation.potOdds * 100).toFixed(1)}%\n`;
        }
        if (recommendation.potOddsCalc) {
            extra += `Pot Odds Calc: ${recommendation.potOddsCalc}\n`;
        }
        explanationElement.textContent = recommendation.explanation + (extra ? '\n' + extra : '');
    }

    hideGTORecommendation() {
        document.getElementById('gto-panel').classList.add('hidden');
        document.getElementById('gto-recommendation').textContent = '';
        document.getElementById('gto-explanation').textContent = '';
    }

    showDecisionResult(isCorrect, gtoRecommendation) {
        const resultElement = document.createElement('div');
        resultElement.className = `decision-result ${isCorrect ? 'correct' : 'incorrect'}`;
        resultElement.textContent = isCorrect ? 'Correct!' : 'Incorrect!';
        
        document.getElementById('gto-panel').appendChild(resultElement);
        
        setTimeout(() => {
            resultElement.remove();
        }, 2000);
    }

    updateStatsDisplay(stats) {
        const statsContent = document.getElementById('stats-content');
        const totalDecisions = stats.totalDecisions;
        const correctDecisions = stats.correctDecisions;
        const accuracy = totalDecisions > 0 ? (correctDecisions / totalDecisions * 100).toFixed(1) : 0;
        statsContent.innerHTML = `
            <div class="stat-item">
                <h4>Total Decisions</h4>
                <p>${totalDecisions}</p>
            </div>
            <div class="stat-item">
                <h4>Correct Decisions</h4>
                <p>${correctDecisions}</p>
            </div>
            <div class="stat-item">
                <h4>Accuracy</h4>
                <p>${accuracy}%</p>
            </div>
            <div class="stat-item">
                <h4>Current Streak</h4>
                <p>${stats.currentStreak}</p>
            </div>
            <div class="stat-item">
                <h4>Max Streak</h4>
                <p>${stats.maxStreak}</p>
            </div>
            <div class="stat-item">
                <h4>Decisions by Position</h4>
                ${this.createPositionStatsHTML(stats.positionStats)}
            </div>
            <div class="stat-item">
                <h4>Decisions by Mode</h4>
                ${this.createModeStatsHTML(stats.modeStats)}
            </div>
            <div class="stat-item">
                <h4>Decisions by Street</h4>
                ${this.createStreetStatsHTML(stats.streetStats)}
            </div>
        `;
        // Attach reset button event listener
        const resetBtn = document.getElementById('reset-stats-btn');
        if (resetBtn) {
            resetBtn.onclick = () => {
                if (confirm('Are you sure you want to reset all stats and history?')) {
                    this.app.storage.clearStats();
                    this.app.updateStats();
                    // If hand history panel is open, refresh it
                    if (document.getElementById('history-panel') && !document.getElementById('history-panel').classList.contains('hidden')) {
                        this.app.showHandHistory();
                    }
                }
            };
        }
    }

    createPositionStatsHTML(positionStats) {
        return Object.entries(positionStats)
            .map(([position, stats]) => `
                <div class="position-stat">
                    <strong>${position}:</strong>
                    <span>${stats.correct}/${stats.total} (${(stats.correct / stats.total * 100).toFixed(1)}%)</span>
                </div>
            `)
            .join('');
    }

    createModeStatsHTML(modeStats) {
        return Object.entries(modeStats)
            .map(([mode, stats]) => `
                <div class="position-stat">
                    <strong>${mode}:</strong>
                    <span>${stats.correct}/${stats.total} (${(stats.correct / stats.total * 100).toFixed(1)}%)</span>
                </div>
            `)
            .join('');
    }

    createStreetStatsHTML(streetStats) {
        return Object.entries(streetStats)
            .map(([street, stats]) => `
                <div class="position-stat">
                    <strong>${street}:</strong>
                    <span>${stats.correct}/${stats.total} (${(stats.correct / stats.total * 100).toFixed(1)}%)</span>
                </div>
            `)
            .join('');
    }

    // --- Decision Drills UI ---
    showDecisionDrills() {
        this.hideAllPanels();
        let drillsPanel = document.getElementById('drills-panel');
        if (!drillsPanel) {
            drillsPanel = document.createElement('div');
            drillsPanel.id = 'drills-panel';
            drillsPanel.className = 'mode-panel';
            drillsPanel.innerHTML = `
                <h3>Decision Drills</h3>
                <div id="drill-hand"></div>
                <div id="drill-actions"></div>
                <div id="drill-result"></div>
            `;
            document.getElementById('main-content').appendChild(drillsPanel);
        }
        drillsPanel.classList.remove('hidden');
    }
    hideDecisionDrills() {
        const drillsPanel = document.getElementById('drills-panel');
        if (drillsPanel) drillsPanel.classList.add('hidden');
    }
    updateDrillHand(hand, position) {
        const el = document.getElementById('drill-hand');
        el.innerHTML = `<div>Position: <strong>${position}</strong></div><div class="drill-hand-cards">${this.createCardElements(hand)}</div>`;
    }
    showDrillActions(callback) {
        const el = document.getElementById('drill-actions');
        el.innerHTML = `
            <button class="drill-btn" data-action="fold">Fold</button>
            <button class="drill-btn" data-action="call">Call</button>
            <button class="drill-btn" data-action="raise">Raise</button>
        `;
        el.querySelectorAll('.drill-btn').forEach(btn => {
            btn.onclick = () => callback(btn.dataset.action);
        });
    }
    showDrillResult(isCorrect, gtoRecommendation) {
        const el = document.getElementById('drill-result');
        el.textContent = isCorrect ? 'Correct!' : `Incorrect! GTO: ${gtoRecommendation.action}`;
        el.className = isCorrect ? 'drill-result correct' : 'drill-result incorrect';
        setTimeout(() => { el.textContent = ''; el.className = ''; }, 1000);
    }

    // --- Range Trainer UI ---
    showRangeTrainer() {
        this.hideAllPanels();
        let rangePanel = document.getElementById('range-panel');
        const position = this.app.gameState.position;
        if (!rangePanel) {
            rangePanel = document.createElement('div');
            rangePanel.id = 'range-panel';
            rangePanel.className = 'mode-panel';
            document.getElementById('main-content').appendChild(rangePanel);
        }
        rangePanel.classList.remove('hidden');
        rangePanel.innerHTML = `
            <h3>Range Trainer</h3>
            <div style="margin-bottom: 1rem; font-weight: bold;">Position: <span class="range-position">${position}</span></div>
            <div id="range-grid"></div>
            <button id="submit-range">Submit Range</button>
            <div id="range-result"></div>
        `;
    }
    hideRangeTrainer() {
        const rangePanel = document.getElementById('range-panel');
        if (rangePanel) rangePanel.classList.add('hidden');
    }
    showRangeSelection(callback) {
        const grid = document.getElementById('range-grid');
        // 13x13 grid for all starting hands
        const ranks = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
        let html = '<table class="range-table">';
        for (let i = 0; i < 13; i++) {
            html += '<tr>';
            for (let j = 0; j < 13; j++) {
                const hand = i < j ? `${ranks[i]}${ranks[j]}s` : i > j ? `${ranks[j]}${ranks[i]}o` : `${ranks[i]}${ranks[j]}`;
                html += `<td class="range-cell" data-hand="${hand}">${hand}</td>`;
            }
            html += '</tr>';
        }
        html += '</table>';
        grid.innerHTML = html;
        const selected = new Set();
        grid.querySelectorAll('.range-cell').forEach(cell => {
            cell.onclick = () => {
                if (selected.has(cell.dataset.hand)) {
                    selected.delete(cell.dataset.hand);
                    cell.classList.remove('selected');
                } else {
                    selected.add(cell.dataset.hand);
                    cell.classList.add('selected');
                }
            };
        });
        document.getElementById('submit-range').onclick = () => {
            callback(Array.from(selected));
        };
    }
    showRangeResult(score, gtoRange) {
        const el = document.getElementById('range-result');
        el.innerHTML = `Score: <strong>${score.toFixed(1)}%</strong><br>GTO Range: ${gtoRange.join(', ')}`;
    }

    // --- Hand History ---
    showHandHistoryPanel(history) {
        this.hideAllPanels();
        let panel = document.getElementById('history-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'history-panel';
            panel.className = 'mode-panel';
            document.getElementById('main-content').appendChild(panel);
        }
        panel.classList.remove('hidden');
        panel.innerHTML = `<h3>Hand History</h3>${this.createHandHistoryTable(history)}`;
    }
    hideHandHistoryPanel() {
        const panel = document.getElementById('history-panel');
        if (panel) panel.classList.add('hidden');
    }
    createHandHistoryTable(history) {
        if (!history.length) return '<div>No hands yet.</div>';
        return `<table class="history-table">
            <tr><th>Time</th><th>Mode</th><th>Position</th><th>Decision</th><th>Correct</th><th>Score</th></tr>
            ${history.map(h => `
                <tr>
                    <td>${new Date(h.timestamp).toLocaleTimeString()}</td>
                    <td>${h.mode || 'play'}</td>
                    <td>${h.position}</td>
                    <td>${h.decision}</td>
                    <td>${h.isCorrect ? '✔️' : '❌'}</td>
                    <td>${h.score !== undefined ? h.score.toFixed(1) : ''}</td>
                </tr>
            `).join('')}
        </table>`;
    }

    // --- Utility ---
    hideAllPanels() {
        document.getElementById('gto-panel').classList.add('hidden');
        document.getElementById('stats-panel').classList.add('hidden');
        this.hideRangeTrainer();
        this.hideDecisionDrills();
    }
} 