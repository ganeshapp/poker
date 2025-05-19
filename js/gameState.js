export class GameState {
    constructor() {
        this.deck = [];
        this.playerHand = [];
        this.aiHand = [];
        this.communityCards = [];
        this.position = 'BTN'; // Button position
        this.pot = 0;
        this.currentStreet = 'preflop';
        this.positions = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
        this.currentPositionIndex = 0;
        this.amountToCall = 25; // Example default call amount
    }

    startNewHand() {
        this.initializeDeck();
        this.shuffleDeck();
        this.dealHands();
        this.communityCards = [];
        this.pot = 100; // Example starting pot
        this.currentStreet = 'preflop';
        this.rotatePosition();
    }

    initializeDeck() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        this.deck = [];

        for (let suit of suits) {
            for (let value of values) {
                this.deck.push({ suit, value });
            }
        }
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    dealHands() {
        this.playerHand = [this.deck.pop(), this.deck.pop()];
        this.aiHand = [this.deck.pop(), this.deck.pop()];
    }

    dealCommunityCards() {
        switch (this.currentStreet) {
            case 'flop':
                this.communityCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
                break;
            case 'turn':
                this.communityCards.push(this.deck.pop());
                break;
            case 'river':
                this.communityCards.push(this.deck.pop());
                break;
        }
    }

    nextStreet() {
        switch (this.currentStreet) {
            case 'preflop':
                this.currentStreet = 'flop';
                break;
            case 'flop':
                this.currentStreet = 'turn';
                break;
            case 'turn':
                this.currentStreet = 'river';
                break;
            case 'river':
                this.currentStreet = 'showdown';
                break;
        }
        this.dealCommunityCards();
        // For demo, keep amountToCall and pot the same
    }

    rotatePosition() {
        this.currentPositionIndex = (this.currentPositionIndex + 1) % this.positions.length;
        this.position = this.positions[this.currentPositionIndex];
    }

    isHandComplete() {
        return this.currentStreet === 'showdown';
    }

    getHandStrength() {
        // Placeholder for hand strength calculation
        return Math.random();
    }

    getCurrentState() {
        return {
            playerHand: this.playerHand,
            communityCards: this.communityCards,
            position: this.position,
            currentStreet: this.currentStreet,
            pot: this.pot,
            amountToCall: this.amountToCall
        };
    }
} 