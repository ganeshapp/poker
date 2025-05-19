export class Storage {
    constructor() {
        this.STORAGE_KEY = 'poker_training_stats';
        this.initializeStorage();
    }

    initializeStorage() {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            const initialData = {
                decisions: [],
                totalDecisions: 0,
                correctDecisions: 0,
                positionStats: this.initializePositionStats()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(initialData));
        }
    }

    initializePositionStats() {
        const positions = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
        return positions.reduce((stats, position) => {
            stats[position] = { total: 0, correct: 0 };
            return stats;
        }, {});
    }

    storeDecision(decision) {
        const data = this.getData();
        
        // Add new decision
        data.decisions.push(decision);
        data.totalDecisions++;
        
        if (decision.isCorrect) {
            data.correctDecisions++;
            data.currentStreak = (data.currentStreak || 0) + 1;
            data.maxStreak = Math.max(data.maxStreak || 0, data.currentStreak);
        } else {
            data.currentStreak = 0;
        }

        // Update position stats
        const positionStats = data.positionStats[decision.position];
        positionStats.total++;
        if (decision.isCorrect) {
            positionStats.correct++;
        }

        // Track by mode
        if (!data.modeStats) data.modeStats = {};
        if (!data.modeStats[decision.mode || 'play']) data.modeStats[decision.mode || 'play'] = { total: 0, correct: 0 };
        data.modeStats[decision.mode || 'play'].total++;
        if (decision.isCorrect) data.modeStats[decision.mode || 'play'].correct++;

        // Track by street
        if (decision.street) {
            if (!data.streetStats) data.streetStats = {};
            if (!data.streetStats[decision.street]) data.streetStats[decision.street] = { total: 0, correct: 0 };
            data.streetStats[decision.street].total++;
            if (decision.isCorrect) data.streetStats[decision.street].correct++;
        }

        // Save updated data
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    getData() {
        return JSON.parse(localStorage.getItem(this.STORAGE_KEY));
    }

    getStats() {
        const data = this.getData();
        return {
            totalDecisions: data.totalDecisions,
            correctDecisions: data.correctDecisions,
            positionStats: data.positionStats,
            modeStats: data.modeStats || {},
            streetStats: data.streetStats || {},
            currentStreak: data.currentStreak || 0,
            maxStreak: data.maxStreak || 0
        };
    }

    clearStats() {
        // Reset all stats and history
        const initialData = {
            decisions: [],
            totalDecisions: 0,
            correctDecisions: 0,
            positionStats: this.initializePositionStats(),
            modeStats: {},
            streetStats: {},
            currentStreak: 0,
            maxStreak: 0
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(initialData));
    }

    getRecentDecisions(limit = 10) {
        const data = this.getData();
        return data.decisions.slice(-limit);
    }

    getPositionAccuracy(position) {
        const data = this.getData();
        const stats = data.positionStats[position];
        return stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : 0;
    }

    getHandHistory(limit = 20) {
        const data = this.getData();
        return data.decisions.slice(-limit).reverse();
    }
} 