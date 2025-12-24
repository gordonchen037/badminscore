
// Mock GameState and App logic for testing
class GameState {
    constructor() {
        this.teams = {
            A: { name: "A", members: [], scoreS4: 0 },
            B: { name: "B", members: [], scoreS4: 0 }
        };
        this.stage4 = {
            roles: {},
            status: {},
            snapshots: {},
            veteranTargets: {}
        };
    }
}

class App {
    constructor() {
        this.state = new GameState();
    }

    computeResultsLogic() {
        const scoreA = this.state.teams.A.scoreS4;
        const scoreB = this.state.teams.B.scoreS4;
        const winnerTeam = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : 'Draw');
        const allPlayers = [...this.state.teams.A.members, ...this.state.teams.B.members];
        const computedResults = [];

        const spySurvived = {
            A: this.state.teams.A.members.some(m => this.state.stage4.roles[m] === 'Spy' && this.state.stage4.status[m] !== 'Eliminated'),
            B: this.state.teams.B.members.some(m => this.state.stage4.roles[m] === 'Spy' && this.state.stage4.status[m] !== 'Eliminated')
        };

        // First Pass
        const tempResults = {};
        allPlayers.forEach(p => {
            const team = this.state.teams.A.members.includes(p) ? 'A' : 'B';
            const opponentTeam = team === 'A' ? 'B' : 'A';
            const role = this.state.stage4.roles[p];
            const status = this.state.stage4.status[p];

            let baseScore = status === 'Eliminated' ? (this.state.stage4.snapshots[p] || 0) : this.state.teams[team].scoreS4;
            let personalBonus = 0;

            if (role === 'Spy') {
                if (status !== 'Eliminated') {
                    personalBonus += Math.ceil(this.state.teams[opponentTeam].scoreS4 / 2);
                }
                if (winnerTeam === opponentTeam) {
                    personalBonus += 5;
                }
            }
            else if (role === 'Passerby') {
                if (status === 'Eliminated') {
                    const originalBase = baseScore;
                    baseScore = Math.ceil(originalBase * 1.5);
                } else {
                    personalBonus += 5;
                }
            }
            else if (role === 'Veteran') {
                // Logic mostly in second pass
            }
            else if (role === 'Player') {
                if (!spySurvived[team]) {
                    const originalBase = baseScore;
                    baseScore = originalBase * 2;
                }
                if (winnerTeam === team) {
                    personalBonus += 5;
                }
            }
            tempResults[p] = { team, role, status, base: baseScore, personal: personalBonus, final: baseScore + personalBonus };
        });

        // Second Pass
        allPlayers.forEach(p => {
            const r = tempResults[p];
            if (r.role === 'Veteran' && r.status === 'Eliminated') {
                const target = this.state.stage4.veteranTargets ? this.state.stage4.veteranTargets[p] : null;
                if (target && tempResults[target]) {
                    const targetScore = tempResults[target].final;
                    const bonus = Math.ceil(targetScore / 2);
                    r.personal += bonus;
                    r.final += bonus;
                }
            }

            computedResults.push({ name: p, team: r.team, role: r.role, status: r.status, base: r.base, personal: r.personal, final: r.final });
        });
        return computedResults;
    }
}

// Tests
const app = new App();

function test(name, setupFn, verifyFn) {
    console.log(`Running Test: ${name}`);
    app.state = new GameState(); // Reset
    setupFn(app);
    const results = app.computeResultsLogic();
    const resultMap = {};
    results.forEach(r => resultMap[r.name] = r);
    try {
        verifyFn(resultMap);
        console.log("  PASS");
    } catch (e) {
        console.error("  FAIL:", e.message);
        console.log("  Results:", JSON.stringify(results, null, 2));
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
}

// Case 1: Spy Logic
test("Spy Alive, Opponent Win", (app) => {
    app.state.teams.A.members = ['SpyA', 'PlayerA']; // A loses
    app.state.teams.B.members = ['PlayerB'];         // B wins
    app.state.teams.A.scoreS4 = 10;
    app.state.teams.B.scoreS4 = 20; // Winner

    app.state.stage4.roles = { 'SpyA': 'Spy', 'PlayerA': 'Player', 'PlayerB': 'Player' };
    app.state.stage4.status = { 'SpyA': 'Active', 'PlayerA': 'Active', 'PlayerB': 'Active' };

    // SpyA: Alive + Opponent Win.
    // Base = 10.
    // Bonus = Ceil(OpponentScore 20 / 2) = 10. + 5 (Opponent Win) = 15.
    // Final = 25.
}, (results) => {
    assert(results['SpyA'].final === 25, `Expected SpyA 25, got ${results['SpyA'].final}`);
});

// Case 2: Passerby Logic
test("Passerby Eliminated", (app) => {
    app.state.teams.A.members = ['PassA'];
    app.state.teams.B.members = [];
    app.state.teams.A.scoreS4 = 20;

    app.state.stage4.roles = { 'PassA': 'Passerby' };
    app.state.stage4.status = { 'PassA': 'Eliminated' };
    app.state.stage4.snapshots['PassA'] = 10; // Eliminated at score 10

    // Passerby Eliminated: Snapshot * 1.5. 
    // Base = 10.
    // Final = Ceil(10 * 1.5) = 15.
}, (results) => {
    assert(results['PassA'].final === 15, `Expected PassA 15, got ${results['PassA'].final}`);
});

// Case 3: Player Logic (No Spy)
test("Player, No Spy in Team", (app) => {
    app.state.teams.A.members = ['PlayerA'];
    app.state.teams.B.members = [];
    app.state.teams.A.scoreS4 = 20; // Win

    app.state.stage4.roles = { 'PlayerA': 'Player' };
    app.state.stage4.status = { 'PlayerA': 'Active' };

    // Spy Survived? No spy at all. So false.
    // Player gets * 2. 
    // Base = 20. New Base = 40.
    // Win Bonus = +5.
    // Final = 45.
}, (results) => {
    assert(results['PlayerA'].final === 45, `Expected PlayerA 45, got ${results['PlayerA'].final}`);
});

// Case 4: Veteran Logic
test("Veteran Eliminated w/ Teammate", (app) => {
    app.state.teams.A.members = ['VetA', 'MateA'];
    app.state.teams.B.members = [];
    app.state.teams.A.scoreS4 = 30; // Win

    app.state.stage4.roles = { 'VetA': 'Veteran', 'MateA': 'Player' };
    app.state.stage4.status = { 'VetA': 'Eliminated', 'MateA': 'Active' };
    app.state.stage4.snapshots['VetA'] = 10;
    app.state.stage4.veteranTargets['VetA'] = 'MateA'; // Choose MateA

    // MateA (Player, No Spy): Base 30 -> *2 = 60. Win +5 = 65.
    // VetA: Base = Snapshot = 10.
    // Bonus = Ceil(MateA Final 65 / 2) = 33.
    // Final = 10 + 33 = 43.
}, (results) => {
    assert(results['MateA'].final === 65, `Expected MateA 65, got ${results['MateA'].final}`);
    assert(results['VetA'].final === 43, `Expected VetA 43, got ${results['VetA'].final}`);
});
