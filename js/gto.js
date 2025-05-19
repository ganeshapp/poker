export class GTO {
    constructor() {
        this.positionWeights = {
            'BTN': 1.2,
            'SB': 0.9,
            'BB': 1.1,
            'UTG': 0.7,
            'MP': 0.8,
            'CO': 1.0
        };
    }

    getRecommendation(gameState) {
        const state = gameState.getCurrentState();
        const handStrength = this.calculateHandStrength(state.playerHand, state.communityCards, state.currentStreet);
        const positionWeight = this.positionWeights[state.position];
        let action, explanation;

        // --- Preflop logic: use hand ranking ---
        if (state.currentStreet === 'preflop') {
            const preflopRank = this.getPreflopHandRank(state.playerHand);
            if (preflopRank <= 10) {
                action = 'raise';
                explanation = 'Premium hand preflop: aggressive play recommended.';
            } else if (preflopRank <= 30) {
                action = 'call';
                explanation = 'Playable hand preflop: calling is reasonable.';
            } else {
                action = 'fold';
                explanation = 'Weak hand preflop: folding is optimal.';
            }
        } else {
            // --- Postflop logic: use hand strength and board texture ---
            if (handStrength > 0.85) {
                action = 'raise';
                explanation = 'Very strong hand postflop: value bet or raise.';
            } else if (handStrength > 0.65) {
                action = 'call';
                explanation = 'Decent hand postflop: calling is fine.';
            } else if (this.isDraw(state.playerHand, state.communityCards)) {
                action = 'call';
                explanation = 'You have a draw: calling is reasonable.';
            } else {
                action = 'fold';
                explanation = 'Weak hand postflop: folding is optimal.';
            }
        }

        // Adjust for position
        if (positionWeight > 1 && action === 'fold') {
            action = 'call';
            explanation = 'Position advantage: calling with marginal hand.';
        }

        // Calculate win probability and pot odds (realistic)
        const winProb = this.estimateWinProb(handStrength, state.currentStreet);
        const {potOdds, calcString} = this.calculatePotOdds(state.pot, state.amountToCall);
        return {
            action,
            explanation,
            handStrength,
            positionWeight,
            winProb,
            potOdds,
            potOddsCalc: calcString
        };
    }

    isCorrectDecision(decision, recommendation) {
        // Simple placeholder logic - can be expanded with real GTO analysis
        return decision === recommendation.action;
    }

    // --- Preflop hand ranking (simplified, 1=best, 169=worst) ---
    getPreflopHandRank(hand) {
        // Use a simple Sklansky hand group approximation
        const ranks = {
            'A': 14, 'K': 13, 'Q': 12, 'J': 11,
            '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
        };
        const v1 = ranks[hand[0].value];
        const v2 = ranks[hand[1].value];
        const suited = hand[0].suit === hand[1].suit;
        // Pair
        if (v1 === v2) return 1 + (14 - v1) * 10;
        // Suited connectors
        if (suited && Math.abs(v1 - v2) === 1) return 30 + (14 - Math.max(v1, v2));
        // High card combos
        if (v1 >= 10 && v2 >= 10) return 10 + (14 - Math.max(v1, v2));
        // Suited
        if (suited) return 50 + (14 - Math.max(v1, v2));
        // Offsuit
        return 80 + (14 - Math.max(v1, v2));
    }

    // --- Postflop: basic draw detection (future: expand for flush/straight draws) ---
    isDraw(hand, community) {
        // Placeholder: if two cards to a flush or straight
        const all = [...hand, ...community];
        const suits = all.map(c => c.suit);
        const suitCounts = {};
        suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
        if (Object.values(suitCounts).some(count => count >= 4)) return true; // flush draw
        // TODO: Add straight draw detection
        return false;
    }

    calculateHandStrength(hand, communityCards, street) {
        // Placeholder: use preflop rank for preflop, otherwise use base strength + random
        if (street === 'preflop') {
            const rank = this.getPreflopHandRank(hand);
            return 1 - (rank / 170); // scale 1 (best) to ~0 (worst)
        }
        // Postflop: use base strength + random
        const randomFactor = Math.random() * 0.15;
        const baseStrength = this.getBaseHandStrength(hand);
        return Math.min(1, baseStrength + randomFactor);
    }

    getBaseHandStrength(hand) {
        // Very basic hand strength calculation
        const values = hand.map(card => {
            const value = card.value;
            if (value === 'A') return 14;
            if (value === 'K') return 13;
            if (value === 'Q') return 12;
            if (value === 'J') return 11;
            return parseInt(value);
        });

        const isPair = values[0] === values[1];
        const isSuited = hand[0].suit === hand[1].suit;
        const highCard = Math.max(...values);

        let strength = 0;
        
        if (isPair) {
            strength = 0.6 + (highCard / 20);
        } else if (isSuited) {
            strength = 0.4 + (highCard / 30);
        } else {
            strength = 0.3 + (highCard / 40);
        }

        return strength;
    }

    getPositionBasedAdjustment(position) {
        return this.positionWeights[position] || 1.0;
    }

    getGtoRange(position) {
        // Placeholder: BTN = wide, UTG = tight, others = medium
        if (position === 'BTN') {
            return [
                'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
                'AKs','AQs','AJs','ATs','KQs','KJs','QJs','JTs','T9s','98s','87s',
                'AKo','AQo','AJo','KQo'
            ];
        } else if (position === 'UTG') {
            return [
                'AA','KK','QQ','JJ','TT','AKs','AQs','AKo'
            ];
        } else {
            return [
                'AA','KK','QQ','JJ','TT','99','88','77','AKs','AQs','AJs','KQs','AKo','AQo'
            ];
        }
    }

    estimateWinProb(handStrength, street) {
        // Placeholder: preflop = handStrength*0.7, postflop = handStrength*0.9
        return street === 'preflop' ? handStrength * 0.7 : handStrength * 0.9;
    }

    calculatePotOdds(pot, amountToCall) {
        if (!amountToCall || amountToCall <= 0) return { potOdds: 0, calcString: 'No call required.' };
        const totalPot = pot + amountToCall;
        const potOdds = amountToCall / totalPot;
        const calcString = `To call ${amountToCall} into a pot of ${pot}: ${amountToCall} / (${pot} + ${amountToCall}) = ${(potOdds * 100).toFixed(1)}%`;
        return { potOdds, calcString };
    }
} 