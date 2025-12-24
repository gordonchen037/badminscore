class GameState {
    constructor() {
        this.teams = {
            A: {
                name: "A 組", members: [],
                s1_scores: { 1: 0, 2: 0, 3: 0 },
                scoreS4: 0
            },
            B: {
                name: "B 組", members: [],
                s1_scores: { 1: 0, 2: 0, 3: 0 },
                scoreS4: 0
            }
        };
        this.stage4 = {
            checkpoints: [7, 14, 20],
            violatedCheckpoints: [],
            roles: {},
            status: {},
            snapshots: {},
            matchCount: 1,
            timer: null
        };
        // Individual Series Tracking
        this.playerSeriesScores = {}; // Map<Name, TotalScore>

        this.currentStage = 'setup';
        this.subStage = 1;
    }
}

class UIManager {
    constructor() {
        this.views = {
            setup: document.getElementById('view-setup'),
            stage1: document.getElementById('view-stage1'),
            stage4setup: document.getElementById('view-stage4-setup'),
            stage4game: document.getElementById('view-stage4-game'),
            stage4results: document.getElementById('view-stage4-results'),
            summary: document.getElementById('view-summary')
        };
    }

    switchView(viewName) {
        Object.values(this.views).forEach(el => el.classList.remove('active'));
        let target = this.views[viewName];
        if (target) target.classList.add('active');
        if (viewName === 'stage4setup') this.renderScrambleLists();
        this.updateGlobalRanking();
    }

    setSubStage(stageId) {
        app.state.subStage = stageId;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const tabs = document.querySelectorAll('.tab');
        if (tabs[stageId - 1]) tabs[stageId - 1].classList.add('active');

        const texts = [
            "1. 發球得分: 發球至指定區域得分。",
            "2. 打倒球筒: 用球打倒對方場地內的球筒。",
            "3. 兩人一拍: 兩人合持一支球拍接球。"
        ];
        document.getElementById('stage-desc').innerText = texts[stageId - 1] || "";
        this.updateStage1Display();
    }

    updateStage1Display() {
        const sub = app.state.subStage;
        document.getElementById('s1-score-a').innerText = app.state.teams.A.s1_scores[sub];
        document.getElementById('s1-score-b').innerText = app.state.teams.B.s1_scores[sub];
    }

    addMemberInput(team) {
        const container = document.getElementById(`team-${team.toLowerCase()}-members`);
        const div = document.createElement('div');
        div.className = 'member-row';
        div.innerHTML = `<input type="text" class="member-input" placeholder="輸入隊員姓名">`;
        container.appendChild(div);
    }

    renderScrambleLists() {
        ['A', 'B'].forEach(team => {
            const container = document.getElementById(`scramble-${team.toLowerCase()}`);
            container.innerHTML = '';
            app.state.teams[team].members.forEach(m => {
                const div = document.createElement('div');
                div.className = 'scramble-item';
                div.innerHTML = `
                    <span>${m}</span>
                    <button class="btn-toggle-team" onclick="app.movePlayer('${m}', '${team}')">
                        換到 ${team === 'A' ? 'B' : 'A'} 組 ➡️
                    </button>
                 `;
                container.appendChild(div);
            });
        });
    }

    renderLiveStatus() {
        ['A', 'B'].forEach(team => {
            const container = document.getElementById(`s4-live-${team.toLowerCase()}`);
            container.innerHTML = '';
            app.state.teams[team].members.forEach(m => {
                const status = app.state.stage4.status[m];
                const card = document.createElement('div');
                card.className = `player-card ${status === 'Eliminated' ? 'eliminated' : ''}`;
                const reviveBtn = status === 'Eliminated'
                    ? `<button class="btn-toggle-team" style="background:var(--accent-primary); color:#000;" onclick="app.manualRevive('${m}')">復活</button>` : '';
                card.innerHTML = `<span>${m}</span><div style="display:flex;align-items:center;gap:5px;">${reviveBtn}<span class="status-indicator ${status === 'Eliminated' ? 'out' : ''}"></span></div>`;
                container.appendChild(card);
            });
        });
    }

    showVoteModal(triggerScore) {
        const modal = document.getElementById('modal-vote');
        document.getElementById('cp-score').innerText = triggerScore;

        ['A', 'B'].forEach(team => {
            const list = document.getElementById(`vote-list-${team.toLowerCase()}`);
            list.innerHTML = '';
            const members = app.state.teams[team].members;
            const activeMembers = members.filter(m => app.state.stage4.status[m] !== 'Eliminated');

            const threshold = Math.ceil(activeMembers.length / 2);
            document.getElementById(`thresh-${team.toLowerCase()}`).innerText = threshold > 0 ? threshold : 0;

            activeMembers.forEach(p => {
                const div = document.createElement('div');
                div.className = 'vote-row';
                div.innerHTML = `<span>${p}</span><input type="number" min="0" class="vote-input" data-player="${p}" data-team="${team}">`;
                list.appendChild(div);
            });
        });

        modal.classList.add('active');

        let timeLeft = 60;
        const timerDisplay = document.getElementById('vote-timer');
        timerDisplay.innerText = timeLeft;
        if (this.voteTimerInterval) clearInterval(this.voteTimerInterval);
        this.voteTimerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.innerText = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(this.voteTimerInterval);
                timerDisplay.innerText = "時間到！";
            }
        }, 1000);
    }

    hideModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    toggleGlobalScoreboard() {
        const modal = document.getElementById('modal-global-score');
        if (modal.classList.contains('active')) {
            modal.classList.remove('active');
        } else {
            this.updateGlobalRanking();
            modal.classList.add('active');
        }
    }

    updateGlobalRanking() {
        const list = document.getElementById('global-ranking-list');
        list.innerHTML = '';

        // Get all players that have scores or are currently in team
        // Merge current members + history
        const allNames = new Set([
            ...Object.keys(app.state.playerSeriesScores),
            ...app.state.teams.A.members,
            ...app.state.teams.B.members
        ]);

        // Sort by Score Desc
        const sorted = Array.from(allNames).map(name => ({
            name: name,
            score: app.state.playerSeriesScores[name] || 0
        })).sort((a, b) => b.score - a.score);

        if (sorted.length === 0) {
            list.innerHTML = '<div style="padding:10px;text-align:center;">尚無資料</div>';
            return;
        }

        sorted.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `ranking-item ${index < 3 ? 'top3' : ''}`;
            let icon = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `#${index + 1}`));

            div.innerHTML = `
                <span>${icon}</span>
                <span>${item.name}</span>
                <span style="font-weight:bold; color:var(--accent-primary)">${item.score}</span>
            `;
            list.appendChild(div);
        });
    }

    renderRoleAssignTable() {
        const container = document.getElementById('role-assign-container');
        container.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'results-table';
        table.innerHTML = `<thead><tr><th>隊伍</th><th>玩家</th><th>狀態</th><th>選擇身份</th></tr></thead><tbody id="role-tbody"></tbody>`;
        container.appendChild(table);
        const tbody = table.querySelector('tbody');

        const allPlayers = [];
        app.state.teams.A.members.forEach(m => allPlayers.push({ p: m, t: 'A' }));
        app.state.teams.B.members.forEach(m => allPlayers.push({ p: m, t: 'B' }));

        allPlayers.forEach(obj => {
            const { p, t } = obj;
            const status = app.state.stage4.status[p];
            const row = document.createElement('tr');
            row.innerHTML = `<td style="color: var(--team-${t.toLowerCase()}-color)">${t} 組</td><td>${p}</td><td>${status === 'Eliminated' ? '已淘汰' : '存活'}</td><td><select class="role-select" data-player="${p}"><option value="Player">選手 (Player)</option><option value="Spy">間諜 (Spy)</option><option value="Veteran">老手 (Veteran)</option><option value="Passerby">路人 (Passerby)</option></select></td>`;
            tbody.appendChild(row);
        });
    }
}

class App {
    constructor() {
        this.state = new GameState();
        this.ui = new UIManager();
        this.ui.addMemberInput('A'); this.ui.addMemberInput('A');
        this.ui.addMemberInput('B'); this.ui.addMemberInput('B');
    }

    startStage1() {
        const inputsA = document.querySelectorAll('#team-a-members input');
        this.state.teams.A.members = Array.from(inputsA).map(i => i.value).filter(v => v);
        const inputsB = document.querySelectorAll('#team-b-members input');
        this.state.teams.B.members = Array.from(inputsB).map(i => i.value).filter(v => v);

        if (this.state.teams.A.members.length === 0 || this.state.teams.B.members.length === 0) {
            alert("請輸入隊員姓名！"); return;
        }

        // Init scores for players
        [...this.state.teams.A.members, ...this.state.teams.B.members].forEach(m => {
            if (this.state.playerSeriesScores[m] === undefined) this.state.playerSeriesScores[m] = 0;
        });

        this.ui.switchView('stage1');
        this.ui.updateStage1Display();
    }

    updateStage1Score(team, delta) {
        const sub = this.state.subStage;
        this.state.teams[team].s1_scores[sub] += delta;
        if (this.state.teams[team].s1_scores[sub] < 0) this.state.teams[team].s1_scores[sub] = 0;
        this.ui.updateStage1Display();
    }

    startStage4Setup() { this.ui.switchView('stage4setup'); }

    movePlayer(player, fromTeam) {
        this.state.teams[fromTeam].members = this.state.teams[fromTeam].members.filter(m => m !== player);
        const targetTeam = fromTeam === 'A' ? 'B' : 'A';
        this.state.teams[targetTeam].members.push(player);
        this.ui.renderScrambleLists();
    }

    startStage4Game() {
        const allPlayers = [...this.state.teams.A.members, ...this.state.teams.B.members];
        allPlayers.forEach(p => {
            this.state.stage4.status[p] = "Active";
            this.state.stage4.snapshots[p] = 0;
            // Ensure series score init
            if (this.state.playerSeriesScores[p] === undefined) this.state.playerSeriesScores[p] = 0;
        });
        document.getElementById('match-count').innerText = this.state.stage4.matchCount;
        this.ui.renderLiveStatus();
        this.ui.switchView('stage4game');
    }

    scoreStage4(team, delta) {
        this.state.teams[team].scoreS4 += delta;
        if (this.state.teams[team].scoreS4 < 0) this.state.teams[team].scoreS4 = 0;
        document.getElementById(`s4-score-${team.toLowerCase()}`).innerText = this.state.teams[team].scoreS4;

        const score = this.state.teams[team].scoreS4;
        if (this.state.stage4.checkpoints.includes(score)) {
            if (!this.state.stage4.violatedCheckpoints.includes(score)) {
                this.state.stage4.violatedCheckpoints.push(score);
                ui.showVoteModal(score);
            }
        }
    }

    confirmVotes() {
        const eliminatedPlayers = [];
        ['A', 'B'].forEach(team => {
            const inputs = document.querySelectorAll(`.vote-input[data-team="${team}"]`);
            const members = this.state.teams[team].members;
            const activeMembers = members.filter(m => this.state.stage4.status[m] !== 'Eliminated');
            const threshold = Math.ceil(activeMembers.length / 2);

            if (activeMembers.length > 0) {
                inputs.forEach(inp => {
                    const votes = parseInt(inp.value) || 0;
                    if (votes >= threshold) {
                        eliminatedPlayers.push(inp.dataset.player);
                    }
                });
            }
        });

        eliminatedPlayers.forEach(p => {
            const team = this.state.teams.A.members.includes(p) ? 'A' : 'B';
            const currentScore = this.state.teams[team].scoreS4;
            this.state.stage4.status[p] = "Eliminated";
            this.state.stage4.snapshots[p] = currentScore;
        });

        if (eliminatedPlayers.length > 0) alert(`淘汰: ${eliminatedPlayers.join(', ')}`);
        else alert("無人淘汰！");
        this.ui.hideModal('modal-vote');
        this.ui.renderLiveStatus();
    }

    manualRevive(player) {
        if (confirm(`確定要復活 ${player} 嗎？`)) {
            this.state.stage4.status[player] = "Active";
            this.state.stage4.snapshots[player] = 0;
            this.ui.renderLiveStatus();
        }
    }

    finishStage4Match() {
        if (!confirm("確定結束比賽並進入結算？")) return;
        this.ui.renderRoleAssignTable();
        this.ui.switchView('stage4results');
    }

    calculateAndShowFinal() {
        const selects = document.querySelectorAll('.role-select');
        selects.forEach(sel => this.state.stage4.roles[sel.dataset.player] = sel.value);

        const results = this.computeResultsLogic();
        this.renderFinalSummary(results);
        this.ui.switchView('summary');
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

        allPlayers.forEach(p => {
            const team = this.state.teams.A.members.includes(p) ? 'A' : 'B';
            const opponentTeam = team === 'A' ? 'B' : 'A';
            const role = this.state.stage4.roles[p];
            const status = this.state.stage4.status[p];
            let baseScore = status === 'Eliminated' ? (this.state.stage4.snapshots[p] || 0) : this.state.teams[team].scoreS4;
            let finalScore = baseScore;

            if (role === 'Spy') {
                if (status !== 'Eliminated') finalScore += Math.ceil(this.state.teams[opponentTeam].scoreS4 / 2);
                if (winnerTeam === opponentTeam) finalScore += 5;
            }
            else if (role === 'Passerby') {
                if (status === 'Eliminated') finalScore = Math.ceil(baseScore * 1.5);
                else finalScore += 5;
            }
            else if (role === 'Player') {
                if (!spySurvived[team]) finalScore *= 2;
                if (winnerTeam === team) finalScore += 5;
            }
            computedResults.push({ name: p, team, role, status, base: baseScore, final: finalScore });
        });
        return computedResults;
    }

    renderFinalSummary(results) {
        let s1TotalA = 0, s1TotalB = 0;
        for (let i = 1; i <= 3; i++) { s1TotalA += this.state.teams.A.s1_scores[i]; s1TotalB += this.state.teams.B.s1_scores[i]; }
        document.getElementById('sum-s1-a').innerText = s1TotalA;
        document.getElementById('sum-s1-b').innerText = s1TotalB;

        const tbody = document.getElementById('final-results-body');
        tbody.innerHTML = '';
        results.forEach(r => {
            const row = document.createElement('tr');

            // Create Input for the Final Score (Editable)
            const inputHtml = `<input type="number" class="score-edit-input" data-player="${r.name}" value="${r.final}">`;

            row.innerHTML = `<td>${r.name}</td><td>${this.translateRole(r.role)}</td><td>${r.status === 'Eliminated' ? '已淘汰' : '存活'}</td><td>${inputHtml}</td>`;
            tbody.appendChild(row);
        });
    }

    nextMatch() {
        // 1. Harvest Edited Scores
        const inputs = document.querySelectorAll('.score-edit-input');
        inputs.forEach(inp => {
            const player = inp.dataset.player;
            const score = parseInt(inp.value) || 0;
            // 2. Commit to Series
            if (this.state.playerSeriesScores[player] === undefined) this.state.playerSeriesScores[player] = 0;
            this.state.playerSeriesScores[player] += score;
        });

        // 3. Reset Match State
        this.state.teams.A.scoreS4 = 0;
        this.state.teams.B.scoreS4 = 0;
        this.state.stage4.violatedCheckpoints = [];
        this.state.stage4.matchCount++;

        document.getElementById('s4-score-a').innerText = 0;
        document.getElementById('s4-score-b').innerText = 0;

        this.ui.switchView('stage4setup');
    }

    translateRole(role) {
        const map = { 'Player': '選手', 'Spy': '間諜', 'Veteran': '老手', 'Passerby': '路人' };
        return map[role] || role;
    }
}

const ui = new UIManager();
const app = new App();
window.ui = ui;
window.app = app;
